/**
 * @file verification/stabilityTimer.ts
 * @module StabilityTimer
 * @description 60-second stability delay timer for verification (MT-015.2)
 * 
 * Waits for files to stop changing before reading them for verification.
 * Resets the timer each time a file changes.
 * 
 * **Simple explanation**: Like waiting for water to settle before looking at
 * your reflection. We wait for files to stop changing before checking them.
 */

import { EventEmitter } from 'events';
import { logInfo, logWarn } from '../../logger';

// ============================================================================
// Types
// ============================================================================

export interface StabilityTimerConfig {
    delayMs: number;        // Default: 60000 (60 seconds)
    maxWaitMs: number;      // Maximum total wait time: 5 minutes
}

export interface StabilitySession {
    id: string;
    files: string[];
    startedAt: number;
    lastChangeAt: number;
    isStable: boolean;
}

// ============================================================================
// StabilityTimer Class
// ============================================================================

/**
 * Timer that waits for file stability before proceeding with verification.
 * 
 * **Simple explanation**: A patient waiter that watches files and only
 * proceeds when nothing has changed for 60 seconds.
 */
export class StabilityTimer extends EventEmitter {
    private config: StabilityTimerConfig;
    private sessions: Map<string, StabilitySession> = new Map();
    private pendingResolves: Map<string, () => void> = new Map();
    private timeoutHandles: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private sessionCounter = 0;

    constructor(config: Partial<StabilityTimerConfig> = {}) {
        super();
        this.config = {
            delayMs: config.delayMs ?? 60000,
            maxWaitMs: config.maxWaitMs ?? 5 * 60 * 1000
        };
    }

    /**
     * Wait for files to become stable (no changes for delayMs)
     * 
     * @param files - List of file paths to monitor
     * @returns Promise that resolves when stable
     */
    async waitForStability(files: string[]): Promise<void> {
        const sessionId = `stability-${++this.sessionCounter}`;

        const session: StabilitySession = {
            id: sessionId,
            files,
            startedAt: Date.now(),
            lastChangeAt: Date.now(),
            isStable: false
        };

        this.sessions.set(sessionId, session);

        return new Promise((resolve, reject) => {
            this.pendingResolves.set(sessionId, resolve);

            // Set initial stability timer
            this.resetTimer(sessionId);

            // Set maximum wait timeout
            const maxTimeout = setTimeout(() => {
                if (!session.isStable) {
                    logWarn(`[StabilityTimer] Max wait exceeded for session ${sessionId}`);
                    this.completeSession(sessionId, true);
                }
            }, this.config.maxWaitMs);

            // Store for cleanup
            this.timeoutHandles.set(`${sessionId}-max`, maxTimeout);
        });
    }

    /**
     * Report a file change (resets the stability timer)
     */
    reportFileChange(filePath: string): void {
        for (const [sessionId, session] of this.sessions.entries()) {
            if (!session.isStable && session.files.some(f =>
                filePath.includes(f) || f.includes(filePath)
            )) {
                session.lastChangeAt = Date.now();
                logInfo(`[StabilityTimer] File change detected, resetting timer for ${sessionId}`);
                this.resetTimer(sessionId);
                this.emit('reset', { sessionId, filePath });
            }
        }
    }

    /**
     * Reset the stability timer for a session
     */
    private resetTimer(sessionId: string): void {
        // Clear existing timer
        const existingHandle = this.timeoutHandles.get(sessionId);
        if (existingHandle) {
            clearTimeout(existingHandle);
        }

        // Set new timer
        const handle = setTimeout(() => {
            this.completeSession(sessionId, false);
        }, this.config.delayMs);

        this.timeoutHandles.set(sessionId, handle);
    }

    /**
     * Complete a stability session
     */
    private completeSession(sessionId: string, timedOut: boolean): void {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.isStable = true;

        // Clear timers
        const handle = this.timeoutHandles.get(sessionId);
        if (handle) clearTimeout(handle);

        const maxHandle = this.timeoutHandles.get(`${sessionId}-max`);
        if (maxHandle) clearTimeout(maxHandle);

        this.timeoutHandles.delete(sessionId);
        this.timeoutHandles.delete(`${sessionId}-max`);

        // Resolve the promise
        const resolve = this.pendingResolves.get(sessionId);
        if (resolve) {
            resolve();
            this.pendingResolves.delete(sessionId);
        }

        const duration = Date.now() - session.startedAt;
        logInfo(`[StabilityTimer] Session ${sessionId} complete (${duration}ms, timedOut=${timedOut})`);

        this.emit('stable', { sessionId, duration, timedOut });
        this.sessions.delete(sessionId);
    }

    /**
     * Cancel all pending sessions
     */
    cancelAll(): void {
        for (const sessionId of this.sessions.keys()) {
            this.completeSession(sessionId, true);
        }
    }

    /**
     * Get current session count
     */
    getActiveSessionCount(): number {
        return this.sessions.size;
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new StabilityTimer instance
 */
export function createStabilityTimer(config?: Partial<StabilityTimerConfig>): StabilityTimer {
    return new StabilityTimer(config);
}
