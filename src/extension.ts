import * as vscode from 'vscode';
import { initializeLogger, logInfo, logError, logWarn } from './logger';
import { initializeTicketDb, createTicket, listTickets, updateTicket, onTicketChange, getTicket } from './services/ticketDb';
import { initializeOrchestrator, getOrchestratorInstance, answerQuestion } from './services/orchestrator';
import { initializeLLMService } from './services/llmService';
import { startMCPServer } from './mcpServer/mcpServer';
import { AgentsTreeDataProvider } from './ui/agentsTreeProvider';
import { TicketsTreeDataProvider } from './ui/ticketsTreeProvider';
import { ConversationsTreeDataProvider } from './ui/conversationsTreeProvider';
import { agentStatusTracker } from './ui/agentStatusTracker';
import { ResearchAgent } from './agents/researchAgent';

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
            // Check if auto-processing is enabled
            const config = vscode.workspace.getConfiguration('coe');
            const autoProcessEnabled = config.get<boolean>('autoProcessTickets', false);

            if (!autoProcessEnabled) {
                // Manual mode: Skip auto-processing, tickets stay pending
                logInfo('[Auto-Plan] Skipped - Manual mode enabled (autoProcessTickets = false)');
                return;
            }

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

    const orchestrator = getOrchestratorInstance();

    try {
        const tickets = await listTickets();
        const serializedHistory: { [chatId: string]: string } = {};
        let restoredCount = 0;

        for (const ticket of tickets) {
            if (!ticket.conversationHistory) {
                continue;
            }

            serializedHistory[ticket.id] = ticket.conversationHistory;
            restoredCount += 1;
        }

        orchestrator.getAnswerAgent().deserializeHistory(serializedHistory);
        logInfo(`Restored ${restoredCount} conversation histories on activate`);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to load Answer Agent history on activate: ${message}`);
    }

    await orchestrator.getAnswerAgent().cleanupInactiveConversations();

    // Initialize LLM service (requires Node 18+)
    await initializeLLMService(context);

    // Start MCP server after Orchestrator is ready
    startMCPServer();

    // Setup auto-planning listener for ai_to_human tickets
    await setupAutoPlanning();

    // Initialize TreeView providers for sidebar (Agents, Tickets, and Conversations tabs)
    // AgentsTreeDataProvider = static hardcoded agent list
    const agentsProvider = new AgentsTreeDataProvider();
    // TicketsTreeDataProvider = queries TicketDb for open tickets
    const ticketsProvider = new TicketsTreeDataProvider();
    // ConversationsTreeDataProvider = displays active Answer Agent conversations (placeholder for now)
    const conversationsProvider = new ConversationsTreeDataProvider();

    // Register tree providers with VS Code (connects provider class to view ID from package.json)
    // registerTreeDataProvider = tells VS Code to use our provider for the specified view
    const agentsTreeView = vscode.window.registerTreeDataProvider('coe-agents', agentsProvider);
    const ticketsTreeView = vscode.window.registerTreeDataProvider('coe-tickets', ticketsProvider);
    const conversationsTreeView = vscode.window.registerTreeDataProvider('coe-conversations', conversationsProvider);

    // Register manual refresh commands (accessible via Command Palette)
    const refreshAgentsCommand = vscode.commands.registerCommand('coe.refreshAgents', () => {
        logInfo('Manual refresh: Agents');
        agentsProvider.refresh();
    });

    const refreshTicketsCommand = vscode.commands.registerCommand('coe.refreshTickets', () => {
        logInfo('Manual refresh: Tickets');
        ticketsProvider.refresh();
    });

    const refreshConversationsCommand = vscode.commands.registerCommand('coe.refreshConversations', () => {
        logInfo('Manual refresh: Conversations');
        conversationsProvider.refresh();
    });

    /**
     * Command: coe.enableAgent
     * Enables a disabled agent by updating its setting
     * Called from right-click context menu on disabled agents
     */
    const enableAgentCommand = vscode.commands.registerCommand('coe.enableAgent', async (item: vscode.TreeItem) => {
        if (!item || !item.label) {
            logError('[EnableAgent] No agent item provided');
            return;
        }

        const agentName = item.label.toString();
        logInfo(`[EnableAgent] Enabling agent: ${agentName}`);

        try {
            const config = vscode.workspace.getConfiguration('coe');
            const settingKey = `enable${agentName}Agent`;

            // Update setting to true
            await config.update(settingKey, true, vscode.ConfigurationTarget.Global);

            // Refresh the agents tree view to show updated state
            agentsProvider.refresh();

            vscode.window.showInformationMessage(`${agentName} Agent enabled`);
            logInfo(`[EnableAgent] ${agentName} Agent enabled successfully`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[EnableAgent] Failed to enable ${agentName}: ${message}`);
            vscode.window.showErrorMessage(`Failed to enable ${agentName} Agent`);
        }
    });

    /**
     * Command: coe.disableAgent
     * Disables an enabled agent by updating its setting
     * Called from right-click context menu on enabled agents
     */
    const disableAgentCommand = vscode.commands.registerCommand('coe.disableAgent', async (item: vscode.TreeItem) => {
        if (!item || !item.label) {
            logError('[DisableAgent] No agent item provided');
            return;
        }

        const agentName = item.label.toString();
        logInfo(`[DisableAgent] Disabling agent: ${agentName}`);

        try {
            const config = vscode.workspace.getConfiguration('coe');
            const settingKey = `enable${agentName}Agent`;

            // Update setting to false
            await config.update(settingKey, false, vscode.ConfigurationTarget.Global);

            // Refresh the agents tree view to show updated state
            agentsProvider.refresh();

            vscode.window.showInformationMessage(`${agentName} Agent disabled`);
            logInfo(`[DisableAgent] ${agentName} Agent disabled successfully`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[DisableAgent] Failed to disable ${agentName}: ${message}`);
            vscode.window.showErrorMessage(`Failed to disable ${agentName} Agent`);
        }
    });

    /**
     * Command: coe.toggleAutoProcessing
     * Toggles between Auto and Manual ticket processing mode
     * Auto mode: Tickets are automatically routed to agents and processed with LLM
     * Manual mode: Tickets stay in "Pending" status, waiting for manual action
     * Called when clicking the Processing toggle at top of Agents tab
     */
    const toggleAutoProcessingCommand = vscode.commands.registerCommand('coe.toggleAutoProcessing', async () => {
        logInfo('[ToggleAutoProcessing] User clicked processing mode toggle');

        try {
            const config = vscode.workspace.getConfiguration('coe');
            const currentMode = config.get<boolean>('autoProcessTickets', false);
            const newMode = !currentMode;

            // Update setting
            await config.update('autoProcessTickets', newMode, vscode.ConfigurationTarget.Global);

            // Refresh agents tree view to show updated toggle state
            agentsProvider.refresh();

            const modeText = newMode ? 'Auto' : 'Manual';
            vscode.window.showInformationMessage(`Processing mode: ${modeText}`);
            logInfo(`[ToggleAutoProcessing] Mode changed to: ${modeText}`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[ToggleAutoProcessing] Failed to toggle mode: ${message}`);
            vscode.window.showErrorMessage('Failed to toggle processing mode');
        }
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
        logInfo('User triggered: Ask Answer Agent (new conversation)');
        try {
            // Prompt user for question
            const question = await vscode.window.showInputBox({
                prompt: 'Ask a question to the Answer Agent',
                placeHolder: 'E.g., How do I create a VS Code extension?'
            });

            if (!question) {
                logInfo('Ask Answer Agent cancelled - no question provided');
                return;
            }

            // Create a ticket for this Answer Agent conversation (ticket.id becomes chatId)
            const ticket = await createTicket({
                title: `Answer Chat: ${question.substring(0, 60)}${question.length > 60 ? '...' : ''}`,
                status: 'open',
                type: 'answer_agent',
                description: `Answer Agent conversation started with: ${question}`
            });

            const chatId = ticket.id;
            logInfo(`Starting new conversation: ${chatId}`);

            // Store chatId in globalState for use in Continue command
            await context.globalState.update('currentChatId', chatId);

            await getOrchestratorInstance().getAnswerAgent().cleanupInactiveConversations();

            // Call Answer Agent with new conversation
            const response = await answerQuestion(question, chatId, false);

            // Display answer
            vscode.window.showInformationMessage(
                `Answer: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`Answer Agent command error: ${message}`);
            vscode.window.showErrorMessage('Answer Agent failed - see logs for details.');
        }
    });

    /**
     * Command: coe.askAnswerAgentContinue
     * Asks a follow-up question to the Answer Agent using the same conversation history
     */
    const askAnswerAgentContinueCommand = vscode.commands.registerCommand(
        'coe.askAnswerAgentContinue',
        async () => {
            logInfo('User triggered: Ask Answer Agent (continue conversation)');
            try {
                // Get chatId from globalState
                const chatId = context.globalState.get<string>('currentChatId');

                if (!chatId) {
                    vscode.window.showWarningMessage(
                        'No active conversation. Start a new one with "Ask Answer Agent" first.'
                    );
                    logWarn('Continue command executed without active conversation');
                    return;
                }

                // Prompt user for follow-up question
                const followUpQuestion = await vscode.window.showInputBox({
                    prompt: 'Ask a follow-up question',
                    placeHolder: 'E.g., Can you explain that in more detail?'
                });

                if (!followUpQuestion) {
                    logInfo('Ask Answer Agent (Continue) cancelled - no question provided');
                    return;
                }

                logInfo(`Continuing conversation: ${chatId}`);

                await getOrchestratorInstance().getAnswerAgent().cleanupInactiveConversations();

                // Call Answer Agent with same chatId (reuses history)
                const response = await answerQuestion(followUpQuestion, chatId, true);

                // Display answer
                vscode.window.showInformationMessage(
                    `Answer: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`Answer Agent continue command error: ${message}`);
                vscode.window.showErrorMessage('Answer Agent failed - see logs for details.');
            }
        }
    );

    /**
     * Helper function to extract ticket ID from TreeItem
     * Context menu commands receive TreeItem as argument, need to extract ID
     * @param treeItem The TreeItem from context menu
     * @returns Ticket ID string or null if not found
     */
    function extractTicketId(treeItem: vscode.TreeItem): string | null {
        // Ticket ID is stored in command.arguments[0] by createTicketItem()
        return treeItem.command?.arguments?.[0] || null;
    }

    /**
     * Command: coe.openTicket
     * Opens a ticket's plan/description in a new editor tab as Markdown
     * Called when user clicks a ticket in the Tickets sidebar
     * @param ticketId The ticket ID (passed as argument from TreeItem.command)
     */
    const openTicketCommand = vscode.commands.registerCommand(
        'coe.openTicket',
        async (ticketId: string) => {
            try {
                logInfo(`Opening ticket: ${ticketId}`);

                // Fetch ticket from database
                const ticket = await getTicket(ticketId);

                // Handle deleted/not found ticket
                if (!ticket) {
                    logWarn(`Ticket not found: ${ticketId}`);
                    vscode.window.showWarningMessage(`Ticket ${ticketId} not found or was deleted`);
                    return;
                }

                // Prepare content (fallback if no description)
                const content = ticket.description ||
                    `# No Plan Yet\n\nThis ticket doesn't have a plan.\n\n` +
                    `Use **COE: Plan Task** to generate one.`;

                // Create Markdown document (untitled, in memory)
                const doc = await vscode.workspace.openTextDocument({
                    content,
                    language: 'markdown'
                });

                // Open in editor (not preview mode, so it's a permanent tab)
                await vscode.window.showTextDocument(doc, {
                    preview: false,
                    viewColumn: vscode.ViewColumn.One
                });

                logInfo(`Ticket ${ticketId} opened in editor: ${ticket.title}`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`Error opening ticket: ${message}`);
                vscode.window.showErrorMessage(`Failed to open ticket: ${message}`);
            }
        }
    );

    /**
     * Command: coe.viewTicketProgress
     * Context menu command to view ticket progress (delegates to openTicket)
     * @param treeItem The TreeItem selected in context menu
     */
    const viewTicketProgressCommand = vscode.commands.registerCommand(
        'coe.viewTicketProgress',
        async (treeItem: vscode.TreeItem) => {
            try {
                const ticketId = extractTicketId(treeItem);

                if (!ticketId) {
                    logWarn('[ViewProgress] No ticket ID found in TreeItem');
                    vscode.window.showWarningMessage('No ticket selected');
                    return;
                }

                // Delegate to existing openTicket command
                await vscode.commands.executeCommand('coe.openTicket', ticketId);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`[ViewProgress] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to view ticket progress: ${message}`);
            }
        }
    );

    /**
     * Command: coe.updateTicketStatus
     * Context menu command to manually update ticket status
     * @param treeItem The TreeItem selected in context menu
     */
    /**
     * Command: coe.clearConversationHistory
     * Context menu command to clear Answer Agent conversation history
     * Clears both in-memory and persisted history while keeping ticket open
     * @param treeItem The TreeItem selected in context menu
     */
    const clearConversationHistoryCommand = vscode.commands.registerCommand(
        'coe.clearConversationHistory',
        async (treeItem: vscode.TreeItem) => {
            try {
                // Extract chatId from TreeItem.command.arguments
                const chatId = treeItem.command?.arguments?.[0] as string | undefined;

                if (!chatId) {
                    logWarn('[ClearHistory] No chat ID found in TreeItem');
                    vscode.window.showWarningMessage('No conversation selected');
                    return;
                }

                logInfo(`[ClearHistory] Clearing history for chat ${chatId}`);

                // Clear in-memory history in AnswerAgent
                const orchestrator = getOrchestratorInstance();
                orchestrator.getAnswerAgent().clearHistory(chatId);

                // Update ticket in DB with empty conversation history
                await updateTicket(chatId, { conversationHistory: '[]' });

                // Refresh Conversations tree view to show updated state
                conversationsProvider.refresh();

                logInfo(`[ClearHistory] Successfully cleared history for chat ${chatId}`);
                vscode.window.showInformationMessage(`Conversation history cleared for ${chatId}`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`[ClearHistory] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to clear conversation history: ${message}`);
            }
        }
    );

    const updateTicketStatusCommand = vscode.commands.registerCommand(
        'coe.updateTicketStatus',
        async (treeItem: vscode.TreeItem) => {
            try {
                const ticketId = extractTicketId(treeItem);

                if (!ticketId) {
                    logWarn('[UpdateStatus] No ticket ID found in TreeItem');
                    vscode.window.showWarningMessage('No ticket selected');
                    return;
                }

                // Prompt user for new status
                const status = await vscode.window.showQuickPick(
                    ['open', 'in-progress', 'blocked', 'done'],
                    {
                        placeHolder: `Select new status for ticket ${ticketId}`
                    }
                );

                // User cancelled
                if (!status) {
                    logInfo(`[UpdateStatus] User cancelled status update for ${ticketId}`);
                    return;
                }

                logInfo(`[UpdateStatus] Updating ${ticketId} to ${status}`);

                // Update ticket in database
                // Type assertion: status is guaranteed to be one of the valid values from showQuickPick
                const updated = await updateTicket(ticketId, {
                    status: status as 'open' | 'in-progress' | 'blocked' | 'done'
                });

                // Handle ticket not found (deleted while menu was open)
                if (!updated) {
                    logWarn(`[UpdateStatus] Ticket ${ticketId} not found`);
                    vscode.window.showWarningMessage(`Ticket ${ticketId} not found or was deleted`);
                    return;
                }

                // Success feedback
                vscode.window.showInformationMessage(`Ticket ${ticketId} status updated to '${status}'`);
                logInfo(`[UpdateStatus] Success - ${ticketId} → ${status}`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`[UpdateStatus] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to update ticket status: ${message}`);
            }
        }
    );

    /**
     * Command: coe.processTicket
     * Manually processes a ticket by calling the Planning Agent
     * This allows manual processing even when Auto mode is disabled
     * @param treeItem The TreeItem selected in context menu
     */
    async function processTicketWithPlanning(ticketId: string, ticketTitle: string): Promise<void> {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Processing ticket ${ticketId}`,
                cancellable: false
            },
            async (progress) => {
                progress.report({ message: 'Calling Planning Agent...' });

                // Reset agent statuses when manually processing
                agentStatusTracker.resetAll();

                // Call planning agent with ticket title
                const orchestrator = getOrchestratorInstance();
                const plan = await orchestrator.routeToPlanningAgent(ticketTitle);

                progress.report({ message: 'Storing plan...' });

                // Update ticket with plan in description
                await updateTicket(ticketId, {
                    description: plan,
                    status: 'in-progress' // Update status to show it's being worked on
                });

                logInfo(`[ProcessTicket] Plan stored in ${ticketId}`);
            }
        );
    }

    const processTicketCommand = vscode.commands.registerCommand(
        'coe.processTicket',
        async (treeItem: vscode.TreeItem) => {
            try {
                const ticketId = extractTicketId(treeItem);

                if (!ticketId) {
                    logWarn('[ProcessTicket] No ticket ID found in TreeItem');
                    vscode.window.showWarningMessage('No ticket selected');
                    return;
                }

                logInfo(`[ProcessTicket] Processing ticket: ${ticketId}`);

                // Fetch ticket details
                const ticket = await getTicket(ticketId);

                if (!ticket) {
                    logWarn(`[ProcessTicket] Ticket ${ticketId} not found`);
                    vscode.window.showWarningMessage(`Ticket ${ticketId} not found or was deleted`);
                    return;
                }

                // Show progress indicator
                await processTicketWithPlanning(ticketId, ticket.title);

                // Success feedback
                vscode.window.showInformationMessage(`✅ Ticket ${ticketId} processed successfully`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`[ProcessTicket] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to process ticket: ${message}`);
            }
        }
    );

    /**
     * Command: coe.approveTicket
     * Approves a pending ticket and triggers processing
     * @param treeItem The TreeItem selected in context menu
     */
    const approveTicketCommand = vscode.commands.registerCommand(
        'coe.approveTicket',
        async (treeItem: vscode.TreeItem) => {
            try {
                const ticketId = extractTicketId(treeItem);

                if (!ticketId) {
                    logWarn('[ApproveTicket] No ticket ID found in TreeItem');
                    vscode.window.showWarningMessage('No ticket selected');
                    return;
                }

                logInfo(`[ApproveTicket] Approving ticket: ${ticketId}`);

                const ticket = await getTicket(ticketId);

                if (!ticket) {
                    logWarn(`[ApproveTicket] Ticket ${ticketId} not found`);
                    vscode.window.showWarningMessage(`Ticket ${ticketId} not found or was deleted`);
                    return;
                }

                await updateTicket(ticketId, { status: 'open' });

                const config = vscode.workspace.getConfiguration('coe');
                const autoProcessEnabled = config.get<boolean>('autoProcessTickets', false);

                if (autoProcessEnabled) {
                    logInfo(`[ApproveTicket] Auto mode enabled; waiting for auto-processing for ${ticketId}`);
                    vscode.window.showInformationMessage(
                        `Ticket ${ticketId} approved. Auto-processing will start shortly.`
                    );
                    return;
                }

                await processTicketWithPlanning(ticketId, ticket.title);

                vscode.window.showInformationMessage(
                    `✅ Ticket ${ticketId} approved and processing started`
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`[ApproveTicket] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to approve ticket: ${message}`);
            }
        }
    );

    /**
     * Command: coe.addTicketComment
     * Context menu command to add user comment to ticket
     * @param treeItem The TreeItem selected in context menu
     */
    const addTicketCommentCommand = vscode.commands.registerCommand(
        'coe.addTicketComment',
        async (treeItem: vscode.TreeItem) => {
            try {
                const ticketId = extractTicketId(treeItem);

                if (!ticketId) {
                    logWarn('[AddComment] No ticket ID found in TreeItem');
                    vscode.window.showWarningMessage('No ticket selected');
                    return;
                }

                // Prompt user for comment with validation
                const comment = await vscode.window.showInputBox({
                    prompt: 'Enter your comment (max 500 chars)',
                    placeHolder: 'Add notes, questions, or updates...',
                    validateInput: (value: string) => {
                        if (value.length > 500) {
                            return 'Comment too long (max 500 characters)';
                        }
                        return null;
                    }
                });

                // User cancelled
                if (!comment) {
                    logInfo(`[AddComment] User cancelled comment for ${ticketId}`);
                    return;
                }

                logInfo(`[AddComment] Adding comment to ${ticketId}`);

                // Fetch existing ticket
                const ticket = await getTicket(ticketId);

                // Handle ticket not found
                if (!ticket) {
                    logWarn(`[AddComment] Ticket ${ticketId} not found`);
                    vscode.window.showWarningMessage(`Ticket ${ticketId} not found or was deleted`);
                    return;
                }

                // Append comment to description with timestamp separator
                const timestamp = new Date().toLocaleString();
                const existingDescription = ticket.description || '';
                const updatedDescription = `${existingDescription}\n\n---\n**User Comment (${timestamp}):**\n${comment}`;

                // Update ticket with new description
                await updateTicket(ticketId, { description: updatedDescription });

                // Success feedback
                vscode.window.showInformationMessage(`Comment added to ticket ${ticketId}`);
                logInfo(`[AddComment] Success - Comment added to ${ticketId}`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`[AddComment] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to add comment: ${message}`);
            }
        }
    );

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

    /**
     * Command: coe.researchWithAgent
     * Performs detailed research using the Research Agent and generates an MD report
     */
    const researchWithAgentCommand = vscode.commands.registerCommand(
        'coe.researchWithAgent',
        async () => {
            logInfo('User triggered: Research with Agent');

            try {
                // Check if Research Agent is enabled in settings
                const config = vscode.workspace.getConfiguration('coe');
                const enabled = config.get<boolean>('enableResearchAgent', false);

                if (!enabled) {
                    vscode.window.showInformationMessage(
                        'Research Agent is disabled. Enable it in Settings: COE > Enable Research Agent'
                    );
                    logInfo('[ResearchAgent] Feature disabled in settings');
                    return;
                }

                // Prompt user for research query
                const query = await vscode.window.showInputBox({
                    prompt: 'Enter your research query',
                    placeHolder: 'E.g., Explain the benefits of TypeScript over JavaScript',
                    validateInput: (value) => {
                        return value.trim() ? null : 'Query cannot be empty';
                    }
                });

                // User cancelled or provided empty query
                if (!query?.trim()) {
                    logInfo('[ResearchAgent] No query provided, aborting');
                    return;
                }

                // Show progress indicator during research
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Research Agent',
                        cancellable: false
                    },
                    async (progress) => {
                        progress.report({ message: 'Conducting research... (~10 min)' });

                        // Run research
                        const agent = new ResearchAgent();
                        const report = await agent.runResearch(query);

                        progress.report({ message: 'Opening report...' });

                        // Open report in new editor tab
                        const doc = await vscode.workspace.openTextDocument({
                            content: report,
                            language: 'markdown'
                        });

                        await vscode.window.showTextDocument(doc, {
                            preview: false,
                            viewColumn: vscode.ViewColumn.One
                        });

                        logInfo('[ResearchAgent] Report generated and opened successfully');
                    }
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`Research Agent command error: ${message}`);
                vscode.window.showErrorMessage(
                    `Research Agent failed: ${message}`
                );
            }
        }
    );

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
    context.subscriptions.push(conversationsTreeView);
    context.subscriptions.push(refreshAgentsCommand);
    context.subscriptions.push(refreshTicketsCommand);
    context.subscriptions.push(refreshConversationsCommand);
    context.subscriptions.push(enableAgentCommand);
    context.subscriptions.push(disableAgentCommand);
    context.subscriptions.push(toggleAutoProcessingCommand);
    context.subscriptions.push(planTaskCommand);
    context.subscriptions.push(verifyTaskCommand);
    context.subscriptions.push(verifyLastTicketCommand);
    context.subscriptions.push(askAnswerAgentCommand);
    context.subscriptions.push(askAnswerAgentContinueCommand);
    context.subscriptions.push(openTicketCommand);
    context.subscriptions.push(processTicketCommand);
    context.subscriptions.push(approveTicketCommand);
    context.subscriptions.push(viewTicketProgressCommand);
    context.subscriptions.push(updateTicketStatusCommand);
    context.subscriptions.push(addTicketCommentCommand);
    context.subscriptions.push(clearConversationHistoryCommand);
    context.subscriptions.push(researchWithAgentCommand);

    logInfo('Extension fully activated');
}

/**
 * This function is called when the extension is deactivated.
 * Clean up resources here if needed.
 */
export async function deactivate(): Promise<void> {
    try {
        const orchestrator = getOrchestratorInstance();
        const answerAgent = orchestrator.getAnswerAgent();
        const serializedHistory = answerAgent.serializeHistory();
        const tickets = await listTickets();
        let savedCount = 0;

        for (const ticket of tickets) {
            const conversationHistory = serializedHistory[ticket.id];

            if (!conversationHistory) {
                continue;
            }

            try {
                await updateTicket(ticket.id, { conversationHistory });
                savedCount += 1;
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logWarn(
                    `Failed to persist Answer Agent history for ticket ${ticket.id}: ${message}`
                );
            }
        }

        logInfo(`Saved ${savedCount} conversation histories on deactivate`);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to persist Answer Agent history on deactivate: ${message}`);
    }
}
