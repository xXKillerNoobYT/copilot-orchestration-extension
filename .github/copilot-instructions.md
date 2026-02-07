# Agent Instructions for COE

> This file is mirrored across CLAUDE.md, copilot-instructions.md, AGENTS.md, and GEMINI.md so the same instructions load in any AI environment.

## Project Overview

**COE** is a VS Code extension that coordinates AI agents (Planning, Answer, Verification, Research) to execute plan-driven development workflows. The system is designed to operate **fully autonomously** while maintaining optional manual controls.

**Current Status**: Stage 7 - Testing & Advanced Features (62% complete, 273/440 tasks)
**Stages 1-6**: ✅ COMPLETE (Foundation, Tickets, LLM, Agents, Context, UI)
**Current Focus**: MT-033 Planning Wizard, test coverage improvement to 80%+
**Master Plan**: `Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List .md`

---

## The 3-Layer Architecture

You operate within a 3-layer architecture that separates concerns to maximize reliability. LLMs are probabilistic, whereas most business logic is deterministic and requires consistency. This system fixes that mismatch.

**Why this works:** If you do everything yourself, errors compound. 90% accuracy per step = 59% success over 5 steps. The solution is push complexity into deterministic code. That way you just focus on decision-making.

```
Layer 1: Directive (What to do)
├── Master Plan: Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List .md
├── Architecture: Docs/This Program's Plans/01-Architecture-Document.md
├── Agent Roles: Docs/This Program's Plans/02-Agent-Role-Definitions.md
├── Workflows: Docs/This Program's Plans/03-Workflow-Orchestration.md
├── MCP Spec: Docs/This Program's Plans/05-MCP-API-Reference.md
└── Skills: .github/skills/ (patterns, conventions, checklists)

Layer 2: Orchestration (Decision making - YOU)
├── Read directives and understand requirements
├── Call execution tools in the right order
├── Handle errors and ask for clarification when needed
├── Update directives with learnings
└── You're the glue between intent and execution

Layer 3: Execution (Doing the work)
├── src/services/ - Core singleton services
├── src/agents/ - LLM-powered agent logic
├── src/mcpServer/ - JSON-RPC 2.0 integration
├── src/ui/ - TreeDataProviders and webviews
└── src/config/ - Configuration with Zod validation
```

---

## Operating Principles

### 1. Check for existing code/patterns first
Before writing new code, check if patterns exist in `src/` or are documented in `.github/skills/`. Only create new files if none exist. This is your directive.

### 2. Self-anneal when things break
- Read error message and stack trace
- Fix the code and test it again
- Update relevant docs with what you learned (API limits, edge cases, timing)
- Example: Hit an API rate limit → investigate → find batch endpoint → rewrite → test → update directive
- System is now stronger

### 3. Update directives as you learn
Directives are **living documents**. When you discover API constraints, better approaches, common errors, or timing expectations—update the directive:
- Update the relevant skill in `.github/skills/`
- Add notes to the master plan if it affects task estimates
- Don't create or overwrite directives without asking unless explicitly told to
- Directives are your instruction set and must be preserved (and improved upon over time, not extemporaneously used and then discarded)
- Use the skills as a checklist for every task you do—it helps ensure code quality

## Project Structure

```
src/
├── agents/          - LLM-powered agents (answerAgent.ts, researchAgent.ts)
├── config/          - Zod schema validation, loader, singleton
├── errors/          - Error code enums
├── mcpServer/       - JSON-RPC 2.0 server and tools (getNextTask, reportTaskDone, askQuestion)
├── services/        - Singletons (orchestrator.ts, ticketDb.ts, llmService.ts)
├── ui/              - TreeDataProviders, webview panels, status bar
├── extension.ts     - VS Code entry point
└── logger.ts        - Logging service

tests/
├── __mocks__/       - VS Code API mocks
├── agents/          - Agent tests
├── config/          - Config system tests
├── mcpServer/       - MCP server and tool tests
└── services/        - Service tests

.github/skills/      - 12+ Copilot skill documents (patterns, conventions)
Docs/This Program's Plans/  - Architecture docs, master plan, agent specs
```

## Critical Patterns

### Singleton Service Pattern
All core services follow this exact pattern (see `.github/skills/02-service-patterns.md`):

```typescript
let instance: ServiceClass | null = null;

export async function initializeService(context: vscode.ExtensionContext): Promise<void> {
    if (instance !== null) throw new Error('Already initialized');
    instance = new ServiceClass();
    await instance.init(context);
}

export function getServiceInstance(): ServiceClass {
    if (!instance) throw new Error('Not initialized');
    return instance;
}

export function resetServiceForTests(): void {
    instance = null;
}
```

### Initialization Order (Critical)
Services must initialize in this order due to dependencies:
1. Logger (required by all others)
2. Config (required by services)
3. TicketDb (database)
4. LLMService (LLM calls)
5. Orchestrator (depends on all above)
6. UI Providers (last)

### Test Naming Convention
Prefix all test descriptions with `"Test N: "` for sequential tracking:
```typescript
it('Test 1: should initialize with default timeout', ...)
it('Test 2: should load timeout from config when present', ...)
```

### JSDoc Style
All public functions include "Simple explanation" for beginners:
```typescript
/**
 * Brief technical summary.
 *
 * **Simple explanation**: Beginner-friendly analogy or metaphor.
 */
```

### Error Handling
Use typed catch blocks:
```typescript
catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`Failed: ${msg}`);
}
```

## Build & Test Commands

```bash
npm run watch       # TypeScript watch mode (run FIRST during development)
npm run compile     # One-time build
npm run test        # Jest in watch mode
npm run test:once   # Single test run (for CI)
npm run lint        # ESLint
```

**IMPORTANT**: Always run `npm run watch` in background. VS Code debugger won't work without compiled `out/` folder.

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/extension.ts` | Entry point, registers commands/providers |
| `src/services/orchestrator.ts` | Task routing, agent coordination, system prompts |
| `src/services/ticketDb.ts` | SQLite CRUD + EventEmitter for changes |
| `src/services/llmService.ts` | LLM API client with streaming |
| `src/agents/answerAgent.ts` | Conversational Q&A with history pruning |
| `src/mcpServer/mcpServer.ts` | JSON-RPC server for Copilot integration |
| `src/config/` | Zod schema, loader, singleton service |

## Skills Reference

When implementing features, reference these skills in `.github/skills/`:

| Task | Skills |
|------|--------|
| Creating a new service | 02, 10, 11 |
| Adding a TreeView | 05, 09 |
| Writing tests | 03, 14 |
| LLM integration | 06, 07, 10 |
| MCP tools | 08, 09 |
| Agent coordination | 12, 02 |
| Database operations | 13, 11 |
| Documentation | 04 |

## Current Development Focus

**Stage 7: Testing & Advanced Features**
- 7/176 tasks complete (4.0%) - Stage just started
- MT-030 Custom Agent Builder: ✅ COMPLETE (22/22 tasks)
- Current focus: MT-033 Planning Wizard, test coverage to 80%+
- Recently completed: Agent execution framework, routing, metrics, gallery UI

**Completed Stages:**
- ✅ Stage 1: Foundation (MCP server, config, error handling)
- ✅ Stage 2: Ticket System (SQLite CRUD, EventEmitter, concurrency)
- ✅ Stage 3: LLM Integration (caching, streaming, Clarity Agent)
- ✅ Stage 4: Agent Teams (Planning, Answer, Verification, Orchestrator)
- ✅ Stage 5: Context & Data Flow (token counting, task queue, dependencies)
- ✅ Stage 6: VS Code UI (9 components, 244+ tests)

See `Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List .md` for full task breakdown.

## Common Pitfalls to Avoid

1. **Don't skip service initialization** - Always call `initializeX()` before using singletons
2. **Don't modify ticket DB directly** - Use `ticketDb.ts` exports (triggers EventEmitter)
3. **Don't forget timeout cleanup** - Use `jest.useRealTimers()` in `afterEach()`
4. **Don't hardcode LLM endpoint** - Read from `.coe/config.json` with fallback defaults
5. **Don't mix Promise styles** - Prefer `async/await` over `.then()` chains

## LLM Setup (for Agent Features)

1. Install [LM Studio](https://lmstudio.ai) and download `ministral-3-14b-reasoning`
2. Start LM Studio server (default: `http://127.0.0.1:1234/v1`)
3. Configure `.coe/config.json`:
```json
{
  "llm": {
    "endpoint": "http://127.0.0.1:1234/v1",
    "model": "ministral-3-14b-reasoning",
    "timeoutSeconds": 60,
    "maxTokens": 2048
  }
}
```

## Self-Annealing Loop

Errors are learning opportunities. When something breaks:
1. Fix the code
2. Update tests
3. Verify tests pass
4. Update skill docs or directives with new learnings
5. System is now stronger

---

## File Organization

**Directory structure:**
- `src/` - TypeScript source (the deterministic execution layer)
- `tests/` - Jest test suites
- `out/` - Compiled JavaScript (intermediate, regenerated)
- `coverage/` - Test coverage reports (intermediate)
- `.coe/config.json` - Configuration (like .env for this project)
- `Docs/This Program's Plans/` - Directives (SOPs, architecture docs)
- `.github/skills/` - Patterns and checklists

**Key principle:** Local temp files are only for processing. Everything in `out/` and `coverage/` can be deleted and regenerated.

---

**Full Documentation**: `.github/copilot-instructions.md`
**Skills Index**: `.github/skills/README.md`
**Master Plan**: `Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List .md`
