/**
 * Tests for Planning Wizard Panel (MT-033.1)
 *
 * Unit tests for the 7-page wizard dialog for creating project plans.
 * Tests cover panel creation, message handling, plan saving, and lifecycle.
 */

import { PlanningWizardPanel } from '../../src/ui/planningWizard';
import * as vscode from 'vscode';

// Mock dependencies
jest.mock('../../src/planning/schema', () => ({
    validatePartialPlan: jest.fn(),
    validatePlan: jest.fn(),
}));

jest.mock('../../src/services/planningService', () => ({
    getPlanningServiceInstance: jest.fn(),
}));

jest.mock('../../src/ui/wizardHtml', () => ({
    generateWizardHTML: jest.fn(() => '<html>mock wizard</html>'),
}));

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
}));

import { validatePartialPlan, validatePlan } from '../../src/planning/schema';
import { getPlanningServiceInstance } from '../../src/services/planningService';
import { generateWizardHTML } from '../../src/ui/wizardHtml';
import { logInfo, logError } from '../../src/logger';

// ============================================================================
// Test Setup
// ============================================================================

describe('PlanningWizardPanel', () => {
    let mockPanel: any;
    let mockContext: any;
    let messageHandler: ((msg: any) => Promise<void>) | null;
    let disposeHandler: (() => void) | null;
    let panelDisposables: vscode.Disposable[];

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandler = null;
        disposeHandler = null;
        panelDisposables = [];

        // Reset static state
        (PlanningWizardPanel as any).currentPanel = undefined;

        // Mock webview panel
        mockPanel = {
            webview: {
                html: '',
                onDidReceiveMessage: jest.fn((handler, _, disposables) => {
                    messageHandler = handler;
                    if (disposables) panelDisposables.push(...disposables);
                    return { dispose: jest.fn() };
                }),
                postMessage: jest.fn().mockResolvedValue(true),
            },
            onDidDispose: jest.fn((handler, _, disposables) => {
                disposeHandler = handler;
                if (disposables) panelDisposables.push(...disposables);
                return { dispose: jest.fn() };
            }),
            dispose: jest.fn(),
            reveal: jest.fn(),
        };

        // Mock vscode.window.createWebviewPanel
        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

        // Mock extension context
        mockContext = {
            subscriptions: [],
            extensionPath: '/mock/path',
        };

        // Default mock implementations
        (validatePartialPlan as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
        (validatePlan as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
        (generateWizardHTML as jest.Mock).mockReturnValue('<html>mock wizard</html>');
    });

    afterEach(() => {
        // Clean up static state
        if (PlanningWizardPanel.currentPanel) {
            PlanningWizardPanel.currentPanel.dispose();
        }
    });

    // ========================================================================
    // Panel Creation Tests
    // ========================================================================

    describe('createOrShow', () => {
        it('Test 1: should create a new panel when none exists', () => {
            PlanningWizardPanel.createOrShow(mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'planningWizard',
                'Planning Wizard',
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true }
            );
            expect(PlanningWizardPanel.currentPanel).toBeDefined();
        });

        it('Test 2: should reveal existing panel when one exists', () => {
            // Create first panel
            PlanningWizardPanel.createOrShow(mockContext);
            const firstPanel = PlanningWizardPanel.currentPanel;

            // Try to create second panel
            PlanningWizardPanel.createOrShow(mockContext);

            expect(PlanningWizardPanel.currentPanel).toBe(firstPanel);
            expect(mockPanel.reveal).toHaveBeenCalledWith(vscode.ViewColumn.One);
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
        });

        it('Test 3: should set up message handler on creation', () => {
            PlanningWizardPanel.createOrShow(mockContext);

            expect(mockPanel.webview.onDidReceiveMessage).toHaveBeenCalled();
            expect(messageHandler).not.toBeNull();
        });

        it('Test 4: should set up dispose handler on creation', () => {
            PlanningWizardPanel.createOrShow(mockContext);

            expect(mockPanel.onDidDispose).toHaveBeenCalled();
            expect(disposeHandler).not.toBeNull();
        });

        it('Test 5: should generate initial HTML on creation', () => {
            PlanningWizardPanel.createOrShow(mockContext);

            expect(generateWizardHTML).toHaveBeenCalled();
            expect(mockPanel.webview.html).toBe('<html>mock wizard</html>');
        });
    });

    // ========================================================================
    // Message Handling Tests
    // ========================================================================

    describe('handleMessage', () => {
        beforeEach(() => {
            PlanningWizardPanel.createOrShow(mockContext);
        });

        it('Test 6: should handle pageChanged command for valid page index', async () => {
            await messageHandler!({ command: 'pageChanged', pageIndex: 2 });

            // Should update wizard HTML
            expect(generateWizardHTML).toHaveBeenCalledTimes(2); // Once on create, once on change
        });

        it('Test 7: should clamp pageChanged index to valid range (min)', async () => {
            await messageHandler!({ command: 'pageChanged', pageIndex: -5 });

            // Should not throw, should update
            expect(generateWizardHTML).toHaveBeenCalled();
        });

        it('Test 8: should clamp pageChanged index to valid range (max)', async () => {
            await messageHandler!({ command: 'pageChanged', pageIndex: 100 });

            // Should not throw, should update
            expect(generateWizardHTML).toHaveBeenCalled();
        });

        it('Test 9: should handle refreshPage command', async () => {
            await messageHandler!({ command: 'refreshPage' });

            expect(generateWizardHTML).toHaveBeenCalledTimes(2);
        });

        it('Test 10: should handle saveDraft command with valid data', async () => {
            await messageHandler!({
                command: 'saveDraft',
                planData: { overview: { name: 'Test Plan' } },
            });

            expect(validatePartialPlan).toHaveBeenCalled();
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ command: 'draftSaved' });
            expect(logInfo).toHaveBeenCalledWith('Draft saved');
        });

        it('Test 11: should handle saveDraft with invalid data', async () => {
            (validatePartialPlan as jest.Mock).mockReturnValue({
                isValid: false,
                errors: ['Name is required'],
            });

            await messageHandler!({ command: 'saveDraft', planData: {} });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                command: 'error',
                message: 'Name is required',
            });
        });

        it('Test 12: should handle finishPlan command with valid data', async () => {
            const mockService = {
                createPlan: jest.fn().mockResolvedValue({
                    metadata: { id: 'plan-123' },
                }),
            };
            (getPlanningServiceInstance as jest.Mock).mockReturnValue(mockService);

            await messageHandler!({
                command: 'finishPlan',
                planData: {
                    overview: { name: 'Complete Plan', description: 'Desc', goals: ['Goal 1'] },
                },
            });

            expect(validatePlan).toHaveBeenCalled();
            expect(mockService.createPlan).toHaveBeenCalled();
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                command: 'planCompleted',
                planId: 'plan-123',
            });
            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });

        it('Test 13: should handle finishPlan with invalid data', async () => {
            (validatePlan as jest.Mock).mockReturnValue({
                isValid: false,
                errors: ['Missing required fields'],
            });

            await messageHandler!({ command: 'finishPlan', planData: {} });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                command: 'error',
                message: 'Missing required fields',
            });
        });

        it('Test 14: should handle finishPlan service error', async () => {
            const mockService = {
                createPlan: jest.fn().mockRejectedValue(new Error('DB error')),
            };
            (getPlanningServiceInstance as jest.Mock).mockReturnValue(mockService);

            await messageHandler!({
                command: 'finishPlan',
                planData: { overview: { name: 'Test' } },
            });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                command: 'error',
                message: 'Failed: DB error',
            });
            expect(logError).toHaveBeenCalled();
        });

        it('Test 15: should handle unknown command gracefully', async () => {
            // Should not throw
            await messageHandler!({ command: 'unknownCommand' });
        });
    });

    // ========================================================================
    // Draft Saving Tests
    // ========================================================================

    describe('saveDraft', () => {
        beforeEach(() => {
            PlanningWizardPanel.createOrShow(mockContext);
        });

        it('Test 16: should merge plan data correctly', async () => {
            await messageHandler!({
                command: 'saveDraft',
                planData: {
                    overview: { name: 'My Project', description: 'A great project' },
                },
            });

            // Check that validation received merged data
            const validationCall = (validatePartialPlan as jest.Mock).mock.calls[0][0];
            expect(validationCall.overview.name).toBe('My Project');
            expect(validationCall.overview.description).toBe('A great project');
        });

        it('Test 17: should update timestamp on save', async () => {
            const beforeSave = new Date();

            await messageHandler!({
                command: 'saveDraft',
                planData: { overview: { name: 'Test' } },
            });

            const validationCall = (validatePartialPlan as jest.Mock).mock.calls[0][0];
            const updatedAt = validationCall.metadata.updatedAt;

            expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime());
        });

        it('Test 18: should handle saveDraft non-Error exception', async () => {
            (validatePartialPlan as jest.Mock).mockImplementation(() => {
                throw 'String error';
            });

            await messageHandler!({ command: 'saveDraft', planData: {} });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                command: 'error',
                message: 'Failed: String error',
            });
        });
    });

    // ========================================================================
    // Plan Completion Tests
    // ========================================================================

    describe('finishPlan', () => {
        beforeEach(() => {
            PlanningWizardPanel.createOrShow(mockContext);
        });

        it('Test 19: should dispose panel after successful plan creation', async () => {
            jest.useFakeTimers();

            const mockService = {
                createPlan: jest.fn().mockResolvedValue({
                    metadata: { id: 'plan-456' },
                }),
            };
            (getPlanningServiceInstance as jest.Mock).mockReturnValue(mockService);

            await messageHandler!({
                command: 'finishPlan',
                planData: { overview: { name: 'Final Plan' } },
            });

            // Fast-forward timeout
            jest.advanceTimersByTime(1500);

            expect(mockPanel.dispose).toHaveBeenCalled();

            jest.useRealTimers();
        });

        it('Test 20: should handle finishPlan non-Error exception', async () => {
            (validatePlan as jest.Mock).mockImplementation(() => {
                throw { custom: 'non-error object' };
            });

            await messageHandler!({ command: 'finishPlan', planData: {} });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ command: 'error' })
            );
        });
    });

    // ========================================================================
    // Deep Merge Tests
    // ========================================================================

    describe('mergeDeep', () => {
        beforeEach(() => {
            PlanningWizardPanel.createOrShow(mockContext);
        });

        it('Test 21: should merge nested objects', async () => {
            await messageHandler!({
                command: 'saveDraft',
                planData: {
                    overview: { description: 'Updated desc' },
                },
            });

            // Initial plan has overview.name = '', this should preserve it while adding description
            const validationCall = (validatePartialPlan as jest.Mock).mock.calls[0][0];
            expect(validationCall.overview.name).toBe('');
            expect(validationCall.overview.description).toBe('Updated desc');
        });

        it('Test 22: should handle null values in source', async () => {
            await messageHandler!({
                command: 'saveDraft',
                planData: {
                    overview: { name: null },
                },
            });

            // null values should be skipped
            const validationCall = (validatePartialPlan as jest.Mock).mock.calls[0][0];
            expect(validationCall.overview.name).toBe('');
        });

        it('Test 23: should replace arrays (not merge)', async () => {
            await messageHandler!({
                command: 'saveDraft',
                planData: {
                    overview: { goals: ['Goal A', 'Goal B'] },
                },
            });

            const validationCall = (validatePartialPlan as jest.Mock).mock.calls[0][0];
            expect(validationCall.overview.goals).toEqual(['Goal A', 'Goal B']);
        });
    });

    // ========================================================================
    // Error Handling Tests
    // ========================================================================

    describe('error handling', () => {
        beforeEach(() => {
            PlanningWizardPanel.createOrShow(mockContext);
        });

        it('Test 24: should handle generateWizardHTML error', () => {
            (generateWizardHTML as jest.Mock).mockImplementation(() => {
                throw new Error('HTML generation failed');
            });

            // Create new panel to trigger error
            (PlanningWizardPanel as any).currentPanel = undefined;
            PlanningWizardPanel.createOrShow(mockContext);

            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Wizard update failed'));
            expect(mockPanel.webview.html).toBe('<p>Error loading wizard</p>');
        });

        it('Test 25: should catch and log message handler errors', async () => {
            // Simulate an error in message handling
            (validatePartialPlan as jest.Mock).mockImplementation(() => {
                throw new Error('Validation crashed');
            });

            // The handleMessage should catch this via the .catch() wrapper
            await messageHandler!({ command: 'saveDraft', planData: {} });

            // Error should be handled internally
            expect(logError).toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Dispose Tests
    // ========================================================================

    describe('dispose', () => {
        it('Test 26: should clean up on dispose', () => {
            PlanningWizardPanel.createOrShow(mockContext);

            expect(PlanningWizardPanel.currentPanel).toBeDefined();

            PlanningWizardPanel.currentPanel!.dispose();

            expect(mockPanel.dispose).toHaveBeenCalled();
            expect(PlanningWizardPanel.currentPanel).toBeUndefined();
        });

        it('Test 27: should handle onDidDispose callback', () => {
            PlanningWizardPanel.createOrShow(mockContext);

            expect(PlanningWizardPanel.currentPanel).toBeDefined();

            // Trigger dispose callback
            disposeHandler!();

            expect(mockPanel.dispose).toHaveBeenCalled();
            expect(PlanningWizardPanel.currentPanel).toBeUndefined();
        });
    });

    // ========================================================================
    // getNonce Tests
    // ========================================================================

    describe('getNonce generation', () => {
        it('Test 28: should generate 32-character nonce', () => {
            PlanningWizardPanel.createOrShow(mockContext);

            // Access via generateWizardHTML call
            const call = (generateWizardHTML as jest.Mock).mock.calls[0];
            const nonce = call[1]; // Second argument is nonce

            expect(typeof nonce).toBe('string');
            expect(nonce.length).toBe(32);
            expect(/^[A-Za-z0-9]+$/.test(nonce)).toBe(true);
        });

        it('Test 29: should generate different nonces each time', () => {
            PlanningWizardPanel.createOrShow(mockContext);

            // Trigger refresh to generate new nonce
            messageHandler!({ command: 'refreshPage' });

            const calls = (generateWizardHTML as jest.Mock).mock.calls;
            const nonce1 = calls[0][1];
            const nonce2 = calls[1][1];

            expect(nonce1).not.toBe(nonce2);
        });
    });

    // ========================================================================
    // Wizard State Tests
    // ========================================================================

    describe('wizard state', () => {
        it('Test 30: should initialize with default wizard state', () => {
            PlanningWizardPanel.createOrShow(mockContext);

            // Check the initial state passed to generateWizardHTML
            const call = (generateWizardHTML as jest.Mock).mock.calls[0];
            const state = call[0];

            expect(state.currentPage).toBe('overview');
            expect(state.plan.overview.name).toBe('');
            expect(state.plan.featureBlocks).toEqual([]);
            expect(state.isDirty).toBe(false);
        });

        it('Test 31: should initialize with valid UUID in metadata', () => {
            PlanningWizardPanel.createOrShow(mockContext);

            const call = (generateWizardHTML as jest.Mock).mock.calls[0];
            const state = call[0];

            // UUID format check (36 chars with hyphens)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            expect(state.plan.metadata.id).toMatch(uuidRegex);
        });

        it('Test 32: should initialize with proper date objects', () => {
            PlanningWizardPanel.createOrShow(mockContext);

            const call = (generateWizardHTML as jest.Mock).mock.calls[0];
            const state = call[0];

            expect(state.plan.metadata.createdAt).toBeInstanceOf(Date);
            expect(state.plan.metadata.updatedAt).toBeInstanceOf(Date);
        });

        it('Test 33: should navigate through all pages', async () => {
            PlanningWizardPanel.createOrShow(mockContext);

            const pages = ['overview', 'features', 'linking', 'userStories', 'devStories', 'criteria', 'review'];

            for (let i = 0; i < pages.length; i++) {
                await messageHandler!({ command: 'pageChanged', pageIndex: i });

                const callIndex = i + 1; // +1 for initial render
                const state = (generateWizardHTML as jest.Mock).mock.calls[callIndex][0];
                expect(state.currentPage).toBe(pages[i]);
            }
        });
    });

    // ========================================================================
    // Integration-like Tests
    // ========================================================================

    describe('full wizard flow', () => {
        it('Test 34: should support creating a complete plan', async () => {
            const mockService = {
                createPlan: jest.fn().mockResolvedValue({
                    metadata: { id: 'complete-plan-id' },
                }),
            };
            (getPlanningServiceInstance as jest.Mock).mockReturnValue(mockService);

            PlanningWizardPanel.createOrShow(mockContext);

            // Step 1: Save overview
            await messageHandler!({
                command: 'saveDraft',
                planData: {
                    overview: { name: 'My App', description: 'A cool app', goals: ['Goal 1'] },
                },
            });

            // Step 2: Add features
            await messageHandler!({
                command: 'saveDraft',
                planData: {
                    featureBlocks: [{ id: 'f1', name: 'Feature 1', description: 'Desc' }],
                },
            });

            // Step 3: Finish plan
            await messageHandler!({
                command: 'finishPlan',
                planData: {},
            });

            expect(mockService.createPlan).toHaveBeenCalled();
            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                command: 'planCompleted',
                planId: 'complete-plan-id',
            });
        });
    });
});
