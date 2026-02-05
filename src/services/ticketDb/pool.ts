/**
 * Database Connection Pool
 *
 * Manages SQLite connections with pooling for efficient resource usage.
 * Limits concurrent connections and handles cleanup on extension deactivate.
 *
 * **Simple explanation**: Like a car rental lot - instead of buying a new car
 * every time you need one, you pick one from the lot, use it, then return it.
 * We keep a few database connections ready to use instead of creating new ones
 * each time.
 *
 * @module ticketDb/pool
 * @since MT-005.8
 */

import { logInfo, logWarn, logError } from '../../logger';

/**
 * Connection pool configuration
 */
export interface PoolConfig {
    /** Maximum number of connections in the pool (default: 5) */
    maxConnections: number;
    /** Timeout in ms waiting for a connection (default: 5000) */
    acquireTimeout: number;
    /** Time in ms before an idle connection is closed (default: 30000) */
    idleTimeout: number;
}

/**
 * Default pool configuration
 */
export const DEFAULT_POOL_CONFIG: PoolConfig = {
    maxConnections: 5,
    acquireTimeout: 5000,
    idleTimeout: 30000,
};

/**
 * A pooled connection wrapper
 */
export interface PooledConnection<T = unknown> {
    /** The underlying database connection */
    connection: T;
    /** Unique ID for tracking */
    id: number;
    /** When this connection was created */
    createdAt: number;
    /** When this connection was last used */
    lastUsedAt: number;
    /** Whether this connection is currently in use */
    inUse: boolean;
}

/**
 * Connection Pool Manager
 *
 * Manages a pool of database connections with automatic cleanup.
 *
 * **Simple explanation**: Keeps a collection of database connections ready
 * to use. When you need one, you "borrow" it. When you're done, you "return"
 * it. If all are busy, you wait. Old unused connections get cleaned up.
 *
 * @typeParam T - The type of database connection
 */
export class ConnectionPool<T = unknown> {
    private config: PoolConfig;
    private connections: PooledConnection<T>[] = [];
    private nextId = 1;
    private closed = false;
    private connectionFactory: () => Promise<T>;
    private connectionDestroyer: (conn: T) => Promise<void>;
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor(
        config: Partial<PoolConfig>,
        factory: () => Promise<T>,
        destroyer: (conn: T) => Promise<void>
    ) {
        this.config = { ...DEFAULT_POOL_CONFIG, ...config };
        this.connectionFactory = factory;
        this.connectionDestroyer = destroyer;

        // Start idle connection cleanup
        this.cleanupInterval = setInterval(
            () => this.cleanupIdleConnections(),
            this.config.idleTimeout
        );

        logInfo(`Connection pool created (max: ${this.config.maxConnections})`);
    }

    /**
     * Acquire a connection from the pool.
     *
     * **Simple explanation**: Get a database connection to use.
     * If one is available, you get it immediately. If all are busy
     * and we haven't hit the limit, we create a new one. If we're
     * at the limit, you wait until one is returned.
     *
     * @returns A pooled connection
     * @throws Error if pool is closed or timeout exceeded
     */
    async acquire(): Promise<PooledConnection<T>> {
        if (this.closed) {
            throw new Error('Connection pool is closed');
        }

        // Try to find an idle connection
        const idle = this.connections.find(c => !c.inUse);
        if (idle) {
            idle.inUse = true;
            idle.lastUsedAt = Date.now();
            logInfo(`Reusing connection #${idle.id}`);
            return idle;
        }

        // If room for new connection, create one
        if (this.connections.length < this.config.maxConnections) {
            return this.createConnection();
        }

        // Wait for a connection to be released
        return this.waitForConnection();
    }

    /**
     * Release a connection back to the pool.
     *
     * **Simple explanation**: Return a connection you borrowed so
     * someone else can use it.
     *
     * @param connectionId - The ID of the connection to release
     */
    release(connectionId: number): void {
        const conn = this.connections.find(c => c.id === connectionId);
        if (conn) {
            conn.inUse = false;
            conn.lastUsedAt = Date.now();
            logInfo(`Released connection #${connectionId}`);
        } else {
            logWarn(`Attempted to release unknown connection #${connectionId}`);
        }
    }

    /**
     * Close the pool and destroy all connections.
     *
     * **Simple explanation**: Shut everything down and return all
     * rental cars to the dealership.
     */
    async close(): Promise<void> {
        this.closed = true;

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        const errors: string[] = [];
        for (const conn of this.connections) {
            try {
                await this.connectionDestroyer(conn.connection);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                errors.push(`Failed to close connection #${conn.id}: ${msg}`);
            }
        }

        const count = this.connections.length;
        this.connections = [];

        if (errors.length > 0) {
            logWarn(`Pool closed with ${errors.length} error(s): ${errors.join('; ')}`);
        } else {
            logInfo(`Connection pool closed (${count} connection(s) destroyed)`);
        }
    }

    /**
     * Get pool statistics.
     *
     * @returns Current pool state
     */
    getStats(): {
        total: number;
        active: number;
        idle: number;
        maxConnections: number;
        closed: boolean;
    } {
        const active = this.connections.filter(c => c.inUse).length;
        return {
            total: this.connections.length,
            active,
            idle: this.connections.length - active,
            maxConnections: this.config.maxConnections,
            closed: this.closed,
        };
    }

    /**
     * Check if the pool has available connections.
     *
     * @returns true if a connection can be acquired without waiting
     */
    hasAvailable(): boolean {
        if (this.closed) return false;
        const hasIdle = this.connections.some(c => !c.inUse);
        const hasRoom = this.connections.length < this.config.maxConnections;
        return hasIdle || hasRoom;
    }

    // ─── Private Methods ─────────────────────────────────────────────────

    private async createConnection(): Promise<PooledConnection<T>> {
        const conn = await this.connectionFactory();
        const pooled: PooledConnection<T> = {
            connection: conn,
            id: this.nextId++,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            inUse: true,
        };

        this.connections.push(pooled);
        logInfo(`Created connection #${pooled.id} (total: ${this.connections.length})`);
        return pooled;
    }

    private async waitForConnection(): Promise<PooledConnection<T>> {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const check = () => {
                if (this.closed) {
                    reject(new Error('Connection pool closed while waiting'));
                    return;
                }

                const idle = this.connections.find(c => !c.inUse);
                if (idle) {
                    idle.inUse = true;
                    idle.lastUsedAt = Date.now();
                    logInfo(`Acquired connection #${idle.id} after waiting`);
                    resolve(idle);
                    return;
                }

                if (Date.now() - startTime > this.config.acquireTimeout) {
                    reject(new Error(
                        `Connection pool timeout: no connection available within ${this.config.acquireTimeout}ms`
                    ));
                    return;
                }

                // Check again in 50ms
                setTimeout(check, 50);
            };

            check();
        });
    }

    private async cleanupIdleConnections(): Promise<void> {
        const now = Date.now();
        const toRemove: PooledConnection<T>[] = [];

        for (const conn of this.connections) {
            if (!conn.inUse && (now - conn.lastUsedAt) > this.config.idleTimeout) {
                // Keep at least one connection alive
                if (this.connections.length - toRemove.length > 1) {
                    toRemove.push(conn);
                }
            }
        }

        for (const conn of toRemove) {
            try {
                await this.connectionDestroyer(conn.connection);
                this.connections = this.connections.filter(c => c.id !== conn.id);
                logInfo(`Cleaned up idle connection #${conn.id}`);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                logWarn(`Failed to cleanup connection #${conn.id}: ${msg}`);
            }
        }
    }
}
