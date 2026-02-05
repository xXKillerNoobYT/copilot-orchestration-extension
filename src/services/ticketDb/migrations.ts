/**
 * Schema Migration System
 *
 * Tracks database schema versions and applies migrations in order.
 * Supports both "up" (apply) and "down" (rollback) operations.
 *
 * **Simple explanation**: Like a recipe book for database changes. Each
 * migration is a numbered recipe that transforms the database from one
 * version to the next. If something goes wrong, you can "undo" a recipe
 * to go back to the previous version.
 *
 * @module ticketDb/migrations
 * @since MT-005.5b
 */

import { logInfo, logWarn, logError } from '../../logger';

/**
 * A single migration step
 */
export interface Migration {
    /** Unique version number (sequential, starts at 1) */
    version: number;
    /** Short description of what this migration does */
    description: string;
    /** SQL statements to apply this migration */
    up: string[];
    /** SQL statements to reverse this migration */
    down: string[];
}

/**
 * Result of running migrations
 */
export interface MigrationResult {
    /** Whether all migrations completed successfully */
    success: boolean;
    /** The version the database is now at */
    currentVersion: number;
    /** Migrations that were applied */
    applied: number[];
    /** Migrations that were rolled back */
    rolledBack: number[];
    /** Any errors that occurred */
    errors: string[];
}

/**
 * Interface for executing SQL (abstracts away SQLite vs in-memory)
 */
export interface SqlExecutor {
    /** Run a SQL statement (no return value) */
    run(sql: string, params?: unknown[]): Promise<void>;
    /** Query SQL and return rows */
    query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
    /** Get a single row */
    get(sql: string, params?: unknown[]): Promise<Record<string, unknown> | undefined>;
}

// ─── Migration Registry ──────────────────────────────────────────────────

/**
 * All registered migrations, in order.
 *
 * **Simple explanation**: The list of all database changes, from the
 * very first version to the latest. Each one builds on the previous.
 */
export const MIGRATIONS: Migration[] = [
    {
        version: 1,
        description: 'Initial tickets table with core fields',
        up: [
            `CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                type TEXT,
                thread TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                description TEXT,
                conversationHistory TEXT
            )`,
        ],
        down: [
            'DROP TABLE IF EXISTS tickets',
        ],
    },
    {
        version: 2,
        description: 'Add priority, creator, assignee fields',
        up: [
            "ALTER TABLE tickets ADD COLUMN priority INTEGER DEFAULT 2",
            "ALTER TABLE tickets ADD COLUMN creator TEXT DEFAULT 'system'",
            "ALTER TABLE tickets ADD COLUMN assignee TEXT DEFAULT 'Clarity Agent'",
        ],
        down: [
            // SQLite doesn't support DROP COLUMN before 3.35.0
            // So we recreate the table without the columns
            `CREATE TABLE tickets_backup AS SELECT id, title, status, type, thread,
             createdAt, updatedAt, description, conversationHistory FROM tickets`,
            'DROP TABLE tickets',
            `ALTER TABLE tickets_backup RENAME TO tickets`,
        ],
    },
    {
        version: 3,
        description: 'Add taskId, version, resolution fields',
        up: [
            'ALTER TABLE tickets ADD COLUMN taskId TEXT',
            'ALTER TABLE tickets ADD COLUMN version INTEGER DEFAULT 1',
            'ALTER TABLE tickets ADD COLUMN resolution TEXT',
        ],
        down: [
            `CREATE TABLE tickets_backup AS SELECT id, title, status, type, thread,
             createdAt, updatedAt, description, conversationHistory, priority, creator, assignee FROM tickets`,
            'DROP TABLE tickets',
            'ALTER TABLE tickets_backup RENAME TO tickets',
        ],
    },
    {
        version: 4,
        description: 'Add performance indexes',
        up: [
            'CREATE INDEX IF NOT EXISTS idx_tickets_status_type ON tickets(status, type)',
            'CREATE INDEX IF NOT EXISTS idx_tickets_updatedAt ON tickets(updatedAt DESC)',
            'CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority)',
            'CREATE INDEX IF NOT EXISTS idx_tickets_creator ON tickets(creator)',
        ],
        down: [
            'DROP INDEX IF EXISTS idx_tickets_status_type',
            'DROP INDEX IF EXISTS idx_tickets_updatedAt',
            'DROP INDEX IF EXISTS idx_tickets_priority',
            'DROP INDEX IF EXISTS idx_tickets_creator',
        ],
    },
    {
        version: 5,
        description: 'Add parent_ticket_id and dependency tracking',
        up: [
            'ALTER TABLE tickets ADD COLUMN parent_ticket_id TEXT',
            "ALTER TABLE tickets ADD COLUMN depends_on TEXT DEFAULT '[]'",
            "ALTER TABLE tickets ADD COLUMN blocks TEXT DEFAULT '[]'",
        ],
        down: [
            `CREATE TABLE tickets_backup AS SELECT id, title, status, type, thread,
             createdAt, updatedAt, description, conversationHistory, priority, creator,
             assignee, taskId, version, resolution FROM tickets`,
            'DROP TABLE tickets',
            'ALTER TABLE tickets_backup RENAME TO tickets',
        ],
    },
    {
        version: 6,
        description: 'Add stage_gate and atomic_estimate_minutes',
        up: [
            'ALTER TABLE tickets ADD COLUMN stage_gate INTEGER DEFAULT 1',
            'ALTER TABLE tickets ADD COLUMN atomic_estimate_minutes INTEGER DEFAULT 30',
        ],
        down: [
            `CREATE TABLE tickets_backup AS SELECT id, title, status, type, thread,
             createdAt, updatedAt, description, conversationHistory, priority, creator,
             assignee, taskId, version, resolution, parent_ticket_id, depends_on, blocks
             FROM tickets`,
            'DROP TABLE tickets',
            'ALTER TABLE tickets_backup RENAME TO tickets',
        ],
    },
    {
        version: 7,
        description: 'Add doc_reference and history audit fields',
        up: [
            'ALTER TABLE tickets ADD COLUMN doc_reference TEXT',
            "ALTER TABLE tickets ADD COLUMN history TEXT DEFAULT '{}'",
        ],
        down: [
            `CREATE TABLE tickets_backup AS SELECT id, title, status, type, thread,
             createdAt, updatedAt, description, conversationHistory, priority, creator,
             assignee, taskId, version, resolution, parent_ticket_id, depends_on, blocks,
             stage_gate, atomic_estimate_minutes FROM tickets`,
            'DROP TABLE tickets',
            'ALTER TABLE tickets_backup RENAME TO tickets',
        ],
    },
];

// ─── Migration Engine ────────────────────────────────────────────────────

/**
 * Ensure the schema_versions tracking table exists.
 *
 * **Simple explanation**: Creates a small table that remembers which
 * migrations have already been applied, so we don't run them twice.
 *
 * @param executor - SQL executor for running queries
 */
export async function ensureVersionTable(executor: SqlExecutor): Promise<void> {
    await executor.run(`
        CREATE TABLE IF NOT EXISTS schema_versions (
            version INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now')),
            checksum TEXT
        )
    `);
}

/**
 * Get the current database schema version.
 *
 * @param executor - SQL executor
 * @returns Current version number (0 if no migrations applied)
 */
export async function getCurrentVersion(executor: SqlExecutor): Promise<number> {
    try {
        const row = await executor.get(
            'SELECT MAX(version) as max_version FROM schema_versions'
        );
        return (row?.max_version as number) ?? 0;
    } catch {
        // Table might not exist yet
        return 0;
    }
}

/**
 * Get list of all applied migration versions.
 *
 * @param executor - SQL executor
 * @returns Array of applied version numbers
 */
export async function getAppliedVersions(executor: SqlExecutor): Promise<number[]> {
    try {
        const rows = await executor.query(
            'SELECT version FROM schema_versions ORDER BY version ASC'
        );
        return rows.map(r => r.version as number);
    } catch {
        return [];
    }
}

/**
 * Apply all pending migrations (migrate up to latest).
 *
 * **Simple explanation**: Looks at which database changes haven't been
 * applied yet, and applies them one by one in order. Like catching up
 * on episodes of a TV show you missed.
 *
 * @param executor - SQL executor
 * @param targetVersion - Optional target version (defaults to latest)
 * @returns Result with applied migrations and any errors
 */
export async function migrateUp(
    executor: SqlExecutor,
    targetVersion?: number
): Promise<MigrationResult> {
    await ensureVersionTable(executor);

    const currentVersion = await getCurrentVersion(executor);
    const target = targetVersion ?? MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

    const result: MigrationResult = {
        success: true,
        currentVersion,
        applied: [],
        rolledBack: [],
        errors: [],
    };

    if (currentVersion >= target) {
        logInfo(`Database already at version ${currentVersion}, target is ${target}`);
        return result;
    }

    const pendingMigrations = MIGRATIONS.filter(
        m => m.version > currentVersion && m.version <= target
    );

    for (const migration of pendingMigrations) {
        try {
            logInfo(`Applying migration v${migration.version}: ${migration.description}`);

            for (const sql of migration.up) {
                await executor.run(sql);
            }

            // Record that this migration was applied
            await executor.run(
                'INSERT INTO schema_versions (version, description) VALUES (?, ?)',
                [migration.version, migration.description]
            );

            result.applied.push(migration.version);
            result.currentVersion = migration.version;
            logInfo(`Migration v${migration.version} applied successfully`);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            result.errors.push(`Migration v${migration.version} failed: ${msg}`);
            result.success = false;
            logError(`Migration v${migration.version} failed: ${msg}`);
            break; // Stop on first error
        }
    }

    return result;
}

/**
 * Roll back migrations to a target version.
 *
 * **Simple explanation**: Undoes database changes, going backwards from
 * the current version to the target version. Like pressing "undo" multiple
 * times to get back to an earlier state.
 *
 * @param executor - SQL executor
 * @param targetVersion - The version to roll back to (0 = undo everything)
 * @returns Result with rolled-back migrations and any errors
 */
export async function migrateDown(
    executor: SqlExecutor,
    targetVersion: number
): Promise<MigrationResult> {
    await ensureVersionTable(executor);

    const currentVersion = await getCurrentVersion(executor);

    const result: MigrationResult = {
        success: true,
        currentVersion,
        applied: [],
        rolledBack: [],
        errors: [],
    };

    if (currentVersion <= targetVersion) {
        logInfo(`Database already at version ${currentVersion}, target is ${targetVersion}`);
        return result;
    }

    // Get migrations to rollback, in reverse order
    const rollbackMigrations = MIGRATIONS
        .filter(m => m.version > targetVersion && m.version <= currentVersion)
        .reverse();

    for (const migration of rollbackMigrations) {
        try {
            logInfo(`Rolling back migration v${migration.version}: ${migration.description}`);

            for (const sql of migration.down) {
                await executor.run(sql);
            }

            // Remove the version record
            await executor.run(
                'DELETE FROM schema_versions WHERE version = ?',
                [migration.version]
            );

            result.rolledBack.push(migration.version);
            result.currentVersion = migration.version - 1;
            logInfo(`Migration v${migration.version} rolled back successfully`);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            result.errors.push(`Rollback v${migration.version} failed: ${msg}`);
            result.success = false;
            logError(`Rollback v${migration.version} failed: ${msg}`);
            break; // Stop on first error
        }
    }

    return result;
}

/**
 * Get migration status report.
 *
 * **Simple explanation**: Shows you which migrations have been applied,
 * which are pending, and whether the database is up to date.
 *
 * @param executor - SQL executor
 * @returns Status report
 */
export async function getMigrationStatus(
    executor: SqlExecutor
): Promise<{
    currentVersion: number;
    latestVersion: number;
    isUpToDate: boolean;
    applied: number[];
    pending: number[];
}> {
    await ensureVersionTable(executor);

    const currentVersion = await getCurrentVersion(executor);
    const appliedVersions = await getAppliedVersions(executor);
    const latestVersion = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

    const pendingVersions = MIGRATIONS
        .filter(m => !appliedVersions.includes(m.version))
        .map(m => m.version);

    return {
        currentVersion,
        latestVersion,
        isUpToDate: currentVersion >= latestVersion,
        applied: appliedVersions,
        pending: pendingVersions,
    };
}

/**
 * Get a migration by version number.
 *
 * @param version - The version number to find
 * @returns The migration or undefined
 */
export function getMigration(version: number): Migration | undefined {
    return MIGRATIONS.find(m => m.version === version);
}

/**
 * Get the latest migration version number.
 *
 * @returns The highest version number defined
 */
export function getLatestVersion(): number {
    return MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
}
