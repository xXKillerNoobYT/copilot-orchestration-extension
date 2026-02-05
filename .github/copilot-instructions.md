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

## 🚀 Quick Command Reference

### Development
```bash
npm run watch      # TypeScript watch (run FIRST in background)
npm run test       # Jest watch mode (run alongside watch)
npm run test:once  # Single test run
npm run lint       # ESLint check
npm run compile    # One-time TypeScript build
```

### LM Studio Setup
1. Download [LM Studio](https://lmstudio.ai)
2. Load `ministral-3-14b-reasoning` model
3. Start server (default: `http://127.0.0.1:1234/v1`)
4. Set in `.coe/config.json`:
   ```json
   {
     "llm": {
       "endpoint": "http://127.0.0.1:1234/v1",
       "model": "ministral-3-14b-reasoning"
     }
   }
   ```
5. Check output: VS Code → Output → "COE Logs"

### Debugging
- Press F5 → VS Code Extension Development Host launches
- Check "COE Logs" output panel for runtime logs
- Inspect `.coe/tickets.db` with SQLite browser if needed

## 🎯 Critical Skills to Know

**Start here if new to project:**

- **[01-coe-architecture.md](skills/01-coe-architecture.md)** - System overview
- **[02-service-patterns.md](skills/02-service-patterns.md)** - Core pattern
- **[03-testing-conventions.md](skills/03-testing-conventions.md)** - Test setup
- **[12-agent-coordination.md](skills/12-agent-coordination.md)** - Agent routing
- **[20-noob-proofing.md](skills/20-noob-proofing.md)** - Beginner guide

**Full skills index:** [skills/README.md](skills/README.md) (28 skills total)
**Quality control skills (NEW):**
- **[23-plan-drift-detection.md](skills/23-plan-drift-detection.md)** - Detect deviations from plan
- **[24-observation-skill.md](skills/24-observation-skill.md)** - Monitor patterns and behavior
- **[25-fixing-plan-drift.md](skills/25-fixing-plan-drift.md)** - Correct drift and realign
- **[26-safety-checklist.md](skills/26-safety-checklist.md)** - Pre-commit safety checks
## 🎯 Plan Verification (CRITICAL)

**Always verify code matches plan to minimize drift.**

### Before Writing Code
1. Read plan completely
2. Understand success criteria
3. Note patterns to follow
4. Identify dependencies

### During Implementation
1. Keep plan visible
2. Check off completed steps
3. Ask before adding features
4. Verify patterns match skills

### Before Committing
1. Re-read original plan
2. Verify all requirements met
3. Check no extra features added
4. Run safety checklist (skill 26)
5. Detect any drift (skill 23)

### If Drift Detected
1. Stop immediately
2. Document deviation (skill 23)
3. Decide: fix code OR fix plan (skill 25)
4. Get approval from orchestrator
5. Correct and re-verify

**Key principle**: Code that doesn't match plan creates confusion, bugs, and maintenance burden. Always verify alignment.

## 🔍 Where to Find Answers

| Question | Resource |
|----------|----------|
| How does COE system work? | Docs/This Program's Plans/01-Architecture-Document.md |
| How do agents coordinate? | .github/skills/12-agent-coordination.md |
| What patterns should I follow? | .github/skills/ (all 28 skills) |
| How do I write tests? | .github/skills/03-testing-conventions.md |
| What's the plan/roadmap? | PRD.md |
| How do I debug? | .github/skills/15-dev-workflows.md |
| What are common mistakes? | .github/skills/14-common-pitfalls.md |
| New to the project? | .github/skills/20-noob-proofing.md |
| How do I detect plan drift? | .github/skills/23-plan-drift-detection.md |
| How do I fix drift? | .github/skills/25-fixing-plan-drift.md |
| What should I check before commit? | .github/skills/26-safety-checklist.md |
| How do I update PROJECT-BREAKDOWN? | .github/skills/27-project-breakdown-maintenance.md |
| How do I validate user requests? | .github/skills/28-user-request-validation.md |
| User asking to do blocked task? | .github/skills/28-user-request-validation.md |
| How do I validate user requests? | .github/skills/28-user-request-validation.md |
| User asking to do blocked task? | .github/skills/28-user-request-validation.md |

## 📊 Testing Requirements

**Coverage target**: 85%+ for all metrics (lines, branches, functions, statements)

**Current**: 70%+ ✅ (in progress toward 85%)

**Test naming**: All tests must start with "Test N:" for sequential tracking
- Example: `it('Test 1: should initialize...')`
- Example: `it('Test 2: should handle error...')`

**Setup pattern**: All services follow singleton initialization
```typescript
beforeEach(() => {
    jest.clearAllMocks();
    resetServiceForTests(); // Reset singleton
});

afterEach(() => {
    jest.useRealTimers(); // Clean up timers
});
```

## 🐛 Troubleshooting

### "Service not initialized" Error
**Fix**: Ensure service `initialize()` called in `extension.ts` activate() before use
- Check order: Config → TicketDb → Orchestrator → UI
- Check: All services initialized before any features used

### Tests timeout or fail unexpectedly
**Fix**: Tests leaking fake timers from previous test
- Add `jest.useRealTimers()` in every afterEach()
- Add singleton reset: `resetServiceForTests()` in every beforeEach()

### LLM responses incomplete or timeout
**Fix**: Check LM Studio is running
```bash
# Test if endpoint is up
curl http://127.0.0.1:1234/v1/models
```
- Verify model loaded in LM Studio UI
- Check `.coe/config.json` endpoint URL matches

### TreeView not updating
**Fix**: Service didn't trigger EventEmitter
- Check service calls `onDataChange()` listener
- Check UI provider subscribed to listener
- Check `_onDidChangeTreeData.fire()` called in provider

### SQLite database locked error  
**Fix**: Multiple instances accessing database
- Ensure only ONE `ticketDb` singleton
- Check `beforeEach()` calls `resetServiceForTests()`
- Check no background processes accessing `.coe/tickets.db`

## 📈 Performance Baselines

These are expected performance metrics for healthy COE:

| Operation | Expected | Alert if > |
|-----------|----------|-----------|
| Plan generation | 25s avg | 45s |
| Agent response | 8.5s avg | 15s |
| Verification check | 4s avg | 8s |
| Extension startup | 1.8s | 3s |
| DB query (100 tickets) | 50ms | 200ms |

If performance degrades:
1. Check CPU usage (background processes?)
2. Check memory usage (memory leak?)
3. Profile with Chrome DevTools
4. See: `.github/skills/15-dev-workflows.md` for profiling guide

## 🎓 Learning Path

**Week 1**: Foundation
- Read README.md (5 min)
- Read .github/skills/README.md (5 min)
- Read this file end-to-end (15 min)
- Read .github/skills/01-coe-architecture.md (20 min)
- Read .github/skills/02-service-patterns.md (20 min)

**Week 2**: Patterns
- Read .github/skills/03-testing-conventions.md (20 min)
- Read .github/skills/12-agent-coordination.md (15 min)
- Try to write a simple test
- Review one test file in tests/ directory

**Week 3**: Deep Dive
- Pick two skills from .github/skills/ that interest you
- Read them thoroughly
- Write code using those patterns
- Get code review from team

**Week 4+**: Contribute
- Understand full COE system
- Take on small tasks
- Fix bugs
- Add new features

---

**Last Updated**: February 4, 2026  
**Maintained By**: COE Development Team

I a noob Programmer m still learning and exploring the world of coding. My journey has just begun, and I am excited to dive deeper into programming languages, frameworks, and best practices. I understand that making mistakes is part of the learning process, and I am eager to improve my skills through practice and perseverance.
