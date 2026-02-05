/**
 * Tests for Connection Pool
 *
 * Covers: MT-005.8 (Database Connection Pooling)
 *
 * @since MT-005.8
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import {
    ConnectionPool,
    DEFAULT_POOL_CONFIG,
} from '../../../src/services/ticketDb/pool';

describe('Connection Pool (MT-005.8)', () => {
    let pool: ConnectionPool<{ id: number }>;
    let nextConnId = 1;

    const createFactory = () => {
        return async () => ({ id: nextConnId++ });
    };
    const createDestroyer = () => {
        return async (_conn: { id: number }) => { /* cleanup */ };
    };

    beforeEach(() => {
        nextConnId = 1;
        pool = new ConnectionPool(
            { maxConnections: 3, acquireTimeout: 500, idleTimeout: 60000 },
            createFactory(),
            createDestroyer()
        );
    });

    afterEach(async () => {
        if (pool) {
            await pool.close();
        }
    });

    // ─── Default Config ──────────────────────────────────────────────────

    describe('Configuration', () => {
        it('Test 1: should have sensible default config', () => {
            expect(DEFAULT_POOL_CONFIG.maxConnections).toBe(5);
            expect(DEFAULT_POOL_CONFIG.acquireTimeout).toBe(5000);
            expect(DEFAULT_POOL_CONFIG.idleTimeout).toBe(30000);
        });
    });

    // ─── Acquire ─────────────────────────────────────────────────────────

    describe('Acquire', () => {
        it('Test 2: should create first connection on acquire', async () => {
            const conn = await pool.acquire();
            expect(conn).toBeDefined();
            expect(conn.id).toBe(1);
            expect(conn.inUse).toBe(true);
        });

        it('Test 3: should create multiple connections', async () => {
            const conn1 = await pool.acquire();
            const conn2 = await pool.acquire();
            expect(conn1.id).not.toBe(conn2.id);
        });

        it('Test 4: should reuse released connections', async () => {
            const conn1 = await pool.acquire();
            const connId = conn1.id;
            pool.release(connId);

            const conn2 = await pool.acquire();
            expect(conn2.id).toBe(connId);
        });

        it('Test 5: should not exceed max connections', async () => {
            // Acquire max (3)
            await pool.acquire();
            await pool.acquire();
            await pool.acquire();

            const stats = pool.getStats();
            expect(stats.total).toBe(3);
            expect(stats.active).toBe(3);
        });

        it('Test 6: should timeout when all connections are busy', async () => {
            // Acquire all 3
            await pool.acquire();
            await pool.acquire();
            await pool.acquire();

            // 4th should timeout
            await expect(pool.acquire()).rejects.toThrow('timeout');
        });

        it('Test 7: should throw when pool is closed', async () => {
            await pool.close();
            await expect(pool.acquire()).rejects.toThrow('closed');
        });
    });

    // ─── Release ─────────────────────────────────────────────────────────

    describe('Release', () => {
        it('Test 8: should mark connection as not in use', async () => {
            const conn = await pool.acquire();
            pool.release(conn.id);

            const stats = pool.getStats();
            expect(stats.idle).toBe(1);
            expect(stats.active).toBe(0);
        });

        it('Test 9: should handle releasing unknown connection', () => {
            // Should not throw
            expect(() => pool.release(999)).not.toThrow();
        });
    });

    // ─── Close ───────────────────────────────────────────────────────────

    describe('Close', () => {
        it('Test 10: should close all connections', async () => {
            await pool.acquire();
            await pool.acquire();
            await pool.close();

            const stats = pool.getStats();
            expect(stats.total).toBe(0);
            expect(stats.closed).toBe(true);
        });

        it('Test 11: should handle close errors gracefully', async () => {
            const failingDestroyer = async () => {
                throw new Error('close failed');
            };
            const failPool = new ConnectionPool(
                { maxConnections: 2, acquireTimeout: 500, idleTimeout: 60000 },
                createFactory(),
                failingDestroyer
            );
            await failPool.acquire();

            // Should not throw
            await expect(failPool.close()).resolves.toBeUndefined();
        });
    });

    // ─── Stats ───────────────────────────────────────────────────────────

    describe('Stats', () => {
        it('Test 12: should report correct initial stats', () => {
            const stats = pool.getStats();
            expect(stats.total).toBe(0);
            expect(stats.active).toBe(0);
            expect(stats.idle).toBe(0);
            expect(stats.maxConnections).toBe(3);
            expect(stats.closed).toBe(false);
        });

        it('Test 13: should track active and idle correctly', async () => {
            const conn1 = await pool.acquire();
            await pool.acquire();

            let stats = pool.getStats();
            expect(stats.total).toBe(2);
            expect(stats.active).toBe(2);
            expect(stats.idle).toBe(0);

            pool.release(conn1.id);

            stats = pool.getStats();
            expect(stats.active).toBe(1);
            expect(stats.idle).toBe(1);
        });
    });

    // ─── hasAvailable ────────────────────────────────────────────────────

    describe('hasAvailable', () => {
        it('Test 14: should return true when pool has room', () => {
            expect(pool.hasAvailable()).toBe(true);
        });

        it('Test 15: should return true when idle connections exist', async () => {
            const conn = await pool.acquire();
            pool.release(conn.id);
            expect(pool.hasAvailable()).toBe(true);
        });

        it('Test 16: should return false when all busy and at max', async () => {
            await pool.acquire();
            await pool.acquire();
            await pool.acquire();
            expect(pool.hasAvailable()).toBe(false);
        });

        it('Test 17: should return false when pool is closed', async () => {
            await pool.close();
            expect(pool.hasAvailable()).toBe(false);
        });
    });

    // ─── Concurrent Usage ────────────────────────────────────────────────

    describe('Concurrent Usage', () => {
        it('Test 18: should handle acquire-release-acquire pattern', async () => {
            const conn1 = await pool.acquire();
            pool.release(conn1.id);
            const conn2 = await pool.acquire();
            // Should reuse same connection
            expect(conn2.id).toBe(conn1.id);
        });

        it('Test 19: should handle waiting for released connection', async () => {
            // Fill the pool
            const conn1 = await pool.acquire();
            await pool.acquire();
            await pool.acquire();

            // Release one after a delay
            setTimeout(() => pool.release(conn1.id), 100);

            // Should wait and get the released connection
            const conn4 = await pool.acquire();
            expect(conn4.id).toBe(conn1.id);
        });

        it('Test 20: should update lastUsedAt on acquire', async () => {
            const conn = await pool.acquire();
            const firstUsed = conn.lastUsedAt;

            pool.release(conn.id);
            await new Promise(r => setTimeout(r, 10));

            const reacquired = await pool.acquire();
            expect(reacquired.lastUsedAt).toBeGreaterThan(firstUsed);
        });
    });
});
