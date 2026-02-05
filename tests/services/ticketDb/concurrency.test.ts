/**
 * Tests for Version Control & Concurrency
 *
 * Covers: MT-007.1 (Optimistic Locking), MT-007.2 (Retry Logic),
 *         MT-007.3 (Conflict Detection), MT-007.4 (Concurrency Tests),
 *         MT-007.5 (Transaction Handling), MT-007.6 (Deadlock Prevention)
 *
 * @since MT-007.1
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import {
    withRetry,
    calculateDelay,
    isRetryableError,
    isSqliteBusy,
    isSqliteFull,
    DEFAULT_RETRY_CONFIG,
} from '../../../src/services/ticketDb/retry';

import {
    checkVersion,
    incrementVersion,
    buildVersionCheckSQL,
    detectFieldConflicts,
    attemptMerge,
} from '../../../src/services/ticketDb/conflict';

import {
    withTransaction,
    getLockOrder,
    LockManager,
    getLockManager,
    resetLockManagerForTests,
    DEFAULT_TRANSACTION_OPTIONS,
} from '../../../src/services/ticketDb/transaction';

describe('Version Control & Concurrency (MT-007)', () => {

    // ─── Retry Logic (MT-007.2) ──────────────────────────────────────────

    describe('Retry Logic', () => {
        it('Test 1: should succeed on first attempt', async () => {
            const result = await withRetry(async () => 'success');
            expect(result.success).toBe(true);
            expect(result.value).toBe('success');
            expect(result.attempts).toBe(1);
        });

        it('Test 2: should retry on SQLITE_BUSY', async () => {
            let attempts = 0;
            const result = await withRetry(async () => {
                attempts++;
                if (attempts < 3) throw new Error('SQLITE_BUSY');
                return 'success';
            }, { baseDelayMs: 10, maxRetries: 5 });

            expect(result.success).toBe(true);
            expect(result.attempts).toBe(3);
        });

        it('Test 3: should fail after max retries', async () => {
            const result = await withRetry(
                async () => { throw new Error('SQLITE_BUSY'); },
                { maxRetries: 2, baseDelayMs: 10 }
            );
            expect(result.success).toBe(false);
            expect(result.attempts).toBe(3); // initial + 2 retries
            expect(result.errors.length).toBe(3);
        });

        it('Test 4: should not retry non-retryable errors', async () => {
            const result = await withRetry(
                async () => { throw new Error('UNIQUE constraint violated'); },
                { baseDelayMs: 10 }
            );
            expect(result.success).toBe(false);
            expect(result.attempts).toBe(1); // No retry
        });

        it('Test 5: should track total time', async () => {
            const result = await withRetry(async () => 'fast');
            expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
        });

        it('Test 6: should calculate exponential delay', () => {
            const d0 = calculateDelay(0, { baseDelayMs: 100, backoffMultiplier: 2, jitter: false, maxDelayMs: 5000, maxRetries: 5, retryableErrors: [] });
            const d1 = calculateDelay(1, { baseDelayMs: 100, backoffMultiplier: 2, jitter: false, maxDelayMs: 5000, maxRetries: 5, retryableErrors: [] });
            const d2 = calculateDelay(2, { baseDelayMs: 100, backoffMultiplier: 2, jitter: false, maxDelayMs: 5000, maxRetries: 5, retryableErrors: [] });

            expect(d0).toBe(100);
            expect(d1).toBe(200);
            expect(d2).toBe(400);
        });

        it('Test 7: should cap delay at maxDelayMs', () => {
            const delay = calculateDelay(10, { baseDelayMs: 100, backoffMultiplier: 2, jitter: false, maxDelayMs: 1000, maxRetries: 5, retryableErrors: [] });
            expect(delay).toBe(1000);
        });

        it('Test 8: should identify retryable errors', () => {
            expect(isRetryableError('SQLITE_BUSY')).toBe(true);
            expect(isRetryableError('SQLITE_LOCKED')).toBe(true);
            expect(isRetryableError('database is locked')).toBe(true);
            expect(isRetryableError('UNIQUE constraint')).toBe(false);
        });

        it('Test 9: should detect SQLITE_BUSY errors', () => {
            expect(isSqliteBusy(new Error('SQLITE_BUSY'))).toBe(true);
            expect(isSqliteBusy(new Error('something else'))).toBe(false);
        });

        it('Test 10: should detect SQLITE_FULL errors', () => {
            expect(isSqliteFull(new Error('SQLITE_FULL'))).toBe(true);
            expect(isSqliteFull(new Error('database or disk is full'))).toBe(true);
            expect(isSqliteFull(new Error('something else'))).toBe(false);
        });

        it('Test 11: should have sensible default config', () => {
            expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(5);
            expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(100);
            expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(5000);
        });
    });

    // ─── Optimistic Locking (MT-007.1) ───────────────────────────────────

    describe('Optimistic Locking', () => {
        it('Test 12: should pass when versions match', () => {
            const result = checkVersion('TK-0001', 3, 3);
            expect(result.valid).toBe(true);
            expect(result.currentVersion).toBe(3);
        });

        it('Test 13: should fail when versions differ', () => {
            const result = checkVersion('TK-0001', 3, 5);
            expect(result.valid).toBe(false);
            expect(result.conflict).toBeDefined();
            expect(result.conflict!.expectedVersion).toBe(3);
            expect(result.conflict!.actualVersion).toBe(5);
        });

        it('Test 14: should provide resolution options', () => {
            const result = checkVersion('TK-0001', 1, 2);
            expect(result.conflict!.resolutionOptions.length).toBeGreaterThan(0);
            const strategies = result.conflict!.resolutionOptions.map(r => r.strategy);
            expect(strategies).toContain('retry');
            expect(strategies).toContain('abort');
        });

        it('Test 15: should increment version correctly', () => {
            expect(incrementVersion(1)).toBe(2);
            expect(incrementVersion(5)).toBe(6);
            expect(incrementVersion(100)).toBe(101);
        });

        it('Test 16: should build version check SQL', () => {
            const { clause, param } = buildVersionCheckSQL(3);
            expect(clause).toContain('version = ?');
            expect(param).toBe(3);
        });
    });

    // ─── Conflict Detection (MT-007.3) ───────────────────────────────────

    describe('Conflict Detection', () => {
        it('Test 17: should detect no conflicts when fields differ', () => {
            const original = { title: 'Old', status: 'open' };
            const current = { title: 'Old', status: 'in-progress' }; // other person changed status
            const ourChanges = { title: 'New Title' }; // we changed title

            const conflicts = detectFieldConflicts(original, current, ourChanges);
            expect(conflicts).toHaveLength(0); // Different fields changed
        });

        it('Test 18: should detect conflict on same field', () => {
            const original = { title: 'Old', status: 'open' };
            const current = { title: 'Other Title', status: 'open' }; // other person changed title
            const ourChanges = { title: 'Our Title' }; // we also changed title

            const conflicts = detectFieldConflicts(original, current, ourChanges);
            expect(conflicts).toContain('title');
        });

        it('Test 19: should not flag same value as conflict', () => {
            const original = { status: 'open' };
            const current = { status: 'done' }; // other person set done
            const ourChanges = { status: 'done' }; // we also want done

            const conflicts = detectFieldConflicts(original, current, ourChanges);
            expect(conflicts).toHaveLength(0); // Both want the same thing
        });

        it('Test 20: should ignore immutable fields', () => {
            const original = { id: 'TK-0001' };
            const current = { id: 'TK-0001' };
            const ourChanges = { id: 'TK-9999' };

            const conflicts = detectFieldConflicts(original, current, ourChanges);
            expect(conflicts).not.toContain('id');
        });
    });

    describe('Three-Way Merge', () => {
        it('Test 21: should auto-merge non-conflicting changes', () => {
            const original = { title: 'Old', status: 'open', priority: 2 };
            const current = { title: 'Old', status: 'in-progress', priority: 2 };
            const ourChanges = { title: 'New Title' };

            const result = attemptMerge(original, current, ourChanges);
            expect(result.autoMerged).toBe(true);
            expect(result.merged.title).toBe('New Title');
            expect(result.merged.status).toBe('in-progress'); // Keep other's change
        });

        it('Test 22: should identify manual merge fields', () => {
            const original = { title: 'Old' };
            const current = { title: 'Other Title' };
            const ourChanges = { title: 'Our Title' };

            const result = attemptMerge(original, current, ourChanges);
            expect(result.autoMerged).toBe(false);
            expect(result.manualFields).toContain('title');
        });

        it('Test 23: should handle complex merge scenarios', () => {
            const original = { title: 'Old', status: 'open', priority: 2, assignee: 'Agent A' };
            const current = { title: 'Old', status: 'in-progress', priority: 2, assignee: 'Agent A' };
            const ourChanges = { priority: 1, assignee: 'Agent B' };

            const result = attemptMerge(original, current, ourChanges);
            expect(result.autoMerged).toBe(true);
            expect(result.merged.status).toBe('in-progress'); // Other's
            expect(result.merged.priority).toBe(1); // Ours
            expect(result.merged.assignee).toBe('Agent B'); // Ours
        });
    });

    // ─── Transaction Handling (MT-007.5) ──────────────────────────────────

    describe('Transaction Handling', () => {
        const createMockTxExecutor = () => {
            const statements: string[] = [];
            return {
                statements,
                async run(sql: string, _params?: unknown[]): Promise<void> {
                    statements.push(sql);
                },
                async query(sql: string): Promise<Record<string, unknown>[]> {
                    statements.push(sql);
                    return [];
                },
                async get(sql: string): Promise<Record<string, unknown> | undefined> {
                    statements.push(sql);
                    return undefined;
                },
            };
        };

        it('Test 24: should commit on success', async () => {
            const executor = createMockTxExecutor();
            const result = await withTransaction(executor, async (tx) => {
                await tx.run("UPDATE tickets SET status = 'done'");
                return 'ok';
            });

            expect(result.committed).toBe(true);
            expect(result.value).toBe('ok');
            expect(result.rolledBack).toBe(false);
            expect(executor.statements).toContain('COMMIT');
        });

        it('Test 25: should rollback on error', async () => {
            const executor = createMockTxExecutor();
            const result = await withTransaction(executor, async () => {
                throw new Error('Something failed');
            });

            expect(result.committed).toBe(false);
            expect(result.rolledBack).toBe(true);
            expect(result.error).toContain('Something failed');
            expect(executor.statements).toContain('ROLLBACK');
        });

        it('Test 26: should use DEFERRED mode by default', async () => {
            const executor = createMockTxExecutor();
            await withTransaction(executor, async () => 'ok');
            expect(executor.statements[0]).toContain('DEFERRED');
        });

        it('Test 27: should support EXCLUSIVE mode', async () => {
            const executor = createMockTxExecutor();
            await withTransaction(executor, async () => 'ok', { mode: 'EXCLUSIVE' });
            expect(executor.statements[0]).toContain('EXCLUSIVE');
        });

        it('Test 28: should have sensible default options', () => {
            expect(DEFAULT_TRANSACTION_OPTIONS.mode).toBe('DEFERRED');
            expect(DEFAULT_TRANSACTION_OPTIONS.lockTimeout).toBe(5000);
        });
    });

    // ─── Lock Ordering & Deadlock Prevention (MT-007.6) ──────────────────

    describe('Lock Ordering', () => {
        it('Test 29: should sort resource IDs consistently', () => {
            const order = getLockOrder(['TK-0005', 'TK-0001', 'TK-0003']);
            expect(order).toEqual(['TK-0001', 'TK-0003', 'TK-0005']);
        });

        it('Test 30: should handle single resource', () => {
            expect(getLockOrder(['TK-0001'])).toEqual(['TK-0001']);
        });

        it('Test 31: should handle empty array', () => {
            expect(getLockOrder([])).toEqual([]);
        });
    });

    describe('LockManager', () => {
        let lockManager: LockManager;

        beforeEach(() => {
            lockManager = new LockManager();
        });

        it('Test 32: should acquire lock', () => {
            expect(lockManager.acquire('TK-0001', 'AgentA')).toBe(true);
            expect(lockManager.isLocked('TK-0001')).not.toBeNull();
        });

        it('Test 33: should reject duplicate lock', () => {
            lockManager.acquire('TK-0001', 'AgentA');
            expect(lockManager.acquire('TK-0001', 'AgentB')).toBe(false);
        });

        it('Test 34: should release lock by holder', () => {
            lockManager.acquire('TK-0001', 'AgentA');
            expect(lockManager.release('TK-0001', 'AgentA')).toBe(true);
            expect(lockManager.isLocked('TK-0001')).toBeNull();
        });

        it('Test 35: should not release lock by wrong holder', () => {
            lockManager.acquire('TK-0001', 'AgentA');
            expect(lockManager.release('TK-0001', 'AgentB')).toBe(false);
        });

        it('Test 36: should auto-release stale locks', async () => {
            lockManager.acquire('TK-0001', 'AgentA', 50); // 50ms timeout
            await new Promise(r => setTimeout(r, 100));
            expect(lockManager.isLocked('TK-0001')).toBeNull();
        });

        it('Test 37: should force-release locks', () => {
            lockManager.acquire('TK-0001', 'AgentA');
            expect(lockManager.forceRelease('TK-0001')).toBe(true);
            expect(lockManager.isLocked('TK-0001')).toBeNull();
        });

        it('Test 38: should list all locks', () => {
            lockManager.acquire('TK-0001', 'AgentA');
            lockManager.acquire('TK-0002', 'AgentB');
            const locks = lockManager.getAllLocks();
            expect(locks.size).toBe(2);
        });

        it('Test 39: should reset for tests', () => {
            lockManager.acquire('TK-0001', 'AgentA');
            lockManager.resetForTests();
            expect(lockManager.isLocked('TK-0001')).toBeNull();
        });
    });

    describe('Singleton LockManager', () => {
        beforeEach(() => {
            resetLockManagerForTests();
        });

        it('Test 40: should return singleton instance', () => {
            const lm1 = getLockManager();
            const lm2 = getLockManager();
            expect(lm1).toBe(lm2);
        });

        it('Test 41: should reset singleton', () => {
            const lm1 = getLockManager();
            resetLockManagerForTests();
            const lm2 = getLockManager();
            expect(lm1).not.toBe(lm2);
        });
    });

    // ─── Concurrent Simulation (MT-007.4) ────────────────────────────────

    describe('Concurrent Simulation', () => {
        it('Test 42: should handle simultaneous version checks', () => {
            // Simulate 10 agents checking the same ticket
            const results = [];
            for (let i = 0; i < 10; i++) {
                // Agent i thinks the version is 1
                const result = checkVersion('TK-0001', 1, i === 0 ? 1 : 2);
                results.push(result);
            }

            // First agent succeeds (version still 1)
            expect(results[0].valid).toBe(true);
            // All others fail (version is now 2)
            for (let i = 1; i < 10; i++) {
                expect(results[i].valid).toBe(false);
            }
        });

        it('Test 43: should handle concurrent lock acquisition', () => {
            const lm = new LockManager();
            const results: boolean[] = [];

            // 10 agents try to lock the same resource
            for (let i = 0; i < 10; i++) {
                results.push(lm.acquire('TK-0001', `Agent${i}`));
            }

            // Only first should succeed
            expect(results[0]).toBe(true);
            for (let i = 1; i < 10; i++) {
                expect(results[i]).toBe(false);
            }
        });
    });
});
