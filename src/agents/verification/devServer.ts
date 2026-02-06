/**
 * Dev Server Launcher for Verification Team
 * 
 * **Simple explanation**: Starts a development server (like npm run dev)
 * for visual verification, manages the server lifecycle, and ensures
 * cleanup when verification is complete. Like automatically running
 * your app so you can check if the UI looks right.
 * 
 * @module agents/verification/devServer
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { logInfo, logWarn, logError } from '../../logger';

/**
 * Dev server configuration
 */
export interface DevServerConfig {
    /** Command to run the dev server */
    command: string;
    /** Arguments for the command */
    args: string[];
    /** Working directory */
    cwd: string;
    /** Port the server runs on */
    port: number;
    /** Max time to wait for server to start (ms) */
    startupTimeoutMs: number;
    /** Max time server can run before auto-kill (ms) */
    maxRuntimeMs: number;
    /** Environment variables */
    env?: Record<string, string>;
}

/**
 * Dev server status
 */
export interface DevServerStatus {
    /** Whether server is running */
    running: boolean;
    /** PID of the server process */
    pid?: number;
    /** Port the server is on */
    port?: number;
    /** URL to access the server */
    url?: string;
    /** Start time */
    startedAt?: number;
    /** Any error that occurred */
    error?: string;
}

/**
 * Default dev server configuration
 */
const DEFAULT_CONFIG: DevServerConfig = {
    command: 'npm',
    args: ['run', 'dev'],
    cwd: '',
    port: 3000,
    startupTimeoutMs: 30000, // 30 seconds
    maxRuntimeMs: 5 * 60 * 1000, // 5 minutes
    env: {}
};

/**
 * Dev Server Launcher
 * 
 * **Simple explanation**: Manages starting and stopping the development
 * server for visual verification. Ensures the server doesn't run forever
 * and cleans up properly.
 */
export class DevServerLauncher {
    private process: ChildProcess | null = null;
    private config: DevServerConfig;
    private status: DevServerStatus = { running: false };
    private maxRuntimeTimer: NodeJS.Timeout | null = null;
    private output: string[] = [];

    constructor(config: Partial<DevServerConfig> = {}) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.config = {
            ...DEFAULT_CONFIG,
            cwd: workspaceRoot,
            ...config
        };
    }

    /**
     * Start the dev server
     */
    public async start(): Promise<DevServerStatus> {
        if (this.status.running) {
            logWarn('[DevServer] Server already running');
            return this.status;
        }

        logInfo(`[DevServer] Starting: ${this.config.command} ${this.config.args.join(' ')}`);

        return new Promise((resolve) => {
            try {
                this.process = spawn(this.config.command, this.config.args, {
                    cwd: this.config.cwd,
                    shell: true,
                    env: { ...process.env, ...this.config.env }
                });

                this.status = {
                    running: true,
                    pid: this.process.pid,
                    port: this.config.port,
                    url: `http://localhost:${this.config.port}`,
                    startedAt: Date.now()
                };

                // Capture output
                this.process.stdout?.on('data', (data) => {
                    const line = data.toString();
                    this.output.push(line);
                    // Check for typical "server ready" messages
                    if (line.includes('ready') || line.includes('started') ||
                        line.includes('listening') || line.includes(`localhost:${this.config.port}`)) {
                        logInfo(`[DevServer] Server ready at ${this.status.url}`);
                    }
                });

                this.process.stderr?.on('data', (data) => {
                    const line = data.toString();
                    this.output.push(`[stderr] ${line}`);
                    // Many frameworks use stderr for startup messages
                    if (!line.toLowerCase().includes('error')) {
                        return;
                    }
                    logWarn(`[DevServer] stderr: ${line.substring(0, 200)}`);
                });

                this.process.on('error', (error) => {
                    this.status.error = error.message;
                    this.status.running = false;
                    logError(`[DevServer] Process error: ${error.message}`);
                });

                this.process.on('exit', (code) => {
                    this.status.running = false;
                    if (code !== 0 && code !== null) {
                        logWarn(`[DevServer] Exited with code ${code}`);
                    }
                    this.cleanup();
                });

                // Set max runtime timer
                this.maxRuntimeTimer = setTimeout(() => {
                    logWarn(`[DevServer] Max runtime exceeded (${this.config.maxRuntimeMs}ms), stopping`);
                    this.stop();
                }, this.config.maxRuntimeMs);

                // Wait a bit for server to start
                setTimeout(() => {
                    resolve(this.status);
                }, 2000); // 2 seconds for initial startup

            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                this.status = { running: false, error: msg };
                logError(`[DevServer] Failed to start: ${msg}`);
                resolve(this.status);
            }
        });
    }

    /**
     * Stop the dev server
     */
    public async stop(): Promise<void> {
        if (!this.process || !this.status.running) {
            return;
        }

        logInfo('[DevServer] Stopping server...');

        return new Promise((resolve) => {
            if (!this.process) {
                resolve();
                return;
            }

            // Try graceful shutdown first
            const killed = this.process.kill('SIGTERM');

            if (!killed) {
                // Force kill if SIGTERM failed
                this.process.kill('SIGKILL');
            }

            // Wait for process to exit
            let exitTimeout: NodeJS.Timeout | undefined;

            const onExit = () => {
                if (exitTimeout) {
                    clearTimeout(exitTimeout);
                }
                this.cleanup();
                resolve();
            };

            this.process.once('exit', onExit);

            // Force resolve after timeout
            exitTimeout = setTimeout(() => {
                logWarn('[DevServer] Timeout waiting for graceful shutdown');
                if (this.process) {
                    this.process.removeListener('exit', onExit);
                    this.process.kill('SIGKILL');
                }
                this.cleanup();
                resolve();
            }, 5000); // 5 second timeout for graceful shutdown
        });
    }

    /**
     * Clean up resources
     */
    private cleanup(): void {
        if (this.maxRuntimeTimer) {
            clearTimeout(this.maxRuntimeTimer);
            this.maxRuntimeTimer = null;
        }
        this.process = null;
        this.status.running = false;
        this.output = [];
    }

    /**
     * Get current server status
     */
    public getStatus(): DevServerStatus {
        return { ...this.status };
    }

    /**
     * Get captured output
     */
    public getOutput(): string[] {
        return [...this.output];
    }

    /**
     * Check if server is healthy
     */
    public async healthCheck(): Promise<boolean> {
        if (!this.status.running || !this.status.url) {
            return false;
        }

        try {
            // Simple fetch to check if server responds
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(this.status.url, {
                signal: controller.signal
            });

            clearTimeout(timeout);
            return response.ok || response.status < 500;
        } catch {
            return false;
        }
    }

    /**
     * Wait for server to be ready
     */
    public async waitForReady(timeoutMs: number = 30000): Promise<boolean> {
        const startTime = Date.now();
        const checkInterval = 1000; // Check every second

        while (Date.now() - startTime < timeoutMs) {
            if (await this.healthCheck()) {
                logInfo('[DevServer] Server is ready');
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        logWarn('[DevServer] Timeout waiting for server to be ready');
        return false;
    }

    /**
     * Restart the server
     */
    public async restart(): Promise<DevServerStatus> {
        await this.stop();
        return this.start();
    }
}

// Singleton instance
let serverInstance: DevServerLauncher | null = null;

/**
 * Get the singleton DevServerLauncher instance
 */
export function getDevServerLauncher(): DevServerLauncher {
    if (!serverInstance) {
        serverInstance = new DevServerLauncher();
    }
    return serverInstance;
}

/**
 * Reset for testing
 */
export async function resetDevServerLauncherForTests(): Promise<void> {
    if (serverInstance) {
        await serverInstance.stop();
    }
    serverInstance = null;
}
