/**
 * Orchestrator State Persistence
 * 
 * **Simple explanation**: Saves the orchestrator's state to disk so it can
 * recover after a crash or restart. Like having an autosave feature that
 * remembers exactly where you left off.
 * 
 * @module agents/orchestrator/state
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../../logger';

/**
 * Orchestrator state snapshot
 */
export interface OrchestratorState {
    /** Version for migration support */
    version: number;
    /** Timestamp of last save */
    timestamp: number;
    /** Currently running task ID */
    currentTaskId: string | null;
    /** Tasks in verification queue */
    verificationQueue: string[];
    /** Paused task IDs */
    pausedTasks: string[];
    /** Orchestration mode */
    mode: 'auto' | 'manual' | 'paused';
    /** Session ID */
    sessionId: string;
    /** Recovery checkpoints */
    checkpoints: StateCheckpoint[];
}

/**
 * State checkpoint for recovery
 */
export interface StateCheckpoint {
    /** Checkpoint ID */
    id: string;
    /** Timestamp */
    timestamp: number;
    /** Description */
    description: string;
    /** Task ID at checkpoint */
    taskId: string | null;
    /** State at checkpoint */
    stateSnapshot: Partial<OrchestratorState>;
}

/**
 * Default state for new orchestrator
 */
const DEFAULT_STATE: OrchestratorState = {
    version: 1,
    timestamp: 0,
    currentTaskId: null,
    verificationQueue: [],
    pausedTasks: [],
    mode: 'auto',
    sessionId: '',
    checkpoints: []
};

/**
 * Orchestrator State Manager
 * 
 * **Simple explanation**: Handles saving and loading the orchestrator's
 * working state, with support for crash recovery and checkpoints.
 */
export class OrchestratorStateManager {
    private state: OrchestratorState;
    private statePath: string;
    private autoSaveInterval: NodeJS.Timeout | null = null;
    private autoSaveIntervalMs: number = 30000; // 30 seconds
    private maxCheckpoints: number = 10;
    private dirty: boolean = false;

    constructor(workspacePath?: string) {
        // Deep copy arrays to prevent shared state between instances
        this.state = {
            ...DEFAULT_STATE,
            verificationQueue: [],
            pausedTasks: [],
            checkpoints: [],
            sessionId: this.generateSessionId()
        };

        // Use workspace path or tmp directory
        const baseDir = workspacePath ||
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
            '/tmp';
        this.statePath = path.join(baseDir, '.coe', 'orchestrator-state.json');
    }

    /**
     * Generate unique session ID
     */
    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Initialize state manager - load existing state or create new
     */
    public async initialize(): Promise<void> {
        try {
            if (fs.existsSync(this.statePath)) {
                const loaded = await this.loadState();
                if (loaded) {
                    logInfo(`[StateManager] Recovered state from session ${this.state.sessionId}`);
                    // Check for crash recovery
                    if (this.state.currentTaskId) {
                        logWarn(`[StateManager] Found in-progress task ${this.state.currentTaskId} - may need recovery`);
                    }
                }
            } else {
                await this.saveState();
                logInfo('[StateManager] Created new state file');
            }

            this.startAutoSave();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[StateManager] Initialize failed: ${msg}`);
        }
    }

    /**
     * Load state from file
     */
    private async loadState(): Promise<boolean> {
        try {
            const content = fs.readFileSync(this.statePath, 'utf-8');
            const loaded = JSON.parse(content) as OrchestratorState;

            // Version migration if needed
            if (loaded.version !== DEFAULT_STATE.version) {
                logInfo(`[StateManager] Migrating state from v${loaded.version} to v${DEFAULT_STATE.version}`);
                // For now, just update version - add migration logic as needed
                loaded.version = DEFAULT_STATE.version;
            }

            this.state = { ...DEFAULT_STATE, ...loaded };
            return true;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[StateManager] Failed to load state: ${msg}`);
            return false;
        }
    }

    /**
     * Save state to file atomically
     */
    public async saveState(): Promise<boolean> {
        try {
            this.state.timestamp = Date.now();

            // Ensure directory exists
            const dir = path.dirname(this.statePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Write to temp file first (atomic write)
            const tempPath = `${this.statePath}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2));

            // Rename temp to actual (atomic on most systems)
            fs.renameSync(tempPath, this.statePath);

            this.dirty = false;
            return true;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[StateManager] Failed to save state: ${msg}`);
            return false;
        }
    }

    /**
     * Start auto-save interval
     */
    private startAutoSave(): void {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        this.autoSaveInterval = setInterval(async () => {
            if (this.dirty) {
                await this.saveState();
            }
        }, this.autoSaveIntervalMs);
    }

    /**
     * Stop auto-save interval
     */
    public stopAutoSave(): void {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    /**
     * Set the current task ID
     */
    public setCurrentTask(taskId: string | null): void {
        this.state.currentTaskId = taskId;
        this.dirty = true;
    }

    /**
     * Get the current task ID
     */
    public getCurrentTask(): string | null {
        return this.state.currentTaskId;
    }

    /**
     * Add a task to verification queue
     */
    public addToVerificationQueue(taskId: string): void {
        if (!this.state.verificationQueue.includes(taskId)) {
            this.state.verificationQueue.push(taskId);
            this.dirty = true;
        }
    }

    /**
     * Remove from verification queue
     */
    public removeFromVerificationQueue(taskId: string): void {
        const index = this.state.verificationQueue.indexOf(taskId);
        if (index !== -1) {
            this.state.verificationQueue.splice(index, 1);
            this.dirty = true;
        }
    }

    /**
     * Get verification queue
     */
    public getVerificationQueue(): string[] {
        return [...this.state.verificationQueue];
    }

    /**
     * Set orchestration mode
     */
    public setMode(mode: OrchestratorState['mode']): void {
        this.state.mode = mode;
        this.dirty = true;
        logInfo(`[StateManager] Mode changed to: ${mode}`);
    }

    /**
     * Get current mode
     */
    public getMode(): OrchestratorState['mode'] {
        return this.state.mode;
    }

    /**
     * Create a checkpoint for recovery
     */
    public createCheckpoint(description: string): string {
        const checkpoint: StateCheckpoint = {
            id: `cp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            timestamp: Date.now(),
            description,
            taskId: this.state.currentTaskId,
            stateSnapshot: {
                currentTaskId: this.state.currentTaskId,
                verificationQueue: [...this.state.verificationQueue],
                mode: this.state.mode
            }
        };

        this.state.checkpoints.push(checkpoint);

        // Keep only maxCheckpoints
        if (this.state.checkpoints.length > this.maxCheckpoints) {
            this.state.checkpoints = this.state.checkpoints.slice(-this.maxCheckpoints);
        }

        this.dirty = true;
        logInfo(`[StateManager] Created checkpoint: ${checkpoint.id} - ${description}`);
        return checkpoint.id;
    }

    /**
     * Restore from a checkpoint
     */
    public restoreCheckpoint(checkpointId: string): boolean {
        const checkpoint = this.state.checkpoints.find(cp => cp.id === checkpointId);
        if (!checkpoint) {
            logWarn(`[StateManager] Checkpoint ${checkpointId} not found`);
            return false;
        }

        // Restore state from checkpoint
        if (checkpoint.stateSnapshot.currentTaskId !== undefined) {
            this.state.currentTaskId = checkpoint.stateSnapshot.currentTaskId;
        }
        if (checkpoint.stateSnapshot.verificationQueue) {
            this.state.verificationQueue = [...checkpoint.stateSnapshot.verificationQueue];
        }
        if (checkpoint.stateSnapshot.mode) {
            this.state.mode = checkpoint.stateSnapshot.mode;
        }

        this.dirty = true;
        logInfo(`[StateManager] Restored checkpoint: ${checkpointId}`);
        return true;
    }

    /**
     * Get all checkpoints
     */
    public getCheckpoints(): StateCheckpoint[] {
        return [...this.state.checkpoints];
    }

    /**
     * Get full state
     */
    public getState(): OrchestratorState {
        return { ...this.state };
    }

    /**
     * Get session ID
     */
    public getSessionId(): string {
        return this.state.sessionId;
    }

    /**
     * Pause a task
     */
    public pauseTask(taskId: string): void {
        if (!this.state.pausedTasks.includes(taskId)) {
            this.state.pausedTasks.push(taskId);
            this.dirty = true;
        }
    }

    /**
     * Resume a task
     */
    public resumeTask(taskId: string): void {
        const index = this.state.pausedTasks.indexOf(taskId);
        if (index !== -1) {
            this.state.pausedTasks.splice(index, 1);
            this.dirty = true;
        }
    }

    /**
     * Check if task is paused
     */
    public isTaskPaused(taskId: string): boolean {
        return this.state.pausedTasks.includes(taskId);
    }

    /**
     * Dispose the state manager
     */
    public async dispose(): Promise<void> {
        this.stopAutoSave();
        if (this.dirty) {
            await this.saveState();
        }
        logInfo('[StateManager] Disposed');
    }
}

// Singleton instance
let stateInstance: OrchestratorStateManager | null = null;

/**
 * Get the singleton OrchestratorStateManager instance
 */
export function getOrchestratorStateManager(): OrchestratorStateManager {
    if (!stateInstance) {
        stateInstance = new OrchestratorStateManager();
    }
    return stateInstance;
}

/**
 * Initialize the state manager
 */
export async function initializeOrchestratorState(): Promise<void> {
    const manager = getOrchestratorStateManager();
    await manager.initialize();
}

/**
 * Reset the state manager (for testing)
 */
export function resetOrchestratorStateManagerForTests(): void {
    if (stateInstance) {
        stateInstance.stopAutoSave();
    }
    stateInstance = null;
}
