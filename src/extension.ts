import * as vscode from 'vscode';
import { initializeLogger, logInfo, logError, logWarn } from './logger';
import { initializeConfig } from './config';
import { initializeTicketDb, createTicket, listTickets, updateTicket, onTicketChange, getTicket } from './services/ticketDb';
import { initializeOrchestrator, getOrchestratorInstance } from './services/orchestrator';
import { checkAndDeduplicateTicket, generateDuplicationReport } from './services/deduplication';
import { initializePeriodicCleanup } from './services/ticketCleanup';
import { initializeLLMService, validateConnection } from './services/llmService';
import { initializeMCPServer } from './mcpServer';
import { AgentsTreeDataProvider } from './ui/agentsTreeProvider';
import { TicketsTreeDataProvider } from './ui/ticketsTreeProvider';
import { ConversationsTreeDataProvider } from './ui/conversationsTreeProvider';
import { OrchestratorStatusTreeDataProvider } from './ui/orchestratorStatusTreeProvider';
import { ConversationWebviewPanel } from './ui/conversationWebview';
import { agentStatusTracker } from './ui/agentStatusTracker';
import { openVerificationPanel } from './ui/verificationWebview';
import { openCustomAgentBuilder } from './ui/customAgentBuilder';
import { showAgentGallery } from './ui/agentGallery';
import { openPlanningWizard } from './ui/planningWizard';
import { initializePlanningService } from './services/planningService';
import { ResearchAgent } from './agents/researchAgent';
import {
    initializeAnswerAgent,
    createChatId,
    persistAnswerAgentHistory,
} from './agents/answerAgent';
import {
    getAutoModeEnabled,
    setAutoModeOverride,
    isTicketProcessed,
    markTicketProcessed,
    getDebounceTimer,
    setDebounceTimer,
    clearDebounceTimer,
    resetAutoModeState,
    AUTO_PLAN_DEBOUNCE_MS,
} from './services/autoModeState';

// Module-level status bar item - can be updated from orchestrator
let statusBarItem: vscode.StatusBarItem | null = null;

// Re-export for backward compatibility with tests
export { getAutoModeEnabled, resetAutoModeState as resetAutoModeOverrideForTests } from './services/autoModeState';

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
 * Triggers Planning Agent when a new ai_to_human ticket is created.
 * 
 * **Guards against infinite loops:**
 * 1. Debounce timer (500ms) - prevents rapid-fire triggers
 * 2. Processed ticket Set - skips already-processed tickets
 * 3. LLM health check - blocks ticket if LLM unavailable
 * 4. Status change on failure - prevents re-triggering
 */
async function setupAutoPlanning(): Promise<void> {
    onTicketChange(async () => {
        // DEBOUNCE: Clear existing timer and set new one
        clearDebounceTimer();

        const timer = setTimeout(async () => {
            setDebounceTimer(null);

            try {
                // GUARD 1: Check if auto-processing is enabled (runtime override or setting)
                if (!getAutoModeEnabled()) {
                    logInfo('[Auto-Plan] Skipped - Manual mode enabled');
                    return;
                }

                // Fetch all tickets, get last created
                const tickets = await listTickets();
                if (tickets.length === 0) return;

                const lastTicket = tickets[0]; // listTickets returns DESC by createdAt

                // Only auto-plan if type is 'ai_to_human' and status is 'open'
                if (lastTicket.type !== 'ai_to_human' || lastTicket.status !== 'open') {
                    return;
                }

                // GUARD 2: Already processed this ticket? Prevents infinite loop.
                if (isTicketProcessed(lastTicket.id)) {
                    logInfo(`[Auto-Plan] Skipped - Ticket ${lastTicket.id} already processed`);
                    return;
                }

                // Mark as processed BEFORE calling LLM (prevents re-entry)
                markTicketProcessed(lastTicket.id);

                logInfo(`[Auto-Plan] Detected new ai_to_human ticket: ${lastTicket.id}`);

                // CHECK DUPLICATES: See if this ticket is a duplicate of an existing one
                logInfo(`[Auto-Plan] Checking for duplicate problems...`);
                const deduplicationResult = await checkAndDeduplicateTicket(lastTicket, {
                    minSimilarityScore: 70,
                    autoRemoveDuplicates: true,  // Auto-remove duplicates - keep queue clean
                    bumpMasterPriority: true     // Bump existing ticket priority
                });

                if (deduplicationResult.isDuplicate && deduplicationResult.matches.length > 0) {
                    logInfo(`[Auto-Plan] Duplicate problem detected! ${deduplicationResult.matches.length} match(es) - consolidated`);
                    logInfo(generateDuplicationReport(deduplicationResult));
                    
                    // Notify user about consolidation
                    vscode.window.showInformationMessage(
                        `COE: Duplicate problem consolidated. ` +
                        `${deduplicationResult.report.duplicatesRemoved.length} duplicate ticket(s) removed, ` +
                        `${deduplicationResult.report.mastersPrioritized.length} master(s) prioritized.`
                    );
                    return; // Skip planning - duplicate handled
                }

                // Continue with regular planning
                logInfo(`[Auto-Plan] No significant duplicates found - proceeding with planning`);

                // GUARD 3: Check LLM availability BEFORE planning
                const { success: llmAvailable, error: llmError } = await validateConnection();
                if (!llmAvailable) {
                    logWarn(`[Auto-Plan] LLM unavailable: ${llmError}`);

                    // Mark ticket as blocked (prevents re-triggering)
                    await updateTicket(lastTicket.id, {
                        status: 'blocked',
                        description: `Auto-planning blocked: ${llmError || 'LLM unavailable'}`
                    });

                    // Notify user
                    vscode.window.showWarningMessage(
                        `COE: LLM unavailable - ticket ${lastTicket.id} marked as blocked. Check LLM server connection.`
                    );
                    await updateStatusBar('$(warning) LLM Offline');
                    return;
                }

                // Reset agent statuses when new planning cycle starts
                agentStatusTracker.resetAll();

                // Call planning agent
                const orchestrator = getOrchestratorInstance();
                const plan = await orchestrator.routeToPlanningAgent(lastTicket.title);

                // Check if planning actually succeeded (not just returned fallback)
                const isFallbackResponse = plan.includes('Planning service is currently unavailable');

                if (isFallbackResponse) {
                    // Planning failed - mark as blocked to prevent re-triggering
                    await updateTicket(lastTicket.id, {
                        status: 'blocked',
                        description: plan
                    });
                    logWarn(`[Auto-Plan] Failed - Ticket ${lastTicket.id} marked as blocked`);
                } else {
                    // Planning succeeded - store plan but keep status 'open' for next step
                    await updateTicket(lastTicket.id, {
                        description: plan
                    });
                    logInfo(`[Auto-Plan] DONE - Plan stored in ${lastTicket.id}`);
                }

            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                logError(`[Auto-Plan] Failed: ${msg}`);

                // Try to mark ticket as blocked on error to prevent infinite loop
                try {
                    const tickets = await listTickets();
                    if (tickets.length > 0 && tickets[0].status === 'open') {
                        await updateTicket(tickets[0].id, {
                            status: 'blocked',
                            description: `Auto-planning error: ${msg}`
                        });
                    }
                } catch {
                    // Ignore secondary errors
                }
            }
        }, AUTO_PLAN_DEBOUNCE_MS);

        setDebounceTimer(timer);
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

    // Initialize config system (uses logger for warnings)
    await initializeConfig(context);

    logInfo('Copilot Orchestration Extension is activating...');

    // Initialize Ticket DB
    await initializeTicketDb(context);

    // Initialize Orchestrator after TicketDb (depends on it)
    await initializeOrchestrator(context);

    // Initialize Planning Service (for planning wizard)
    await initializePlanningService(context);

    // Initialize periodic ticket cleanup (removes stale resolved/duplicate tickets every 1 hour)
    initializePeriodicCleanup(1, 7); // 1 hour interval, archive resolved tickets after 7 days

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

    // Initialize Answer Agent singleton
    initializeAnswerAgent();

    // Initialize LLM service (requires Node 18+)
    await initializeLLMService(context);

    // Cleanup inactive conversations
    // (Answer Agent now has this built-in)

    // Start MCP server after Orchestrator is ready
    initializeMCPServer();

    // Setup auto-planning listener for ai_to_human tickets
    await setupAutoPlanning();

    // Initialize TreeView providers for sidebar (Agents, Tickets, and Conversations tabs)
    // AgentsTreeDataProvider = static hardcoded agent list
    const agentsProvider = new AgentsTreeDataProvider();
    // OrchestratorStatusTreeDataProvider = live orchestrator queue stats
    const orchestratorStatusProvider = new OrchestratorStatusTreeDataProvider();
    // TicketsTreeDataProvider = queries TicketDb for open tickets
    const ticketsProvider = new TicketsTreeDataProvider();
    // ConversationsTreeDataProvider = displays active Answer Agent conversations (placeholder for now)
    const conversationsProvider = new ConversationsTreeDataProvider();

    // Register tree providers with VS Code (connects provider class to view ID from package.json)
    // registerTreeDataProvider = tells VS Code to use our provider for the specified view
    const agentsTreeView = vscode.window.registerTreeDataProvider('coe-agents', agentsProvider);
    const orchestratorStatusTreeView = vscode.window.registerTreeDataProvider('coe-agents-status', orchestratorStatusProvider);
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

    const refreshOrchestratorStatusCommand = vscode.commands.registerCommand('coe.refreshOrchestratorStatus', async () => {
        logInfo('Manual refresh: Orchestrator Status');
        try {
            await orchestrator.refreshQueueFromTickets();
            orchestratorStatusProvider.refresh();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[OrchestratorStatus] Manual refresh failed: ${message}`);
            vscode.window.showWarningMessage(`Orchestrator status refresh failed: ${message}`);
        }
    });

    const showOrchestratorStatusDetailsCommand = vscode.commands.registerCommand(
        'coe.showOrchestratorStatusDetails',
        async (detailType?: 'queue' | 'blocked' | 'lastPicked') => {
            try {
                const details = await orchestrator.getQueueDetails();

                if (detailType === 'queue') {
                    const items: vscode.QuickPickItem[] = [];

                    items.push({ label: 'Queue (pending)', kind: vscode.QuickPickItemKind.Separator });
                    if (details.queueTitles.length === 0) {
                        items.push({ label: 'No pending tasks' });
                    } else {
                        details.queueTitles.forEach(title => items.push({ label: title }));
                    }

                    items.push({ label: 'Picked (in-progress)', kind: vscode.QuickPickItemKind.Separator });
                    if (details.pickedTitles.length === 0) {
                        items.push({ label: 'No picked tasks' });
                    } else {
                        details.pickedTitles.forEach(title => items.push({ label: title }));
                    }

                    await vscode.window.showQuickPick(items, {
                        title: 'Orchestrator Queue Details'
                    });
                    return;
                }

                if (detailType === 'blocked') {
                    if (details.blockedP1Titles.length === 0) {
                        vscode.window.showInformationMessage('No blocked P1 tickets right now.');
                        return;
                    }

                    await vscode.window.showQuickPick(
                        details.blockedP1Titles.map(title => ({ label: title })),
                        { title: 'Blocked P1 Tickets' }
                    );
                    return;
                }

                if (detailType === 'lastPicked') {
                    const title = details.lastPickedTitle ?? 'Idle';
                    const timestamp = details.lastPickedAt ? new Date(details.lastPickedAt).toLocaleTimeString() : 'N/A';
                    vscode.window.showInformationMessage(`Last picked: ${title} (at ${timestamp})`);
                    return;
                }

                vscode.window.showInformationMessage(
                    `Queue: ${details.queueTitles.length} tasks, Blocked P1: ${details.blockedP1Titles.length}`
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`[OrchestratorStatus] Failed to show details: ${message}`);
                vscode.window.showWarningMessage(`Failed to show orchestrator details: ${message}`);
            }
        }
    );

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
     * Toggles between Auto and Manual ticket processing mode.
     * 
     * **IMPORTANT**: This is a RUNTIME-ONLY override. It does NOT persist to settings.
     * On extension reload/restart, the mode reverts to the setting value.
     * 
     * Auto mode: Tickets are automatically routed to agents and processed with LLM
     * Manual mode: Tickets stay in "Pending" status, waiting for manual action
     * Called when clicking the Processing toggle at top of Agents tab
     */
    const toggleAutoProcessingCommand = vscode.commands.registerCommand('coe.toggleAutoProcessing', async () => {
        logInfo('[ToggleAutoProcessing] User clicked processing mode toggle');

        try {
            // Get current effective mode (runtime override or setting)
            const currentMode = getAutoModeEnabled();
            const newMode = !currentMode;

            // Set runtime override (does NOT persist to settings)
            setAutoModeOverride(newMode);

            // Refresh agents tree view to show updated toggle state
            agentsProvider.refresh();

            const modeText = newMode ? 'Auto' : 'Manual';
            vscode.window.showInformationMessage(`Processing mode: ${modeText} (session only)`);
            logInfo(`[ToggleAutoProcessing] Mode changed to: ${modeText} (runtime override, not persisted)`);
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

    /**
     * Command: coe.openVerification
     * Opens the verification checklist webview for a given task ID.
     * If no task ID provided, generates one using current timestamp.
     */
    const openVerificationCommand = vscode.commands.registerCommand(
        'coe.openVerification',
        async (taskId?: string) => {
            const id = taskId || `TASK-${Date.now()}`;
            logInfo(`User triggered: Open Verification Checklist for ${id}`);
            openVerificationPanel(id, context);
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

            const threadEntry = {
                role: 'user' as const,
                content: question,
                createdAt: new Date().toISOString()
            };

            // Create a ticket for this conversation (ticket.id becomes chatId)
            const ticket = await createTicket({
                title: `User Question: ${question.substring(0, 60)}${question.length > 60 ? '...' : ''}`,
                status: 'open',
                type: 'human_to_ai',
                description: `User question submitted: ${question}`,
                thread: [threadEntry],
                priority: 2,
                creator: 'system',
                assignee: 'Clarity Agent',
                taskId: null,
                version: 1,
                resolution: null
            });

            const chatId = ticket.id;
            logInfo(`Starting new ticket conversation: ${chatId}`);

            // Store chatId in globalState for use in Continue command
            await context.globalState.update('currentChatId', chatId);

            // Route the ticket through the orchestrator
            const orchestrator = getOrchestratorInstance();
            await orchestrator.processConversationTicket(chatId);

            vscode.window.showInformationMessage(
                `Conversation started for ${chatId}. Response incoming...`
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

                logInfo(`Continuing ticket conversation: ${chatId}`);

                const ticket = await getTicket(chatId);
                if (!ticket) {
                    logWarn(`[Answer Agent Continue] Ticket ${chatId} not found`);
                    vscode.window.showWarningMessage(`Ticket ${chatId} not found or was deleted`);
                    return;
                }

                const updatedThread = ticket.thread ? [...ticket.thread] : [];
                updatedThread.push({
                    role: 'user',
                    content: followUpQuestion,
                    createdAt: new Date().toISOString()
                });

                await updateTicket(chatId, { thread: updatedThread });

                const orchestrator = getOrchestratorInstance();
                await orchestrator.processConversationTicket(chatId);

                vscode.window.showInformationMessage(
                    `Follow-up sent for ${chatId}. Response incoming...`
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`Answer Agent continue command error: ${message}`);
                vscode.window.showErrorMessage('Answer Agent failed - see logs for details.');
            }
        }
    );

    /**
     * Command: coe.replyConversation
     * Context menu command to reply to a conversation ticket
     * @param treeItem The TreeItem selected in context menu
     */
    const replyConversationCommand = vscode.commands.registerCommand(
        'coe.replyConversation',
        async (treeItem: vscode.TreeItem) => {
            try {
                const chatId = treeItem.command?.arguments?.[0] as string | undefined;

                if (!chatId) {
                    logWarn('[ReplyConversation] No chat ID found in TreeItem');
                    vscode.window.showWarningMessage('No conversation selected');
                    return;
                }

                const reply = await vscode.window.showInputBox({
                    prompt: 'Reply to this conversation',
                    placeHolder: 'Type your message...'
                });

                if (!reply) {
                    logInfo(`[ReplyConversation] User cancelled reply for ${chatId}`);
                    return;
                }

                const ticket = await getTicket(chatId);
                if (!ticket) {
                    logWarn(`[ReplyConversation] Ticket ${chatId} not found`);
                    vscode.window.showWarningMessage(`Ticket ${chatId} not found or was deleted`);
                    return;
                }

                const updatedThread = ticket.thread ? [...ticket.thread] : [];
                updatedThread.push({
                    role: 'user',
                    content: reply,
                    createdAt: new Date().toISOString()
                });

                await updateTicket(chatId, { thread: updatedThread });

                const orchestrator = getOrchestratorInstance();
                await orchestrator.processConversationTicket(chatId);

                vscode.window.showInformationMessage(`Reply sent for ${chatId}. Response incoming...`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`[ReplyConversation] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to reply: ${message}`);
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
    async function removeConversationFromView(chatId: string): Promise<void> {
        // Clear in-memory history in AnswerAgent
        const orchestrator = getOrchestratorInstance();
        orchestrator.getAnswerAgent().clearHistory(chatId);

        // Update ticket in DB to remove conversation history and type
        // This hides the conversation from the Conversations view.
        await updateTicket(chatId, {
            conversationHistory: undefined,
            type: undefined,
            thread: undefined
        });

        // Refresh Conversations tree view to show updated state
        conversationsProvider.refresh();
    }

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
                await removeConversationFromView(chatId);

                logInfo(`[ClearHistory] Successfully cleared history for chat ${chatId}`);
                vscode.window.showInformationMessage(`Conversation history cleared for ${chatId}`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`[ClearHistory] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to clear conversation history: ${message}`);
            }
        }
    );

    /**
     * Command: coe.removeConversation
     * Context menu command to remove a conversation from the sidebar
     * @param treeItem The TreeItem selected in context menu
     */
    const removeConversationCommand = vscode.commands.registerCommand(
        'coe.removeConversation',
        async (treeItem: vscode.TreeItem) => {
            try {
                const chatId = treeItem.command?.arguments?.[0] as string | undefined;

                if (!chatId) {
                    logWarn('[RemoveConversation] No chat ID found in TreeItem');
                    vscode.window.showWarningMessage('No conversation selected');
                    return;
                }

                logInfo(`[RemoveConversation] Removing conversation ${chatId}`);
                await removeConversationFromView(chatId);

                logInfo(`[RemoveConversation] Successfully removed conversation ${chatId}`);
                vscode.window.showInformationMessage(`Conversation removed for ${chatId}`);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`[RemoveConversation] Error: ${message}`);
                vscode.window.showErrorMessage(`Failed to remove conversation: ${message}`);
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
                status: 'open',
                priority: 2,
                creator: 'system',
                assignee: 'Clarity Agent',
                taskId: null,
                version: 1,
                resolution: null
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


    /**
     * Command: coe.startNewConversation
     * Opens a new conversation webview with empty chat
     */
    const startNewConversationCommand = vscode.commands.registerCommand('coe.startNewConversation', async () => {
        logInfo('User triggered: Start New Conversation');
        try {
            const newChatId = createChatId();

            // Create empty ticket for this conversation
            const ticket = await createTicket({
                title: 'New Conversation',
                status: 'open',
                type: 'answer_agent',
                description: 'New conversation',
                priority: 2,
                creator: 'system',
                assignee: 'Clarity Agent',
                taskId: null,
                version: 1,
                resolution: null
            });

            // Open webview with this chatId
            await ConversationWebviewPanel.createOrShow(newChatId, context, []);
            logInfo(`Created new conversation: ${newChatId}`);
        } catch (err) {
            logError(`Failed to start new conversation: ${err}`);
            vscode.window.showErrorMessage(`Failed to start conversation: ${err}`);
        }
    });

    /**
     * Command: coe.openConversation
     * Opens an existing conversation in webview
     */
    const openConversationCommand = vscode.commands.registerCommand(
        'coe.openConversation',
        async (chatId: string) => {
            logInfo(`User triggered: Open Conversation ${chatId}`);
            try {
                // Get conversation history from answer agent
                const ticket = await getTicket(chatId);
                if (!ticket) {
                    vscode.window.showWarningMessage(`Conversation ${chatId} not found`);
                    logWarn(`Conversation ticket ${chatId} not found`);
                    return;
                }

                // Open webview panel
                await ConversationWebviewPanel.createOrShow(chatId, context);
                logInfo(`Opened conversation webview: ${chatId}`);
            } catch (err) {
                logError(`Failed to open conversation: ${err}`);
                vscode.window.showErrorMessage(`Failed to open conversation: ${err}`);
            }
        }
    );

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

    /**
     * Command: coe.openCustomAgentBuilder
     * Opens the Custom Agent Builder panel for creating new agents
     */
    const openCustomAgentBuilderCommand = vscode.commands.registerCommand(
        'coe.openCustomAgentBuilder',
        async () => {
            logInfo('User triggered: Open Custom Agent Builder');
            try {
                openCustomAgentBuilder(context);
                logInfo('Custom Agent Builder panel opened');
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`Failed to open Custom Agent Builder: ${message}`);
                vscode.window.showErrorMessage(
                    `Failed to open Custom Agent Builder: ${message}`
                );
            }
        }
    );

    /**
     * Command: coe.showAgentGallery
     * Opens the Agent Gallery for browsing and installing agents
     */
    const showAgentGalleryCommand = vscode.commands.registerCommand(
        'coe.showAgentGallery',
        async () => {
            logInfo('User triggered: Show Agent Gallery');
            try {
                await showAgentGallery(context);
                logInfo('Agent Gallery panel opened');
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`Failed to open Agent Gallery: ${message}`);
                vscode.window.showErrorMessage(
                    `Failed to open Agent Gallery: ${message}`
                );
            }
        }
    );

    /**
     * Command: coe.openPlanningWizard
     * Opens the Planning Wizard for creating comprehensive project plans
     */
    const openPlanningWizardCommand = vscode.commands.registerCommand(
        'coe.openPlanningWizard',
        async () => {
            logInfo('User triggered: Open Planning Wizard');
            try {
                await openPlanningWizard(context);
                logInfo('Planning Wizard panel opened');
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                logError(`Failed to open Planning Wizard: ${message}`);
                vscode.window.showErrorMessage(
                    `Failed to open Planning Wizard: ${message}`
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
    context.subscriptions.push(orchestratorStatusTreeView);
    context.subscriptions.push(ticketsTreeView);
    context.subscriptions.push(conversationsTreeView);
    context.subscriptions.push(refreshAgentsCommand);
    context.subscriptions.push(refreshTicketsCommand);
    context.subscriptions.push(refreshConversationsCommand);
    context.subscriptions.push(refreshOrchestratorStatusCommand);
    context.subscriptions.push(showOrchestratorStatusDetailsCommand);
    context.subscriptions.push(enableAgentCommand);
    context.subscriptions.push(disableAgentCommand);
    context.subscriptions.push(toggleAutoProcessingCommand);
    context.subscriptions.push(planTaskCommand);
    context.subscriptions.push(verifyTaskCommand);
    context.subscriptions.push(verifyLastTicketCommand);
    context.subscriptions.push(openVerificationCommand);
    context.subscriptions.push(askAnswerAgentCommand);
    context.subscriptions.push(askAnswerAgentContinueCommand);
    context.subscriptions.push(startNewConversationCommand);
    context.subscriptions.push(openConversationCommand);
    context.subscriptions.push(replyConversationCommand);
    context.subscriptions.push(openTicketCommand);
    context.subscriptions.push(processTicketCommand);
    context.subscriptions.push(approveTicketCommand);
    context.subscriptions.push(viewTicketProgressCommand);
    context.subscriptions.push(updateTicketStatusCommand);
    context.subscriptions.push(addTicketCommentCommand);
    context.subscriptions.push(clearConversationHistoryCommand);
    context.subscriptions.push(removeConversationCommand);
    context.subscriptions.push(researchWithAgentCommand);
    context.subscriptions.push(openCustomAgentBuilderCommand);
    context.subscriptions.push(showAgentGalleryCommand);
    context.subscriptions.push(openPlanningWizardCommand);

    logInfo('Extension fully activated');
}

/**
 * This function is called when the extension is deactivated.
 * Clean up resources here if needed.
 */
export async function deactivate(): Promise<void> {
    try {
        // Dispose all open webview panels
        ConversationWebviewPanel.disposeAll();
        logInfo('Disposed all conversation webview panels');

        // Persist Answer Agent conversation history
        const serializedHistory = persistAnswerAgentHistory();
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
