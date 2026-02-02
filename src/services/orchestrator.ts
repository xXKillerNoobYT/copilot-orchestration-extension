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
import { listTickets, createTicket, Ticket } from './ticketDb';
import { completeLLM, streamLLM } from './llmService';

/**
 * System prompt for the Answer agent
 * Tells the LLM how to behave when answering questions
 */
const ANSWER_SYSTEM_PROMPT = "You are an Answer agent in a coding orchestration system. Provide concise, actionable responses to developer questions. Focus on clarity and practical solutions.";

/**
 * Planning system prompt for the Answer agent
 * Tells the LLM how to break down coding tasks into atomic steps
 */
const PLANNING_SYSTEM_PROMPT = "You are a Planning agent. Break coding tasks into small atomic steps (15-25 min each), number them, include file names to modify/create, and add 1-sentence success criteria per step.";

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

        } catch (error: any) {
            logError(`Answer agent failed: ${error.message}`);

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
            } else if (fullPlan.length > 1000) {
                logInfo(`Full plan (truncated): ${fullPlan.substring(0, 1000)}...`);
            } else {
                logInfo(`Full plan: ${fullPlan}`);
            }

            return fullPlan;

        } catch (error: any) {
            logError(`Planning agent failed: ${error.message}`);
            return 'Planning service is currently unavailable. A ticket has been created for manual review.';
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
     * Reset orchestrator state for tests
     * 
     * Clears the task queue and picked tasks to prevent test pollution.
     */
    resetForTests(): void {
        this.taskQueue = [];
        this.pickedTasks = [];
        this.context = null;
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
 * Reset orchestrator for tests (clears singleton and queue)
 */
export function resetOrchestratorForTests(): void {
    if (orchestratorInstance) {
        orchestratorInstance.resetForTests();
    }
    orchestratorInstance = null;
}

export function getOrchestratorInstance(): OrchestratorService {
    if (!orchestratorInstance) {
        throw new Error('Orchestrator not initialized');
    }
    return orchestratorInstance;
}
