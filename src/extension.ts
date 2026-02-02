import * as vscode from 'vscode';
import { initializeLogger, logInfo, logError, logWarn } from './logger';
import { initializeTicketDb, createTicket, listTickets, updateTicket, onTicketChange } from './services/ticketDb';
import { initializeOrchestrator, getOrchestratorInstance } from './services/orchestrator';
import { initializeLLMService } from './services/llmService';
import { startMCPServer } from './mcpServer/mcpServer';
import { AgentsTreeDataProvider } from './ui/agentsTreeProvider';
import { TicketsTreeDataProvider } from './ui/ticketsTreeProvider';
import { agentStatusTracker } from './ui/agentStatusTracker';

// Module-level status bar item - can be updated from orchestrator
let statusBarItem: vscode.StatusBarItem | null = null;

/**
 * Update the status bar with new text and optional tooltip.
 * Called by orchestrator when planning/verification starts/completes.
 * 
 * **Simple explanation**: Status bar is like an elevator floor display.
 * We update the text to show current agent status (Planning..., Verifying..., Ready).
 */
export async function updateStatusBar(text: string, tooltip?: string): Promise<void> {
    if (statusBarItem) {
        statusBarItem.text = text;
        if (tooltip) {
            statusBarItem.tooltip = tooltip;
        }
    }
}

/**
 * Setup auto-planning listener
 * Triggers Planning Agent when a new ai_to_human ticket is created
 */
async function setupAutoPlanning(): Promise<void> {
    onTicketChange(async () => {
        try {
            // Fetch all tickets, get last created
            const tickets = await listTickets();
            if (tickets.length === 0) return;

            const lastTicket = tickets[0]; // listTickets returns DESC by createdAt

            // Only auto-plan if type is 'ai_to_human' and status is 'open'
            if (lastTicket.type === 'ai_to_human' && lastTicket.status === 'open') {
                logInfo(`[Auto-Plan] Detected new ai_to_human ticket: ${lastTicket.id}`);

                // Reset agent statuses when new planning cycle starts
                agentStatusTracker.resetAll();

                // Call planning agent
                const orchestrator = getOrchestratorInstance();
                const plan = await orchestrator.routeToPlanningAgent(lastTicket.title);

                // Store plan in ticket description
                await updateTicket(lastTicket.id, {
                    description: plan
                });

                logInfo(`[Auto-Plan] DONE - Plan stored in ${lastTicket.id}`);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[Auto-Plan] Failed: ${msg}`);
        }
    });
    logInfo('[Auto-Plan] Listener registered');
}

/**
 * Handle "COE: Verify Last Ticket" command
 * Finds last open/in-progress ticket and runs verification
 */
async function handleVerifyLastTicket(): Promise<void> {
    try {
        // Get all tickets
        const tickets = await listTickets();

        // Find last open or in-progress ticket
        const lastOpenTicket = tickets.find(
            t => t.status === 'open' || t.status === 'in-progress'
        );

        if (!lastOpenTicket) {
            logWarn('[Verify] No open ticket found');
            vscode.window.showInformationMessage(
                'COE: No open ticket to verify. Create one first.'
            );
            return;
        }

        logInfo(`[Verify] Checking ticket ${lastOpenTicket.id}`);

        // Get plan from ticket description (or use title if no plan)
        const plan = lastOpenTicket.description || lastOpenTicket.title;

        // Fake diff for demo
        const fakeDiff = `
+ Feature: ${lastOpenTicket.title}
- Status: Blocked
+ Status: Verified
        `.trim();

        // Call verification agent
        const orchestrator = getOrchestratorInstance();
        const result = await orchestrator.routeToVerificationAgent(
            plan,
            fakeDiff
        );

        // Update ticket status based on result
        if (result.passed) {
            await updateTicket(lastOpenTicket.id, { status: 'done' });
            logInfo(`[INFO] Ticket ${lastOpenTicket.id} verified DONE`);
            vscode.window.showInformationMessage(
                `✅ Ticket ${lastOpenTicket.id} verified: ${result.explanation}`
            );
        } else {
            // Keep status as 'blocked'
            await updateTicket(lastOpenTicket.id, { status: 'blocked' });
            logInfo(`[INFO] Ticket ${lastOpenTicket.id} verification FAILED`);
            vscode.window.showWarningMessage(
                `❌ Ticket ${lastOpenTicket.id} failed verification: ${result.explanation}`
            );
        }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`[Verify] Error: ${msg}`);
        vscode.window.showErrorMessage(`Verification failed: ${msg}`);
    }
}

/**
 * This function is called when the extension is activated.
 * Activation happens when VS Code starts up (due to "onStartupFinished" event).
 */
export async function activate(context: vscode.ExtensionContext) {
    // Initialize logger first
    initializeLogger(context);

    logInfo('Copilot Orchestration Extension is activating...');

    // Initialize Ticket DB
    await initializeTicketDb(context);

    // Initialize Orchestrator after TicketDb (depends on it)
    await initializeOrchestrator(context);

    // Initialize LLM service (requires Node 18+)
    await initializeLLMService(context);

    // Start MCP server after Orchestrator is ready
    startMCPServer();

    // Setup auto-planning listener for ai_to_human tickets
    await setupAutoPlanning();

    // Initialize TreeView providers for sidebar (Agents and Tickets tabs)
    // AgentsTreeDataProvider = static hardcoded agent list
    const agentsProvider = new AgentsTreeDataProvider();
    // TicketsTreeDataProvider = queries TicketDb for open tickets
    const ticketsProvider = new TicketsTreeDataProvider();

    // Register tree providers with VS Code (connects provider class to view ID from package.json)
    // registerTreeDataProvider = tells VS Code to use our provider for the specified view
    const agentsTreeView = vscode.window.registerTreeDataProvider('coe-agents', agentsProvider);
    const ticketsTreeView = vscode.window.registerTreeDataProvider('coe-tickets', ticketsProvider);

    // Register manual refresh commands (accessible via Command Palette)
    const refreshAgentsCommand = vscode.commands.registerCommand('coe.refreshAgents', () => {
        logInfo('Manual refresh: Agents');
        agentsProvider.refresh();
    });

    const refreshTicketsCommand = vscode.commands.registerCommand('coe.refreshTickets', () => {
        logInfo('Manual refresh: Tickets');
        ticketsProvider.refresh();
    });

    const planTaskCommand = vscode.commands.registerCommand('coe.planTask', async () => {
        logInfo('User triggered: Plan Task');
        const orchestratorInstance = getOrchestratorInstance();
        const plan = await orchestratorInstance.routeToPlanningAgent('Plan how to add dark mode toggle');
        vscode.window.showInformationMessage(`Plan generated: ${plan.substring(0, 50)}...`);
    });

    const verifyTaskCommand = vscode.commands.registerCommand('coe.verifyTask', async () => {
        logInfo('User triggered: Verify Task');

        const taskDescription = 'Add dark mode toggle. Success criteria: config flag added, status bar icon toggles.';
        const codeDiff = '+ darkMode: true in config.json';

        try {
            const orchestratorInstance = getOrchestratorInstance();
            const result = await orchestratorInstance.routeToVerificationAgent(taskDescription, codeDiff);

            if (!result.passed) {
                vscode.window.showErrorMessage(`Verification FAILED: ${result.explanation}`);
            } else {
                vscode.window.showInformationMessage(`Verification PASSED: ${result.explanation}`);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`Verification command error: ${message}`);
            vscode.window.showErrorMessage('Verification failed - see logs for details.');
        }
    });

    const verifyLastTicketCommand = vscode.commands.registerCommand(
        'coe.verifyLastTicket',
        async () => {
            logInfo('[Verify] User triggered: Verify Last Ticket');
            await handleVerifyLastTicket();
        }
    );

    const askAnswerAgentCommand = vscode.commands.registerCommand('coe.askAnswerAgent', async () => {
        logInfo('User triggered: Ask Answer Agent');
        try {
            const orchestratorInstance = getOrchestratorInstance();
            const response = await orchestratorInstance.routeToAnswerAgent(
                'Explain what is VS Code extension?'
            );
            vscode.window.showInformationMessage(`Answer: ${response.substring(0, 100)}...`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`Answer Agent command error: ${message}`);
            vscode.window.showErrorMessage('Answer Agent failed - see logs for details.');
        }
    });

    // TEMP TEST CODE - Creates an ai_to_human ticket to trigger auto-planning
    setTimeout(async () => {
        try {
            const testTicket = await createTicket({
                title: 'Add dark mode toggle',
                type: 'ai_to_human',
                status: 'open'
            });
            logInfo(`[TEST] Created ticket: ${testTicket.id} - auto-planning should trigger`);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[TEST] Failed to create test ticket: ${msg}`);
        }
    }, 2000);

    // OPTIONAL ERROR TEST - Uncomment to test error handling in sidebar
    // To test: Add this line at the start of listTickets() in ticketDb.ts:
    //   throw new Error('DB down');
    // Expected: Tickets tab shows "Error loading tickets" item with error icon


    // Keep your existing command and status bar code here
    const helloCommand = vscode.commands.registerCommand('coe.sayHello', () => {
        vscode.window.showInformationMessage('Hello from COE!');
        logInfo('User ran COE: Say Hello');
    });

    // Initialize status bar item at module level
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = '$(rocket) COE Ready';
    statusBarItem.command = 'coe.sayHello';
    statusBarItem.tooltip = 'Click to say hello from COE';
    statusBarItem.show();


    // Push all disposables to context.subscriptions for automatic cleanup when extension deactivates
    context.subscriptions.push(helloCommand);
    context.subscriptions.push(statusBarItem);
    context.subscriptions.push(agentsTreeView);
    context.subscriptions.push(ticketsTreeView);
    context.subscriptions.push(refreshAgentsCommand);
    context.subscriptions.push(refreshTicketsCommand);
    context.subscriptions.push(planTaskCommand);
    context.subscriptions.push(verifyTaskCommand);
    context.subscriptions.push(verifyLastTicketCommand);
    context.subscriptions.push(askAnswerAgentCommand);

    logInfo('Extension fully activated');
}

/**
 * This function is called when the extension is deactivated.
 * Clean up resources here if needed.
 */
export function deactivate() {
    // Nothing to clean up yet
}
