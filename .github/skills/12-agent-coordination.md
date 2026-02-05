# Agent Coordination Pattern

**Purpose**: Orchestrator-based agent routing and autonomous workflow management  
**Related Files**: `src/services/orchestrator.ts`, `src/agents/*.ts`  
**Keywords**: orchestrator, agents, routing, planning, verification, autonomous

## Agent Architecture

COE uses specialized agents coordinated by Orchestrator:

```
┌─────────────────────────────────────────────┐
│ 1. PLANNING AGENT                           │
│    - Breaks task into atomic steps          │
│    - Generates execution plan               │
│    - Stores plan in ticket.description      │
└─────────────────┬───────────────────────────┘
                  ↓
┌─────────────────────────────────────────────┐
│ 2. VERIFICATION AGENT                       │
│    - Checks code against success criteria   │
│    - Returns PASS/FAIL + explanation        │
│    - Updates ticket status                  │
└─────────────────────────────────────────────┘

     On-demand (called when needed):
     ┌──────────────────────────────┐
     │ ANSWER AGENT                 │
     │  - Q&A with conversation     │
     │  - Can call Research Agent → │
     └──────────────────────────────┘
                  ↓
     ┌──────────────────────────────┐
     │ RESEARCH AGENT               │
     │  - Deep research (~10 min)   │
     │  - Generates MD reports      │
     └──────────────────────────────┘
```

## Agent System Prompts

**All agent system prompts defined as constants in orchestrator.ts:**

```typescript
// src/services/orchestrator.ts

export const PLANNING_SYSTEM_PROMPT = `You are a Planning agent in the COE system.

Your role:
- Break down tasks into atomic steps (15-25 minutes each)
- Generate clear, actionable plans with verification criteria
- Consider dependencies and prerequisites
- Format output as numbered list with success criteria

Output format:
1. [Step description] - Success: [how to verify]
2. [Step description] - Success: [how to verify]
...

Be specific and actionable.`;

export const VERIFICATION_SYSTEM_PROMPT = `You are a Verification agent in the COE system.

Your role:
- Check if code changes meet success criteria
- Return PASS or FAIL with detailed explanation
- Identify specific issues if verification fails
- Suggest fixes for failed verifications

Output format:
PASS: [explanation of what was verified]
or
FAIL: [specific issues found] - Suggested fix: [what to do]

Be thorough and specific.`;

export const ANSWER_SYSTEM_PROMPT = `You are an Answer agent in the COE system.

Your role:
- Answer user questions about code, tasks, and project context
- Be concise but thorough
- If you need deep research (>2 min), suggest using Research Agent
- Stay helpful and friendly
- You have conversation history (up to 5 exchanges)
- Reference prior messages when relevant

Respond in markdown format.`;
```

## Orchestrator Routing Pattern

```typescript
// src/services/orchestrator.ts

class Orchestrator {
    private taskQueue: Task[] = [];
    
    /**
     * Route question to Planning Agent for task breakdown.
     * 
     * **Simple explanation**: Like asking a project manager to create a plan.
     * We send the task description to the LLM with the Planning system prompt,
     * and it returns a step-by-step plan.
     * 
     * @param taskDescription - What needs to be done
     * @returns Detailed plan with numbered steps
     */
    async routeToPlanningAgent(taskDescription: string): Promise<string> {
        await updateStatusBar('$(loading~spin) Planning...', 'Planning Agent active');
        
        try {
            const messages = [
                { role: 'system', content: PLANNING_SYSTEM_PROMPT },
                { role: 'user', content: `Create a plan for: ${taskDescription}` }
            ];
            
            const response = await completeLLM('', { messages });
            
            logInfo('[Orchestrator] Planning Agent response received');
            await updateStatusBar('$(pulse) Ready', 'Planning complete');
            
            return response.content;
            
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[Orchestrator] Planning failed: ${msg}`);
            await updateStatusBar('$(error) Failed', 'Planning failed');
            
            return `[Planning Error: ${msg}]`;
        }
    }
    
    /**
     * Route code changes to Verification Agent.
     * 
     * @param code - Code to verify
     * @param criteria - Success criteria from plan
     * @returns PASS/FAIL with explanation
     */
    async routeToVerificationAgent(code: string, criteria: string): Promise<string> {
        await updateStatusBar('$(loading~spin) Verifying...', 'Verification Agent active');
        
        try {
            const messages = [
                { role: 'system', content: VERIFICATION_SYSTEM_PROMPT },
                { role: 'user', content: `Verify this code:\n\n${code}\n\nCriteria: ${criteria}` }
            ];
            
            const response = await completeLLM('', { messages });
            
            logInfo('[Orchestrator] Verification Agent response received');
            await updateStatusBar('$(pulse) Ready', 'Verification complete');
            
            return response.content;
            
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[Orchestrator] Verification failed: ${msg}`);
            await updateStatusBar('$(error) Failed', 'Verification failed');
            
            return `[Verification Error: ${msg}]`;
        }
    }
    
    /**
     * Route question to Answer Agent with conversation history.
     * 
     * @param question - User's question
     * @param chatId - Optional chat session ID
     * @returns Answer from AI
     */
    async routeToAnswerAgent(question: string, chatId?: string): Promise<string> {
        await updateStatusBar('$(loading~spin) Answering...', 'Answer Agent active');
        
        try {
            const answerAgent = new AnswerAgent();
            const answer = await answerAgent.ask(question, chatId);
            
            logInfo('[Orchestrator] Answer Agent response received');
            await updateStatusBar('$(pulse) Ready', 'Answer complete');
            
            return answer;
            
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[Orchestrator] Answer failed: ${msg}`);
            await updateStatusBar('$(error) Failed', 'Answer failed');
            
            return `[Answer Error: ${msg}]`;
        }
    }
}
```

## Task Queue Management (FIFO)

```typescript
/**
 * Add task to queue for processing.
 * 
 * **Simple explanation**: Like a line at a deli counter. Tasks are processed
 * in the order they arrive (first in, first out). Nobody cuts in line.
 * 
 * @param task - Task to add to queue
 */
async addTask(task: Task): Promise<void> {
    this.taskQueue.push(task);
    logInfo(`[Orchestrator] Task added to queue: ${task.title} (queue length: ${this.taskQueue.length})`);
}

/**
 * Get next task from queue.
 * 
 * @returns Next task or null if queue empty
 */
async getNextTask(): Promise<Task | null> {
    if (this.taskQueue.length === 0) {
        return null;
    }
    
    const task = this.taskQueue.shift()!;
    logInfo(`[Orchestrator] Task dequeued: ${task.title} (${this.taskQueue.length} remaining)`);
    
    return task;
}

/**
 * Check queue status.
 * 
 * @returns Number of pending tasks
 */
getQueueLength(): number {
    return this.taskQueue.length;
}
```

## Autonomous Workflow Pattern

**Auto-processing flow when `coe.autoProcessTickets` enabled:**

```typescript
// src/extension.ts

async function setupAutoPlanning(): Promise<void> {
    onTicketChange(async () => {
        try {
            const config = vscode.workspace.getConfiguration('coe');
            const autoProcessEnabled = config.get<boolean>('autoProcessTickets', false);

            if (!autoProcessEnabled) {
                logInfo('[Auto-Plan] Skipped - Manual mode enabled');
                return;
            }

            const tickets = await listTickets();
            const lastTicket = tickets[0];

            // Only auto-process human → AI tickets
            if (lastTicket.type === 'ai_to_human' && lastTicket.status === 'open') {
                logInfo(`[Auto-Plan] Processing ticket: ${lastTicket.title}`);
                
                const orchestrator = getOrchestratorInstance();
                const plan = await orchestrator.routeToPlanningAgent(lastTicket.title);
                
                await updateTicket(lastTicket.id, {
                    description: plan,
                    status: 'in-progress'
                });
                
                logInfo('[Auto-Plan] Plan stored in ticket description');
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[Auto-Plan] Failed: ${msg}`);
        }
    });
}
```

## Manual vs Autonomous Mode

```typescript
/**
 * Get current processing mode.
 * 
 * @returns 'autonomous' or 'manual'
 */
function getProcessingMode(): 'autonomous' | 'manual' {
    const config = vscode.workspace.getConfiguration('coe');
    const autoProcess = config.get<boolean>('autoProcessTickets', false);
    return autoProcess ? 'autonomous' : 'manual';
}

/**
 * Toggle between autonomous and manual modes.
 */
async function toggleProcessingMode(): Promise<void> {
    const config = vscode.workspace.getConfiguration('coe');
    const current = config.get<boolean>('autoProcessTickets', false);
    
    await config.update('autoProcessTickets', !current, vscode.ConfigurationTarget.Workspace);
    
    const newMode = !current ? 'Autonomous' : 'Manual';
    vscode.window.showInformationMessage(`Switched to ${newMode} mode`);
    
    logInfo(`[Mode] Switched to ${newMode}`);
}
```

## Agent State Tracking

```typescript
// src/ui/agentStatusTracker.ts

export enum AgentStatus {
    IDLE = 'idle',
    ACTIVE = 'active',
    ERROR = 'error'
}

export interface AgentState {
    name: string;
    status: AgentStatus;
    lastActivity: string | null;
    currentTask: string | null;
}

const agentStates: Map<string, AgentState> = new Map();

/**
 * Update agent status.
 * 
 * @param agentName - Name of agent (e.g., 'Planning Agent')
 * @param status - New status
 * @param currentTask - Optional task description
 */
export function updateAgentStatus(
    agentName: string,
    status: AgentStatus,
    currentTask?: string
): void {
    const state: AgentState = {
        name: agentName,
        status: status,
        lastActivity: new Date().toISOString(),
        currentTask: currentTask || null
    };
    
    agentStates.set(agentName, state);
    logInfo(`[Agent Status] ${agentName}: ${status}`);
}

/**
 * Get all agent states for UI display.
 */
export function getAllAgentStates(): AgentState[] {
    return Array.from(agentStates.values());
}
```

## Research Agent Integration

**Research Agent (disabled by default):**

```typescript
/**
 * Route to Research Agent for deep research tasks (~10 min).
 * Only called when explicitly needed by Answer Agent.
 * 
 * @param topic - Research topic
 * @returns Detailed markdown report
 */
async routeToResearchAgent(topic: string): Promise<string> {
    const config = getConfigInstance();
    const enabled = config.agents?.enableResearchAgent ?? false;
    
    if (!enabled) {
        return '[Research Agent disabled. Enable in .coe/config.json]';
    }
    
    await updateStatusBar('$(search) Researching...', 'Research Agent active (~10 min)');
    
    try {
        const researchAgent = new ResearchAgent();
        const report = await researchAgent.research(topic);
        
        await updateStatusBar('$(pulse) Ready', 'Research complete');
        return report;
        
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`[Orchestrator] Research failed: ${msg}`);
        return `[Research Error: ${msg}]`;
    }
}
```

## Workflow Coordination Example

```typescript
/**
 * Full autonomous workflow for a ticket.
 * 
 * **Simple explanation**: Like a factory assembly line. Each step feeds into
 * the next: Plan → Execute → Verify → Mark Done or Create Fix Task.
 */
async processTicketWorkflow(ticketId: string): Promise<void> {
    try {
        // 1. Get ticket
        const ticket = await getTicket(ticketId);
        
        // 2. Planning phase
        logInfo(`[Workflow] Planning ticket: ${ticket.title}`);
        const plan = await this.routeToPlanningAgent(ticket.title);
        await updateTicket(ticketId, { description: plan, status: 'in-progress' });
        
        // 3. Execution phase (Copilot does this via MCP)
        // ... code changes happen here ...
        
        // 4. Verification phase
        logInfo(`[Workflow] Verifying ticket: ${ticket.title}`);
        const verification = await this.routeToVerificationAgent(
            codeChanges,
            ticket.description || ''
        );
        
        // 5. Decision based on verification
        if (verification.startsWith('PASS')) {
            await updateTicket(ticketId, { status: 'done' });
            logInfo(`[Workflow] Ticket completed: ${ticket.title}`);
        } else {
            // Create investigation task
            await createTicket({
                title: `Fix verification failure: ${ticket.title}`,
                description: verification,
                type: 'human_to_ai',
                status: 'open'
            });
            
            await updateTicket(ticketId, { status: 'blocked' });
            logInfo(`[Workflow] Ticket blocked, fix task created`);
        }
        
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`[Workflow] Failed for ticket ${ticketId}: ${msg}`);
        await updateTicket(ticketId, { status: 'blocked' });
    }
}
```

## Common Mistakes

❌ **Don't**: Call agents directly from UI
```typescript
// BAD - bypasses orchestrator
const answerAgent = new AnswerAgent();
const answer = await answerAgent.ask(question);
```

✅ **Do**: Route through orchestrator
```typescript
// GOOD - coordinated by orchestrator
const orchestrator = getOrchestratorInstance();
const answer = await orchestrator.routeToAnswerAgent(question);
```

❌ **Don't**: Hardcode system prompts in agent files
```typescript
// BAD - prompts scattered across files
class PlanningAgent {
    ask(question: string) {
        const prompt = "You are a planning agent..."; // Hardcoded!
    }
}
```

✅ **Do**: Define prompts as constants in orchestrator
```typescript
// GOOD - centralized prompt management
export const PLANNING_SYSTEM_PROMPT = `You are...`;

async routeToPlanningAgent(task: string) {
    const messages = [
        { role: 'system', content: PLANNING_SYSTEM_PROMPT },
        // ...
    ];
}
```

## Related Skills
- **[06-llm-integration.md](06-llm-integration.md)** - LLM calls from agents
- **[07-conversation-management.md](07-conversation-management.md)** - Answer Agent history
- **[01-coe-architecture.md](01-coe-architecture.md)** - Service layer routing
