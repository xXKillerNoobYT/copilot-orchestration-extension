/**
 * Tests for VerificationWebviewPanel
 * 
 * Unit tests for the verification checklist webview panel.
 * Tests panel creation, disposal, and message handling.
 */

import * as vscode from 'vscode';
import {
    VerificationWebviewPanel,
    openVerificationPanel,
    resetVerificationWebviewForTests
} from '../../src/ui/verificationWebview';

// Mock vscode module
jest.mock('vscode');

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn()
}));

// Mock checklist module
jest.mock('../../src/agents/verification/checklist', () => ({
    createChecklist: jest.fn(() => ({
        getItems: jest.fn(() => [
            {
                id: 'tests-pass',
                category: 'tests',
                description: 'All unit tests pass',
                status: 'pending',
                required: true,
                checkType: 'automatic'
            },
            {
                id: 'docs-updated',
                category: 'documentation',
                description: 'Documentation updated if needed',
                status: 'pending',
                required: false,
                checkType: 'manual'
            }
        ]),
        getResult: jest.fn(() => ({
            passed: false,
            passPercent: 0,
            byStatus: { pending: 2, passed: 0, failed: 0, skipped: 0, 'n/a': 0 },
            byCategory: {},
            failedRequired: [],
            summary: '⏳ 2 check(s) pending'
        })),
        markPassed: jest.fn(),
        markFailed: jest.fn(),
        markSkipped: jest.fn()
    })),
    VerificationChecklist: jest.fn()
}));

// Mock devServer module
jest.mock('../../src/agents/verification/devServer', () => ({
    DevServerLauncher: jest.fn().mockImplementation(() => ({
        start: jest.fn().mockResolvedValue({ running: true, url: 'http://localhost:3000' }),
        stop: jest.fn().mockResolvedValue(undefined)
    }))
}));

describe('VerificationWebviewPanel', () => {
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;
    let messageCallback: ((message: any) => void) | null = null;
    let disposeCallback: (() => void) | null = null;

    beforeEach(() => {
        jest.clearAllMocks();
        resetVerificationWebviewForTests();

        // Mock webview
        mockWebview = {
            html: '',
            postMessage: jest.fn().mockResolvedValue(true),
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
            title: '',
            viewColumn: vscode.ViewColumn.One,
            active: true,
            visible: true,
            viewType: 'coeVerification',
            options: {}
        } as unknown as vscode.WebviewPanel;

        // Mock createWebviewPanel
        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

        // Mock workspace
        (vscode.workspace as any).workspaceFolders = [{
            uri: { fsPath: '/mock/workspace' },
            name: 'test',
            index: 0
        }];

        // Mock context
        mockContext = {
            extensionPath: '/mock/extension',
            subscriptions: [],
            globalState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined)
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn()
            }
        } as unknown as vscode.ExtensionContext;
    });

    afterEach(() => {
        messageCallback = null;
        disposeCallback = null;
    });

    describe('createOrShow', () => {
        it('Test 1: should create new panel when none exists', () => {
            const panel = VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'coeVerification',
                expect.stringContaining('Verification'),
                vscode.ViewColumn.Two,
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: true
                })
            );
            expect(panel).toBeDefined();
        });

        it('Test 2: should reuse existing panel', () => {
            const panel1 = VerificationWebviewPanel.createOrShow('TASK-001', mockContext);
            const panel2 = VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
            expect(mockPanel.reveal).toHaveBeenCalled();
            expect(panel1).toBe(panel2);
        });

        it('Test 3: should set webview HTML content', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(mockWebview.html).toBeTruthy();
            expect(mockWebview.html).toContain('Verification Checklist');
            expect(mockWebview.html).toContain('TASK-001');
        });
    });

    describe('getInstance', () => {
        it('Test 4: should return null when no panel exists', () => {
            expect(VerificationWebviewPanel.getInstance()).toBeNull();
        });

        it('Test 5: should return instance after creation', () => {
            const panel = VerificationWebviewPanel.createOrShow('TASK-001', mockContext);
            expect(VerificationWebviewPanel.getInstance()).toBe(panel);
        });
    });

    describe('message handling', () => {
        beforeEach(() => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);
        });

        it('Test 6: should handle markPassed message', () => {
            const { createChecklist } = require('../../src/agents/verification/checklist');
            const mockChecklist = createChecklist();

            messageCallback?.({ type: 'markPassed', itemId: 'tests-pass', evidence: 'All passed' });

            // Verify postMessage called for update
            expect(mockWebview.postMessage).toHaveBeenCalled();
        });

        it('Test 7: should handle markFailed message', () => {
            messageCallback?.({ type: 'markFailed', itemId: 'tests-pass', evidence: 'Test failed' });

            expect(mockWebview.postMessage).toHaveBeenCalled();
        });

        it('Test 8: should handle markSkipped message', () => {
            messageCallback?.({ type: 'markSkipped', itemId: 'docs-updated', evidence: 'Not applicable' });

            expect(mockWebview.postMessage).toHaveBeenCalled();
        });

        it('Test 9: should handle refresh message', () => {
            messageCallback?.({ type: 'refresh' });

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'checklistUpdate' })
            );
        });
    });

    describe('server control', () => {
        beforeEach(() => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);
        });

        it('Test 10: should handle startServer message', async () => {
            // Mock openExternal
            (vscode.env as any).openExternal = jest.fn();

            await messageCallback?.({ type: 'startServer' });

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'serverStatus' })
            );
        });

        it('Test 11: should handle stopServer message', async () => {
            await messageCallback?.({ type: 'stopServer' });

            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'serverStatus',
                    serverStatus: { running: false }
                })
            );
        });
    });

    describe('disposal', () => {
        it('Test 12: should clear instance on dispose', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);
            expect(VerificationWebviewPanel.getInstance()).not.toBeNull();

            // Trigger dispose callback
            disposeCallback?.();

            expect(VerificationWebviewPanel.getInstance()).toBeNull();
        });

        it('Test 13: should handle dispose gracefully', () => {
            const panel = VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(() => {
                disposeCallback?.();
            }).not.toThrow();
        });
    });

    describe('getChecklist', () => {
        it('Test 14: should return checklist instance', () => {
            const panel = VerificationWebviewPanel.createOrShow('TASK-001', mockContext);
            const checklist = panel.getChecklist();

            expect(checklist).toBeDefined();
            expect(checklist.getItems).toBeDefined();
        });
    });

    describe('getResult', () => {
        it('Test 15: should return checklist result', () => {
            const panel = VerificationWebviewPanel.createOrShow('TASK-001', mockContext);
            const result = panel.getResult();

            expect(result).toBeDefined();
            expect(result.summary).toBe('⏳ 2 check(s) pending');
        });
    });

    describe('HTML content', () => {
        it('Test 16: should include CSP meta tag', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(mockWebview.html).toContain('Content-Security-Policy');
            expect(mockWebview.html).toContain("default-src 'none'");
        });

        it('Test 17: should include toolbar buttons', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(mockWebview.html).toContain('Run All Auto Checks');
            expect(mockWebview.html).toContain('Start Dev Server');
            expect(mockWebview.html).toContain('Stop Server');
            expect(mockWebview.html).toContain('Refresh');
        });

        it('Test 18: should include server status section', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(mockWebview.html).toContain('Dev Server');
            expect(mockWebview.html).toContain('serverStatus');
        });

        it('Test 19: should include progress bar', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(mockWebview.html).toContain('progress-bar');
            expect(mockWebview.html).toContain('progressFill');
        });

        it('Test 20: should include checklist container', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(mockWebview.html).toContain('id="checklist"');
        });

        it('Test 21: should include summary section', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(mockWebview.html).toContain('id="summary"');
        });
    });

    describe('openVerificationPanel helper', () => {
        it('Test 22: should create panel via helper function', () => {
            const panel = openVerificationPanel('TASK-002', mockContext);

            expect(panel).toBeDefined();
            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
        });
    });

    describe('resetVerificationWebviewForTests', () => {
        it('Test 23: should clear instance', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);
            expect(VerificationWebviewPanel.getInstance()).not.toBeNull();

            resetVerificationWebviewForTests();

            expect(VerificationWebviewPanel.getInstance()).toBeNull();
        });

        it('Test 24: should handle reset when no instance exists', () => {
            expect(() => {
                resetVerificationWebviewForTests();
            }).not.toThrow();
        });
    });

    describe('edge cases', () => {
        it('Test 25: should handle unknown message type gracefully', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(() => {
                messageCallback?.({ type: 'unknownType' });
            }).not.toThrow();
        });

        it('Test 26: should handle message without itemId', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            expect(() => {
                messageCallback?.({ type: 'markPassed' }); // No itemId
            }).not.toThrow();
        });

        it('Test 27: should include nonce in HTML for CSP', () => {
            VerificationWebviewPanel.createOrShow('TASK-001', mockContext);

            // Nonce should appear in script and style tags
            const nonceMatches = mockWebview.html.match(/nonce="[A-Za-z0-9]+"/g);
            expect(nonceMatches).toBeTruthy();
            expect(nonceMatches!.length).toBeGreaterThanOrEqual(2); // At least style and script
        });
    });

    describe('server control edge cases', () => {
        it('Test 28: should handle startServer when server returns no url', async () => {
            // Override mock to return no url
            const mockDevServer = {
                start: jest.fn().mockResolvedValue({ running: true }),
                stop: jest.fn().mockResolvedValue(undefined)
            };

            jest.doMock('../../src/agents/verification/devServer', () => ({
                DevServerLauncher: jest.fn().mockImplementation(() => mockDevServer)
            }));

            VerificationWebviewPanel.createOrShow('TASK-002', mockContext);
            (vscode.env as any).openExternal = jest.fn();

            await messageCallback?.({ type: 'startServer' });

            // Should not call openExternal without url
            expect(mockWebview.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'serverStatus' })
            );
        });
    });
});
