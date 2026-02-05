/**
 * Tests for Schema Migration System
 *
 * Covers: MT-005.5b (Schema Migration System)
 *
 * @since MT-005.5b
 */

jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

import {
    MIGRATIONS,
    ensureVersionTable,
    getCurrentVersion,
    getAppliedVersions,
    migrateUp,
    migrateDown,
    getMigrationStatus,
    getMigration,
    getLatestVersion,
    SqlExecutor,
    Migration,
} from '../../../src/services/ticketDb/migrations';

/**
 * Create a mock SQL executor for testing.
 *
 * Simulates a simple in-memory database with schema_versions table support.
 */
function createMockExecutor(): SqlExecutor & {
    executedStatements: string[];
    versionTable: Map<number, { version: number; description: string }>;
    state: { tableExists: boolean };
} {
    const executedStatements: string[] = [];
    const versionTable = new Map<number, { version: number; description: string }>();
    const state = { tableExists: false };

    return {
        executedStatements,
        versionTable,
        state,
        async run(sql: string, params?: unknown[]): Promise<void> {
            executedStatements.push(sql.trim());

            // Handle CREATE TABLE for schema_versions
            if (sql.includes('CREATE TABLE') && sql.includes('schema_versions')) {
                state.tableExists = true;
            }

            // Handle INSERT into schema_versions
            if (sql.includes('INSERT INTO schema_versions') && params) {
                versionTable.set(params[0] as number, {
                    version: params[0] as number,
                    description: params[1] as string,
                });
            }

            // Handle DELETE from schema_versions
            if (sql.includes('DELETE FROM schema_versions') && params) {
                versionTable.delete(params[0] as number);
            }
        },

        async query(sql: string): Promise<Record<string, unknown>[]> {
            executedStatements.push(sql.trim());

            if (sql.includes('SELECT version FROM schema_versions')) {
                if (!state.tableExists) throw new Error('no such table: schema_versions');
                return Array.from(versionTable.values()).map(v => ({ version: v.version }));
            }
            return [];
        },

        async get(sql: string): Promise<Record<string, unknown> | undefined> {
            executedStatements.push(sql.trim());

            if (sql.includes('MAX(version)')) {
                if (!state.tableExists) throw new Error('no such table: schema_versions');
                const versions = Array.from(versionTable.keys());
                const maxVersion = versions.length > 0 ? Math.max(...versions) : null;
                return { max_version: maxVersion };
            }
            return undefined;
        },
    };
}

/**
 * Create a mock executor that fails on specific operations.
 */
function createFailingExecutor(failOnSql: string): SqlExecutor {
    const base = createMockExecutor();
    return {
        async run(sql: string, params?: unknown[]): Promise<void> {
            if (sql.includes(failOnSql)) {
                throw new Error(`Simulated failure on: ${failOnSql}`);
            }
            return base.run(sql, params);
        },
        async query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
            if (sql.includes(failOnSql)) {
                throw new Error(`Simulated failure on: ${failOnSql}`);
            }
            return base.query(sql, params);
        },
        async get(sql: string, params?: unknown[]): Promise<Record<string, unknown> | undefined> {
            if (sql.includes(failOnSql)) {
                throw new Error(`Simulated failure on: ${failOnSql}`);
            }
            return base.get(sql, params);
        },
    };
}

describe('Schema Migration System (MT-005.5b)', () => {

    // ─── Migration Registry ──────────────────────────────────────────────

    describe('Migration Registry', () => {
        it('Test 1: should have migrations defined', () => {
            expect(MIGRATIONS.length).toBeGreaterThan(0);
        });

        it('Test 2: should have sequential version numbers', () => {
            for (let i = 0; i < MIGRATIONS.length; i++) {
                expect(MIGRATIONS[i].version).toBe(i + 1);
            }
        });

        it('Test 3: should have descriptions for all migrations', () => {
            for (const migration of MIGRATIONS) {
                expect(migration.description).toBeTruthy();
                expect(migration.description.length).toBeGreaterThan(0);
            }
        });

        it('Test 4: should have up and down SQL for all migrations', () => {
            for (const migration of MIGRATIONS) {
                expect(migration.up.length).toBeGreaterThan(0);
                expect(migration.down.length).toBeGreaterThan(0);
            }
        });

        it('Test 5: should have first migration creating tickets table', () => {
            const first = MIGRATIONS[0];
            expect(first.version).toBe(1);
            expect(first.up[0]).toContain('CREATE TABLE');
            expect(first.up[0]).toContain('tickets');
        });
    });

    // ─── ensureVersionTable ──────────────────────────────────────────────

    describe('ensureVersionTable', () => {
        it('Test 6: should create schema_versions table', async () => {
            const executor = createMockExecutor();
            await ensureVersionTable(executor);
            expect(executor.executedStatements.some(s => s.includes('CREATE TABLE'))).toBe(true);
            expect(executor.executedStatements.some(s => s.includes('schema_versions'))).toBe(true);
        });
    });

    // ─── getCurrentVersion ───────────────────────────────────────────────

    describe('getCurrentVersion', () => {
        it('Test 7: should return 0 when no migrations applied', async () => {
            const executor = createMockExecutor();
            executor.state.tableExists = true;
            const version = await getCurrentVersion(executor);
            expect(version).toBe(0);
        });

        it('Test 8: should return 0 when version table does not exist', async () => {
            const executor = createMockExecutor();
            const version = await getCurrentVersion(executor);
            expect(version).toBe(0);
        });

        it('Test 9: should return highest applied version', async () => {
            const executor = createMockExecutor();
            executor.state.tableExists = true;
            executor.versionTable.set(1, { version: 1, description: 'v1' });
            executor.versionTable.set(2, { version: 2, description: 'v2' });
            const version = await getCurrentVersion(executor);
            expect(version).toBe(2);
        });
    });

    // ─── getAppliedVersions ──────────────────────────────────────────────

    describe('getAppliedVersions', () => {
        it('Test 10: should return empty array when no migrations applied', async () => {
            const executor = createMockExecutor();
            executor.state.tableExists = true;
            const versions = await getAppliedVersions(executor);
            expect(versions).toEqual([]);
        });

        it('Test 11: should return applied versions', async () => {
            const executor = createMockExecutor();
            executor.state.tableExists = true;
            executor.versionTable.set(1, { version: 1, description: 'v1' });
            executor.versionTable.set(3, { version: 3, description: 'v3' });
            const versions = await getAppliedVersions(executor);
            expect(versions).toContain(1);
            expect(versions).toContain(3);
        });

        it('Test 12: should return empty for non-existent table', async () => {
            const executor = createMockExecutor();
            const versions = await getAppliedVersions(executor);
            expect(versions).toEqual([]);
        });
    });

    // ─── migrateUp ───────────────────────────────────────────────────────

    describe('migrateUp', () => {
        it('Test 13: should apply all migrations from version 0', async () => {
            const executor = createMockExecutor();
            const result = await migrateUp(executor);

            expect(result.success).toBe(true);
            expect(result.applied.length).toBe(MIGRATIONS.length);
            expect(result.currentVersion).toBe(getLatestVersion());
        });

        it('Test 14: should apply migrations up to target version', async () => {
            const executor = createMockExecutor();
            const result = await migrateUp(executor, 3);

            expect(result.success).toBe(true);
            expect(result.applied).toEqual([1, 2, 3]);
            expect(result.currentVersion).toBe(3);
        });

        it('Test 15: should skip already applied migrations', async () => {
            const executor = createMockExecutor();

            // Apply first 3
            await migrateUp(executor, 3);
            executor.executedStatements.length = 0; // Clear

            // Apply remaining
            const result = await migrateUp(executor);
            expect(result.applied).not.toContain(1);
            expect(result.applied).not.toContain(2);
            expect(result.applied).not.toContain(3);
        });

        it('Test 16: should handle already up-to-date database', async () => {
            const executor = createMockExecutor();
            await migrateUp(executor); // Apply all

            const result = await migrateUp(executor); // Try again
            expect(result.success).toBe(true);
            expect(result.applied).toHaveLength(0);
        });

        it('Test 17: should stop on migration error', async () => {
            const executor = createFailingExecutor('ALTER TABLE tickets ADD COLUMN priority');
            const result = await migrateUp(executor);

            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            // Should have applied v1 but stopped at v2
            expect(result.applied).toContain(1);
        });

        it('Test 18: should record each migration in schema_versions', async () => {
            const executor = createMockExecutor();
            await migrateUp(executor, 2);

            expect(executor.versionTable.has(1)).toBe(true);
            expect(executor.versionTable.has(2)).toBe(true);
        });
    });

    // ─── migrateDown ─────────────────────────────────────────────────────

    describe('migrateDown', () => {
        it('Test 19: should rollback to target version', async () => {
            const executor = createMockExecutor();
            await migrateUp(executor, 4);

            const result = await migrateDown(executor, 2);
            expect(result.success).toBe(true);
            expect(result.rolledBack).toContain(4);
            expect(result.rolledBack).toContain(3);
            expect(result.currentVersion).toBe(2);
        });

        it('Test 20: should rollback all migrations to version 0', async () => {
            const executor = createMockExecutor();
            await migrateUp(executor, 3);

            const result = await migrateDown(executor, 0);
            expect(result.success).toBe(true);
            expect(result.rolledBack.length).toBe(3);
            expect(result.currentVersion).toBe(0);
        });

        it('Test 21: should handle already at target version', async () => {
            const executor = createMockExecutor();
            await migrateUp(executor, 2);

            const result = await migrateDown(executor, 2);
            expect(result.success).toBe(true);
            expect(result.rolledBack).toHaveLength(0);
        });

        it('Test 22: should remove version records on rollback', async () => {
            const executor = createMockExecutor();
            await migrateUp(executor, 3);
            expect(executor.versionTable.has(3)).toBe(true);

            await migrateDown(executor, 1);
            expect(executor.versionTable.has(3)).toBe(false);
            expect(executor.versionTable.has(2)).toBe(false);
            expect(executor.versionTable.has(1)).toBe(true);
        });

        it('Test 23: should stop on rollback error', async () => {
            const executor = createMockExecutor();
            await migrateUp(executor, 4);

            // Create an executor that wraps the existing one but fails on DROP INDEX
            const failExecutor: SqlExecutor = {
                async run(sql: string, params?: unknown[]): Promise<void> {
                    if (sql.includes('DROP INDEX')) {
                        throw new Error('Simulated failure on: DROP INDEX');
                    }
                    return executor.run(sql, params);
                },
                async query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
                    return executor.query(sql, params);
                },
                async get(sql: string, params?: unknown[]): Promise<Record<string, unknown> | undefined> {
                    return executor.get(sql, params);
                },
            };

            const result = await migrateDown(failExecutor, 0);
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    // ─── getMigrationStatus ──────────────────────────────────────────────

    describe('getMigrationStatus', () => {
        it('Test 24: should show all pending for fresh database', async () => {
            const executor = createMockExecutor();
            const status = await getMigrationStatus(executor);

            expect(status.currentVersion).toBe(0);
            expect(status.latestVersion).toBe(getLatestVersion());
            expect(status.isUpToDate).toBe(false);
            expect(status.pending.length).toBe(MIGRATIONS.length);
        });

        it('Test 25: should show up-to-date after all migrations', async () => {
            const executor = createMockExecutor();
            await migrateUp(executor);
            const status = await getMigrationStatus(executor);

            expect(status.isUpToDate).toBe(true);
            expect(status.pending).toHaveLength(0);
            expect(status.applied.length).toBe(MIGRATIONS.length);
        });

        it('Test 26: should show partial progress', async () => {
            const executor = createMockExecutor();
            await migrateUp(executor, 3);
            const status = await getMigrationStatus(executor);

            expect(status.currentVersion).toBe(3);
            expect(status.isUpToDate).toBe(false);
            expect(status.applied).toEqual([1, 2, 3]);
            expect(status.pending.length).toBe(MIGRATIONS.length - 3);
        });
    });

    // ─── Helper Functions ────────────────────────────────────────────────

    describe('Helper Functions', () => {
        it('Test 27: should get migration by version', () => {
            const m = getMigration(1);
            expect(m).toBeDefined();
            expect(m!.version).toBe(1);
        });

        it('Test 28: should return undefined for non-existent version', () => {
            expect(getMigration(999)).toBeUndefined();
        });

        it('Test 29: should return latest version number', () => {
            expect(getLatestVersion()).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
        });
    });

    // ─── Migration Content ───────────────────────────────────────────────

    describe('Migration Content Validation', () => {
        it('Test 30: should have indexes migration (v4)', () => {
            const m = getMigration(4);
            expect(m).toBeDefined();
            expect(m!.description.toLowerCase()).toContain('index');
            expect(m!.up.some(s => s.includes('CREATE INDEX'))).toBe(true);
            expect(m!.down.some(s => s.includes('DROP INDEX'))).toBe(true);
        });

        it('Test 31: should have parent/dependency migration (v5)', () => {
            const m = getMigration(5);
            expect(m).toBeDefined();
            expect(m!.up.some(s => s.includes('parent_ticket_id'))).toBe(true);
            expect(m!.up.some(s => s.includes('depends_on'))).toBe(true);
        });

        it('Test 32: should have reversible down migrations', () => {
            for (const migration of MIGRATIONS) {
                expect(migration.down.length).toBeGreaterThan(0);
                // Verify down statements have DROP or ALTER or CREATE (backup)
                const hasReversalOp = migration.down.some(s =>
                    s.includes('DROP') || s.includes('ALTER') || s.includes('CREATE')
                );
                expect(hasReversalOp).toBe(true);
            }
        });
    });
});
