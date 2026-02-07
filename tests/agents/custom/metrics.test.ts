/**
 * Agent Metrics Tests (MT-030.17)
 */

import {
    recordMetric,
    getAgentMetrics,
    getMultipleAgentMetrics,
    compareAgentMetrics,
    getExecutionHistory,
    getMetricsTimeline,
    exportMetricsAsCSV,
    resetMetrics,
    clearAllMetrics,
    type ExecutionMetric,
    type AgentMetrics
} from '../../../src/agents/custom/metrics';

describe('MT-030.17: Agent Performance Metrics', () => {
    beforeEach(() => {
        clearAllMetrics();
    });

    // ========== Test 1: Recording Metrics ==========
    describe('Test 1: Record execution metrics', () => {
        it('should record a successful execution', () => {
            const metric: ExecutionMetric = {
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                taskId: 'task-1',
                success: true,
                responseTimeMs: 250,
                tokenUsed: 512
            };

            recordMetric(metric);
            const metrics = getAgentMetrics('test-agent');

            expect(metrics.totalInvocations).toBe(1);
            expect(metrics.successCount).toBe(1);
            expect(metrics.failureCount).toBe(0);
            expect(metrics.successRate).toBe(100);
        });

        it('should record a failed execution', () => {
            const metric: ExecutionMetric = {
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: false,
                responseTimeMs: 100,
                tokenUsed: 128,
                errorMessage: 'Timeout'
            };

            recordMetric(metric);
            const metrics = getAgentMetrics('test-agent');

            expect(metrics.totalInvocations).toBe(1);
            expect(metrics.successCount).toBe(0);
            expect(metrics.failureCount).toBe(1);
            expect(metrics.successRate).toBe(0);
        });

        it('should track multiple executions', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 200,
                tokenUsed: 256
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 300,
                tokenUsed: 512
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: false,
                responseTimeMs: 100,
                tokenUsed: 128,
                errorMessage: 'Error'
            });

            const metrics = getAgentMetrics('test-agent');
            expect(metrics.totalInvocations).toBe(3);
            expect(metrics.successCount).toBe(2);
            expect(metrics.failureCount).toBe(1);
            expect(metrics.successRate).toBe(67); // Rounded
        });
    });

    // ========== Test 2: Response Time Tracking ==========
    describe('Test 2: Response time metrics', () => {
        it('should track average response time', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 300,
                tokenUsed: 256
            });

            const metrics = getAgentMetrics('test-agent');
            expect(metrics.avgResponseTimeMs).toBe(200);
            expect(metrics.minResponseTimeMs).toBe(100);
            expect(metrics.maxResponseTimeMs).toBe(300);
        });

        it('should handle first metric setting min/max', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 250,
                tokenUsed: 256
            });

            const metrics = getAgentMetrics('test-agent');
            expect(metrics.minResponseTimeMs).toBe(250);
            expect(metrics.maxResponseTimeMs).toBe(250);
            expect(metrics.avgResponseTimeMs).toBe(250);
        });
    });

    // ========== Test 3: Token Usage Tracking ==========
    describe('Test 3: Token usage metrics', () => {
        it('should track total and average token usage', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 1000
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 2000
            });

            const metrics = getAgentMetrics('test-agent');
            expect(metrics.totalTokensUsed).toBe(3000);
            expect(metrics.avgTokensPerInvocation).toBe(1500);
        });
    });

    // ========== Test 4: User Ratings ==========
    describe('Test 4: User rating tracking', () => {
        it('should track user ratings', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256,
                userRating: 5
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256,
                userRating: 3
            });

            const metrics = getAgentMetrics('test-agent');
            expect(metrics.avgUserRating).toBe(4);
        });

        it('should handle mixed ratings with no ratings', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256,
                userRating: 5
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
                // No rating
            });

            const metrics = getAgentMetrics('test-agent');
            expect(metrics.avgUserRating).toBeDefined();
        });
    });

    // ========== Test 5: Error Tracking ==========
    describe('Test 5: Error tracking and frequency', () => {
        it('should track top errors', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: false,
                responseTimeMs: 100,
                tokenUsed: 128,
                errorMessage: 'Timeout'
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: false,
                responseTimeMs: 100,
                tokenUsed: 128,
                errorMessage: 'Timeout'
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: false,
                responseTimeMs: 100,
                tokenUsed: 128,
                errorMessage: 'RateLimit'
            });

            const metrics = getAgentMetrics('test-agent');
            expect(metrics.topErrors.length).toBeGreaterThan(0);
            expect(metrics.topErrors[0].error).toBe('Timeout');
            expect(metrics.topErrors[0].count).toBe(2);
        });
    });

    // ========== Test 6: Multiple Agents ==========
    describe('Test 6: Multiple agent comparisons', () => {
        it('should compare metrics between agents', () => {
            // Agent 1: 2 successes out of 2
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'agent-1',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
            });
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'agent-1',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
            });

            // Agent 2: 1 success out of 2
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'agent-2',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
            });
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'agent-2',
                success: false,
                responseTimeMs: 100,
                tokenUsed: 256,
                errorMessage: 'Error'
            });

            const comparison = compareAgentMetrics(['agent-1', 'agent-2']);
            expect(comparison.agents).toHaveLength(2);
            expect(comparison.agents[0].agentId).toBe('agent-1'); // Higher success rate
            expect(comparison.agents[0].successRate).toBe(100);
            expect(comparison.agents[1].successRate).toBe(50);
        });

        it('should get metrics for multiple agents', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'agent-a',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'agent-b',
                success: true,
                responseTimeMs: 150,
                tokenUsed: 512
            });

            const metrics = getMultipleAgentMetrics(['agent-a', 'agent-b']);
            expect(metrics).toHaveLength(2);
            expect(metrics[0].agentId).toBe('agent-a');
            expect(metrics[1].agentId).toBe('agent-b');
        });
    });

    // ========== Test 7: Execution History ==========
    describe('Test 7: Execution history and timeline', () => {
        it('should retrieve execution history', () => {
            const now = new Date().toISOString();
            recordMetric({
                timestamp: now,
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
            });

            const history = getExecutionHistory('test-agent');
            expect(history).toHaveLength(1);
            expect(history[0].agentId).toBe('test-agent');
            expect(history[0].success).toBe(true);
        });

        it('should generate metrics timeline', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: false,
                responseTimeMs: 200,
                tokenUsed: 512,
                errorMessage: 'Error'
            });

            const timeline = getMetricsTimeline('test-agent', 'daily');
            expect(timeline.agentId).toBe('test-agent');
            expect(timeline.period).toBe('daily');
            expect(timeline.dataPoints.length).toBeGreaterThan(0);
        });
    });

    // ========== Test 8: Export Functionality ==========
    describe('Test 8: Metrics export', () => {
        it('should export metrics as CSV', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
            });

            const csv = exportMetricsAsCSV(['test-agent']);
            expect(csv).toContain('Agent ID');
            expect(csv).toContain('test-agent');
            expect(csv).toContain('Success Rate');
        });

        it('should export multiple agents as CSV', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'agent-1',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'agent-2',
                success: false,
                responseTimeMs: 150,
                tokenUsed: 512,
                errorMessage: 'Error'
            });

            const csv = exportMetricsAsCSV(['agent-1', 'agent-2']);
            expect(csv.split('\n')).toHaveLength(3); // header + 2 agents
        });
    });

    // ========== Test 9: Metrics Reset ==========
    describe('Test 9: Metrics management', () => {
        it('should reset metrics for single agent', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
            });

            resetMetrics('test-agent');
            const metrics = getAgentMetrics('test-agent');
            expect(metrics.totalInvocations).toBe(0);
        });

        it('should clear all metrics', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'agent-1',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 256
            });

            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'agent-2',
                success: true,
                responseTimeMs: 150,
                tokenUsed: 512
            });

            clearAllMetrics();

            const metrics1 = getAgentMetrics('agent-1');
            const metrics2 = getAgentMetrics('agent-2');

            expect(metrics1.totalInvocations).toBe(0);
            expect(metrics2.totalInvocations).toBe(0);
        });
    });

    // ========== Test 10: Edge Cases ==========
    describe('Test 10: Edge cases and large datasets', () => {
        it('should handle 1000+ execution records', () => {
            // Record 1000 metrics - should keep last 1000
            for (let i = 0; i < 1000; i++) {
                recordMetric({
                    timestamp: new Date(Date.now() + i * 1000).toISOString(),
                    agentId: 'test-agent',
                    success: Math.random() > 0.1,
                    responseTimeMs: Math.random() * 500,
                    tokenUsed: Math.random() * 2000
                });
            }

            const metrics = getAgentMetrics('test-agent');
            expect(metrics.totalInvocations).toBe(1000);
        });

        it('should calculate success rate correctly with many invocations', () => {
            for (let i = 0; i < 100; i++) {
                recordMetric({
                    timestamp: new Date().toISOString(),
                    agentId: 'test-agent',
                    success: i < 75, // 75% success
                    responseTimeMs: 100,
                    tokenUsed: 256
                });
            }

            const metrics = getAgentMetrics('test-agent');
            expect(metrics.successRate).toBe(75);
            expect(metrics.successCount).toBe(75);
            expect(metrics.failureCount).toBe(25);
        });

        it('should handle metrics with zero token usage', () => {
            recordMetric({
                timestamp: new Date().toISOString(),
                agentId: 'test-agent',
                success: true,
                responseTimeMs: 100,
                tokenUsed: 0
            });

            const metrics = getAgentMetrics('test-agent');
            expect(metrics.avgTokensPerInvocation).toBe(0);
        });
    });
});
