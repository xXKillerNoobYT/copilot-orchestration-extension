import * as vscode from 'vscode';
import { initializeLogger, logInfo } from './logger';
import { initializeTicketDb, createTicket, updateTicket } from './services/ticketDb';
import { initializeOrchestrator } from './services/orchestrator';
import { startMCPServer } from './mcpServer/mcpServer';
import { AgentsTreeDataProvider } from './ui/agentsTreeProvider';
import { TicketsTreeDataProvider } from './ui/ticketsTreeProvider';

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

    // Start MCP server after Orchestrator is ready
    startMCPServer();

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

    // TEMP TEST CODE - Remove after verification of auto-refresh
    /* setTimeout(async () => {
        const newTicket = await createTicket({
            title: 'Test Ticket for Refresh',
            status: 'open'
        });
        logInfo(`Created test ticket ${newTicket.id} - sidebar should auto-refresh now`);
        
        // Wait 3 seconds, then update the ticket status
        setTimeout(async () => {
            await updateTicket(newTicket.id, { status: 'in-progress' });
            logInfo(`Updated test ticket - sidebar should refresh again`);
        }, 3000);
    }, 5000); */

    // OPTIONAL ERROR TEST - Uncomment to test error handling in sidebar
    // To test: Add this line at the start of listTickets() in ticketDb.ts:
    //   throw new Error('DB down');
    // Expected: Tickets tab shows "Error loading tickets" item with error icon


    // Keep your existing command and status bar code here
    const helloCommand = vscode.commands.registerCommand('coe.sayHello', () => {
        vscode.window.showInformationMessage('Hello from COE!');
        logInfo('User ran COE: Say Hello');
    });

    const statusBarItem = vscode.window.createStatusBarItem(
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

    logInfo('Extension fully activated');
}

/**
 * This function is called when the extension is deactivated.
 * Clean up resources here if needed.
 */
export function deactivate() {
    // Nothing to clean up yet
}
