/**
 * Transaction Handling Module
 *
 * Wraps multiple database operations in SQLite transactions with
 * automatic rollback on failure and deadlock prevention.
 *
 * **Simple explanation**: Like a safety net for database changes. If
 * you need to make several changes that all need to succeed together
 * (like transferring money - debit one account AND credit another),
 * a transaction ensures either ALL changes happen or NONE do.
 *
 * @module ticketDb/transaction
 * @since MT-007.5
 */

import { logInfo, logWarn, logError } from '../../logger';

/**
 * Interface for executing SQL within a transaction
 */
export interface TransactionExecutor {
    /** Run a SQL statement */
    run(sql: string, params?: unknown[]): Promise<void>;
    /** Query and return rows */
    query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
    /** Get a single row */
    get(sql: string, params?: unknown[]): Promise<Record<string, unknown> | undefined>;
}

/**
 * Transaction options
 */
export interface TransactionOptions {
    /** Transaction isolation mode (default: 'DEFERRED') */
    mode: 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE';
    /** Timeout for acquiring lock in ms (default: 5000) */
    lockTimeout: number;
    /** Whether to auto-retry on SQLITE_BUSY (default: true) */
    retryOnBusy: boolean;
    /** Maximum retries on busy (default: 3) */
    maxBusyRetries: number;
}

/**
 * Default transaction options
 */
export const DEFAULT_TRANSACTION_OPTIONS: TransactionOptions = {
    mode: 'DEFERRED',
    lockTimeout: 5000,
    retryOnBusy: true,
    maxBusyRetries: 3,
};

/**
 * Result of a transaction
 */
export interface TransactionResult<T> {
    /** Whether the transaction committed successfully */
    committed: boolean;
    /** The return value from the transaction callback */
    value?: T;
    /** Error if the transaction failed */
    error?: string;
    /** Whether a rollback was performed */
    rolledBack: boolean;
}

/**
 * Execute a function within a database transaction.
 *
 * **Simple explanation**: Run a bunch of database operations as a single
 * unit. If any one fails, all changes are undone (rolled back). If all
 * succeed, the changes are saved (committed).
 *
 * @param executor - SQL executor for running queries
 * @param callback - Function containing the operations to execute
 * @param options - Optional transaction configuration
 * @returns Transaction result
 *
 * @example
 * const result = await withTransaction(db, async (tx) => {
 *   await tx.run("UPDATE tickets SET status = 'done' WHERE id = ?", ['TK-0001']);
 *   await tx.run("INSERT INTO history ...");
 *   return 'success';
 * });
 */
export async function withTransaction<T>(
    executor: TransactionExecutor,
    callback: (tx: TransactionExecutor) => Promise<T>,
    options?: Partial<TransactionOptions>
): Promise<TransactionResult<T>> {
    const opts = { ...DEFAULT_TRANSACTION_OPTIONS, ...options };

    try {
        // Begin transaction
        await executor.run(`BEGIN ${opts.mode}`);
        logInfo(`Transaction started (${opts.mode})`);

        // Execute callback
        const value = await callback(executor);

        // Commit
        await executor.run('COMMIT');
        logInfo('Transaction committed');

        return {
            committed: true,
            value,
            rolledBack: false,
        };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Transaction failed: ${msg}`);

        // Attempt rollback
        try {
            await executor.run('ROLLBACK');
            logInfo('Transaction rolled back');
        } catch (rollbackError: unknown) {
            const rbMsg = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
            logWarn(`Rollback also failed: ${rbMsg}`);
        }

        return {
            committed: false,
            error: msg,
            rolledBack: true,
        };
    }
}

/**
 * Lock ordering helper to prevent deadlocks.
 *
 * **Simple explanation**: Deadlocks happen when two processes each hold
 * a lock the other needs. By always acquiring locks in the same order
 * (alphabetically by resource ID), we prevent circular waiting.
 *
 * @param resourceIds - IDs of resources to lock
 * @returns Sorted resource IDs in consistent lock order
 *
 * @example
 * const lockOrder = getLockOrder(['TK-0005', 'TK-0001', 'TK-0003']);
 * // Returns ['TK-0001', 'TK-0003', 'TK-0005'] - always alphabetical
 */
export function getLockOrder(resourceIds: string[]): string[] {
    return [...resourceIds].sort();
}

/**
 * In-memory lock manager for coordinating concurrent operations.
 *
 * **Simple explanation**: Like a sign-out sheet at a library. Before
 * you use a resource, you sign it out. When you're done, you sign it
 * back in. If someone else has it, you wait.
 */
export class LockManager {
    private locks: Map<string, {
        holder: string;
        acquiredAt: number;
        timeout: number;
    }> = new Map();

    /**
     * Attempt to acquire a lock on a resource.
     *
     * @param resourceId - The resource to lock
     * @param holder - Who is acquiring the lock
     * @param timeout - Lock timeout in ms (default: 5000)
     * @returns true if lock acquired, false if already locked
     */
    acquire(resourceId: string, holder: string, timeout: number = 5000): boolean {
        // Check for stale locks
        this.cleanupStaleLocks();

        const existing = this.locks.get(resourceId);
        if (existing) {
            logWarn(`Lock on ${resourceId} held by ${existing.holder}`);
            return false;
        }

        this.locks.set(resourceId, {
            holder,
            acquiredAt: Date.now(),
            timeout,
        });

        logInfo(`Lock acquired on ${resourceId} by ${holder}`);
        return true;
    }

    /**
     * Release a lock on a resource.
     *
     * @param resourceId - The resource to unlock
     * @param holder - Who is releasing (must match acquirer)
     * @returns true if released, false if not held by this holder
     */
    release(resourceId: string, holder: string): boolean {
        const lock = this.locks.get(resourceId);
        if (!lock) {
            return false;
        }

        if (lock.holder !== holder) {
            logWarn(`Cannot release lock on ${resourceId}: held by ${lock.holder}, not ${holder}`);
            return false;
        }

        this.locks.delete(resourceId);
        logInfo(`Lock released on ${resourceId} by ${holder}`);
        return true;
    }

    /**
     * Check if a resource is locked.
     *
     * @param resourceId - The resource to check
     * @returns Lock info or null if unlocked
     */
    isLocked(resourceId: string): { holder: string; acquiredAt: number } | null {
        this.cleanupStaleLocks();
        const lock = this.locks.get(resourceId);
        return lock ? { holder: lock.holder, acquiredAt: lock.acquiredAt } : null;
    }

    /**
     * Force-release a stale lock.
     *
     * @param resourceId - The resource to force-unlock
     * @returns true if force-released
     */
    forceRelease(resourceId: string): boolean {
        if (this.locks.has(resourceId)) {
            this.locks.delete(resourceId);
            logWarn(`Force-released lock on ${resourceId}`);
            return true;
        }
        return false;
    }

    /**
     * Get all current locks.
     *
     * @returns Map of resource IDs to lock info
     */
    getAllLocks(): Map<string, { holder: string; acquiredAt: number }> {
        this.cleanupStaleLocks();
        const result = new Map<string, { holder: string; acquiredAt: number }>();
        for (const [key, value] of this.locks) {
            result.set(key, { holder: value.holder, acquiredAt: value.acquiredAt });
        }
        return result;
    }

    /**
     * Remove stale locks that have exceeded their timeout.
     */
    private cleanupStaleLocks(): void {
        const now = Date.now();
        for (const [key, lock] of this.locks) {
            if (now - lock.acquiredAt > lock.timeout) {
                this.locks.delete(key);
                logWarn(`Stale lock on ${key} auto-released (was held by ${lock.holder})`);
            }
        }
    }

    /**
     * Reset all locks (testing only).
     */
    resetForTests(): void {
        this.locks.clear();
    }
}

// ─── Singleton Lock Manager ──────────────────────────────────────────────

let lockManagerInstance: LockManager | null = null;

/**
 * Get the global lock manager instance.
 *
 * @returns The lock manager singleton
 */
export function getLockManager(): LockManager {
    if (!lockManagerInstance) {
        lockManagerInstance = new LockManager();
    }
    return lockManagerInstance;
}

/**
 * Reset the lock manager (testing only).
 */
export function resetLockManagerForTests(): void {
    if (lockManagerInstance) {
        lockManagerInstance.resetForTests();
    }
    lockManagerInstance = null;
}
