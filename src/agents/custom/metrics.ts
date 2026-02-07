/**
 * Agent Performance Metrics System
 *
 * Tracks execution metrics for custom agents including invocations, response time,
 * success rate, token usage, and user ratings.
 *
 * **Simple explanation**: Like a fitness tracker for your agents - records how many
 * times they've been used, how fast they respond, how often they succeed, and what
 * users think of them.
 *
 * @module agents/custom/metrics
 */

// In-memory storage fallback for Node.js environments
const memoryStore: Record<string, string> = {};

/**
 * Storage abstraction that works in both browser and Node.js
 */
const storage = {
    getItem: (key: string) => {
        try {
            const win = (globalThis as any).window;
            if (win?.localStorage) {
                return win.localStorage.getItem(key);
            }
        } catch {
            // localStorage not available, fall through to memory store
        }
        return memoryStore[key];
    },
    setItem: (key: string, value: string) => {
        try {
            const win = (globalThis as any).window;
            if (win?.localStorage) {
                win.localStorage.setItem(key, value);
                return;
            }
        } catch {
            // localStorage not available, fall through to memory store
        }
        memoryStore[key] = value;
    },
    removeItem: (key: string) => {
        try {
            const win = (globalThis as any).window;
            if (win?.localStorage) {
                win.localStorage.removeItem(key);
                return;
            }
        } catch {
            // localStorage not available, fall through to memory store
        }
        delete memoryStore[key];
    },
    keys: () => {
        try {
            const win = (globalThis as any).window;
            if (win?.localStorage) {
                return Array.from(Object.keys(win.localStorage));
            }
        } catch {
            // localStorage not available, fall through to memory store
        }
        return Object.keys(memoryStore);
    }
};

/**
 * Single execution metric record
 */
export interface ExecutionMetric {
    timestamp: string;
    agentId: string;
    taskId?: string;
    success: boolean;
    responseTimeMs: number;
    tokenUsed: number;
    errorMessage?: string;
    userRating?: 1 | 2 | 3 | 4 | 5;
}

/**
 * Aggregated metrics for an agent
 */
export interface AgentMetrics {
    agentId: string;
    totalInvocations: number;
    successCount: number;
    failureCount: number;
    avgResponseTimeMs: number;
    minResponseTimeMs: number;
    maxResponseTimeMs: number;
    totalTokensUsed: number;
    avgTokensPerInvocation: number;
    successRate: number; // 0-100
    avgUserRating?: number; // 1-5
    lastExecutedAt?: string;
    firstExecutedAt?: string;
    topErrors: Array<{ error: string; count: number }>;
}

/**
 * Metrics for comparison between agents
 */
export interface MetricsComparison {
    agents: AgentMetrics[];
    timeRange: { startDate: string; endDate: string };
}

/**
 * Metric collection for timeline analytics
 */
export interface MetricsTimeline {
    agentId: string;
    period: 'daily' | 'weekly' | 'monthly';
    dataPoints: Array<{
        date: string;
        invocations: number;
        successRate: number;
        avgResponseTimeMs: number;
    }>;
}

/**
 * Get execution history for an agent
 */
export function getExecutionHistory(agentId: string): ExecutionMetric[] {
    const key = `agent-execution-history:${agentId}`;
    const stored = storage.getItem(key);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return [];
        }
    }
    return [];
}

/**
 * Record a single agent execution
 *
 * **Simple explanation**: Logs what happened when an agent ran
 */
export function recordMetric(metric: ExecutionMetric): void {
    const key = `agent-metrics:${metric.agentId}`;
    const metrics = getOrCreateMetrics(metric.agentId);

    // Add to execution history
    const history = getExecutionHistory(metric.agentId);
    history.push(metric);
    // Keep only last 1000 executions to prevent memory bloat
    if (history.length > 1000) {
        history.shift();
    }

    // Save history back to storage
    const historyKey = `agent-execution-history:${metric.agentId}`;
    storage.setItem(historyKey, JSON.stringify(history));

    // Update aggregated metrics
    metrics.totalInvocations += 1;
    if (metric.success) {
        metrics.successCount += 1;
    } else {
        metrics.failureCount += 1;
        // Track error frequency
        if (metric.errorMessage) {
            const existing = metrics.topErrors.find(e => e.error === metric.errorMessage);
            if (existing) {
                existing.count += 1;
            } else {
                metrics.topErrors.push({ error: metric.errorMessage, count: 1 });
                metrics.topErrors.sort((a, b) => b.count - a.count).slice(0, 5);
            }
        }
    }

    // Update response time tracking
    if (metric.responseTimeMs > 0) {
        const totalTime = metrics.avgResponseTimeMs * (metrics.totalInvocations - 1) + metric.responseTimeMs;
        metrics.avgResponseTimeMs = Math.round(totalTime / metrics.totalInvocations);
        metrics.minResponseTimeMs = Math.min(metrics.minResponseTimeMs, metric.responseTimeMs);
        metrics.maxResponseTimeMs = Math.max(metrics.maxResponseTimeMs, metric.responseTimeMs);
    }

    // Update token usage
    if (metric.tokenUsed > 0) {
        metrics.totalTokensUsed += metric.tokenUsed;
        metrics.avgTokensPerInvocation = Math.round(metrics.totalTokensUsed / metrics.totalInvocations);
    }

    // Update ratings
    if (metric.userRating) {
        if (metrics.avgUserRating === undefined) {
            metrics.avgUserRating = metric.userRating;
        } else {
            // Count the number of rated items before this one (excluding the one we just added)
            const prevRatedCount = history.length - 1;
            const totalRating = prevRatedCount * metrics.avgUserRating + metric.userRating;
            metrics.avgUserRating = totalRating / (prevRatedCount + 1);
        }
    }

    // Update timestamps
    metrics.lastExecutedAt = metric.timestamp;
    if (!metrics.firstExecutedAt) {
        metrics.firstExecutedAt = metric.timestamp;
    }

    // Update success rate
    metrics.successRate = Math.round((metrics.successCount / metrics.totalInvocations) * 100);

    // Save updated metrics
    storage.setItem(key, JSON.stringify(metrics));
}

/**
 * Get aggregated metrics for an agent
 */
export function getAgentMetrics(agentId: string): AgentMetrics {
    return getOrCreateMetrics(agentId);
}

/**
 * Get metrics for multiple agents
 */
export function getMultipleAgentMetrics(agentIds: string[]): AgentMetrics[] {
    return agentIds.map(id => getOrCreateMetrics(id));
}

/**
 * Compare metrics between agents
 */
export function compareAgentMetrics(agentIds: string[]): MetricsComparison {
    const agents = getMultipleAgentMetrics(agentIds);
    return {
        agents: agents.sort((a, b) => b.successRate - a.successRate),
        timeRange: {
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
            endDate: new Date().toISOString()
        }
    };
}

/**
 * Get metrics timeline for analytics/charts
 */
export function getMetricsTimeline(agentId: string, period: 'daily' | 'weekly' | 'monthly'): MetricsTimeline {
    const history = getExecutionHistory(agentId);
    const grouped = groupMetricsByPeriod(history, period);

    const dataPoints = Object.entries(grouped).map(([date, metrics]) => ({
        date,
        invocations: metrics.length,
        successRate: Math.round((metrics.filter(m => m.success).length / metrics.length) * 100),
        avgResponseTimeMs: Math.round(
            metrics.reduce((sum, m) => sum + m.responseTimeMs, 0) / metrics.length
        )
    }));

    return {
        agentId,
        period,
        dataPoints: dataPoints.sort((a, b) => a.date.localeCompare(b.date))
    };
}

/**
 * Export metrics as CSV
 */
export function exportMetricsAsCSV(agentIds: string[]): string {
    const agents = getMultipleAgentMetrics(agentIds);

    const headers = [
        'Agent ID',
        'Total Invocations',
        'Success Count',
        'Failure Count',
        'Success Rate (%)',
        'Avg Response Time (ms)',
        'Min Response Time (ms)',
        'Max Response Time (ms)',
        'Total Tokens Used',
        'Avg Tokens per Invocation',
        'Avg User Rating',
        'Last Executed',
        'First Executed'
    ];

    const rows = agents.map(m => [
        m.agentId,
        m.totalInvocations,
        m.successCount,
        m.failureCount,
        m.successRate.toFixed(1),
        m.avgResponseTimeMs,
        m.minResponseTimeMs === Infinity ? 0 : m.minResponseTimeMs,
        m.maxResponseTimeMs === 0 ? 0 : m.maxResponseTimeMs,
        m.totalTokensUsed,
        m.avgTokensPerInvocation,
        m.avgUserRating?.toFixed(2) || 'N/A',
        m.lastExecutedAt || 'Never',
        m.firstExecutedAt || 'Never'
    ]);

    const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csv;
}

/**
 * Reset metrics for an agent (useful for testing)
 */
export function resetMetrics(agentId: string): void {
    const key = `agent-metrics:${agentId}`;
    const historyKey = `agent-execution-history:${agentId}`;
    storage.removeItem(key);
    storage.removeItem(historyKey);
}

/**
 * Clear all metrics
 */
export function clearAllMetrics(): void {
    const keys = storage.keys();
    keys.forEach(key => {
        if (key.startsWith('agent-metrics:') || key.startsWith('agent-execution-history:')) {
            storage.removeItem(key);
        }
    });
}

// ============================================================================
// Private Helper Functions
// ============================================================================

function getOrCreateMetrics(agentId: string): AgentMetrics {
    const key = `agent-metrics:${agentId}`;
    const stored = storage.getItem(key);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return createEmptyMetrics(agentId);
        }
    }

    const metrics = createEmptyMetrics(agentId);
    storage.setItem(key, JSON.stringify(metrics));
    return metrics;
}

function createEmptyMetrics(agentId: string): AgentMetrics {
    return {
        agentId,
        totalInvocations: 0,
        successCount: 0,
        failureCount: 0,
        avgResponseTimeMs: 0,
        minResponseTimeMs: Infinity,
        maxResponseTimeMs: 0,
        totalTokensUsed: 0,
        avgTokensPerInvocation: 0,
        successRate: 0,
        topErrors: []
    };
}

function groupMetricsByPeriod(
    metrics: ExecutionMetric[],
    period: 'daily' | 'weekly' | 'monthly'
): Record<string, ExecutionMetric[]> {
    const grouped: Record<string, ExecutionMetric[]> = {};

    metrics.forEach(metric => {
        const date = new Date(metric.timestamp);
        let key: string;

        if (period === 'daily') {
            key = date.toISOString().split('T')[0];
        } else if (period === 'weekly') {
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            key = weekStart.toISOString().split('T')[0];
        } else {
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(metric);
    });

    return grouped;
}
