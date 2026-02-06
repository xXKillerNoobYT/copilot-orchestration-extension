import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';
import { 
    CustomAgent, 
    validateCustomAgent, 
    validateAgentName 
} from './schema';

/**
 * Custom Agent Storage - Persistence layer for user-created agents.
 *
 * **Simple explanation**: This is like a filing cabinet for custom agents.
 * Each agent gets its own folder with a config file. We can save, load,
 * list, delete, and backup agents. Everything is validated before saving.
 *
 * Storage structure:
 * .coe/
 *   agents/
 *     custom/
 *       my-agent/
 *         config.json       <- Agent configuration
 *         config.json.bak   <- Backup (created on overwrite)
 */

// ============================================================================
// Section 1: Constants & Error Types
// ============================================================================

/** Base directory for custom agents (relative to workspace) */
export const CUSTOM_AGENTS_DIR = '.coe/agents/custom';

/** Config filename for each agent */
export const CONFIG_FILENAME = 'config.json';

/** Backup filename suffix */
export const BACKUP_SUFFIX = '.bak';

/** Temp file suffix for atomic writes */
export const TEMP_SUFFIX = '.tmp';

/**
 * Custom error class for storage operations.
 *
 * **Simple explanation**: When something goes wrong with saving/loading,
 * this error tells you exactly what happened and which agent it was for.
 */
export class AgentStorageError extends Error {
    constructor(
        message: string,
        public readonly agentName: string | undefined,
        public readonly operation: 'save' | 'load' | 'delete' | 'list' | 'init',
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'AgentStorageError';
    }
}

// ============================================================================
// Section 2: Path Resolution
// ============================================================================

/**
 * Get the workspace folder path.
 *
 * **Simple explanation**: Find where the user's project lives.
 *
 * @returns Workspace folder path or undefined if none open
 */
export function getWorkspaceFolder(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Get the base directory for custom agents.
 *
 * **Simple explanation**: Get the path to .coe/agents/custom/
 *
 * @param workspaceFolder - The workspace folder path
 * @returns Full path to custom agents directory
 */
export function getCustomAgentsDir(workspaceFolder: string): string {
    return path.join(workspaceFolder, CUSTOM_AGENTS_DIR);
}

/**
 * Get the directory for a specific agent.
 *
 * **Simple explanation**: Get the path to .coe/agents/custom/{agent-name}/
 *
 * @param workspaceFolder - The workspace folder path
 * @param agentName - The agent's unique name
 * @returns Full path to agent directory
 */
export function getAgentDir(workspaceFolder: string, agentName: string): string {
    return path.join(getCustomAgentsDir(workspaceFolder), agentName);
}

/**
 * Get the config file path for a specific agent.
 *
 * **Simple explanation**: Get the path to .coe/agents/custom/{agent-name}/config.json
 *
 * @param workspaceFolder - The workspace folder path
 * @param agentName - The agent's unique name
 * @returns Full path to agent config file
 */
export function getAgentConfigPath(workspaceFolder: string, agentName: string): string {
    return path.join(getAgentDir(workspaceFolder, agentName), CONFIG_FILENAME);
}

// ============================================================================
// Section 3: Directory Management
// ============================================================================

/**
 * Ensure the custom agents directory exists.
 *
 * **Simple explanation**: Make sure the filing cabinet is there before
 * we try to put files in it.
 *
 * @param workspaceFolder - The workspace folder path
 * @throws AgentStorageError if directory creation fails
 */
export function ensureCustomAgentsDir(workspaceFolder: string): void {
    const dir = getCustomAgentsDir(workspaceFolder);
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logInfo(`Created custom agents directory: ${dir}`);
        }
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        throw new AgentStorageError(
            `Failed to create custom agents directory: ${err.message}`,
            undefined,
            'init',
            err
        );
    }
}

/**
 * Ensure the directory for a specific agent exists.
 *
 * **Simple explanation**: Make sure the agent has a folder to store its config.
 *
 * @param workspaceFolder - The workspace folder path
 * @param agentName - The agent's unique name
 * @throws AgentStorageError if directory creation fails
 */
export function ensureAgentDir(workspaceFolder: string, agentName: string): void {
    const dir = getAgentDir(workspaceFolder, agentName);
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logInfo(`Created agent directory: ${dir}`);
        }
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        throw new AgentStorageError(
            `Failed to create agent directory: ${err.message}`,
            agentName,
            'init',
            err
        );
    }
}

// ============================================================================
// Section 4: Atomic Write Helpers
// ============================================================================

/**
 * Write file atomically (write to temp, then rename).
 *
 * **Simple explanation**: Instead of editing the file directly (which could
 * leave it half-written if something goes wrong), we write to a temp file
 * first, then rename it. This ensures the config is always complete.
 *
 * @param filePath - Target file path
 * @param content - Content to write
 * @throws Error if write fails
 */
function atomicWriteFile(filePath: string, content: string): void {
    const tempPath = filePath + TEMP_SUFFIX;
    
    // Write to temp file
    fs.writeFileSync(tempPath, content, 'utf-8');
    
    // Rename temp to target (atomic on most filesystems)
    fs.renameSync(tempPath, filePath);
}

/**
 * Create a backup of an existing file.
 *
 * **Simple explanation**: Before overwriting, copy the old version to .bak
 * just in case the user needs to recover it.
 *
 * @param filePath - File to backup
 * @returns true if backup was created, false if no file to backup
 */
function createBackup(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
        return false;
    }
    
    const backupPath = filePath + BACKUP_SUFFIX;
    fs.copyFileSync(filePath, backupPath);
    logInfo(`Created backup: ${backupPath}`);
    return true;
}

// ============================================================================
// Section 5: Core CRUD Operations
// ============================================================================

/**
 * Save a custom agent to disk.
 *
 * **Simple explanation**: Store the agent configuration in its own folder.
 * Creates a backup if overwriting an existing agent.
 *
 * @param workspaceFolder - The workspace folder path
 * @param agent - The agent to save (must be valid)
 * @param options - Optional save options
 * @returns The saved agent
 * @throws AgentStorageError if validation fails or save fails
 */
export function saveCustomAgent(
    workspaceFolder: string,
    agent: CustomAgent,
    options: {
        /** Skip validation (use carefully, only for trusted sources) */
        skipValidation?: boolean;
        /** Skip backup creation */
        skipBackup?: boolean;
    } = {}
): CustomAgent {
    // Validate the agent first
    if (!options.skipValidation) {
        const validation = validateCustomAgent(agent);
        if (!validation.success) {
            const errorMessages = validation.errors?.errors
                .map(e => `${e.path.join('.')}: ${e.message}`)
                .join('; ');
            throw new AgentStorageError(
                `Invalid agent configuration: ${errorMessages}`,
                agent.name,
                'save'
            );
        }
    }

    // Ensure directories exist
    ensureCustomAgentsDir(workspaceFolder);
    ensureAgentDir(workspaceFolder, agent.name);

    // Get config path
    const configPath = getAgentConfigPath(workspaceFolder, agent.name);

    // Create backup if overwriting
    if (!options.skipBackup) {
        createBackup(configPath);
    }

    // Serialize and write atomically
    try {
        const content = JSON.stringify(agent, null, 2);
        atomicWriteFile(configPath, content);
        logInfo(`Saved custom agent: ${agent.name}`);
        return agent;
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        throw new AgentStorageError(
            `Failed to save agent: ${err.message}`,
            agent.name,
            'save',
            err
        );
    }
}

/**
 * Load a custom agent from disk.
 *
 * **Simple explanation**: Read the agent configuration from its folder
 * and validate it before returning.
 *
 * @param workspaceFolder - The workspace folder path
 * @param agentName - The name of the agent to load
 * @returns The loaded and validated agent
 * @throws AgentStorageError if agent doesn't exist or validation fails
 */
export function loadCustomAgent(
    workspaceFolder: string,
    agentName: string
): CustomAgent {
    // Validate name format first
    const nameValidation = validateAgentName(agentName);
    if (!nameValidation.valid) {
        throw new AgentStorageError(
            `Invalid agent name: ${nameValidation.error}`,
            agentName,
            'load'
        );
    }

    const configPath = getAgentConfigPath(workspaceFolder, agentName);

    // Check if agent exists
    if (!fs.existsSync(configPath)) {
        throw new AgentStorageError(
            `Agent not found: ${agentName}`,
            agentName,
            'load'
        );
    }

    // Read and parse
    let rawConfig: unknown;
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        rawConfig = JSON.parse(content);
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        throw new AgentStorageError(
            `Failed to read agent config: ${err.message}`,
            agentName,
            'load',
            err
        );
    }

    // Validate loaded config
    const validation = validateCustomAgent(rawConfig);
    if (!validation.success) {
        const errorMessages = validation.errors?.errors
            .map(e => `${e.path.join('.')}: ${e.message}`)
            .join('; ');
        logWarn(`Agent ${agentName} has invalid config: ${errorMessages}`);
        throw new AgentStorageError(
            `Agent has invalid configuration: ${errorMessages}`,
            agentName,
            'load'
        );
    }

    logInfo(`Loaded custom agent: ${agentName}`);
    return validation.data!;
}

/**
 * Delete a custom agent from disk.
 *
 * **Simple explanation**: Remove the agent's entire folder including
 * config and backups.
 *
 * @param workspaceFolder - The workspace folder path
 * @param agentName - The name of the agent to delete
 * @param options - Optional delete options
 * @throws AgentStorageError if deletion fails
 */
export function deleteCustomAgent(
    workspaceFolder: string,
    agentName: string,
    options: {
        /** Create a final backup before deleting */
        createFinalBackup?: boolean;
    } = {}
): void {
    // Validate name format
    const nameValidation = validateAgentName(agentName);
    if (!nameValidation.valid) {
        throw new AgentStorageError(
            `Invalid agent name: ${nameValidation.error}`,
            agentName,
            'delete'
        );
    }

    const agentDir = getAgentDir(workspaceFolder, agentName);

    // Check if agent exists
    if (!fs.existsSync(agentDir)) {
        throw new AgentStorageError(
            `Agent not found: ${agentName}`,
            agentName,
            'delete'
        );
    }

    try {
        // Create final backup if requested
        if (options.createFinalBackup) {
            const configPath = getAgentConfigPath(workspaceFolder, agentName);
            if (fs.existsSync(configPath)) {
                const backupPath = path.join(
                    getCustomAgentsDir(workspaceFolder),
                    `${agentName}-deleted-${Date.now()}.json.bak`
                );
                fs.copyFileSync(configPath, backupPath);
                logInfo(`Created deletion backup: ${backupPath}`);
            }
        }

        // Remove directory recursively
        fs.rmSync(agentDir, { recursive: true, force: true });
        logInfo(`Deleted custom agent: ${agentName}`);
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        throw new AgentStorageError(
            `Failed to delete agent: ${err.message}`,
            agentName,
            'delete',
            err
        );
    }
}

/**
 * Check if a custom agent exists.
 *
 * **Simple explanation**: Does this agent have a saved config file?
 *
 * @param workspaceFolder - The workspace folder path
 * @param agentName - The name of the agent to check
 * @returns true if agent exists, false otherwise
 */
export function customAgentExists(
    workspaceFolder: string,
    agentName: string
): boolean {
    const configPath = getAgentConfigPath(workspaceFolder, agentName);
    return fs.existsSync(configPath);
}

// ============================================================================
// Section 6: List Operations
// ============================================================================

/**
 * Result type for listing agents.
 */
export interface AgentListItem {
    /** Agent name (folder name) */
    name: string;
    /** Full path to config file */
    configPath: string;
    /** Whether the config is valid */
    valid: boolean;
    /** Validation error if invalid */
    validationError?: string;
    /** The agent config if valid */
    agent?: CustomAgent;
}

/**
 * List all custom agents (names only, fast).
 *
 * **Simple explanation**: Get a list of all agent folder names, without
 * loading or validating their configs.
 *
 * @param workspaceFolder - The workspace folder path
 * @returns Array of agent names
 */
export function listCustomAgentNames(workspaceFolder: string): string[] {
    const agentsDir = getCustomAgentsDir(workspaceFolder);

    if (!fs.existsSync(agentsDir)) {
        return [];
    }

    try {
        const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
        return entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .filter(name => {
                // Only include directories that have a config.json
                const configPath = path.join(agentsDir, name, CONFIG_FILENAME);
                return fs.existsSync(configPath);
            });
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logError(`Failed to list agents: ${err.message}`);
        throw new AgentStorageError(
            `Failed to list agents: ${err.message}`,
            undefined,
            'list',
            err
        );
    }
}

/**
 * List all custom agents with validation status.
 *
 * **Simple explanation**: Get all agents with info about whether their
 * configs are valid. Invalid agents are included but marked.
 *
 * @param workspaceFolder - The workspace folder path
 * @param options - List options
 * @returns Array of agent list items
 */
export function listCustomAgents(
    workspaceFolder: string,
    options: {
        /** Only return valid agents */
        validOnly?: boolean;
        /** Only return active agents */
        activeOnly?: boolean;
    } = {}
): AgentListItem[] {
    const agentNames = listCustomAgentNames(workspaceFolder);
    const results: AgentListItem[] = [];

    for (const name of agentNames) {
        const configPath = getAgentConfigPath(workspaceFolder, name);
        
        try {
            const agent = loadCustomAgent(workspaceFolder, name);
            
            // Filter by active status if requested
            if (options.activeOnly && !agent.isActive) {
                continue;
            }
            
            results.push({
                name,
                configPath,
                valid: true,
                agent,
            });
        } catch (error) {
            // Skip invalid agents if validOnly is set
            if (options.validOnly) {
                continue;
            }
            
            const err = error instanceof Error ? error : new Error(String(error));
            results.push({
                name,
                configPath,
                valid: false,
                validationError: err.message,
            });
        }
    }

    return results;
}

/**
 * Load all valid custom agents.
 *
 * **Simple explanation**: Get all agents that have valid configs.
 * Shorthand for listCustomAgents with validOnly.
 *
 * @param workspaceFolder - The workspace folder path
 * @returns Array of valid CustomAgent objects
 */
export function loadAllCustomAgents(workspaceFolder: string): CustomAgent[] {
    return listCustomAgents(workspaceFolder, { validOnly: true })
        .map(item => item.agent!)
        .filter((agent): agent is CustomAgent => agent !== undefined);
}

// ============================================================================
// Section 7: Import/Export Utilities
// ============================================================================

/**
 * Export an agent to a JSON string.
 *
 * **Simple explanation**: Convert the agent config to a string that can
 * be shared, copied, or backed up.
 *
 * @param agent - The agent to export
 * @param pretty - Whether to format with indentation (default: true)
 * @returns JSON string representation
 */
export function exportAgentToString(agent: CustomAgent, pretty = true): string {
    return JSON.stringify(agent, null, pretty ? 2 : undefined);
}

/**
 * Import an agent from a JSON string.
 *
 * **Simple explanation**: Parse and validate an agent config from a string.
 *
 * @param jsonString - JSON string to parse
 * @returns The validated agent
 * @throws AgentStorageError if parsing or validation fails
 */
export function importAgentFromString(jsonString: string): CustomAgent {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        throw new AgentStorageError(
            `Invalid JSON: ${err.message}`,
            undefined,
            'load',
            err
        );
    }

    const validation = validateCustomAgent(parsed);
    if (!validation.success) {
        const errorMessages = validation.errors?.errors
            .map(e => `${e.path.join('.')}: ${e.message}`)
            .join('; ');
        throw new AgentStorageError(
            `Invalid agent configuration: ${errorMessages}`,
            undefined,
            'load'
        );
    }

    return validation.data!;
}

// ============================================================================
// Section 8: Backup Management
// ============================================================================

/**
 * Restore an agent from its backup.
 *
 * **Simple explanation**: If something went wrong, restore the previous
 * version of the agent config.
 *
 * @param workspaceFolder - The workspace folder path
 * @param agentName - The name of the agent to restore
 * @returns The restored agent
 * @throws AgentStorageError if no backup exists or restore fails
 */
export function restoreAgentFromBackup(
    workspaceFolder: string,
    agentName: string
): CustomAgent {
    const configPath = getAgentConfigPath(workspaceFolder, agentName);
    const backupPath = configPath + BACKUP_SUFFIX;

    if (!fs.existsSync(backupPath)) {
        throw new AgentStorageError(
            `No backup found for agent: ${agentName}`,
            agentName,
            'load'
        );
    }

    try {
        // Read backup
        const content = fs.readFileSync(backupPath, 'utf-8');
        const parsed = JSON.parse(content);

        // Validate backup
        const validation = validateCustomAgent(parsed);
        if (!validation.success) {
            throw new Error('Backup file contains invalid configuration');
        }

        // Restore: backup current to .bak.old, then restore backup
        if (fs.existsSync(configPath)) {
            fs.copyFileSync(configPath, configPath + BACKUP_SUFFIX + '.old');
        }
        fs.copyFileSync(backupPath, configPath);

        logInfo(`Restored agent from backup: ${agentName}`);
        return validation.data!;
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        throw new AgentStorageError(
            `Failed to restore from backup: ${err.message}`,
            agentName,
            'load',
            err
        );
    }
}

/**
 * Check if an agent has a backup available.
 *
 * **Simple explanation**: Is there a .bak file we can restore from?
 *
 * @param workspaceFolder - The workspace folder path
 * @param agentName - The name of the agent to check
 * @returns true if backup exists
 */
export function agentHasBackup(
    workspaceFolder: string,
    agentName: string
): boolean {
    const configPath = getAgentConfigPath(workspaceFolder, agentName);
    const backupPath = configPath + BACKUP_SUFFIX;
    return fs.existsSync(backupPath);
}

// ============================================================================
// Section 9: Rename Operations
// ============================================================================

/**
 * Rename a custom agent.
 *
 * **Simple explanation**: Change the agent's name and move its folder.
 *
 * @param workspaceFolder - The workspace folder path
 * @param oldName - Current agent name
 * @param newName - New agent name
 * @returns The updated agent
 * @throws AgentStorageError if rename fails
 */
export function renameCustomAgent(
    workspaceFolder: string,
    oldName: string,
    newName: string
): CustomAgent {
    // Validate new name
    const nameValidation = validateAgentName(newName);
    if (!nameValidation.valid) {
        throw new AgentStorageError(
            `Invalid new name: ${nameValidation.error}`,
            newName,
            'save'
        );
    }

    // Check old agent exists
    if (!customAgentExists(workspaceFolder, oldName)) {
        throw new AgentStorageError(
            `Agent not found: ${oldName}`,
            oldName,
            'save'
        );
    }

    // Check new name not taken
    if (customAgentExists(workspaceFolder, newName)) {
        throw new AgentStorageError(
            `Agent already exists: ${newName}`,
            newName,
            'save'
        );
    }

    // Load existing agent
    const agent = loadCustomAgent(workspaceFolder, oldName);

    // Update name in config
    const updatedAgent: CustomAgent = {
        ...agent,
        name: newName,
        metadata: {
            ...agent.metadata,
            updatedAt: new Date().toISOString(),
        },
    };

    // Save with new name
    saveCustomAgent(workspaceFolder, updatedAgent);

    // Delete old folder
    deleteCustomAgent(workspaceFolder, oldName);

    logInfo(`Renamed agent: ${oldName} -> ${newName}`);
    return updatedAgent;
}

// ============================================================================
// Section 10: Storage Statistics
// ============================================================================

/**
 * Storage statistics result.
 */
export interface StorageStats {
    /** Total number of agent directories */
    totalAgents: number;
    /** Number of valid agents */
    validAgents: number;
    /** Number of invalid agents */
    invalidAgents: number;
    /** Number of active agents */
    activeAgents: number;
    /** Number of inactive agents */
    inactiveAgents: number;
    /** Total disk usage in bytes */
    totalBytes: number;
    /** Storage directory path */
    storagePath: string;
}

/**
 * Get storage statistics.
 *
 * **Simple explanation**: How many agents do we have, how much space are
 * they using, how many are active vs inactive?
 *
 * @param workspaceFolder - The workspace folder path
 * @returns Storage statistics
 */
export function getStorageStats(workspaceFolder: string): StorageStats {
    const agentsDir = getCustomAgentsDir(workspaceFolder);
    const agents = listCustomAgents(workspaceFolder);

    let totalBytes = 0;
    let activeAgents = 0;
    let inactiveAgents = 0;

    for (const item of agents) {
        // Calculate size
        try {
            const stat = fs.statSync(item.configPath);
            totalBytes += stat.size;
        } catch {
            // Ignore stat errors
        }

        // Count active/inactive
        if (item.valid && item.agent) {
            if (item.agent.isActive) {
                activeAgents++;
            } else {
                inactiveAgents++;
            }
        }
    }

    return {
        totalAgents: agents.length,
        validAgents: agents.filter(a => a.valid).length,
        invalidAgents: agents.filter(a => !a.valid).length,
        activeAgents,
        inactiveAgents,
        totalBytes,
        storagePath: agentsDir,
    };
}
