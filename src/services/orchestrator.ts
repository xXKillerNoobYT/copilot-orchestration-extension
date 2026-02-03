/**
 * Orchestrator Service
 * 
 * Manages task queue and routing for the COE extension.
 * 
 * Features:
 * - Maintains in-memory task queue (FIFO array) loaded from TicketDb
 * - getNextTask() returns next pending task for Copilot to pick up
 * - Detects blocked tasks (idle >30s) and creates P1 tickets via TicketDb
 * - routeQuestionToAnswer() for routing questions (stub for now)
 * - Integrates with Logger for task pickup logging
 * 
 * Architecture:
 * - Tasks are 1:1 with Tickets (task.id = ticket.id)
 * - Queue is simple array, FIFO order with shift()
 * - Timeout detection runs on every getNextTask() call
 * - Singleton pattern (one orchestrator per extension instance)
 * 
 * Usage:
 * 1. Call initializeOrchestrator(context) in activate() after ticketDb
 * 2. Use getNextTask() to retrieve next pending task
 * 3. Use routeQuestionToAnswer(question) for routing (future)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logInfo, logWarn, logError } from '../logger';
import { listTickets, createTicket } from './ticketDb';
import { completeLLM, streamLLM } from './llmService';
import { agentStatusTracker } from '../ui/agentStatusTracker';
import { llmStatusBar } from '../ui/llmStatusBar';
import { updateStatusBar } from '../extension';
import AnswerAgent from '../agents/answerAgent';

/**
 * System prompt for the Answer agent
 * Tells the LLM how to behave when answering questions
 */
export const ANSWER_SYSTEM_PROMPT = "You are an Answer agent in a coding orchestration system. Provide concise, actionable responses to developer questions. Focus on clarity and practical solutions.";

/**
 * Planning system prompt for the Answer agent
 * Tells the LLM how to break down coding tasks into atomic steps
 */
export const PLANNING_SYSTEM_PROMPT = "You are a Planning agent. Break coding tasks into small atomic steps (15-25 min each), number them, include file names to modify/create, and add 1-sentence success criteria per step.";

/**
 * Verification system prompt for the Verification agent
 * Tells the LLM to check if code matches task success criteria
 */
export const VERIFICATION_SYSTEM_PROMPT = "You are a Verification agent. Check if the code meets the task success criteria. Return only: PASS or FAIL, then 1-2 sentence explanation. Be strict.";

/**
 * Task interface - represents a work item in the queue
 * 
 * Properties:
 * - id: Unique task ID (same as ticket ID since tasks are 1:1 with tickets)
 * - ticketId: Reference to the source ticket in TicketDb
 * - title: Short description from ticket.title
 * - status: Current task status ('pending', 'picked', 'blocked')
 * - createdAt: ISO timestamp when task was created
 * - lastPickedAt: Optional ISO timestamp when task was last picked up (for timeout detection)
 * - blockedAt: Optional ISO timestamp when task was marked as blocked
 */
export interface Task {
    id: string;              // Same as ticket ID (e.g., "TICKET-001")
    ticketId: string;        // Reference to source ticket
    title: string;           // From ticket.title
    status: 'pending' | 'picked' | 'blocked';
    createdAt: string;       // ISO timestamp
    lastPickedAt?: string;   // Optional: when task was picked (for timeout tracking)
    blockedAt?: string;      // Optional: when task was marked blocked
}

/**
 * OrchestratorService class
 * 
 * Manages the task queue and orchestrates work for Copilot.
 */
export class OrchestratorService {
    // In-memory task queue (simple array for FIFO ordering)
    private taskQueue: Task[] = [];

    // Tracks tasks that have been picked and are in-flight (waiting for completion)
    private pickedTasks: Task[] = [];

    // Timeout in seconds before creating blocked ticket (read from config, default 30)
    private taskTimeoutSeconds: number = 30;

    // Extension context (needed to read config file)
    private context: vscode.ExtensionContext | null = null;

    // Answer Agent for multi-turn conversations
    private answerAgent: AnswerAgent | null = null;

    /**
     * Initialize the orchestrator service
     * 
     * Steps:
     * 1. Read taskTimeoutSeconds from config (.coe/config.json)
     * 2. Load initial tasks from TicketDb
     * 3. Log initialization message
     * 
     * @param context VS Code ExtensionContext
     */
    async initialize(context: vscode.ExtensionContext): Promise<void> {
        // Store context for later use
        this.context = context;

        // Step 1: Read taskTimeoutSeconds from config
        const configPath = path.join(context.extensionPath, '.coe', 'config.json');

        try {
            if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(configContent);

                // Try orchestrator.taskTimeoutSeconds first
                if (config.orchestrator?.taskTimeoutSeconds) {
                    this.taskTimeoutSeconds = config.orchestrator.taskTimeoutSeconds;
                }
                // Fallback to llm.timeoutSeconds
                else if (config.llm?.timeoutSeconds) {
                    this.taskTimeoutSeconds = config.llm.timeoutSeconds;
                }
                // Otherwise keep default 30
            }
        } catch (err) {
            // Silent fail - use default 30s
            logWarn(`Failed to read orchestrator config: ${err}`);
        }

        // Step 2: Load initial tasks from TicketDb
        await this.loadTasksFromTickets();

        // Step 3: Log initialization
        logInfo(`Orchestrator initialized with timeout: ${this.taskTimeoutSeconds}s`);
    }

    /**
     * Get the next pending task from the queue
     * 
     * Steps:
     * 1. Check for blocked tasks (timeout detection)
     * 2. If queue empty, return null
     * 3. Remove first task from queue (FIFO with shift())
     * 4. Set task.lastPickedAt to current timestamp
     * 5. Add to pickedTasks for timeout tracking
     * 6. Log task pickup
     * 7. Return task
     * 
     * @returns Next task or null if queue is empty
     */
    async getNextTask(): Promise<Task | null> {
        // Step 1: Check for blocked tasks before returning
        await this.checkForBlockedTasks();

        // Step 2: If queue empty, return null
        if (this.taskQueue.length === 0) {
            logInfo('No pending tasks in queue');
            return null;
        }

        // Step 3: Remove first task from queue (FIFO with shift())
        const task = this.taskQueue.shift()!; // ! tells TypeScript we know it's not undefined

        // Step 4: Set lastPickedAt to current timestamp
        task.lastPickedAt = new Date().toISOString();
        task.status = 'picked';

        // Step 5: Add to pickedTasks for timeout tracking
        this.pickedTasks.push(task);

        // Step 6: Log task pickup
        logInfo(`Task picked: ${task.id} - ${task.title}`);

        // Step 7: Return task
        return task;
    }

    /**
     * Route a question to the Answer team
     * 
     * Uses the LLM service to generate a response to the question.
     * If the LLM fails (network error, timeout, etc.), a blocked ticket is created for manual review.
     * 
     * @param question The question to route
     * @returns Response from Answer team via LLM
     */
    async routeQuestionToAnswer(question: string): Promise<string> {
        logInfo(`Routing question to Answer agent: ${question}`);

        try {
            // Call LLM with the Answer agent system prompt
            const response = await completeLLM(question, {
                systemPrompt: ANSWER_SYSTEM_PROMPT
            });

            logInfo('Answer agent response received');
            return response.content;

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`Answer agent failed: ${message}`);

            // Ticket is already created in completeLLM, just return fallback
            return 'LLM service is currently unavailable. A ticket has been created for manual review.';
        }
    }

    /**
     * Route a question to the Planning agent
     * 
     * Uses the LLM service to generate a response to the question.
     * If the LLM fails (network error, timeout, etc.), a blocked ticket is created for manual review.
     * 
     * @param question The question to route
     * @returns Response from Answer team via LLM
     */
    async routeToPlanningAgent(question: string): Promise<string> {
        logInfo(`Routing request to Planning agent: ${question}`);

        // Update UI: mark agent as Active
        agentStatusTracker.setAgentStatus('Planning', 'Active', '');
        await updateStatusBar('$(rocket) Planning...');

        llmStatusBar.start();
        try {
            const response = await streamLLM(
                question,
                (chunk) => {
                    logInfo(`LLM: ${chunk}`); // Real-time logging of each chunk
                },
                {
                    systemPrompt: PLANNING_SYSTEM_PROMPT
                }
            );

            const fullPlan = response.content;
            if (!fullPlan) {
                logWarn('Planning agent returned an empty response.');
                agentStatusTracker.setAgentStatus('Planning', 'Failed', 'Empty response');
                await updateStatusBar('$(rocket) COE Ready');
            } else {
                if (fullPlan.length > 1000) {
                    logInfo(`Full plan (truncated): ${fullPlan.substring(0, 1000)}...`);
                } else {
                    logInfo(`Full plan: ${fullPlan}`);
                }
                // Update UI: mark agent as Waiting, store plan as result
                agentStatusTracker.setAgentStatus('Planning', 'Waiting', fullPlan.substring(0, 100));
                await updateStatusBar('$(rocket) COE Ready');
            }

            return fullPlan;

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`Planning agent failed: ${message}`);
            agentStatusTracker.setAgentStatus('Planning', 'Failed', message.substring(0, 100));
            await updateStatusBar('$(rocket) COE Ready');
            return 'Planning service is currently unavailable. A ticket has been created for manual review.';
        } finally {
            llmStatusBar.end();
        }
    }

    /**
     * Route a task to the Verification agent
     *
     * Combines task description + code diff, then asks the LLM to verify.
     * Returns pass/fail plus a short explanation.
     */
    async routeToVerificationAgent(
        taskDescription: string,
        codeDiff: string
    ): Promise<{ passed: boolean; explanation: string }> {
        // Update UI: mark agent as Active
        agentStatusTracker.setAgentStatus('Verification', 'Active', '');
        await updateStatusBar('$(rocket) Verifying...');

        const trimmedDiff = codeDiff.trim();
        if (!trimmedDiff) {
            const explanation = 'No code diff provided for verification.';
            logWarn(explanation);
            agentStatusTracker.setAgentStatus('Verification', 'Waiting', 'FAIL - No diff');
            await updateStatusBar('$(rocket) COE Ready');
            await createTicket({
                title: `VERIFICATION FAILED: ${taskDescription || 'Unknown Task'}`,
                status: 'blocked',
                description: `Explanation: ${explanation}\n\nCode diff:\n${codeDiff}`
            });
            return { passed: false, explanation };
        }

        const verificationPrompt = `Task: ${taskDescription}\nCode diff: ${codeDiff}`;
        logInfo(`Routing task to Verification agent: ${taskDescription}`);

        llmStatusBar.start();
        try {
            const response = await completeLLM(verificationPrompt, {
                systemPrompt: VERIFICATION_SYSTEM_PROMPT,
                temperature: 0.3
            });

            const content = response.content.trim();
            const match = content.match(/\b(PASS|FAIL)\b/i);
            let passed = false;
            let explanation = '';

            if (match) {
                passed = match[1].toUpperCase() === 'PASS';
                const matchIndex = match.index ?? 0;
                const afterMatch = content.slice(matchIndex + match[1].length);
                explanation = afterMatch.replace(/^[:\-\s]+/, '').trim();
            } else {
                explanation = 'Ambiguous response from verification - defaulting to FAIL.';
                logWarn(`Verification response was ambiguous: ${content.substring(0, 100)}...`);
            }

            if (!explanation) {
                explanation = passed ? 'All criteria met.' : 'Criteria not met.';
            }

            const logExplanation = explanation.length > 200
                ? `${explanation.substring(0, 200)}...`
                : explanation;
            logInfo(`Verification: ${passed ? 'PASS' : 'FAIL'} - ${logExplanation}`);

            // Update UI: mark agent as Waiting, store result
            const resultText = `${passed ? 'PASS' : 'FAIL'} - ${explanation.substring(0, 80)}`;
            agentStatusTracker.setAgentStatus('Verification', 'Waiting', resultText);
            await updateStatusBar(passed ? '$(rocket) ✓ Verified' : '$(rocket) ⚠ Needs Review');

            if (!passed) {
                await createTicket({
                    title: `VERIFICATION FAILED: ${taskDescription || 'Unknown Task'}`,
                    status: 'blocked',
                    description: `Explanation: ${explanation}\n\nCode diff:\n${codeDiff}`
                });
            }

            return { passed, explanation };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`Verification agent failed: ${message}`);
            agentStatusTracker.setAgentStatus('Verification', 'Failed', message.substring(0, 100));
            await updateStatusBar('$(rocket) COE Ready');
            return {
                passed: false,
                explanation: 'Verification failed due to an LLM error. See logs for details.'
            };
        } finally {
            llmStatusBar.end();
        }
    }

    /**
     * Route a question to the Answer agent
     *
     * Provides concise, actionable responses to developer questions.
     * If the response contains action keywords, creates a ticket for manual follow-up.
     *
     * @param question The question to answer
     * @returns Response from Answer agent via LLM
     */
    async routeToAnswerAgent(question: string): Promise<string> {
        // Validate: warn and return early for empty question
        if (!question || question.trim() === '') {
            logWarn('[Answer] Empty question provided');
            return 'Please ask a question.';
        }

        logInfo(`[Answer] Routing question to Answer agent: ${question}`);

        try {
            const response = await completeLLM(
                question,
                {
                    systemPrompt: ANSWER_SYSTEM_PROMPT
                }
            );

            const fullAnswer = response.content;

            if (!fullAnswer) {
                logWarn('[Answer] Answer agent returned an empty response.');
                return 'Could not generate an answer.';
            }

            // Log response (truncated if >500 chars for readability)
            const displayAnswer = fullAnswer.length > 500
                ? `${fullAnswer.substring(0, 500)}...`
                : fullAnswer;
            logInfo(`[INFO] Answer: ${displayAnswer}`);

            // Check if response contains action keywords (case-insensitive)
            const actionKeywords = ['ticket', 'create', 'fix', 'implement'];
            const lowerAnswer = fullAnswer.toLowerCase();
            const needsAction = actionKeywords.some(keyword => lowerAnswer.includes(keyword));

            // Create ticket if action needed
            if (needsAction) {
                const ticketTitle = `ANSWER NEEDS ACTION: ${question.substring(0, 50)}${question.length > 50 ? '...' : ''}`;
                await createTicket({
                    title: ticketTitle,
                    status: 'blocked',
                    description: fullAnswer
                });
                logInfo(`[Answer] Created ticket for action: ${ticketTitle}`);
            }

            return fullAnswer;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[Answer] Answer agent failed: ${message}`);

            // Ticket is already created in completeLLM, just return fallback
            return 'LLM service is currently unavailable. A ticket has been created for manual review.';
        }
    }

    /**
     * Load tasks from TicketDb
     * 
     * Steps:
     * 1. Call listTickets() to get all tickets
     * 2. Filter for 'open' or 'in-progress' status
     * 3. Map each ticket to a Task object
     * 4. Add to taskQueue
     * 5. Log count of loaded tasks
     * 
     * Called during initialization to populate initial queue.
     */
    private async loadTasksFromTickets(): Promise<void> {
        try {
            // Step 1: Get all tickets from TicketDb
            const tickets = await listTickets();

            // Step 2: Filter for open or in-progress tickets
            const workableTickets = tickets.filter(
                ticket => ticket.status === 'open' || ticket.status === 'in-progress'
            );

            // Step 3: Map each ticket to a Task object
            const tasks: Task[] = workableTickets.map(ticket => ({
                id: ticket.id,              // Task ID = Ticket ID (1:1 relationship)
                ticketId: ticket.id,        // Reference to source ticket
                title: ticket.title,        // Copy title from ticket
                status: 'pending',          // All loaded tasks start as 'pending'
                createdAt: ticket.createdAt // Copy creation timestamp
                // lastPickedAt and blockedAt are undefined initially
            }));

            // Step 4: Add to task queue
            this.taskQueue = tasks;

            // Step 5: Log count
            logInfo(`Loaded ${tasks.length} tasks from tickets`);
        } catch (err) {
            // If TicketDb fails, log error and start with empty queue
            logError(`Failed to load tasks from tickets: ${err}`);
            this.taskQueue = [];
        }
    }

    /**
     * Check for blocked tasks and create tickets for them
     * 
     * Steps:
     * 1. Check both taskQueue and pickedTasks (in-flight tasks)
     * 2. For each task with lastPickedAt:
     *    - Calculate age (current time - lastPickedAt)
     *    - If age > taskTimeoutSeconds and not already blocked:
     *      - Set task.blockedAt
     *      - Create a new ticket with status 'blocked'
     *      - Remove from pickedTasks
     *      - Log the blocked task
     * 
     * Called by getNextTask() before returning to detect stale tasks.
     */
    private async checkForBlockedTasks(): Promise<void> {
        const now = Date.now();

        // Check both pending queue and in-flight picked tasks
        const allTasks = [...this.taskQueue, ...this.pickedTasks];

        // Iterate through all tasks
        for (const task of allTasks) {
            // Skip if task hasn't been picked yet (no lastPickedAt)
            if (!task.lastPickedAt) {
                continue;
            }

            // Calculate how long ago task was picked (in milliseconds)
            const pickedTime = new Date(task.lastPickedAt).getTime();
            const idleTimeMs = now - pickedTime;
            const idleTimeSeconds = idleTimeMs / 1000;

            // If task idle > timeout AND not already blocked
            if (idleTimeSeconds > this.taskTimeoutSeconds && !task.blockedAt) {
                // Mark task as blocked
                task.blockedAt = new Date().toISOString();
                task.status = 'blocked';

                // Remove from pickedTasks if it's there
                const pickedIndex = this.pickedTasks.indexOf(task);
                if (pickedIndex > -1) {
                    this.pickedTasks.splice(pickedIndex, 1);
                }

                // Create P1 ticket in TicketDb
                try {
                    await createTicket({
                        title: `BLOCKED: ${task.title}`,
                        status: 'blocked',
                        description: `Task idle for ${Math.round(idleTimeSeconds)}s (timeout: ${this.taskTimeoutSeconds}s)`
                    });
                    logWarn(`Created blocked ticket for task: ${task.id}`);
                } catch (err) {
                    logError(`Failed to create blocked ticket: ${err}`);
                }
            }
        }
    }

    /**
     * Answer a question using the Answer Agent with multi-turn support
     *
     * Uses the AnswerAgent to maintain conversation history per chatId.
     * Allows follow-up questions in the same conversation.
     *
     * @param question The question to answer
     * @param chatId Optional chat ID for conversation grouping. If not provided, a new one is generated.
     * @param isContinue Whether this is a follow-up question (for logging purposes)
     * @returns Response from Answer Agent
     */
    async answerQuestion(
        question: string,
        chatId?: string,
        isContinue?: boolean
    ): Promise<string> {
        logInfo(
            `[Answer] ${isContinue ? 'Continuing' : 'Starting'} conversation${chatId ? ` (${chatId})` : ''
            }: ${question.substring(0, 50)}...`
        );

        llmStatusBar.start();
        try {
            // Lazy initialize AnswerAgent
            if (!this.answerAgent) {
                this.answerAgent = new AnswerAgent();
            }

            // Use AnswerAgent to handle multi-turn conversation
            const answer = await this.answerAgent.ask(question, chatId);

            logInfo(`[Answer] Response generated`);
            return answer;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[Answer] Failed to answer question: ${message}`);

            // Ticket is already created in completeLLM if it was an LLM error
            return 'LLM service is currently unavailable. A ticket has been created for manual review.';
        } finally {
            llmStatusBar.end();
        }
    }

    /**
     * Get the AnswerAgent instance (lazy initialized)
     */
    getAnswerAgent(): AnswerAgent {
        if (!this.answerAgent) {
            this.answerAgent = new AnswerAgent();
        }
        return this.answerAgent;
    }

    /**
     * Reset orchestrator state for tests
     * 
     * Clears the task queue and picked tasks to prevent test pollution.
     */
    resetForTests(): void {
        this.taskQueue = [];
        this.pickedTasks = [];
        this.context = null;
        this.answerAgent = null;
    }
}

// Singleton instance (only one orchestrator per extension)
let orchestratorInstance: OrchestratorService | null = null;

/**
 * Initialize the orchestrator service (called once from activate())
 * 
 * @param context VS Code ExtensionContext
 */
export async function initializeOrchestrator(context: vscode.ExtensionContext): Promise<OrchestratorService> {
    if (orchestratorInstance) {
        logWarn('Orchestrator already initialized');
        return orchestratorInstance;
    }
    orchestratorInstance = new OrchestratorService();
    await orchestratorInstance.initialize(context);
    return orchestratorInstance;
}

/**
 * Get the next pending task from the queue
 * 
 * @returns Next task or null if queue is empty
 */
export async function getNextTask(): Promise<Task | null> {
    if (!orchestratorInstance) {
        throw new Error('Orchestrator not initialized. Call initializeOrchestrator() first.');
    }
    return orchestratorInstance.getNextTask();
}

/**
 * Route a question to the Answer team
 * 
 * @param question The question to route
 * @returns Response from Answer team
 */
export async function routeQuestionToAnswer(question: string): Promise<string> {
    if (!orchestratorInstance) {
        throw new Error('Orchestrator not initialized');
    }
    return orchestratorInstance.routeQuestionToAnswer(question);
}

/**
 * Route a question to the Planning agent
 * 
 * @param question The question to route
 * @returns Response from Answer team
 */
export async function routeToPlanningAgent(question: string): Promise<string> {
    if (!orchestratorInstance) {
        throw new Error('Orchestrator not initialized');
    }
    return orchestratorInstance.routeToPlanningAgent(question);
}

/**
 * Route a task to the Verification agent
 *
 * @param taskDescription Description + success criteria
 * @param codeDiff Code diff to verify
 */
export async function routeToVerificationAgent(
    taskDescription: string,
    codeDiff: string
): Promise<{ passed: boolean; explanation: string }> {
    if (!orchestratorInstance) {
        throw new Error('Orchestrator not initialized');
    }
    return orchestratorInstance.routeToVerificationAgent(taskDescription, codeDiff);
}

/**
 * Route a question to the Answer agent
 * 
 * @param question The question to answer
 * @returns Response from Answer agent
 */
export async function routeToAnswerAgent(question: string): Promise<string> {
    if (!orchestratorInstance) {
        throw new Error('Orchestrator not initialized');
    }
    return orchestratorInstance.routeToAnswerAgent(question);
}

/**
 * Reset orchestrator for tests (clears singleton and queue)
 */
export function resetOrchestratorForTests(): void {
    if (orchestratorInstance) {
        orchestratorInstance.resetForTests();
    }
    orchestratorInstance = null;
}

/**
 * Answer a question using the Answer Agent with multi-turn support
 *
 * @param question The question to answer
 * @param chatId Optional chat ID for conversation grouping
 * @param isContinue Whether this is a follow-up question
 * @returns Response from Answer Agent
 */
export async function answerQuestion(
    question: string,
    chatId?: string,
    isContinue?: boolean
): Promise<string> {
    if (!orchestratorInstance) {
        throw new Error('Orchestrator not initialized');
    }
    return orchestratorInstance.answerQuestion(question, chatId, isContinue);
}

export function getOrchestratorInstance(): OrchestratorService {
    if (!orchestratorInstance) {
        throw new Error('Orchestrator not initialized');
    }
    return orchestratorInstance;
}
