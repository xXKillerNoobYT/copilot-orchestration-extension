/**
 * Planning Commands Registration (MT-033.48)
 *
 * **Simple explanation**: Registers all VS Code commands for the planning
 * wizard, making them available in the command palette and keyboard shortcuts.
 *
 * @module planning/commands
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { CompletePlan, PlanMetadata } from './types';
import { validatePlan } from './schema';
import { submitPlanToOrchestrator, ExecutionPlan } from './orchestratorIntegration';
import { getErrorHandler, validatePlanWithErrors } from './errorHandler';
import { detectDrift, CodebaseMarkers, DriftReport } from './driftDetection';
import { generateDocumentation, GeneratedDoc } from './documentationSync';
import { exportPlan } from '../ui/planExport';
import { logInfo, logError } from '../logger';

// ============================================================================
// Types
// ============================================================================

export interface PlanningCommandContext {
    /** Get the current plan */
    getCurrentPlan: () => CompletePlan | undefined;
    /** Set the current plan */
    setCurrentPlan: (plan: CompletePlan) => void;
    /** Get execution plan */
    getExecutionPlan: () => ExecutionPlan | undefined;
    /** Refresh UI */
    refreshUI: () => void;
    /** Show webview panel */
    showWebviewPanel: () => void;
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register all planning-related commands.
 */
export function registerPlanningCommands(
    context: vscode.ExtensionContext,
    commandContext: PlanningCommandContext
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Open Planning Wizard
    disposables.push(
        vscode.commands.registerCommand('coe.planning.openWizard', () => {
            logInfo('Opening Planning Wizard');
            commandContext.showWebviewPanel();
        })
    );

    // Create New Plan
    disposables.push(
        vscode.commands.registerCommand('coe.planning.newPlan', async () => {
            logInfo('Creating new plan');
            const now = new Date();
            const metadata: PlanMetadata = {
                id: crypto.randomUUID(),
                name: 'New Plan',
                createdAt: now,
                updatedAt: now,
                version: 1,
            };
            const plan: CompletePlan = {
                metadata,
                overview: {
                    name: '',
                    description: '',
                    goals: [],
                },
                featureBlocks: [],
                blockLinks: [],
                conditionalLogic: [],
                developerStories: [],
                userStories: [],
                successCriteria: [],
            };
            commandContext.setCurrentPlan(plan);
            commandContext.showWebviewPanel();
        })
    );

    // Validate Plan
    disposables.push(
        vscode.commands.registerCommand('coe.planning.validate', async () => {
            const plan = commandContext.getCurrentPlan();
            if (!plan) {
                vscode.window.showWarningMessage('No plan is currently open');
                return;
            }

            logInfo('Validating plan');
            const errorHandler = getErrorHandler();
            const errors = validatePlanWithErrors(plan, errorHandler);

            if (errors.length === 0) {
                vscode.window.showInformationMessage('✓ Plan is valid!');
            } else {
                const errorCount = errors.filter(e => e.severity === 'error').length;
                const warningCount = errors.filter(e => e.severity === 'warning').length;
                vscode.window.showWarningMessage(
                    `Plan has ${errorCount} error(s) and ${warningCount} warning(s)`
                );
            }
        })
    );

    // Export Plan
    disposables.push(
        vscode.commands.registerCommand('coe.planning.export', async () => {
            const plan = commandContext.getCurrentPlan();
            if (!plan) {
                vscode.window.showWarningMessage('No plan is currently open');
                return;
            }

            const format = await vscode.window.showQuickPick(
                [
                    { label: 'JSON', description: 'Export as JSON file', value: 'json' as const },
                    { label: 'Markdown', description: 'Export as Markdown documentation', value: 'markdown' as const },
                    { label: 'YAML', description: 'Export as YAML file', value: 'yaml' as const },
                ],
                { placeHolder: 'Select export format' }
            );

            if (!format) return;

            const result = exportPlan(plan, { format: format.value });

            // Save to file
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`plan.${format.value === 'markdown' ? 'md' : format.value}`),
                filters: {
                    [format.label]: [format.value === 'markdown' ? 'md' : format.value],
                },
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(result.content, 'utf8'));
                vscode.window.showInformationMessage(`Plan exported to ${uri.fsPath}`);
                logInfo(`Plan exported to ${uri.fsPath}`);
            }
        })
    );

    // Import Plan
    disposables.push(
        vscode.commands.registerCommand('coe.planning.import', async () => {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: {
                    'Plan files': ['json', 'yaml', 'yml'],
                },
            });

            if (!uris || uris.length === 0) return;

            try {
                const content = await vscode.workspace.fs.readFile(uris[0]);
                const text = Buffer.from(content).toString('utf8');
                const plan = JSON.parse(text) as CompletePlan;

                // Validate
                const validation = validatePlan(plan);
                if (!validation.isValid) {
                    vscode.window.showErrorMessage('Invalid plan file: ' + validation.errors.join(', '));
                    return;
                }

                commandContext.setCurrentPlan(plan);
                commandContext.showWebviewPanel();
                vscode.window.showInformationMessage('Plan imported successfully');
                logInfo('Plan imported from ' + uris[0].fsPath);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage('Failed to import plan: ' + msg);
                logError('Failed to import plan: ' + msg);
            }
        })
    );

    // Submit to Orchestrator
    disposables.push(
        vscode.commands.registerCommand('coe.planning.submitToOrchestrator', async () => {
            const plan = commandContext.getCurrentPlan();
            if (!plan) {
                vscode.window.showWarningMessage('No plan is currently open');
                return;
            }

            // Validate first
            const errorHandler = getErrorHandler();
            const errors = validatePlanWithErrors(plan, errorHandler);
            if (errors.some(e => e.severity === 'error')) {
                const proceed = await vscode.window.showWarningMessage(
                    'Plan has validation errors. Submit anyway?',
                    'Submit', 'Cancel'
                );
                if (proceed !== 'Submit') return;
            }

            const autoStart = await vscode.window.showQuickPick(
                [
                    { label: 'Yes', description: 'Start execution immediately', value: true },
                    { label: 'No', description: 'Create execution plan as draft', value: false },
                ],
                { placeHolder: 'Auto-start execution?' }
            );

            if (autoStart === undefined) return;

            const result = submitPlanToOrchestrator(plan, {
                autoStart: autoStart.value,
                createSubtasks: true,
                respectPriorities: true,
                createDependencies: true,
            });

            if (result.success) {
                vscode.window.showInformationMessage(
                    `Plan submitted! Created ${result.taskCount} tasks.`
                );
                logInfo(`Plan submitted with ${result.taskCount} tasks`);
            } else {
                vscode.window.showErrorMessage(
                    'Failed to submit plan: ' + result.errors.join(', ')
                );
            }
        })
    );

    // Generate Documentation
    disposables.push(
        vscode.commands.registerCommand('coe.planning.generateDocs', async () => {
            const plan = commandContext.getCurrentPlan();
            if (!plan) {
                vscode.window.showWarningMessage('No plan is currently open');
                return;
            }

            const docs = generateDocumentation(plan);

            // Ask where to save
            const folder = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Documentation Folder',
            });

            if (!folder || folder.length === 0) return;

            // Save all docs
            let saved = 0;
            for (const doc of docs) {
                try {
                    const uri = vscode.Uri.joinPath(folder[0], doc.path);
                    // Create directory if needed
                    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder[0], doc.path.split('/').slice(0, -1).join('/')));
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(doc.content, 'utf8'));
                    saved++;
                } catch (error) {
                    logError(`Failed to save ${doc.path}: ${error}`);
                }
            }

            vscode.window.showInformationMessage(`Generated ${saved}/${docs.length} documentation files`);
            logInfo(`Generated ${saved} documentation files`);
        })
    );

    // Check Drift
    disposables.push(
        vscode.commands.registerCommand('coe.planning.checkDrift', async () => {
            const plan = commandContext.getCurrentPlan();
            if (!plan) {
                vscode.window.showWarningMessage('No plan is currently open');
                return;
            }

            // In real implementation, would scan workspace
            // For now, show placeholder
            vscode.window.showInformationMessage('Drift detection would scan workspace and compare to plan');
            logInfo('Drift detection requested');
        })
    );

    // Auto-fix Errors
    disposables.push(
        vscode.commands.registerCommand('coe.planning.autoFix', async () => {
            const plan = commandContext.getCurrentPlan();
            if (!plan) {
                vscode.window.showWarningMessage('No plan is currently open');
                return;
            }

            const errorHandler = getErrorHandler();
            const recoveries = errorHandler.attemptAutoFixAll(plan);

            const successful = recoveries.filter(r => r.success).length;
            if (successful > 0) {
                vscode.window.showInformationMessage(`Auto-fixed ${successful} issue(s)`);
                commandContext.setCurrentPlan(plan);
                commandContext.refreshUI();
            } else {
                vscode.window.showInformationMessage('No issues could be auto-fixed');
            }
        })
    );

    return disposables;
}

/**
 * Get command metadata for package.json contributes.
 */
export function getCommandMetadata(): Array<{ command: string; title: string; category: string }> {
    return [
        { command: 'coe.planning.openWizard', title: 'Open Planning Wizard', category: 'COE Planning' },
        { command: 'coe.planning.newPlan', title: 'Create New Plan', category: 'COE Planning' },
        { command: 'coe.planning.validate', title: 'Validate Plan', category: 'COE Planning' },
        { command: 'coe.planning.export', title: 'Export Plan', category: 'COE Planning' },
        { command: 'coe.planning.import', title: 'Import Plan', category: 'COE Planning' },
        { command: 'coe.planning.submitToOrchestrator', title: 'Submit Plan to Orchestrator', category: 'COE Planning' },
        { command: 'coe.planning.generateDocs', title: 'Generate Documentation', category: 'COE Planning' },
        { command: 'coe.planning.checkDrift', title: 'Check Plan Drift', category: 'COE Planning' },
        { command: 'coe.planning.autoFix', title: 'Auto-fix Plan Issues', category: 'COE Planning' },
    ];
}
