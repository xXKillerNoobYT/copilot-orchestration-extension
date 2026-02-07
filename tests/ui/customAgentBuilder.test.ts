/**
 * Tests for CustomAgentBuilderPanel
 *
 * Unit tests for the custom agent builder webview panel.
 * Tests panel creation, disposal, message handling, validation, and save/load.
 */

import * as vscode from 'vscode';
import {
    CustomAgentBuilderPanel,
    openCustomAgentBuilder,
    openCustomAgentEditor,
    resetCustomAgentBuilderForTests,
    WebviewToExtensionMessage,
    ExtensionToWebviewMessage,
    BuilderMode
} from '../../src/ui/customAgentBuilder';
import { CustomAgent, createDefaultAgentTemplate } from '../../src/agents/custom/schema';

// Mock vscode module
jest.mock('vscode');

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

// Mock storage module
const mockSaveCustomAgent = jest.fn();
const mockLoadCustomAgent = jest.fn();
const mockListCustomAgents = jest.fn();
const mockCustomAgentExists = jest.fn();
const mockGetWorkspaceFolder = jest.fn();

jest.mock('../../src/agents/custom/storage', () => ({
    saveCustomAgent: (...args: any[]) => mockSaveCustomAgent(...args),
    loadCustomAgent: (...args: any[]) => mockLoadCustomAgent(...args),
    listCustomAgents: (...args: any[]) => mockListCustomAgents(...args),
    customAgentExists: (...args: any[]) => mockCustomAgentExists(...args),
    getWorkspaceFolder: () => mockGetWorkspaceFolder(),
    AgentListItem: {}
}));

describe('CustomAgentBuilderPanel', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;
    let messageCallback: ((message: WebviewToExtensionMessage) => void) | null = null;
    let disposeCallback: (() => void) | null = null;
    let postedMessages: ExtensionToWebviewMessage[] = [];

    beforeEach(() => {
        jest.clearAllMocks();
        resetCustomAgentBuilderForTests();
        messageCallback = null;
        disposeCallback = null;
        postedMessages = [];

        // Reset storage mocks (these are synchronous functions)
        mockGetWorkspaceFolder.mockReturnValue('/test/workspace');
        mockSaveCustomAgent.mockReturnValue(undefined);
        mockLoadCustomAgent.mockReturnValue(null);
        mockListCustomAgents.mockReturnValue([]);
        mockCustomAgentExists.mockReturnValue(false);

        // Mock webview
        mockWebview = {
            html: '',
            postMessage: jest.fn((msg) => {
                postedMessages.push(msg);
                return Promise.resolve(true);
            }),
            onDidReceiveMessage: jest.fn((callback) => {
                messageCallback = callback;
                return { dispose: jest.fn() };
            }),
            asWebviewUri: jest.fn((uri) => uri),
            cspSource: 'self'
        } as unknown as vscode.Webview;

        // Mock panel
        mockPanel = {
            webview: mockWebview,
            reveal: jest.fn(),
            dispose: jest.fn(),
            onDidDispose: jest.fn((callback) => {
                disposeCallback = callback;
                return { dispose: jest.fn() };
            }),
            title: ''
        } as unknown as vscode.WebviewPanel;

        // Mock vscode.window.createWebviewPanel
        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

        // Mock vscode.window.showInformationMessage
        (vscode.window.showInformationMessage as jest.Mock) = jest.fn();

        // Mock extension context
        mockContext = {
            subscriptions: [],
            extensionUri: { fsPath: '/test/extension' } as vscode.Uri,
            extensionPath: '/test/extension',
            globalState: {
                get: jest.fn(),
                update: jest.fn()
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn()
            }
        } as unknown as vscode.ExtensionContext;
    });

    afterEach(() => {
        resetCustomAgentBuilderForTests();
    });

    // =========================================================================
    // Section 1: Panel Creation and Lifecycle
    // =========================================================================

    describe('Panel Creation', () => {
        it('Test 1: should create panel in create mode', () => {
            const panel = openCustomAgentBuilder(mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'coeCustomAgentBuilder',
                'New Custom Agent',
                vscode.ViewColumn.One,
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: true
                })
            );
            expect(panel).not.toBeNull();
        });

        it('Test 2: should create panel in edit mode with agent name', () => {
            openCustomAgentEditor(mockContext, 'test-agent');

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'coeCustomAgentBuilder',
                'Edit Agent: test-agent',
                vscode.ViewColumn.One,
                expect.any(Object)
            );
        });

        it('Test 3: should reuse existing panel if already open', () => {
            const panel1 = openCustomAgentBuilder(mockContext);
            const panel2 = openCustomAgentBuilder(mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
            expect(mockPanel.reveal).toHaveBeenCalled();
            expect(panel1).toBe(panel2);
        });

        it('Test 4: should set HTML content on panel', () => {
            openCustomAgentBuilder(mockContext);

            expect(mockWebview.html).toContain('<!DOCTYPE html>');
            expect(mockWebview.html).toContain('Custom Agent Builder');
            expect(mockWebview.html).toContain('agent-form');
        });

        it('Test 5: should register message handler', () => {
            openCustomAgentBuilder(mockContext);

            expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled();
            expect(messageCallback).not.toBeNull();
        });

        it('Test 6: should register dispose handler', () => {
            openCustomAgentBuilder(mockContext);

            expect(mockPanel.onDidDispose).toHaveBeenCalled();
            expect(disposeCallback).not.toBeNull();
        });

        it('Test 7: should send constraints info on initialization', async () => {
            openCustomAgentBuilder(mockContext);

            // Wait for async initialization
            await new Promise(resolve => setTimeout(resolve, 10));

            const constraintsMsg = postedMessages.find(m => m.type === 'constraintsInfo');
            expect(constraintsMsg).toBeDefined();
            expect((constraintsMsg as any).constraints).toBeDefined();
            expect((constraintsMsg as any).variables).toBeDefined();
            expect((constraintsMsg as any).reservedNames).toBeDefined();
        });

        it('Test 8: should send default agent on create mode', async () => {
            openCustomAgentBuilder(mockContext);

            await new Promise(resolve => setTimeout(resolve, 10));

            const agentLoadedMsg = postedMessages.find(m => m.type === 'agentLoaded');
            expect(agentLoadedMsg).toBeDefined();
            expect((agentLoadedMsg as any).agent).toBeDefined();
        });
    });

    // =========================================================================
    // Section 2: Panel Disposal
    // =========================================================================

    describe('Panel Disposal', () => {
        it('Test 9: should reset instance on dispose', () => {
            openCustomAgentBuilder(mockContext);
            expect(CustomAgentBuilderPanel.getInstance()).not.toBeNull();

            // Trigger dispose callback
            if (disposeCallback) {
                disposeCallback();
            }

            expect(CustomAgentBuilderPanel.getInstance()).toBeNull();
        });

        it('Test 10: should dispose panel resources', () => {
            const panel = openCustomAgentBuilder(mockContext);
            panel.dispose();

            expect(mockPanel.dispose).toHaveBeenCalled();
        });

        it('Test 11: should allow creating new panel after disposal', () => {
            openCustomAgentBuilder(mockContext);
            resetCustomAgentBuilderForTests();

            // Should be able to create again
            const panel = openCustomAgentBuilder(mockContext);
            expect(panel).not.toBeNull();
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
        });
    });

    // =========================================================================
    // Section 3: Message Handling - Validation
    // =========================================================================

    describe('Validation Messages', () => {
        it('Test 12: should validate valid agent config', async () => {
            openCustomAgentBuilder(mockContext);

            const validConfig: Partial<CustomAgent> = {
                name: 'test-agent',
                description: 'A test agent',
                systemPrompt: 'You are a test agent.',
                goals: ['Goal 1'],
                checklist: [],
                customLists: [],
                priority: 'P2',
                isActive: true,
                timeoutSeconds: 60,
                maxTokens: 2048,
                temperature: 0.7
            };

            postedMessages = [];
            messageCallback!({ type: 'validate', agentConfig: validConfig });

            await new Promise(resolve => setTimeout(resolve, 10));

            const result = postedMessages.find(m => m.type === 'validationResult');
            expect(result).toBeDefined();
            expect((result as any).isValid).toBe(true);
        });

        it('Test 13: should reject invalid agent name', async () => {
            openCustomAgentBuilder(mockContext);

            const invalidConfig: Partial<CustomAgent> = {
                name: 'Invalid Name!', // Invalid: uppercase and special chars
                description: 'A test agent',
                systemPrompt: 'You are a test agent.',
                goals: ['Goal 1']
            };

            postedMessages = [];
            messageCallback!({ type: 'validate', agentConfig: invalidConfig });

            await new Promise(resolve => setTimeout(resolve, 10));

            const result = postedMessages.find(m => m.type === 'validationResult');
            expect(result).toBeDefined();
            expect((result as any).isValid).toBe(false);
            expect((result as any).errors).toContainEqual(
                expect.objectContaining({ path: expect.stringContaining('name') })
            );
        });

        it('Test 14: should reject empty goals', async () => {
            openCustomAgentBuilder(mockContext);

            const invalidConfig: Partial<CustomAgent> = {
                name: 'test-agent',
                description: 'A test agent',
                systemPrompt: 'You are a test agent.',
                goals: [] // Invalid: at least 1 goal required
            };

            postedMessages = [];
            messageCallback!({ type: 'validate', agentConfig: invalidConfig });

            await new Promise(resolve => setTimeout(resolve, 10));

            const result = postedMessages.find(m => m.type === 'validationResult');
            expect(result).toBeDefined();
            expect((result as any).isValid).toBe(false);
        });

        it('Test 15: should reject reserved agent names', async () => {
            openCustomAgentBuilder(mockContext);

            const invalidConfig: Partial<CustomAgent> = {
                name: 'planning', // Reserved name
                description: 'A test agent',
                systemPrompt: 'You are a test agent.',
                goals: ['Goal 1']
            };

            postedMessages = [];
            messageCallback!({ type: 'validate', agentConfig: invalidConfig });

            await new Promise(resolve => setTimeout(resolve, 10));

            const result = postedMessages.find(m => m.type === 'validationResult');
            expect(result).toBeDefined();
            expect((result as any).isValid).toBe(false);
        });

        it('Test 16: should validate with no config', async () => {
            openCustomAgentBuilder(mockContext);

            postedMessages = [];
            messageCallback!({ type: 'validate' });

            await new Promise(resolve => setTimeout(resolve, 10));

            const result = postedMessages.find(m => m.type === 'validationResult');
            expect(result).toBeDefined();
            expect((result as any).isValid).toBe(false);
        });
    });

    // =========================================================================
    // Section 4: Message Handling - Save
    // =========================================================================

    describe('Save Messages', () => {
        const validAgent: Partial<CustomAgent> = {
            name: 'test-agent',
            description: 'A test agent',
            systemPrompt: 'You are a test agent.',
            goals: ['Goal 1'],
            checklist: [],
            customLists: [],
            priority: 'P2',
            isActive: true,
            timeoutSeconds: 60,
            maxTokens: 2048,
            temperature: 0.7,
            routing: {
                keywords: [],
                patterns: [],
                tags: [],
                ticketTypes: [],
                priorityBoost: 0
            },
            metadata: {
                version: '1.0.0',
                tags: []
            }
        };

        it('Test 17: should save valid agent config', async () => {
            openCustomAgentBuilder(mockContext);

            postedMessages = [];
            messageCallback!({ type: 'save', agentConfig: validAgent });

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockSaveCustomAgent).toHaveBeenCalled();
            const result = postedMessages.find(m => m.type === 'saveResult');
            expect(result).toBeDefined();
            expect((result as any).success).toBe(true);
        });

        it('Test 18: should show success notification on save', async () => {
            openCustomAgentBuilder(mockContext);

            messageCallback!({ type: 'save', agentConfig: validAgent });

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('created successfully')
            );
        });

        it('Test 19: should reject save with no config', async () => {
            openCustomAgentBuilder(mockContext);

            postedMessages = [];
            messageCallback!({ type: 'save' });

            await new Promise(resolve => setTimeout(resolve, 10));

            const result = postedMessages.find(m => m.type === 'saveResult');
            expect(result).toBeDefined();
            expect((result as any).success).toBe(false);
        });

        it('Test 20: should reject save when agent exists (create mode)', async () => {
            mockCustomAgentExists.mockResolvedValue(true);
            openCustomAgentBuilder(mockContext);

            postedMessages = [];
            messageCallback!({ type: 'save', agentConfig: validAgent });

            await new Promise(resolve => setTimeout(resolve, 50));

            const result = postedMessages.find(m => m.type === 'saveResult');
            expect(result).toBeDefined();
            expect((result as any).success).toBe(false);
            expect((result as any).errorMessage).toContain('already exists');
        });

        it('Test 21: should create backup when saving in edit mode', async () => {
            mockLoadCustomAgent.mockReturnValue({
                ...validAgent,
                name: 'existing-agent'
            });

            openCustomAgentEditor(mockContext, 'existing-agent');

            await new Promise(resolve => setTimeout(resolve, 50));

            postedMessages = [];
            messageCallback!({
                type: 'save',
                agentConfig: { ...validAgent, name: 'existing-agent' }
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockSaveCustomAgent).toHaveBeenCalledWith(
                '/test/workspace',
                expect.objectContaining({ name: 'existing-agent' }),
                expect.objectContaining({ skipBackup: false })
            );
        });

        it('Test 22: should handle save error gracefully', async () => {
            mockSaveCustomAgent.mockImplementation(() => {
                throw new Error('Disk full');
            });
            openCustomAgentBuilder(mockContext);

            postedMessages = [];
            messageCallback!({ type: 'save', agentConfig: validAgent });

            await new Promise(resolve => setTimeout(resolve, 50));

            const result = postedMessages.find(m => m.type === 'saveResult');
            expect(result).toBeDefined();
            expect((result as any).success).toBe(false);
            expect((result as any).errorMessage).toContain('Disk full');
        });
    });

    // =========================================================================
    // Section 5: Message Handling - Load
    // =========================================================================

    describe('Load Messages', () => {
        const existingAgent: CustomAgent = {
            name: 'existing-agent',
            description: 'An existing agent',
            systemPrompt: 'You are an existing agent.',
            goals: ['Goal 1', 'Goal 2'],
            checklist: ['Check 1'],
            customLists: [],
            priority: 'P1',
            isActive: true,
            timeoutSeconds: 90,
            maxTokens: 4096,
            temperature: 0.5,
            routing: {
                keywords: ['test'],
                patterns: [],
                tags: [],
                ticketTypes: [],
                priorityBoost: 1
            },
            metadata: {
                author: 'Test Author',
                version: '2.0.0',
                tags: ['test']
            }
        };

        it('Test 23: should load existing agent in edit mode', async () => {
            mockLoadCustomAgent.mockReturnValue(existingAgent);

            openCustomAgentEditor(mockContext, 'existing-agent');

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockLoadCustomAgent).toHaveBeenCalledWith('/test/workspace', 'existing-agent');

            const agentLoadedMsg = postedMessages.find(m => m.type === 'agentLoaded');
            expect(agentLoadedMsg).toBeDefined();
            expect((agentLoadedMsg as any).agent.name).toBe('existing-agent');
        });

        it('Test 24: should handle load error for non-existent agent', async () => {
            mockLoadCustomAgent.mockImplementation(() => {
                throw new Error('Agent "non-existent" not found');
            });

            openCustomAgentEditor(mockContext, 'non-existent');

            await new Promise(resolve => setTimeout(resolve, 50));

            const errorMsg = postedMessages.find(m => m.type === 'error');
            expect(errorMsg).toBeDefined();
            expect((errorMsg as any).errorMessage).toContain('not found');
        });

        it('Test 25: should load agent by message', async () => {
            mockLoadCustomAgent.mockReturnValue(existingAgent);

            openCustomAgentBuilder(mockContext);

            await new Promise(resolve => setTimeout(resolve, 10));

            postedMessages = [];
            messageCallback!({ type: 'loadAgent', agentName: 'existing-agent' });

            await new Promise(resolve => setTimeout(resolve, 50));

            const agentLoadedMsg = postedMessages.find(m => m.type === 'agentLoaded');
            expect(agentLoadedMsg).toBeDefined();
        });

        it('Test 26: should handle load failure gracefully', async () => {
            mockLoadCustomAgent.mockImplementation(() => {
                throw new Error('Read error');
            });

            openCustomAgentEditor(mockContext, 'broken-agent');

            await new Promise(resolve => setTimeout(resolve, 50));

            const errorMsg = postedMessages.find(m => m.type === 'error');
            expect(errorMsg).toBeDefined();
            expect((errorMsg as any).errorMessage).toContain('Read error');
        });
    });

    // =========================================================================
    // Section 6: Message Handling - Cancel
    // =========================================================================

    describe('Cancel Messages', () => {
        it('Test 27: should dispose panel on cancel', () => {
            const panel = openCustomAgentBuilder(mockContext);

            messageCallback!({ type: 'cancel' });

            expect(mockPanel.dispose).toHaveBeenCalled();
        });

        it('Test 28: should clear instance on cancel', () => {
            openCustomAgentBuilder(mockContext);
            expect(CustomAgentBuilderPanel.getInstance()).not.toBeNull();

            messageCallback!({ type: 'cancel' });

            // Instance cleared after dispose
            expect(CustomAgentBuilderPanel.getInstance()).toBeNull();
        });
    });

    // =========================================================================
    // Section 7: Message Handling - Templates
    // =========================================================================

    describe('Template Messages', () => {
        it('Test 29: should load template', async () => {
            openCustomAgentBuilder(mockContext);

            await new Promise(resolve => setTimeout(resolve, 10));

            postedMessages = [];
            messageCallback!({ type: 'loadTemplate', templateName: 'Research Assistant' });

            await new Promise(resolve => setTimeout(resolve, 10));

            const agentLoadedMsg = postedMessages.find(m => m.type === 'agentLoaded');
            expect(agentLoadedMsg).toBeDefined();
            expect((agentLoadedMsg as any).agent.name).toContain('research');
        });

        it('Test 30: should set template description', async () => {
            openCustomAgentBuilder(mockContext);

            await new Promise(resolve => setTimeout(resolve, 10));

            postedMessages = [];
            messageCallback!({ type: 'loadTemplate', templateName: 'Code Reviewer' });

            await new Promise(resolve => setTimeout(resolve, 10));

            const agentLoadedMsg = postedMessages.find(m => m.type === 'agentLoaded');
            expect((agentLoadedMsg as any).agent.description).toContain('Code Reviewer');
        });
    });

    // =========================================================================
    // Section 8: Message Handling - Field Changes
    // =========================================================================

    describe('Field Change Messages', () => {
        it('Test 31: should handle fieldChanged message', async () => {
            openCustomAgentBuilder(mockContext);

            await new Promise(resolve => setTimeout(resolve, 10));

            postedMessages = [];
            messageCallback!({
                type: 'fieldChanged',
                fieldName: 'name',
                fieldValue: 'new-name'
            });

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should trigger validation
            const validationMsg = postedMessages.find(m => m.type === 'validationResult');
            expect(validationMsg).toBeDefined();
        });

        it('Test 32: should handle nested field changes', async () => {
            openCustomAgentBuilder(mockContext);

            await new Promise(resolve => setTimeout(resolve, 10));

            postedMessages = [];
            messageCallback!({
                type: 'fieldChanged',
                fieldName: 'metadata.author',
                fieldValue: 'Test Author'
            });

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should not error
            expect(postedMessages.some(m => m.type === 'error')).toBe(false);
        });

        it('Test 33: should ignore fieldChanged with no fieldName', async () => {
            openCustomAgentBuilder(mockContext);

            await new Promise(resolve => setTimeout(resolve, 10));

            postedMessages = [];
            messageCallback!({ type: 'fieldChanged' });

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should not trigger validation
            const validationMsg = postedMessages.find(m => m.type === 'validationResult');
            expect(validationMsg).toBeUndefined();
        });
    });

    // =========================================================================
    // Section 9: HTML Content
    // =========================================================================

    describe('HTML Content', () => {
        it('Test 34: should include all form sections', () => {
            openCustomAgentBuilder(mockContext);

            expect(mockWebview.html).toContain('section-basic');
            expect(mockWebview.html).toContain('section-prompt');
            expect(mockWebview.html).toContain('section-goals');
            expect(mockWebview.html).toContain('section-checklist');
            expect(mockWebview.html).toContain('section-customlists');
            expect(mockWebview.html).toContain('section-settings');
            expect(mockWebview.html).toContain('section-routing');
            expect(mockWebview.html).toContain('section-metadata');
        });

        it('Test 35: should include CSP meta tag', () => {
            openCustomAgentBuilder(mockContext);

            expect(mockWebview.html).toContain('Content-Security-Policy');
            expect(mockWebview.html).toContain("default-src 'none'");
        });

        it('Test 36: should include form action buttons', () => {
            openCustomAgentBuilder(mockContext);

            expect(mockWebview.html).toContain('btn-save');
            expect(mockWebview.html).toContain('btn-cancel');
            expect(mockWebview.html).toContain('btn-validate');
        });

        it('Test 37: should include variable helper', () => {
            openCustomAgentBuilder(mockContext);

            expect(mockWebview.html).toContain('variable-helper');
            expect(mockWebview.html).toContain('{{task_id}}');
            expect(mockWebview.html).toContain('{{user_query}}');
        });

        it('Test 38: should include character count displays', () => {
            openCustomAgentBuilder(mockContext);

            expect(mockWebview.html).toContain('name-count');
            expect(mockWebview.html).toContain('description-count');
            expect(mockWebview.html).toContain('prompt-count');
        });

        it('Test 39: should include priority dropdown', () => {
            openCustomAgentBuilder(mockContext);

            expect(mockWebview.html).toContain('agent-priority');
            expect(mockWebview.html).toContain('P0 - Critical');
            expect(mockWebview.html).toContain('P1 - High');
            expect(mockWebview.html).toContain('P2 - Normal');
            expect(mockWebview.html).toContain('P3 - Low');
        });

        it('Test 40: should include routing ticket type checkboxes', () => {
            openCustomAgentBuilder(mockContext);

            expect(mockWebview.html).toContain('ai_to_human');
            expect(mockWebview.html).toContain('human_to_ai');
            expect(mockWebview.html).toContain('internal');
        });
    });

    // =========================================================================
    // Section 10: Agent List Updates
    // =========================================================================

    describe('Agent List Updates', () => {
        it('Test 41: should send agent list on initialization', async () => {
            mockListCustomAgents.mockReturnValue([
                { name: 'agent-1', description: 'Agent 1', isActive: true, priority: 'P2' },
                { name: 'agent-2', description: 'Agent 2', isActive: true, priority: 'P2' }
            ]);

            openCustomAgentBuilder(mockContext);

            await new Promise(resolve => setTimeout(resolve, 50));

            const listMsg = postedMessages.find(m => m.type === 'agentListUpdated');
            expect(listMsg).toBeDefined();
            expect((listMsg as any).agents).toEqual(['agent-1', 'agent-2']);
        });

        it('Test 42: should update agent list after save', async () => {
            mockListCustomAgents
                .mockReturnValueOnce([])
                .mockReturnValueOnce([{ name: 'new-agent', description: 'New', isActive: true, priority: 'P2' }]);

            const validAgent: Partial<CustomAgent> = {
                name: 'new-agent',
                description: 'A new agent',
                systemPrompt: 'You are new.',
                goals: ['Goal 1'],
                checklist: [],
                customLists: [],
                priority: 'P2',
                isActive: true,
                timeoutSeconds: 60,
                maxTokens: 2048,
                temperature: 0.7,
                routing: { keywords: [], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
                metadata: { version: '1.0.0', tags: [] }
            };

            openCustomAgentBuilder(mockContext);

            await new Promise(resolve => setTimeout(resolve, 50));

            postedMessages = [];
            messageCallback!({ type: 'save', agentConfig: validAgent });

            await new Promise(resolve => setTimeout(resolve, 100));

            const listMsgs = postedMessages.filter(m => m.type === 'agentListUpdated');
            expect(listMsgs.length).toBeGreaterThan(0);
        });

        it('Test 43: should handle list error gracefully', async () => {
            mockListCustomAgents.mockImplementation(() => {
                throw new Error('List error');
            });

            openCustomAgentBuilder(mockContext);

            await new Promise(resolve => setTimeout(resolve, 50));

            // Should not throw, just log error
            expect(postedMessages.some(m => m.type === 'error')).toBe(false);
        });
    });

    // =========================================================================
    // Section 11: Static Methods
    // =========================================================================

    describe('Static Methods', () => {
        it('Test 44: should return null from getInstance when no panel', () => {
            expect(CustomAgentBuilderPanel.getInstance()).toBeNull();
        });

        it('Test 45: should return panel from getInstance when open', () => {
            openCustomAgentBuilder(mockContext);
            expect(CustomAgentBuilderPanel.getInstance()).not.toBeNull();
        });

        it('Test 46: openCustomAgentBuilder should use create mode', () => {
            openCustomAgentBuilder(mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'coeCustomAgentBuilder',
                'New Custom Agent',
                expect.anything(),
                expect.anything()
            );
        });

        it('Test 47: openCustomAgentEditor should use edit mode', () => {
            openCustomAgentEditor(mockContext, 'my-agent');

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'coeCustomAgentBuilder',
                'Edit Agent: my-agent',
                expect.anything(),
                expect.anything()
            );
        });
    });

    // =========================================================================
    // Section 12: Unknown Message Types
    // =========================================================================

    describe('Unknown Messages', () => {
        it('Test 48: should handle unknown message type gracefully', async () => {
            openCustomAgentBuilder(mockContext);

            // Send unknown message type
            messageCallback!({ type: 'unknownType' as any });

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should not crash, just log warning
            expect(postedMessages.some(m => m.type === 'error')).toBe(false);
        });
    });

    // =========================================================================
    // Section 13: Panel Title Updates
    // =========================================================================

    describe('Panel Title', () => {
        it('Test 49: should update title when switching from create to edit', async () => {
            const validAgent: Partial<CustomAgent> = {
                name: 'new-agent',
                description: 'A new agent',
                systemPrompt: 'You are new.',
                goals: ['Goal 1'],
                checklist: [],
                customLists: [],
                priority: 'P2',
                isActive: true,
                timeoutSeconds: 60,
                maxTokens: 2048,
                temperature: 0.7,
                routing: { keywords: [], patterns: [], tags: [], ticketTypes: [], priorityBoost: 0 },
                metadata: { version: '1.0.0', tags: [] }
            };

            openCustomAgentBuilder(mockContext);

            messageCallback!({ type: 'save', agentConfig: validAgent });

            await new Promise(resolve => setTimeout(resolve, 50));

            // Title should be updated to edit mode
            expect(mockPanel.title).toBe('Edit Agent: new-agent');
        });

        it('Test 50: should set title for existing agent', async () => {
            mockLoadCustomAgent.mockResolvedValue({
                name: 'loaded-agent',
                description: 'Loaded',
                systemPrompt: 'Test',
                goals: ['Goal']
            });

            openCustomAgentBuilder(mockContext);

            await new Promise(resolve => setTimeout(resolve, 10));

            messageCallback!({ type: 'loadAgent', agentName: 'loaded-agent' });

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockPanel.title).toBe('Edit Agent: loaded-agent');
        });
    });

    // =========================================================================
    // Section 14: Validation Edge Cases
    // =========================================================================

    describe('Validation Edge Cases', () => {
        it('Test 51: should validate system prompt minimum length', async () => {
            openCustomAgentBuilder(mockContext);

            const invalidConfig: Partial<CustomAgent> = {
                name: 'test-agent',
                description: 'A test agent',
                systemPrompt: 'Short', // Less than 10 chars
                goals: ['Goal 1']
            };

            postedMessages = [];
            messageCallback!({ type: 'validate', agentConfig: invalidConfig });

            await new Promise(resolve => setTimeout(resolve, 10));

            const result = postedMessages.find(m => m.type === 'validationResult');
            expect((result as any).isValid).toBe(false);
        });

        it('Test 52: should validate custom list has unique names', async () => {
            openCustomAgentBuilder(mockContext);

            const invalidConfig: Partial<CustomAgent> = {
                name: 'test-agent',
                description: 'A test agent',
                systemPrompt: 'You are a test agent.',
                goals: ['Goal 1'],
                customLists: [
                    { name: 'List A', description: '', items: ['Item 1'], order: 0, collapsed: false },
                    { name: 'list a', description: '', items: ['Item 2'], order: 1, collapsed: false } // Duplicate (case-insensitive)
                ]
            };

            postedMessages = [];
            messageCallback!({ type: 'validate', agentConfig: invalidConfig });

            await new Promise(resolve => setTimeout(resolve, 10));

            const result = postedMessages.find(m => m.type === 'validationResult');
            expect((result as any).isValid).toBe(false);
        });

        it('Test 53: should validate temperature range', async () => {
            openCustomAgentBuilder(mockContext);

            const invalidConfig: Partial<CustomAgent> = {
                name: 'test-agent',
                description: 'A test agent',
                systemPrompt: 'You are a test agent.',
                goals: ['Goal 1'],
                temperature: 3.0 // Max is 2
            };

            postedMessages = [];
            messageCallback!({ type: 'validate', agentConfig: invalidConfig });

            await new Promise(resolve => setTimeout(resolve, 10));

            const result = postedMessages.find(m => m.type === 'validationResult');
            expect((result as any).isValid).toBe(false);
        });

        it('Test 54: should validate timeout range', async () => {
            openCustomAgentBuilder(mockContext);

            const invalidConfig: Partial<CustomAgent> = {
                name: 'test-agent',
                description: 'A test agent',
                systemPrompt: 'You are a test agent.',
                goals: ['Goal 1'],
                timeoutSeconds: 5 // Min is 10
            };

            postedMessages = [];
            messageCallback!({ type: 'validate', agentConfig: invalidConfig });

            await new Promise(resolve => setTimeout(resolve, 10));

            const result = postedMessages.find(m => m.type === 'validationResult');
            expect((result as any).isValid).toBe(false);
        });
    });

    // =========================================================================
    // Section 15: Insert Variable (no-op on extension side)
    // =========================================================================

    describe('Insert Variable', () => {
        it('Test 55: should handle insertVariable message without error', async () => {
            openCustomAgentBuilder(mockContext);

            postedMessages = [];
            messageCallback!({ type: 'insertVariable', variable: 'task_id' });

            await new Promise(resolve => setTimeout(resolve, 10));

            // Should not produce error
            expect(postedMessages.some(m => m.type === 'error')).toBe(false);
        });
    });
});
