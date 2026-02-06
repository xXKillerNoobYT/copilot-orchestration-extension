/**
 * Verification Session Logging
 * 
 * **Simple explanation**: Logs all verification attempts to files so you can
 * review the history later. Like keeping a journal of what was checked and
 * what passed or failed.
 * 
 * @module agents/verification/logging
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';

/**
 * Verification log entry
 */
export interface VerificationLogEntry {
    /** Unique log ID */
    id: string;
    /** Task ID verified */
    taskId: string;
    /** Timestamp */
    timestamp: number;
    /** Duration in ms */
    duration: number;
    /** Overall result */
    result: 'passed' | 'failed' | 'error';
    /** Criteria checked */
    criteriaCount: number;
    /** Criteria passed */
    criteriaPassed: number;
    /** Tests run */
    testsRun: number;
    /** Tests passed */
    testsPassed: number;
    /** Error message if any */
    error?: string;
    /** Summary */
    summary: string;
}

/**
 * Full verification log
 */
export interface VerificationLog extends VerificationLogEntry {
    /** Detailed criteria results */
    criteriaResults?: { criterion: string; passed: boolean; evidence: string }[];
    /** Detailed test results */
    testResults?: { name: string; passed: boolean; error?: string }[];
    /** Modified files */
    modifiedFiles?: string[];
    /** Retry number */
    retryNumber?: number;
}

/**
 * Verification Session Logger
 * 
 * **Simple explanation**: Saves verification logs to .coe/verification-logs/
 * so you can review past verification attempts.
 */
export class VerificationLogger {
    private logsDir: string;
    private inMemoryLogs: Map<string, VerificationLog> = new Map();
    private initialized: boolean = false;

    constructor() {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.logsDir = path.join(workspaceRoot, '.coe', 'verification-logs');
    }

    /**
     * Initialize the logger (create directory)
     */
    public initialize(): void {
        if (this.initialized) return;

        try {
            if (!fs.existsSync(this.logsDir)) {
                fs.mkdirSync(this.logsDir, { recursive: true });
            }
            this.initialized = true;
            logInfo(`[VerificationLogger] Initialized at ${this.logsDir}`);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[VerificationLogger] Failed to initialize: ${msg}`);
        }
    }

    /**
     * Log a verification attempt
     */
    public log(entry: VerificationLog): void {
        this.initialize();

        // Generate ID if not present
        if (!entry.id) {
            entry.id = `vlog_${entry.taskId}_${entry.timestamp}`;
        }

        // Store in memory
        this.inMemoryLogs.set(entry.id, entry);

        // Write to file
        try {
            const filename = `${entry.taskId}_${new Date(entry.timestamp).toISOString().replace(/[:.]/g, '-')}.json`;
            const filepath = path.join(this.logsDir, filename);
            fs.writeFileSync(filepath, JSON.stringify(entry, null, 2));
            logInfo(`[VerificationLogger] Logged verification for ${entry.taskId}: ${entry.result}`);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[VerificationLogger] Failed to write log: ${msg}`);
        }
    }

    /**
     * Get logs for a specific task
     */
    public getLogsForTask(taskId: string): VerificationLog[] {
        const logs: VerificationLog[] = [];

        // Check in-memory first
        for (const log of this.inMemoryLogs.values()) {
            if (log.taskId === taskId) {
                logs.push(log);
            }
        }

        // Also check files
        try {
            if (fs.existsSync(this.logsDir)) {
                const files = fs.readdirSync(this.logsDir);
                for (const file of files) {
                    if (file.startsWith(taskId) && file.endsWith('.json')) {
                        const filepath = path.join(this.logsDir, file);
                        const content = fs.readFileSync(filepath, 'utf-8');
                        const log = JSON.parse(content) as VerificationLog;
                        if (!this.inMemoryLogs.has(log.id)) {
                            logs.push(log);
                        }
                    }
                }
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logWarn(`[VerificationLogger] Error reading logs: ${msg}`);
        }

        return logs.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get recent logs
     */
    public getRecentLogs(limit: number = 50): VerificationLog[] {
        const logs: VerificationLog[] = Array.from(this.inMemoryLogs.values());

        // Also load from files
        try {
            if (fs.existsSync(this.logsDir)) {
                const files = fs.readdirSync(this.logsDir)
                    .filter(f => f.endsWith('.json'))
                    .sort().reverse()
                    .slice(0, limit);

                for (const file of files) {
                    const filepath = path.join(this.logsDir, file);
                    const content = fs.readFileSync(filepath, 'utf-8');
                    const log = JSON.parse(content) as VerificationLog;
                    if (!this.inMemoryLogs.has(log.id)) {
                        logs.push(log);
                    }
                }
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logWarn(`[VerificationLogger] Error reading logs: ${msg}`);
        }

        return logs.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    }

    /**
     * Search logs
     */
    public search(query: string): VerificationLog[] {
        const queryLower = query.toLowerCase();
        return this.getRecentLogs(100).filter(log =>
            log.taskId.toLowerCase().includes(queryLower) ||
            log.summary.toLowerCase().includes(queryLower) ||
            log.error?.toLowerCase().includes(queryLower)
        );
    }

    /**
     * Get summary statistics
     */
    public getStats(): { total: number; passed: number; failed: number; avgDuration: number } {
        const logs = this.getRecentLogs(1000);
        const passed = logs.filter(l => l.result === 'passed').length;
        const failed = logs.filter(l => l.result === 'failed' || l.result === 'error').length;
        const avgDuration = logs.length > 0
            ? logs.reduce((sum, l) => sum + l.duration, 0) / logs.length
            : 0;

        return { total: logs.length, passed, failed, avgDuration };
    }

    /**
     * Clean old logs (keep last N days)
     */
    public cleanOldLogs(maxAgeDays: number = 30): number {
        const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
        let removed = 0;

        try {
            if (fs.existsSync(this.logsDir)) {
                const files = fs.readdirSync(this.logsDir);
                for (const file of files) {
                    if (!file.endsWith('.json')) continue;

                    const filepath = path.join(this.logsDir, file);
                    const stat = fs.statSync(filepath);

                    if (stat.mtimeMs < cutoff) {
                        fs.unlinkSync(filepath);
                        removed++;
                    }
                }
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[VerificationLogger] Error cleaning logs: ${msg}`);
        }

        if (removed > 0) {
            logInfo(`[VerificationLogger] Cleaned ${removed} old log files`);
        }
        return removed;
    }

    /**
     * Clear in-memory logs
     */
    public clearMemory(): void {
        this.inMemoryLogs.clear();
    }
}

// Singleton instance
let loggerInstance: VerificationLogger | null = null;

/**
 * Get the singleton VerificationLogger instance
 */
export function getVerificationLogger(): VerificationLogger {
    if (!loggerInstance) {
        loggerInstance = new VerificationLogger();
    }
    return loggerInstance;
}

/**
 * Reset for testing
 */
export function resetVerificationLoggerForTests(): void {
    if (loggerInstance) {
        loggerInstance.clearMemory();
    }
    loggerInstance = null;
}
