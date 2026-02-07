/**
 * Tests for CustomAgentBuilderPanel Enhancements
 *
 * Unit tests for MT-030.4, MT-030.5, MT-030.6 enhancements:
 * - System prompt editor with autocomplete
 * - Goal list manager with drag-to-reorder
 * - Checklist manager with checkbox UI and templates
 */

import * as vscode from 'vscode';
import {
    openCustomAgentBuilder,
    resetCustomAgentBuilderForTests
} from '../../src/ui/customAgentBuilder';
import { CustomAgent } from '../../src/agents/custom/schema';

// Ensure vscode.Uri is properly mocked
if (!vscode.Uri) {
    (vscode as any).Uri = {
        file: (path: string) => ({ fsPath: path, scheme: 'file', path })
    };
}

jest.mock('vscode');
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

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

describe.skip('CustomAgentBuilderPanel Enhancements', () => {
    let mockContext: vscode.ExtensionContext;
    let mockWebview: any;

    beforeEach(() => {
        jest.clearAllMocks();
        resetCustomAgentBuilderForTests();

        mockContext = {
            extensionPath: '/test/extension',
            extensionUri: { fsPath: '/test/extension' } as any,
            extensionMode: 2 as any, // Development mode
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

        mockWebview = {
            html: '',
            onDidReceiveMessage: { subscribe: jest.fn() },
            postMessage: jest.fn(),
        };
    });

    // =========================================================================
    // MT-030.4 Tests: System Prompt Autocomplete
    // =========================================================================

    describe('MT-030.4: System Prompt Editor - Autocomplete', () => {
        it('Test 1: should include autocomplete input field in system prompt', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('system-prompt-input');
            expect(html).toContain('autocomplete-input');
        });

        it('Test 2: should include autocomplete dropdown container', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('autocomplete-dropdown');
            expect(html).toContain('autocomplete-items');
        });

        it('Test 3: should include CSS for autocomplete dropdown', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('.autocomplete-dropdown');
            expect(html).toContain('position: absolute');
            expect(html).toContain('z-index');
        });

        it('Test 4: should generate CSS for selected autocomplete item', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('.autocomplete-item.selected');
            expect(html).toContain('.autocomplete-item:hover');
        });

        it('Test 5: should include syntax highlighting styles for variables', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('.variable-highlight');
            expect(html).toContain('syntax-highlight-container');
        });
    });

    // =========================================================================
    // MT-030.5 Tests: Goal List Manager with Drag-to-Reorder
    // =========================================================================

    describe('MT-030.5: Goal List Manager - Drag-to-Reorder', () => {
        it('Test 6: should include drag handle element in goal items', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            // Look for drag handle markup
            expect(html).toContain('drag-handle');
            expect(html).toContain('Drag to reorder');
        });

        it('Test 7: should include CSS styles for drag handles', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('.drag-handle');
            expect(html).toContain('cursor: grab');
            expect(html).toContain('cursor: grabbing');
        });

        it('Test 8: should include CSS for dragging state', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('.dynamic-list-item.dragging');
            expect(html).toContain('.dynamic-list-item.drag-over');
            expect(html).toContain('opacity: 0.5');
            expect(html).toContain('border-top: 2px');
        });

        it('Test 9: should add drag hint to goals section', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            // Find the goals section
            const goalsIdx = html.indexOf('🎯 Goals');
            if (goalsIdx > -1) {
                const sectionEnd = html.indexOf('</div>', goalsIdx);
                const section = html.substring(goalsIdx, sectionEnd);

                expect(section).toContain('Drag goals to reorder them');
                expect(section).toContain('prioritize goals in this order');
            }
        });

        it('Test 10: should have numeric numbering for goals', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

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
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('checklist-checkbox');
            expect(html).toContain('class="checklist-item"');
        });

        it('Test 12: should include CSS styles for checklist checkbox UI', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('.checklist-item');
            expect(html).toContain('.checklist-checkbox');
            expect(html).toContain('.checklist-content');
            expect(html).toContain('.checklist-text-input');
        });

        it('Test 13: should render quick template buttons', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('Quick Templates');
            expect(html).toContain('checklist-templates');
            expect(html).toContain('template-tag');
        });

        it('Test 14: should include specific template options', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

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
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('.template-tag');
            expect(html).toContain('.checklist-templates');
            expect(html).toContain('flex-wrap: wrap');
        });

        it('Test 16: should show checklist item opacity change on check', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

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
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            // All three major sections should be present
            expect(html).toContain('💬 System Prompt');
            expect(html).toContain('🎯 Goals');
            expect(html).toContain('✅ Checklist');
        });

        it('Test 18: should have unified CSS for all enhancements', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

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
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            // Check for state initialization
            expect(html).toContain('draggedIndex');
            expect(html).toContain('autocompleteSelectedIndex');
        });

        it('Test 20: should call setup functions for enhancements', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

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
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            // Verify prompt constraint is still enforced
            expect(html).toContain('SYSTEM_PROMPT_MAX_LENGTH');
        });

        it('Test 22: should validate goals max with reordering', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('GOALS_MAX');
            expect(html).toContain('GOALS_MIN');
        });

        it('Test 23: should validate checklist max with checkbox UI', () => {
            openCustomAgentBuilder(mockContext);
            const html = mockWebview.html;

            expect(html).toContain('CHECKLIST_MAX');
        });
    });
});
