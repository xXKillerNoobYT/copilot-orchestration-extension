/**
 * Tests for Planning Commands Registration (MT-033.48)
 *
 * Tests for VS Code command registration for planning wizard.
 */

// Mock crypto
jest.mock('crypto', () => ({
    randomUUID: jest.fn().mockReturnValue('test-uuid-123'),
}));

// Track registered commands
const mockCommands = new Map<string, (...args: unknown[]) => unknown>();

// Mock vscode
jest.mock('vscode', () => ({
    commands: {
        registerCommand: jest.fn((command: string, callback: (...args: unknown[]) => unknown) => {
            mockCommands.set(command, callback);
            return { dispose: jest.fn() };
        }),
    },
    window: {
        showWarningMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showQuickPick: jest.fn(),
        showSaveDialog: jest.fn(),
        showOpenDialog: jest.fn(),
        showErrorMessage: jest.fn(),
    },
    workspace: {
        fs: {
            writeFile: jest.fn(),
            readFile: jest.fn(),
            createDirectory: jest.fn(),
        },
    },
    Uri: {
        file: (path: string) => ({ fsPath: path }),
        joinPath: (base: { fsPath: string }, ...segments: string[]) => ({ 
            fsPath: base.fsPath + '/' + segments.join('/') 
        }),
    },
}));

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
}));

// Mock planning modules
jest.mock('../../src/planning/schema', () => ({
    validatePlan: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
}));

jest.mock('../../src/planning/orchestratorIntegration', () => ({
    submitPlanToOrchestrator: jest.fn().mockReturnValue({ success: true, taskCount: 5, errors: [] }),
}));

jest.mock('../../src/planning/errorHandler', () => ({
    getErrorHandler: jest.fn().mockReturnValue({
        attemptAutoFixAll: jest.fn().mockReturnValue([]),
    }),
    validatePlanWithErrors: jest.fn().mockReturnValue([]),
}));

jest.mock('../../src/planning/driftDetection', () => ({
    detectDrift: jest.fn(),
}));

jest.mock('../../src/planning/documentationSync', () => ({
    generateDocumentation: jest.fn().mockReturnValue([
        { path: 'docs/README.md', content: '# Documentation' },
    ]),
}));

jest.mock('../../src/ui/planExport', () => ({
    exportPlan: jest.fn().mockReturnValue({ content: '{}', format: 'json' }),
}));

import * as vscode from 'vscode';
import {
    registerPlanningCommands,
    getCommandMetadata,
    PlanningCommandContext,
} from '../../src/planning/commands';
import { CompletePlan } from '../../src/planning/types';
import { validatePlan } from '../../src/planning/schema';
import { submitPlanToOrchestrator } from '../../src/planning/orchestratorIntegration';
import { validatePlanWithErrors, getErrorHandler } from '../../src/planning/errorHandler';
import { generateDocumentation } from '../../src/planning/documentationSync';
import { exportPlan } from '../../src/ui/planExport';

describe('Planning Commands', () => {
    let mockContext: vscode.ExtensionContext;
    let commandContext: PlanningCommandContext;
    let currentPlan: CompletePlan | undefined;

    const createMockPlan = (): CompletePlan => ({
        metadata: {
            id: 'plan-1',
            name: 'Test Plan',
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
        },
        overview: {
            name: 'Test',
            description: 'Test description',
            goals: ['Goal 1'],
        },
        featureBlocks: [],
        blockLinks: [],
        conditionalLogic: [],
        developerStories: [],
        userStories: [],
        successCriteria: [],
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockCommands.clear();
        currentPlan = undefined;

        mockContext = {
            subscriptions: [],
        } as unknown as vscode.ExtensionContext;

        commandContext = {
            getCurrentPlan: jest.fn(() => currentPlan),
            setCurrentPlan: jest.fn((plan) => { currentPlan = plan; }),
            getExecutionPlan: jest.fn(() => undefined),
            refreshUI: jest.fn(),
            showWebviewPanel: jest.fn(),
        };
    });

    // ============================================================================
    // registerPlanningCommands Tests
    // ============================================================================
    describe('registerPlanningCommands()', () => {
        it('Test 1: should register all commands', () => {
            const disposables = registerPlanningCommands(mockContext, commandContext);
            
            expect(disposables.length).toBe(9);
            expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(9);
        });

        it('Test 2: should return disposables', () => {
            const disposables = registerPlanningCommands(mockContext, commandContext);
            
            disposables.forEach(d => {
                expect(d).toHaveProperty('dispose');
            });
        });

        it('Test 3: should register openWizard command', () => {
            registerPlanningCommands(mockContext, commandContext);
            
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.planning.openWizard',
                expect.any(Function)
            );
        });

        it('Test 4: should register newPlan command', () => {
            registerPlanningCommands(mockContext, commandContext);
            
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.planning.newPlan',
                expect.any(Function)
            );
        });

        it('Test 5: should register validate command', () => {
            registerPlanningCommands(mockContext, commandContext);
            
            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'coe.planning.validate',
                expect.any(Function)
            );
        });
    });

    // ============================================================================
    // openWizard Command Tests
    // ============================================================================
    describe('openWizard command', () => {
        it('Test 6: should show webview panel', async () => {
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.openWizard');
            
            await handler?.();
            
            expect(commandContext.showWebviewPanel).toHaveBeenCalled();
        });
    });

    // ============================================================================
    // newPlan Command Tests
    // ============================================================================
    describe('newPlan command', () => {
        it('Test 7: should create new plan', async () => {
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.newPlan');
            
            await handler?.();
            
            expect(commandContext.setCurrentPlan).toHaveBeenCalled();
            expect(commandContext.showWebviewPanel).toHaveBeenCalled();
        });

        it('Test 8: should create plan with UUID', async () => {
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.newPlan');
            
            await handler?.();
            
            expect(commandContext.setCurrentPlan).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({ id: 'test-uuid-123' }),
                })
            );
        });
    });

    // ============================================================================
    // validate Command Tests
    // ============================================================================
    describe('validate command', () => {
        it('Test 9: should warn if no plan', async () => {
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.validate');
            
            await handler?.();
            
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No plan is currently open');
        });

        it('Test 10: should show success for valid plan', async () => {
            currentPlan = createMockPlan();
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.validate');
            
            await handler?.();
            
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('✓ Plan is valid!');
        });

        it('Test 11: should show error count for invalid plan', async () => {
            currentPlan = createMockPlan();
            (validatePlanWithErrors as jest.Mock).mockReturnValueOnce([
                { severity: 'error', message: 'Error 1' },
                { severity: 'warning', message: 'Warning 1' },
            ]);
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.validate');
            
            await handler?.();
            
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('1 error(s) and 1 warning(s)')
            );
        });
    });

    // ============================================================================
    // export Command Tests
    // ============================================================================
    describe('export command', () => {
        it('Test 12: should warn if no plan', async () => {
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.export');
            
            await handler?.();
            
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No plan is currently open');
        });

        it('Test 13: should show format picker', async () => {
            currentPlan = createMockPlan();
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.export');
            
            await handler?.();
            
            expect(vscode.window.showQuickPick).toHaveBeenCalled();
        });

        it('Test 14: should export plan when format selected', async () => {
            currentPlan = createMockPlan();
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({ label: 'JSON', value: 'json' });
            (vscode.window.showSaveDialog as jest.Mock).mockResolvedValueOnce({ fsPath: '/test/plan.json' });
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.export');
            
            await handler?.();
            
            expect(exportPlan).toHaveBeenCalled();
            expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
        });

        it('Test 15: should cancel if no format selected', async () => {
            currentPlan = createMockPlan();
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.export');
            
            await handler?.();
            
            expect(exportPlan).not.toHaveBeenCalled();
        });
    });

    // ============================================================================
    // import Command Tests
    // ============================================================================
    describe('import command', () => {
        it('Test 16: should show file picker', async () => {
            (vscode.window.showOpenDialog as jest.Mock).mockResolvedValueOnce(undefined);
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.import');
            
            await handler?.();
            
            expect(vscode.window.showOpenDialog).toHaveBeenCalled();
        });

        it('Test 17: should cancel if no file selected', async () => {
            (vscode.window.showOpenDialog as jest.Mock).mockResolvedValueOnce(undefined);
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.import');
            
            await handler?.();
            
            expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
        });

        it('Test 18: should import valid plan', async () => {
            const planJson = JSON.stringify(createMockPlan());
            (vscode.window.showOpenDialog as jest.Mock).mockResolvedValueOnce([{ fsPath: '/test/plan.json' }]);
            (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValueOnce(Buffer.from(planJson));
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.import');
            
            await handler?.();
            
            expect(commandContext.setCurrentPlan).toHaveBeenCalled();
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Plan imported successfully');
        });

        it('Test 19: should reject invalid plan', async () => {
            (vscode.window.showOpenDialog as jest.Mock).mockResolvedValueOnce([{ fsPath: '/test/plan.json' }]);
            (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValueOnce(Buffer.from('{}'));
            (validatePlan as jest.Mock).mockReturnValueOnce({ isValid: false, errors: ['Missing metadata'] });
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.import');
            
            await handler?.();
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Invalid plan file'));
        });

        it('Test 20: should handle parse error', async () => {
            (vscode.window.showOpenDialog as jest.Mock).mockResolvedValueOnce([{ fsPath: '/test/plan.json' }]);
            (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValueOnce(Buffer.from('not json'));
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.import');
            
            await handler?.();
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Failed to import'));
        });
    });

    // ============================================================================
    // submitToOrchestrator Command Tests
    // ============================================================================
    describe('submitToOrchestrator command', () => {
        it('Test 21: should warn if no plan', async () => {
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.submitToOrchestrator');
            
            await handler?.();
            
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No plan is currently open');
        });

        it('Test 22: should ask about auto-start', async () => {
            currentPlan = createMockPlan();
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.submitToOrchestrator');
            
            await handler?.();
            
            expect(vscode.window.showQuickPick).toHaveBeenCalled();
        });

        it('Test 23: should submit with auto-start', async () => {
            currentPlan = createMockPlan();
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({ label: 'Yes', value: true });
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.submitToOrchestrator');
            
            await handler?.();
            
            expect(submitPlanToOrchestrator).toHaveBeenCalledWith(
                currentPlan,
                expect.objectContaining({ autoStart: true })
            );
        });

        it('Test 24: should show success message', async () => {
            currentPlan = createMockPlan();
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({ value: false });
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.submitToOrchestrator');
            
            await handler?.();
            
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Created 5 tasks')
            );
        });

        it('Test 25: should show error on failure', async () => {
            currentPlan = createMockPlan();
            (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({ value: false });
            (submitPlanToOrchestrator as jest.Mock).mockReturnValueOnce({
                success: false,
                taskCount: 0,
                errors: ['Failed to create tasks'],
            });
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.submitToOrchestrator');
            
            await handler?.();
            
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Failed'));
        });

        it('Test 26: should ask to proceed with validation errors', async () => {
            currentPlan = createMockPlan();
            (validatePlanWithErrors as jest.Mock).mockReturnValueOnce([{ severity: 'error', message: 'Error' }]);
            (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce('Cancel');
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.submitToOrchestrator');
            
            await handler?.();
            
            expect(submitPlanToOrchestrator).not.toHaveBeenCalled();
        });
    });

    // ============================================================================
    // generateDocs Command Tests
    // ============================================================================
    describe('generateDocs command', () => {
        it('Test 27: should warn if no plan', async () => {
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.generateDocs');
            
            await handler?.();
            
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No plan is currently open');
        });

        it('Test 28: should ask for folder', async () => {
            currentPlan = createMockPlan();
            (vscode.window.showOpenDialog as jest.Mock).mockResolvedValueOnce(undefined);
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.generateDocs');
            
            await handler?.();
            
            expect(vscode.window.showOpenDialog).toHaveBeenCalledWith(
                expect.objectContaining({ canSelectFolders: true })
            );
        });

        it('Test 29: should save documentation files', async () => {
            currentPlan = createMockPlan();
            (vscode.window.showOpenDialog as jest.Mock).mockResolvedValueOnce([{ fsPath: '/docs' }]);
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.generateDocs');
            
            await handler?.();
            
            expect(generateDocumentation).toHaveBeenCalledWith(currentPlan);
            expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
        });

        it('Test 30: should show file count', async () => {
            currentPlan = createMockPlan();
            (vscode.window.showOpenDialog as jest.Mock).mockResolvedValueOnce([{ fsPath: '/docs' }]);
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.generateDocs');
            
            await handler?.();
            
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Generated')
            );
        });
    });

    // ============================================================================
    // checkDrift Command Tests
    // ============================================================================
    describe('checkDrift command', () => {
        it('Test 31: should warn if no plan', async () => {
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.checkDrift');
            
            await handler?.();
            
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No plan is currently open');
        });

        it('Test 32: should show info message', async () => {
            currentPlan = createMockPlan();
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.checkDrift');
            
            await handler?.();
            
            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });
    });

    // ============================================================================
    // autoFix Command Tests
    // ============================================================================
    describe('autoFix command', () => {
        it('Test 33: should warn if no plan', async () => {
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.autoFix');
            
            await handler?.();
            
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No plan is currently open');
        });

        it('Test 34: should attempt auto-fix', async () => {
            currentPlan = createMockPlan();
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.autoFix');
            
            await handler?.();
            
            const errorHandler = getErrorHandler();
            expect(errorHandler.attemptAutoFixAll).toHaveBeenCalledWith(currentPlan);
        });

        it('Test 35: should refresh UI on successful fix', async () => {
            currentPlan = createMockPlan();
            const mockErrorHandler = getErrorHandler() as unknown as { attemptAutoFixAll: jest.Mock };
            mockErrorHandler.attemptAutoFixAll.mockReturnValueOnce([{ success: true }]);
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.autoFix');
            
            await handler?.();
            
            expect(commandContext.refreshUI).toHaveBeenCalled();
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Auto-fixed 1 issue')
            );
        });

        it('Test 36: should show message when no fixes possible', async () => {
            currentPlan = createMockPlan();
            registerPlanningCommands(mockContext, commandContext);
            const handler = mockCommands.get('coe.planning.autoFix');
            
            await handler?.();
            
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('No issues could be auto-fixed');
        });
    });

    // ============================================================================
    // getCommandMetadata Tests
    // ============================================================================
    describe('getCommandMetadata()', () => {
        it('Test 37: should return all 9 commands', () => {
            const metadata = getCommandMetadata();
            
            expect(metadata.length).toBe(9);
        });

        it('Test 38: should include command IDs', () => {
            const metadata = getCommandMetadata();
            const commands = metadata.map(m => m.command);
            
            expect(commands).toContain('coe.planning.openWizard');
            expect(commands).toContain('coe.planning.newPlan');
            expect(commands).toContain('coe.planning.validate');
        });

        it('Test 39: should include titles', () => {
            const metadata = getCommandMetadata();
            
            metadata.forEach(m => {
                expect(m.title).toBeTruthy();
            });
        });

        it('Test 40: should use COE Planning category', () => {
            const metadata = getCommandMetadata();
            
            metadata.forEach(m => {
                expect(m.category).toBe('COE Planning');
            });
        });
    });
});
