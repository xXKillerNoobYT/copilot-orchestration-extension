# Copilot Orchestration Extension (COE) - AI Coding Instructions

## Project Overview

**COE** is a VS Code extension that coordinates AI agents (Planning, Answer, Verification, Research) to execute plan-driven development workflows. The system uses:
- **MCP Server** (JSON-RPC 2.0 over stdio) for GitHub Copilot integration
- **SQLite ticket system** for task management with human↔AI workflow
- **LM Studio integration** for LLM-powered agent responses (OpenAI-compatible API)
- **Multi-agent orchestration** with specialized roles and streaming responses

### Core Design Philosophy: Autonomous AI Assistant

**COE is designed to operate fully autonomously** without requiring any user input. The system:
- ✅ **Autonomous mode**: AI agents coordinate and execute tasks independently
- ✅ **Zero-touch workflow**: Plans → Executes → Verifies without human intervention
- ✅ **Full user integration**: Optional manual controls feel natural when needed
- ✅ **Dual-mode operation**: Toggle between autonomous (`coe.autoProcessTickets`) and manual modes

This unique architecture allows AI to drive development autonomously while maintaining seamless user control when desired.

## Architecture (3-Layer Design)

```
┌─────────────────────────────────────────┐
│ VS Code UI Layer                        │
│ - Tree Providers (Agents/Tickets/Convos)│
│ - Commands & Status Bar                 │
│ - extension.ts (activation entry point) │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ Services Layer (Singletons)             │
│ - orchestrator.ts (routing & queue)     │
│ - ticketDb.ts (SQLite persistence)      │
│ - llmService.ts (streaming LLM calls)   │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ Integration Layer                       │
│ - mcpServer.ts (JSON-RPC for Copilot)   │
│ - answerAgent/researchAgent (LLM logic) │
└─────────────────────────────────────────┘
```

**Key architectural notes:**
- All core services use **singleton pattern** with `initializeX()` + `getXInstance()` exports
- `extension.ts` exports `updateStatusBar()` for orchestrator to update UI (circular dependency workaround)
- Agent system prompts defined as constants in `orchestrator.ts` (e.g., `PLANNING_SYSTEM_PROMPT`)
- TreeDataProviders use EventEmitters to auto-refresh on data changes
- **GitHub Issues sync**: Planned feature (not yet implemented) - see `Docs/01-Architecture-Document.md` for future roadmap

## Critical Developer Workflows

### Build & Test
```bash
npm run watch       # TypeScript watch mode (for development) - run this FIRST
npm run compile     # One-time build (for prepublish)
npm run test        # Jest in watch mode (run alongside watch)
npm run test:once   # Single test run (for CI/pipelines)
npm run lint        # ESLint for .ts files in src/
```

**IMPORTANT**: Always run `npm run watch` in background during development. VS Code debugger won't work without compiled `out/` folder.

### LLM Setup (Required for Agent Features)
1. Install [LM Studio](https://lmstudio.ai) and download `ministral-3-14b-reasoning`
2. Start LM Studio server (default: `http://127.0.0.1:1234/v1`)
3. Configure `.coe/config.json` in workspace:
```json
{
  "llm": {
    "endpoint": "http://192.168.1.205:1234/v1",  // Update IP if remote
    "model": "ministral-3-14b-reasoning",
    "timeoutSeconds": 60,
    "maxTokens": 2048
  }
}
```
4. View LLM output: VS Code Output panel → "COE Logs"

**Troubleshooting tip**: If tests fail with "fetch not defined", verify Node.js ≥ 18 (native fetch support required).

### Debugging
- Press F5 to launch Extension Development Host
- COE activates on `onStartupFinished` (see `activationEvents` in package.json)
- Check "COE Logs" in Output panel for runtime logs
- Inspect ticket database: `.coe/tickets.db` (SQLite browser recommended)

## Project-Specific Conventions

### Code Style & Documentation
- **JSDoc with "Simple explanation"**: All public functions include:
  ```typescript
  /**
   * Brief technical summary.
   * 
   * **Simple explanation**: Beginner-friendly analogy or metaphor.
   */
  ```
  Example: `updateStatusBar()` in `extension.ts` compares status bar to "elevator floor display"

- **Test naming**: Prefix all test descriptions with `"Test N: "` for sequential tracking
  ```typescript
  it('Test 1: should initialize with default timeout when config missing', ...)
  it('Test 2: should load timeout from config.json when present', ...)
  ```

- **Error handling**: Use typed catch blocks:
  ```typescript
  catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logError(`Failed: ${msg}`);
  }
  ```

### Service Initialization Pattern
All services follow this singleton pattern:
```typescript
// service.ts
let instance: ServiceClass | null = null;

export async function initializeService(context: vscode.ExtensionContext): Promise<void> {
    instance = new ServiceClass();
    await instance.init();
}

export function getServiceInstance(): ServiceClass {
    if (!instance) throw new Error('Service not initialized');
    return instance;
}

// For tests only
export function resetServiceForTests(): void {
    instance = null;
}
```

### Agent Conversation History
- `answerAgent.ts` maintains per-chat-ID conversation history using `Map<string, ConversationMetadata>`
- Limit: `MAX_HISTORY_EXCHANGES = 5` (5 user + 5 assistant = 10 messages + system prompt)
- Auto-prune old messages to prevent context overflow
- New conversation starts when no `chatId` provided

### Ticket System Workflow
1. User creates ticket via UI → SQLite insert
2. Auto-planning triggers (if `coe.autoProcessTickets` enabled):
   - `onTicketChange()` listener fires
   - Orchestrator routes to Planning Agent (LLM call)
   - Plan stored in ticket `description` field
3. Verification checks ticket against success criteria
4. Manual mode: tickets stay "Pending" until user clicks "Process This Ticket"

### Agent Coordination Workflow (Orchestrator)

**Recommended agent coordination pattern** managed by `orchestrator.ts`:

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

**Flow details:**
1. **Planning → Verification**: Standard autonomous flow (recommended)
   - Planning generates task breakdown
   - System executes tasks
   - Verification validates completion
   - Loop continues until PASS

2. **Answer Agent**: Called on-demand for questions
   - Maintains conversation history per `chatId`
   - Available via MCP `askQuestion` method
   - Can escalate to Research Agent for deep dives

3. **Research Agent**: Invoked by Answer Agent when needed
   - Time-intensive operations (~10 min)
   - Disabled by default (`coe.enableResearchAgent: false`)
   - Generates detailed markdown reports

**Implementation notes:**
- Orchestrator routes via `routeToPlanningAgent()`, `routeToVerificationAgent()`, `routeToAnswerAgent()`
- Agent system prompts in `orchestrator.ts`: `PLANNING_SYSTEM_PROMPT`, `VERIFICATION_SYSTEM_PROMPT`, `ANSWER_SYSTEM_PROMPT`
- Answer Agent can call Research Agent via internal routing (not exposed to MCP directly)

## Integration Points & Communication Patterns

### MCP Server (Copilot ↔ Extension)
- **Protocol**: JSON-RPC 2.0 over stdio (stdin/stdout)
- **Location**: `src/mcpServer/mcpServer.ts`
- **Key methods**:
  - `getNextTask` → Fetches pending task from orchestrator queue
  - `askQuestion` → Routes to Answer Agent with LLM streaming
  - `reportTaskDone` → Marks ticket as complete in DB

**Testing note**: MCP server uses dependency injection for streams:
```typescript
const server = new MCPServer(mockInputStream, mockOutputStream);
```

### LLM Service (Extension → LM Studio)
- **Protocol**: OpenAI-compatible HTTP API (`/v1/chat/completions`)
- **Streaming**: Server-Sent Events (SSE) with inactivity timeout
- **Functions**:
  - `completeLLM(messages)` → One-shot request (returns full string)
  - `streamLLM(messages, onChunk, onDone)` → Streaming with callbacks
- **Error handling**: Catches fetch errors and returns fallback messages (never throws)

### UI Update Pattern (Services → TreeView)
1. Service modifies data (e.g., ticket status changed)
2. Service calls registered listeners via EventEmitter:
   ```typescript
   ticketDb.onTicketChange(() => { /* refresh UI */ })
   ```
3. TreeDataProvider fires `_onDidChangeTreeData.fire()`
4. VS Code auto-refreshes tree view

**Example**: `agentStatusTracker.ts` broadcasts status changes → `agentsTreeProvider.ts` refreshes agents list

## Testing Strategy

### Test Setup Pattern
```typescript
describe('Service Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetServiceForTests();  // Reset singleton
        mockFs.existsSync.mockReturnValue(false);  // Default: no config
    });
    
    afterEach(() => {
        jest.useRealTimers();  // Clean up fake timers
    });
});
```

### Mocking VS Code API
- All tests import from `tests/__mocks__/vscode.ts`
- Mock includes: `window.createOutputChannel`, `TreeItem`, `TreeItemCollapsibleState`
- Configuration: `jest.config.js` → `moduleNameMapper: { '^vscode$': '<rootDir>/tests/__mocks__/vscode.ts' }`

### Coverage Requirements
- **Target**: 80% coverage for lines, branches, functions, and statements
- **Current threshold**: 0% (transitional - incrementally raising to 80%)
- **Requirement**: All new code must maintain or improve coverage toward 80% target
- Run coverage: `npm run test:once -- --coverage`
- Coverage reports: `coverage/lcov-report/index.html`

**Note**: Update `jest.config.js` → `coverageThreshold.global` as coverage improves to enforce the 80% requirement.

## Key Files & Their Purposes

| File | Purpose | Notes |
|------|---------|-------|
| `src/extension.ts` | Entry point, registers commands/providers | Exports `updateStatusBar()` for orchestrator |
| `src/services/orchestrator.ts` | Task routing, queue management, agent coordination | Contains all agent system prompts |
| `src/services/ticketDb.ts` | SQLite CRUD + EventEmitter for ticket changes | Uses in-memory fallback if DB unavailable |
| `src/services/llmService.ts` | LLM API client with streaming support | Implements inactivity timeout (default 60s) |
| `src/agents/answerAgent.ts` | Conversational Q&A with history pruning | Max 5 exchanges per chat |
| `src/mcpServer/mcpServer.ts` | JSON-RPC server for Copilot integration | Uses stdio transport |
| `src/ui/agentsTreeProvider.ts` | VS Code TreeView for agent status display | Auto-refreshes on status changes |
| `tests/__mocks__/vscode.ts` | Mock VS Code API for Jest tests | Required for all tests |

## Common Patterns to Follow

### Adding a New Command
1. Add command to `package.json` → `contributes.commands`
2. Register handler in `extension.ts` → `context.subscriptions.push(...)`
3. Call relevant service via singleton getter (e.g., `getOrchestratorInstance()`)
4. Update UI via TreeDataProvider refresh or status bar

### Adding a New Agent
1. Create `src/agents/newAgent.ts` with system prompt constant
2. Add orchestrator routing method (e.g., `routeToNewAgent()`)
3. Add enable/disable config in `package.json` → `coe.enableNewAgent`
4. Register status tracking in `agentStatusTracker.ts`
5. Write Jest tests with `tests/newAgent.test.ts`

### Config Changes
- Workspace config: `.coe/config.json` (gitignored, user-specific)
- Extension settings: `package.json` → `contributes.configuration`
- Access at runtime: `vscode.workspace.getConfiguration('coe').get<T>('key')`

## Documentation References

- **Architecture deep-dive**: `Docs/This Program's Plans/01-Architecture-Document.md`
- **Agent roles**: `Docs/This Program's Plans/02-Agent-Role-Definitions.md`
- **Workflow orchestration**: `Docs/This Program's Plans/03-Workflow-Orchestration.md`
- **MCP integration**: `Docs/This Program's Plans/05-MCP-API-Reference.md`

## Avoid Common Pitfalls

1. **Don't skip service initialization**: Always call `initializeX()` in `extension.activate()` before using singletons
2. **Don't modify ticket DB directly**: Use `ticketDb.ts` exports (triggers EventEmitter properly)
3. **Don't forget timeout cleanup**: Use `jest.useRealTimers()` in `afterEach()` when testing with fake timers
4. **Don't hardcode LLM endpoint**: Always read from `.coe/config.json` with fallback defaults
5. **Don't mix Promise styles**: Prefer `async/await` over `.then()` chains (project convention)

---

**Last Updated**: February 3, 2026  
**Maintained By**: COE Development Team

I a noob Programmer m still learning and exploring the world of coding. My journey has just begun, and I am excited to dive deeper into programming languages, frameworks, and best practices. I understand that making mistakes is part of the learning process, and I am eager to improve my skills through practice and perseverance.
