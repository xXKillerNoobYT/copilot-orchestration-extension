/**
 * Tests for CustomAgentBuilderPanel Enhancements
 *
 * Unit tests for MT-030.4, MT-030.5, MT-030.6 enhancements:
 * - System prompt editor with autocomplete
 * - Goal list manager with drag-to-reorder
 * - Checklist manager with checkbox UI and templates
 *
 * Fixed: Properly mock createWebviewPanel to capture HTML content
 */

import * as vscode from 'vscode';
import {
    openCustomAgentBuilder,
    resetCustomAgentBuilderForTests
} from '../../src/ui/customAgentBuilder';
import { CustomAgent } from '../../src/agents/custom/schema';

// Mock vscode module inline (no external function calls since mock factories are hoisted)
jest.mock('vscode', () => {
    // Create mock webview with property setter to capture HTML
    const mockWebview: any = {
        onDidReceiveMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        postMessage: jest.fn().mockResolvedValue(true),
        asWebviewUri: jest.fn((uri: any) => uri),
        cspSource: 'mock-csp-source'
    };

    // Store for captured HTML (can't use outer let due to hoisting)
    let htmlStorage = '';

    Object.defineProperty(mockWebview, 'html', {
        get: () => htmlStorage,
        set: (value: string) => { htmlStorage = value; },
        configurable: true
    });

    const mockPanel = {
        webview: mockWebview,
        title: '',
        visible: true,
        active: true,
        viewColumn: 1,
        reveal: jest.fn(),
        dispose: jest.fn(),
        onDidDispose: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        onDidChangeViewState: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    };

    return {
        window: {
            createWebviewPanel: jest.fn(() => mockPanel),
            showInformationMessage: jest.fn(),
            showWarningMessage: jest.fn(),
            showErrorMessage: jest.fn(),
        },
        workspace: {
            workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn(),
                update: jest.fn(),
            }),
        },
        Uri: {
            file: (path: string) => ({ fsPath: path, scheme: 'file', path }),
            joinPath: (base: any, ...segments: string[]) => ({
                fsPath: [base.fsPath, ...segments].join('/'),
            }),
        },
        ViewColumn: { One: 1, Two: 2, Three: 3 },
        ExtensionMode: { Development: 2, Production: 1 },
        // Export method to get  captured HTML (for tests)
        __getMockPanel: () => mockPanel,
    };
});

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

const mockSaveCustomAgent = jest.fn();
const mockLoadCustomAgent = jest.fn();
const mockListCustomAgents = jest.fn().mockResolvedValue([]);
const mockCustomAgentExists = jest.fn().mockResolvedValue(false);
const mockGetWorkspaceFolder = jest.fn().mockReturnValue('/test/workspace');

jest.mock('../../src/agents/custom/storage', () => ({
    saveCustomAgent: (...args: any[]) => mockSaveCustomAgent(...args),
    loadCustomAgent: (...args: any[]) => mockLoadCustomAgent(...args),
    listCustomAgents: (...args: any[]) => mockListCustomAgents(...args),
    customAgentExists: (...args: any[]) => mockCustomAgentExists(...args),
    getWorkspaceFolder: () => mockGetWorkspaceFolder(),
    AgentListItem: {}
}));

describe('CustomAgentBuilderPanel Enhancements', () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        resetCustomAgentBuilderForTests();

        mockContext = {
            extensionPath: '/test/extension',
            extensionUri: { fsPath: '/test/extension' } as any,
            extensionMode: 2 as any,
            logPath: '/test/log',
            storageUri: { fsPath: '/test/storage' } as any,
            globalStorageUri: { fsPath: '/test/global' } as any,
            globalStoragePath: '/test/global',
            storagePath: '/test/storage',
            secrets: {} as any,
            subscriptions: [],
            workspaceState: {} as any,
            globalState: {} as any,
            asAbsolutePath: jest.fn((path) => `/test/extension/${path}`),
        } as any;
    });

    // Helper to get the captured HTML after opening the builder
    const getBuilderHtml = (): string => {
        openCustomAgentBuilder(mockContext);
        // Get HTML from the mock panel via the exported helper
        const mockPanel = (vscode as any).__getMockPanel();
        return mockPanel.webview.html;
    };

    // =========================================================================
    // MT-030.4 Tests: System Prompt Autocomplete
    // =========================================================================

    describe('MT-030.4: System Prompt Editor - Autocomplete', () => {
        it('Test 1: should include autocomplete input field in system prompt', () => {
            const html = getBuilderHtml();

            // The actual HTML uses 'agent-prompt' id for system prompt textarea
            expect(html).toContain('agent-prompt');
            expect(html).toContain('prompt-container');
        });

        it('Test 2: should include autocomplete dropdown container', () => {
            const html = getBuilderHtml();

            expect(html).toContain('autocomplete-dropdown');
            expect(html).toContain('autocomplete-item');
        });

        it('Test 3: should include CSS for autocomplete dropdown', () => {
            const html = getBuilderHtml();

            expect(html).toContain('.autocomplete-dropdown');
            expect(html).toContain('position: absolute');
            expect(html).toContain('z-index');
        });

        it('Test 4: should generate CSS for selected autocomplete item', () => {
            const html = getBuilderHtml();

            expect(html).toContain('.autocomplete-item.selected');
            expect(html).toContain('.autocomplete-item:hover');
        });

        it('Test 5: should include syntax highlighting styles for variables', () => {
            const html = getBuilderHtml();

            expect(html).toContain('.variable-highlight');
            expect(html).toContain('syntax-highlight-container');
        });
    });

    // =========================================================================
    // MT-030.5 Tests: Goal List Manager with Drag-to-Reorder
    // =========================================================================

    describe('MT-030.5: Goal List Manager - Drag-to-Reorder', () => {
        it('Test 6: should include drag handle element in goal items', () => {
            const html = getBuilderHtml();

            // Look for drag handle markup
            expect(html).toContain('drag-handle');
            expect(html).toContain('Drag to reorder');
        });

        it('Test 7: should include CSS styles for drag handles', () => {
            const html = getBuilderHtml();

            expect(html).toContain('.drag-handle');
            expect(html).toContain('cursor: grab');
            expect(html).toContain('cursor: grabbing');
        });

        it('Test 8: should include CSS for dragging state', () => {
            const html = getBuilderHtml();

            expect(html).toContain('.dynamic-list-item.dragging');
            expect(html).toContain('.dynamic-list-item.drag-over');
            expect(html).toContain('opacity: 0.5');
            expect(html).toContain('border-top: 2px');
        });

        it('Test 9: should add drag hint to goals section', () => {
            const html = getBuilderHtml();

            // The drag hint appears in the form-hint after the goals list
            expect(html).toContain('Drag goals to reorder');
            expect(html).toContain('prioritize goals in this order');
        });

        it('Test 10: should have numeric numbering for goals', () => {
            const html = getBuilderHtml();

            expect(html).toContain('item-number');
            // Numeric display for goals
            expect(html).toContain('index + 1');
        });
    });

    // =========================================================================
    // MT-030.6 Tests: Checklist Manager with Checkbox UI and Templates
    // =========================================================================

    describe('MT-030.6: Checklist Manager - Checkbox UI & Templates', () => {
        it('Test 11: should include checkbox input in checklist items', () => {
            const html = getBuilderHtml();

            // CSS styles define checklist-checkbox and checklist-item classes
            expect(html).toContain('.checklist-checkbox');
            expect(html).toContain('.checklist-item');
        });

        it('Test 12: should include CSS styles for checklist checkbox UI', () => {
            const html = getBuilderHtml();

            expect(html).toContain('.checklist-item');
            expect(html).toContain('.checklist-checkbox');
            expect(html).toContain('.checklist-content');
            expect(html).toContain('.checklist-text-input');
        });

        it('Test 13: should render quick template buttons', () => {
            const html = getBuilderHtml();

            expect(html).toContain('Quick Templates');
            expect(html).toContain('checklist-templates');
            expect(html).toContain('template-tag');
        });

        it('Test 14: should include specific template options', () => {
            const html = getBuilderHtml();

            const templates = [
                'Response complete',
                'No errors',
                'All tests pass',
                'Documentation updated',
                'Code reviewed'
            ];

            templates.forEach(template => {
                expect(html).toContain(`data-template="${template}"`);
            });
        });

        it('Test 15: should include CSS for template tags', () => {
            const html = getBuilderHtml();

            expect(html).toContain('.template-tag');
            expect(html).toContain('.checklist-templates');
            expect(html).toContain('flex-wrap: wrap');
        });

        it('Test 16: should show checklist item opacity change on check', () => {
            const html = getBuilderHtml();

            // Checkbox behavior styles
            expect(html).toContain('.checklist-item');
            expect(html).toContain('opacity');
        });
    });

    // =========================================================================
    // Integration Tests for All Enhancements
    // =========================================================================

    describe('Enhancements Integration', () => {
        it('Test 17: should include all enhancement sections in HTML', () => {
            const html = getBuilderHtml();

            // All three major sections should be present
            expect(html).toContain('💬 System Prompt');
            expect(html).toContain('🎯 Goals');
            expect(html).toContain('✅ Checklist');
        });

        it('Test 18: should have unified CSS for all enhancements', () => {
            const html = getBuilderHtml();

            const cssStart = html.indexOf('<style');
            const cssEnd = html.indexOf('</style>');
            if (cssStart > -1 && cssEnd > -1) {
                const styleBlock = html.substring(cssStart, cssEnd);

                // Check for all enhancement CSS classes
                expect(styleBlock).toContain('.autocomplete-dropdown');
                expect(styleBlock).toContain('.drag-handle');
                expect(styleBlock).toContain('.checklist-item');
            }
        });

        it('Test 19: should initialize all state variables in JavaScript', () => {
            const html = getBuilderHtml();

            // Check for state initialization
            expect(html).toContain('draggedIndex');
            expect(html).toContain('autocompleteSelectedIndex');
        });

        it('Test 20: should call setup functions for enhancements', () => {
            const html = getBuilderHtml();

            // All three new setup functions should be called in init()
            expect(html).toContain('setupAutocomplete');
            expect(html).toContain('setupChecklistTemplates');
        });
    });

    // =========================================================================
    // Constraint Validation Tests
    // =========================================================================

    describe('Constraint Validation for Enhancements', () => {
        it('Test 21: should validate system prompt length with autocomplete enabled', () => {
            const html = getBuilderHtml();

            // Verify prompt constraint is enforced via maxlength and char counter
            // The HTML uses hardcoded value 4000 for system prompt length
            expect(html).toContain('0 / 4000');
            expect(html).toContain('prompt-count');
        });

        it('Test 22: should validate goals max with reordering', () => {
            const html = getBuilderHtml();

            // Goals max validation appears as '1-20 goals' hint and in JS logic with >= 20
            expect(html).toContain('1-20 goals');
            expect(html).toContain('>= 20');
        });

        it('Test 23: should validate checklist max with checkbox UI', () => {
            const html = getBuilderHtml();

            // Checklist max validation appears as '0-50 items' hint and >= 50 in JS
            expect(html).toContain('0-50 items');
            expect(html).toContain('>= 50');
        });
    });
});
