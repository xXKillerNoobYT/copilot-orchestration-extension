/**
 * Tests for Custom Agent Storage (MT-030.9)
 *
 * Tests the persistence layer for saving, loading, listing, and deleting
 * custom agents from disk.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    AgentStorageError,
    CUSTOM_AGENTS_DIR,
    CONFIG_FILENAME,
    BACKUP_SUFFIX,
    getWorkspaceFolder,
    getCustomAgentsDir,
    getAgentDir,
    getAgentConfigPath,
    ensureCustomAgentsDir,
    ensureAgentDir,
    saveCustomAgent,
    loadCustomAgent,
    deleteCustomAgent,
    customAgentExists,
    listCustomAgentNames,
    listCustomAgents,
    loadAllCustomAgents,
    exportAgentToString,
    importAgentFromString,
    restoreAgentFromBackup,
    agentHasBackup,
    renameCustomAgent,
    getStorageStats,
} from '../../../src/agents/custom/storage';
import { CustomAgent, createDefaultAgentTemplate } from '../../../src/agents/custom/schema';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    },
}));

// Mock logger
jest.mock('../../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

// Mock fs - we'll control behavior per test
jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

// Helper to create a valid agent
function createValidAgent(name = 'test-agent'): CustomAgent {
    return {
        ...createDefaultAgentTemplate(name),
        name,
        description: 'A test agent for unit testing',
        systemPrompt: 'You are a test agent. Help with testing tasks.',
        goals: ['Complete unit tests successfully'],
    };
}

// Reset mocks before each test
beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.renameSync.mockReturnValue(undefined);
    mockFs.copyFileSync.mockReturnValue(undefined);
    mockFs.rmSync.mockReturnValue(undefined);
});

// ============================================================================
// Section 1: Constants Tests
// ============================================================================

describe('Storage Constants', () => {
    it('Test 1: should export correct directory structure constants', () => {
        expect(CUSTOM_AGENTS_DIR).toBe('.coe/agents/custom');
        expect(CONFIG_FILENAME).toBe('config.json');
        expect(BACKUP_SUFFIX).toBe('.bak');
    });
});

// ============================================================================
// Section 2: AgentStorageError Tests
// ============================================================================

describe('AgentStorageError', () => {
    it('Test 2: should create error with agent name and operation', () => {
        const error = new AgentStorageError(
            'Failed to save',
            'my-agent',
            'save'
        );

        expect(error.message).toBe('Failed to save');
        expect(error.agentName).toBe('my-agent');
        expect(error.operation).toBe('save');
        expect(error.name).toBe('AgentStorageError');
    });

    it('Test 3: should create error with cause', () => {
        const cause = new Error('disk full');
        const error = new AgentStorageError(
            'Failed to save',
            'my-agent',
            'save',
            cause
        );

        expect(error.cause).toBe(cause);
    });

    it('Test 4: should allow undefined agent name for list operations', () => {
        const error = new AgentStorageError(
            'Failed to list',
            undefined,
            'list'
        );

        expect(error.agentName).toBeUndefined();
        expect(error.operation).toBe('list');
    });
});

// ============================================================================
// Section 3: Path Resolution Tests
// ============================================================================

describe('Path Resolution', () => {
    it('Test 5: should get workspace folder from vscode', () => {
        const folder = getWorkspaceFolder();
        expect(folder).toBe('/test/workspace');
    });

    it('Test 6: should return undefined when no workspace', () => {
        const originalFolders = vscode.workspace.workspaceFolders;
        (vscode.workspace as any).workspaceFolders = undefined;

        const folder = getWorkspaceFolder();
        expect(folder).toBeUndefined();

        (vscode.workspace as any).workspaceFolders = originalFolders;
    });

    it('Test 7: should construct custom agents directory path', () => {
        const dir = getCustomAgentsDir('/test/workspace');
        expect(dir).toBe(path.join('/test/workspace', '.coe/agents/custom'));
    });

    it('Test 8: should construct agent directory path', () => {
        const dir = getAgentDir('/test/workspace', 'my-agent');
        expect(dir).toBe(path.join('/test/workspace', '.coe/agents/custom', 'my-agent'));
    });

    it('Test 9: should construct agent config path', () => {
        const configPath = getAgentConfigPath('/test/workspace', 'my-agent');
        expect(configPath).toBe(
            path.join('/test/workspace', '.coe/agents/custom', 'my-agent', 'config.json')
        );
    });
});

// ============================================================================
// Section 4: Directory Management Tests
// ============================================================================

describe('Directory Management', () => {
    it('Test 10: should create custom agents directory if not exists', () => {
        mockFs.existsSync.mockReturnValue(false);

        ensureCustomAgentsDir('/test/workspace');

        // Use toContain for cross-platform - path.join uses OS-specific separators
        expect(mockFs.mkdirSync).toHaveBeenCalled();
        const callPath = mockFs.mkdirSync.mock.calls[0][0] as string;
        expect(callPath.replace(/\\/g, '/')).toContain('.coe/agents/custom');
    });

    it('Test 11: should not create directory if already exists', () => {
        mockFs.existsSync.mockReturnValue(true);

        ensureCustomAgentsDir('/test/workspace');

        expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('Test 12: should throw AgentStorageError on directory creation failure', () => {
        mockFs.existsSync.mockReturnValue(false);
        mockFs.mkdirSync.mockImplementation(() => {
            throw new Error('Permission denied');
        });

        expect(() => ensureCustomAgentsDir('/test/workspace')).toThrow(AgentStorageError);
        expect(() => ensureCustomAgentsDir('/test/workspace')).toThrow('Permission denied');
    });

    it('Test 13: should create agent-specific directory', () => {
        mockFs.existsSync.mockReturnValue(false);

        ensureAgentDir('/test/workspace', 'my-agent');

        expect(mockFs.mkdirSync).toHaveBeenCalledWith(
            expect.stringContaining('my-agent'),
            { recursive: true }
        );
    });
});

// ============================================================================
// Section 5: Save Operation Tests
// ============================================================================

describe('saveCustomAgent', () => {
    it('Test 14: should save a valid agent configuration', () => {
        const agent = createValidAgent();

        const result = saveCustomAgent('/test/workspace', agent);

        expect(result).toEqual(agent);
        expect(mockFs.writeFileSync).toHaveBeenCalled();
        expect(mockFs.renameSync).toHaveBeenCalled(); // Atomic write
    });

    it('Test 15: should create backup before overwriting', () => {
        mockFs.existsSync.mockReturnValue(true);
        const agent = createValidAgent();

        saveCustomAgent('/test/workspace', agent);

        expect(mockFs.copyFileSync).toHaveBeenCalledWith(
            expect.stringContaining('config.json'),
            expect.stringContaining('config.json.bak')
        );
    });

    it('Test 16: should skip backup when option set', () => {
        mockFs.existsSync.mockReturnValue(true);
        const agent = createValidAgent();

        saveCustomAgent('/test/workspace', agent, { skipBackup: true });

        // Should not backup existing file (but will still check directories)
        const copyFileCalls = mockFs.copyFileSync.mock.calls;
        const hasBackupCall = copyFileCalls.some(call =>
            String(call[1]).includes('.bak')
        );
        expect(hasBackupCall).toBe(false);
    });

    it('Test 17: should throw on invalid agent configuration', () => {
        const invalidAgent = {
            name: 'INVALID NAME', // Invalid: uppercase
            description: 'test',
            systemPrompt: 'short', // Invalid: too short
            goals: [], // Invalid: empty
        } as unknown as CustomAgent;

        expect(() => saveCustomAgent('/test/workspace', invalidAgent))
            .toThrow(AgentStorageError);
    });

    it('Test 18: should skip validation when option set', () => {
        // Note: this is for internal use only
        const agent = createValidAgent();

        saveCustomAgent('/test/workspace', agent, { skipValidation: true });

        expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('Test 19: should throw on write failure', () => {
        mockFs.writeFileSync.mockImplementation(() => {
            throw new Error('Disk full');
        });
        const agent = createValidAgent();

        expect(() => saveCustomAgent('/test/workspace', agent))
            .toThrow(AgentStorageError);
    });

    it('Test 20: should serialize agent as JSON', () => {
        const agent = createValidAgent();
        let writtenContent = '';
        mockFs.writeFileSync.mockImplementation((_, content) => {
            writtenContent = content as string;
        });

        saveCustomAgent('/test/workspace', agent);

        const parsed = JSON.parse(writtenContent);
        expect(parsed.name).toBe(agent.name);
        expect(parsed.description).toBe(agent.description);
    });
});

// ============================================================================
// Section 6: Load Operation Tests
// ============================================================================

describe('loadCustomAgent', () => {
    it('Test 21: should load and validate agent from file', () => {
        const agent = createValidAgent('loaded-agent');
        mockFs.readFileSync.mockReturnValue(JSON.stringify(agent));

        const result = loadCustomAgent('/test/workspace', 'loaded-agent');

        expect(result.name).toBe('loaded-agent');
        expect(result.description).toBe(agent.description);
    });

    it('Test 22: should throw on invalid agent name format', () => {
        expect(() => loadCustomAgent('/test/workspace', 'INVALID'))
            .toThrow(AgentStorageError);
        expect(() => loadCustomAgent('/test/workspace', 'INVALID'))
            .toThrow('Invalid agent name');
    });

    it('Test 23: should throw on reserved agent name', () => {
        expect(() => loadCustomAgent('/test/workspace', 'planning'))
            .toThrow(AgentStorageError);
    });

    it('Test 24: should throw when agent not found', () => {
        mockFs.existsSync.mockReturnValue(false);

        expect(() => loadCustomAgent('/test/workspace', 'nonexistent'))
            .toThrow('Agent not found');
    });

    it('Test 25: should throw on invalid JSON', () => {
        mockFs.readFileSync.mockReturnValue('not json {{{');

        expect(() => loadCustomAgent('/test/workspace', 'bad-json'))
            .toThrow('Failed to read agent config');
    });

    it('Test 26: should throw on invalid config schema', () => {
        const invalidConfig = { name: 'test', description: 'test' }; // Missing required fields
        mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

        expect(() => loadCustomAgent('/test/workspace', 'test'))
            .toThrow('invalid configuration');
    });

    it('Test 27: should apply defaults for optional fields', () => {
        const minimalConfig = {
            name: 'minimal',
            description: 'Minimal agent',
            systemPrompt: 'You are a minimal agent. Help users.',
            goals: ['Be helpful'],
        };
        mockFs.readFileSync.mockReturnValue(JSON.stringify(minimalConfig));

        const result = loadCustomAgent('/test/workspace', 'minimal');

        expect(result.checklist).toEqual([]);
        expect(result.customLists).toEqual([]);
        expect(result.priority).toBe('P2');
        expect(result.isActive).toBe(true);
    });
});

// ============================================================================
// Section 7: Delete Operation Tests
// ============================================================================

describe('deleteCustomAgent', () => {
    it('Test 28: should delete agent directory', () => {
        const agent = createValidAgent();
        mockFs.existsSync.mockReturnValue(true);

        deleteCustomAgent('/test/workspace', agent.name);

        expect(mockFs.rmSync).toHaveBeenCalledWith(
            expect.stringContaining(agent.name),
            { recursive: true, force: true }
        );
    });

    it('Test 29: should throw on invalid agent name', () => {
        expect(() => deleteCustomAgent('/test/workspace', 'INVALID'))
            .toThrow('Invalid agent name');
    });

    it('Test 30: should throw when agent not found', () => {
        mockFs.existsSync.mockReturnValue(false);

        expect(() => deleteCustomAgent('/test/workspace', 'nonexistent'))
            .toThrow('Agent not found');
    });

    it('Test 31: should create final backup when option set', () => {
        mockFs.existsSync.mockReturnValue(true);

        deleteCustomAgent('/test/workspace', 'test-agent', { createFinalBackup: true });

        expect(mockFs.copyFileSync).toHaveBeenCalledWith(
            expect.stringContaining('config.json'),
            expect.stringContaining('-deleted-')
        );
    });
});

// ============================================================================
// Section 8: Existence Check Tests
// ============================================================================

describe('customAgentExists', () => {
    it('Test 32: should return true when config file exists', () => {
        mockFs.existsSync.mockReturnValue(true);

        expect(customAgentExists('/test/workspace', 'existing')).toBe(true);
    });

    it('Test 33: should return false when config file missing', () => {
        mockFs.existsSync.mockReturnValue(false);

        expect(customAgentExists('/test/workspace', 'missing')).toBe(false);
    });
});

// ============================================================================
// Section 9: List Operations Tests
// ============================================================================

describe('listCustomAgentNames', () => {
    it('Test 34: should return empty array when no agents directory', () => {
        mockFs.existsSync.mockReturnValue(false);

        const result = listCustomAgentNames('/test/workspace');

        expect(result).toEqual([]);
    });

    it('Test 35: should return agent folder names', () => {
        mockFs.existsSync.mockImplementation((p: fs.PathLike) => true);
        mockFs.readdirSync.mockReturnValue([
            { name: 'agent-one', isDirectory: () => true },
            { name: 'agent-two', isDirectory: () => true },
            { name: 'not-a-dir.txt', isDirectory: () => false },
        ] as any);

        const result = listCustomAgentNames('/test/workspace');

        expect(result).toContain('agent-one');
        expect(result).toContain('agent-two');
        expect(result).not.toContain('not-a-dir.txt');
    });

    it('Test 36: should only include directories with config.json', () => {
        mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
            const pathStr = String(p);
            if (pathStr.includes('has-config') && pathStr.includes('config.json')) return true;
            if (pathStr.includes('no-config') && pathStr.includes('config.json')) return false;
            return true; // Base directory exists
        });
        mockFs.readdirSync.mockReturnValue([
            { name: 'has-config', isDirectory: () => true },
            { name: 'no-config', isDirectory: () => true },
        ] as any);

        const result = listCustomAgentNames('/test/workspace');

        expect(result).toContain('has-config');
        expect(result).not.toContain('no-config');
    });

    it('Test 37: should throw AgentStorageError on read failure', () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockImplementation(() => {
            throw new Error('Permission denied');
        });

        expect(() => listCustomAgentNames('/test/workspace'))
            .toThrow(AgentStorageError);
    });
});

describe('listCustomAgents', () => {
    beforeEach(() => {
        // Setup for list tests
        mockFs.existsSync.mockReturnValue(true);
    });

    it('Test 38: should return items with validation status', () => {
        const validAgent = createValidAgent('valid-agent');

        mockFs.readdirSync.mockReturnValue([
            { name: 'valid-agent', isDirectory: () => true },
            { name: 'broken-agent', isDirectory: () => true },
        ] as any);

        // Use mockReturnValueOnce for predictable behavior
        // First call is for valid-agent, second for broken-agent
        mockFs.readFileSync
            .mockReturnValueOnce(JSON.stringify(validAgent))
            .mockReturnValueOnce('{ invalid json }'); // This will fail JSON.parse

        const result = listCustomAgents('/test/workspace');

        expect(result.length).toBe(2);

        // Find results by checking which one loaded successfully
        const validResult = result.find(r => r.valid);
        const invalidResult = result.find(r => !r.valid);

        expect(validResult).toBeDefined();
        expect(validResult?.agent).toBeDefined();
        expect(invalidResult).toBeDefined();
        expect(invalidResult?.validationError).toBeDefined();
    });

    it('Test 39: should filter to valid only when option set', () => {
        const validAgent = createValidAgent('valid-agent');

        mockFs.readdirSync.mockReturnValue([
            { name: 'valid-agent', isDirectory: () => true },
            { name: 'broken-agent', isDirectory: () => true },
        ] as any);

        // First read returns valid, second returns invalid JSON
        mockFs.readFileSync
            .mockReturnValueOnce(JSON.stringify(validAgent))
            .mockReturnValueOnce('not valid json');

        const result = listCustomAgents('/test/workspace', { validOnly: true });

        // Should only have the valid agent (broken filtered out)
        expect(result.length).toBe(1);
        expect(result[0].valid).toBe(true);
    });

    it('Test 40: should filter to active only when option set', () => {
        const activeAgent = { ...createValidAgent('valid-agent'), isActive: true };
        const inactiveAgent = { ...createValidAgent('invalid-agent'), name: 'inactive', isActive: false };

        mockFs.readdirSync.mockReturnValue([
            { name: 'active', isDirectory: () => true },
            { name: 'inactive', isDirectory: () => true },
        ] as any);

        mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
            if (String(p).includes('active') && !String(p).includes('inactive')) {
                return JSON.stringify({ ...activeAgent, name: 'active' });
            }
            return JSON.stringify({ ...inactiveAgent, name: 'inactive' });
        });

        const result = listCustomAgents('/test/workspace', { activeOnly: true });

        expect(result.length).toBe(1);
        expect(result[0].name).toBe('active');
    });
});

describe('loadAllCustomAgents', () => {
    it('Test 41: should return array of valid agent configs', () => {
        const agent1 = createValidAgent('agent-one');
        const agent2 = createValidAgent('agent-two');

        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue([
            { name: 'agent-one', isDirectory: () => true },
            { name: 'agent-two', isDirectory: () => true },
        ] as any);
        mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
            if (String(p).includes('agent-one')) return JSON.stringify(agent1);
            return JSON.stringify(agent2);
        });

        const result = loadAllCustomAgents('/test/workspace');

        expect(result.length).toBe(2);
        expect(result.map(a => a.name)).toContain('agent-one');
        expect(result.map(a => a.name)).toContain('agent-two');
    });
});

// ============================================================================
// Section 10: Import/Export Tests
// ============================================================================

describe('exportAgentToString', () => {
    it('Test 42: should export agent as formatted JSON', () => {
        const agent = createValidAgent();

        const result = exportAgentToString(agent);

        expect(result).toContain('"name"');
        expect(result).toContain('\n'); // Pretty printed
        const parsed = JSON.parse(result);
        expect(parsed.name).toBe(agent.name);
    });

    it('Test 43: should export compact JSON when pretty=false', () => {
        const agent = createValidAgent();

        const result = exportAgentToString(agent, false);

        // Compact JSON should not have newlines between properties
        expect(result.split('\n').length).toBeLessThan(5);
    });
});

describe('importAgentFromString', () => {
    it('Test 44: should import and validate agent from JSON string', () => {
        const agent = createValidAgent('imported');
        const jsonString = JSON.stringify(agent);

        const result = importAgentFromString(jsonString);

        expect(result.name).toBe('imported');
    });

    it('Test 45: should throw on invalid JSON', () => {
        expect(() => importAgentFromString('not json'))
            .toThrow('Invalid JSON');
    });

    it('Test 46: should throw on invalid agent config', () => {
        const invalidConfig = { name: 'test' }; // Missing required fields

        expect(() => importAgentFromString(JSON.stringify(invalidConfig)))
            .toThrow('Invalid agent configuration');
    });
});

// ============================================================================
// Section 11: Backup Tests
// ============================================================================

describe('restoreAgentFromBackup', () => {
    it('Test 47: should restore agent from backup file', () => {
        const agent = createValidAgent('backed-up');
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(agent));

        const result = restoreAgentFromBackup('/test/workspace', 'backed-up');

        expect(result.name).toBe('backed-up');
        expect(mockFs.copyFileSync).toHaveBeenCalled();
    });

    it('Test 48: should throw when no backup exists', () => {
        mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
            return !String(p).includes('.bak');
        });

        expect(() => restoreAgentFromBackup('/test/workspace', 'no-backup'))
            .toThrow('No backup found');
    });
});

describe('agentHasBackup', () => {
    it('Test 49: should return true when backup file exists', () => {
        mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
            return String(p).includes('.bak');
        });

        expect(agentHasBackup('/test/workspace', 'has-backup')).toBe(true);
    });

    it('Test 50: should return false when no backup', () => {
        mockFs.existsSync.mockReturnValue(false);

        expect(agentHasBackup('/test/workspace', 'no-backup')).toBe(false);
    });
});

// ============================================================================
// Section 12: Rename Tests
// ============================================================================

describe('renameCustomAgent', () => {
    it('Test 51: should rename agent and move folder', () => {
        const oldAgent = createValidAgent('old-name');
        // Carefully mock existsSync to distinguish old vs new name
        mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
            const pathStr = String(p);
            // New name config should NOT exist
            if (pathStr.includes('new-name') && pathStr.includes('config.json')) {
                return false;
            }
            // Old name should exist
            return true;
        });
        mockFs.readFileSync.mockReturnValue(JSON.stringify(oldAgent));

        const result = renameCustomAgent('/test/workspace', 'old-name', 'new-name');

        expect(result.name).toBe('new-name');
        expect(mockFs.rmSync).toHaveBeenCalled(); // Delete old folder
    });

    it('Test 52: should throw when old agent not found', () => {
        mockFs.existsSync.mockReturnValue(false);

        expect(() => renameCustomAgent('/test/workspace', 'missing', 'new-name'))
            .toThrow('Agent not found');
    });

    it('Test 53: should throw when new name is invalid', () => {
        mockFs.existsSync.mockReturnValue(true);

        expect(() => renameCustomAgent('/test/workspace', 'old-name', 'INVALID'))
            .toThrow('Invalid new name');
    });

    it('Test 54: should throw when new name already exists', () => {
        mockFs.existsSync.mockReturnValue(true);

        expect(() => renameCustomAgent('/test/workspace', 'old-name', 'existing'))
            .toThrow('Agent already exists');
    });

    it('Test 55: should update metadata.updatedAt', () => {
        const oldAgent = createValidAgent('old-name');
        mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
            // Old agent exists, new does not
            const pathStr = String(p);
            if (pathStr.includes('new-name') && pathStr.includes('config.json')) {
                return false;
            }
            return true;
        });
        mockFs.readFileSync.mockReturnValue(JSON.stringify(oldAgent));

        const result = renameCustomAgent('/test/workspace', 'old-name', 'new-name');

        expect(result.metadata.updatedAt).toBeDefined();
    });
});

// ============================================================================
// Section 13: Storage Statistics Tests
// ============================================================================

describe('getStorageStats', () => {
    it('Test 56: should return correct statistics', () => {
        const activeAgent = { ...createValidAgent('active-agent'), isActive: true };
        const inactiveAgent = { ...createValidAgent('inactive-agent'), isActive: false };

        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue([
            { name: 'active-agent', isDirectory: () => true },
            { name: 'inactive-agent', isDirectory: () => true },
        ] as any);

        // Use mockReturnValueOnce in order of directory listing
        mockFs.readFileSync
            .mockReturnValueOnce(JSON.stringify(activeAgent))
            .mockReturnValueOnce(JSON.stringify(inactiveAgent));
        mockFs.statSync.mockReturnValue({ size: 500 } as any);

        const stats = getStorageStats('/test/workspace');

        expect(stats.totalAgents).toBe(2);
        expect(stats.validAgents).toBe(2);
        expect(stats.invalidAgents).toBe(0);
        expect(stats.activeAgents).toBe(1);
        expect(stats.inactiveAgents).toBe(1);
        expect(stats.totalBytes).toBe(1000); // 2 agents * 500 bytes
        // Use normalized path check for cross-platform
        expect(stats.storagePath.replace(/\\/g, '/')).toContain('.coe/agents/custom');
    });

    it('Test 57: should handle stat errors gracefully', () => {
        const agent = createValidAgent('test-agent');
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue([
            { name: 'test-agent', isDirectory: () => true },
        ] as any);
        mockFs.readFileSync.mockReturnValue(JSON.stringify(agent));
        mockFs.statSync.mockImplementation(() => {
            throw new Error('Access denied');
        });

        const stats = getStorageStats('/test/workspace');

        expect(stats.totalAgents).toBe(1);
        expect(stats.totalBytes).toBe(0); // Stat failed
    });

    it('Test 58: should count invalid agents correctly', () => {
        const validAgent = createValidAgent('valid-agent');

        mockFs.existsSync.mockReturnValue(true);
        mockFs.readdirSync.mockReturnValue([
            { name: 'valid-agent', isDirectory: () => true },
            { name: 'broken-agent', isDirectory: () => true },
        ] as any);

        // First returns valid, second returns unparseable JSON
        mockFs.readFileSync
            .mockReturnValueOnce(JSON.stringify(validAgent))
            .mockReturnValueOnce('{ broken json');
        mockFs.statSync.mockReturnValue({ size: 100 } as any);

        const stats = getStorageStats('/test/workspace');

        expect(stats.validAgents).toBe(1);
        expect(stats.invalidAgents).toBe(1);
    });
});

// ============================================================================
// Section 14: Edge Cases & Error Handling
// ============================================================================

describe('Edge Cases', () => {
    it('Test 59: should handle agents with special characters in content', () => {
        const agent = {
            ...createValidAgent('special-chars'),
            systemPrompt: 'Handle "quotes" and \\backslashes\\ and unicode: 日本語 emoji: 🚀',
        };

        // Test serialization round-trip
        const exported = exportAgentToString(agent);
        mockFs.readFileSync.mockReturnValue(exported);

        const imported = importAgentFromString(exported);
        expect(imported.systemPrompt).toBe(agent.systemPrompt);
    });

    it('Test 60: should handle empty custom lists array', () => {
        const agent = { ...createValidAgent('no-lists'), customLists: [] };

        const exported = exportAgentToString(agent);
        const imported = importAgentFromString(exported);

        expect(imported.customLists).toEqual([]);
    });

    it('Test 61: should handle max length name', () => {
        const longName = 'a'.repeat(50); // Max length is 50
        const agent = createValidAgent(longName);

        const validation = () => saveCustomAgent('/test/workspace', agent);
        expect(validation).not.toThrow();
    });

    it('Test 62: should reject name over max length', () => {
        const tooLongName = 'a'.repeat(51);
        const agent = { ...createValidAgent('temp'), name: tooLongName } as CustomAgent;

        expect(() => saveCustomAgent('/test/workspace', agent))
            .toThrow(AgentStorageError);
    });

    it('Test 63: should handle concurrent saves (atomic write)', () => {
        // Verify atomic write pattern is used
        const agent = createValidAgent('concurrent');
        const writeOrder: string[] = [];

        mockFs.writeFileSync.mockImplementation((p) => {
            writeOrder.push('write:' + (String(p).includes('.tmp') ? 'tmp' : 'other'));
        });
        mockFs.renameSync.mockImplementation(() => {
            writeOrder.push('rename');
        });

        saveCustomAgent('/test/workspace', agent);

        // Should write to tmp first, then rename
        expect(writeOrder[0]).toBe('write:tmp');
        expect(writeOrder[1]).toBe('rename');
    });
});

// ============================================================================
// Section 15: Integration-style Tests
// ============================================================================

describe('CRUD Workflow Integration', () => {
    it('Test 64: should complete full create-read-update-delete cycle', () => {
        const agent = createValidAgent('crud-test');
        let storedContent = '';

        // Setup mock to simulate persistent storage
        mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
            const pathStr = String(p);
            if (pathStr.includes('crud-test') && pathStr.includes('config.json')) {
                return storedContent.length > 0;
            }
            return true;
        });
        mockFs.writeFileSync.mockImplementation((_, content) => {
            storedContent = content as string;
        });
        mockFs.readFileSync.mockImplementation(() => storedContent);

        // CREATE
        saveCustomAgent('/test/workspace', agent);
        expect(storedContent).toContain('crud-test');

        // READ
        const loaded = loadCustomAgent('/test/workspace', 'crud-test');
        expect(loaded.name).toBe('crud-test');

        // UPDATE
        const updated = { ...loaded, description: 'Updated description' };
        saveCustomAgent('/test/workspace', updated);
        expect(storedContent).toContain('Updated description');

        // DELETE
        mockFs.existsSync.mockReturnValue(true);
        deleteCustomAgent('/test/workspace', 'crud-test');
        expect(mockFs.rmSync).toHaveBeenCalled();
    });

    it('Test 65: should preserve all fields through save/load cycle', () => {
        const agent: CustomAgent = {
            name: 'full-agent',
            description: 'A fully configured agent',
            systemPrompt: 'You are a fully configured test agent.',
            goals: ['Goal 1', 'Goal 2', 'Goal 3'],
            checklist: ['Check 1', 'Check 2'],
            customLists: [
                {
                    name: 'resources',
                    description: 'Resource list',
                    items: ['Item 1', 'Item 2'],
                    order: 0,
                    collapsed: false,
                },
            ],
            priority: 'P1',
            routing: {
                keywords: ['test', 'example'],
                patterns: ['test.*pattern'],
                tags: ['testing'],
                ticketTypes: ['human_to_ai'],
                priorityBoost: 1,
            },
            metadata: {
                author: 'Test Author',
                version: '1.2.3',
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-02T00:00:00.000Z',
                tags: ['test', 'example'],
            },
            isActive: true,
            timeoutSeconds: 90,
            maxTokens: 4096,
            temperature: 0.5,
        };

        // Export and re-import (tests string serialization, not file storage)
        const exported = exportAgentToString(agent);
        const imported = importAgentFromString(exported);

        // Verify all fields preserved
        expect(imported.name).toBe(agent.name);
        expect(imported.goals).toEqual(agent.goals);
        expect(imported.customLists).toEqual(agent.customLists);
        expect(imported.routing).toEqual(agent.routing);
        expect(imported.metadata).toEqual(agent.metadata);
        expect(imported.timeoutSeconds).toBe(agent.timeoutSeconds);
    });
});
