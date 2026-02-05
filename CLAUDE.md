# Claude Code Instructions for COE

> This file provides Claude Code with context about the Copilot Orchestration Extension (COE) project.

## Project Overview

**COE** is a VS Code extension that coordinates AI agents (Planning, Answer, Verification, Research) to execute plan-driven development workflows. The system is designed to operate **fully autonomously** while maintaining optional manual controls.

**Current Status**: Stage 1 - Foundation & Core Infrastructure (33.3% complete, 9/27 tasks)
**Master Plan**: `Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List .md`

## The 3-Layer Architecture

COE follows a separation of concerns that maximizes reliability:

```
Layer 1: Directive (What to do)
├── Master Plan: Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List .md
├── Architecture: Docs/This Program's Plans/01-Architecture-Document.md
├── Agent Roles: Docs/This Program's Plans/02-Agent-Role-Definitions.md
├── Workflows: Docs/This Program's Plans/03-Workflow-Orchestration.md
└── MCP Spec: Docs/This Program's Plans/05-MCP-API-Reference.md

Layer 2: Orchestration (Decision making - YOU)
├── Read directives and understand requirements
├── Call execution tools in the right order
├── Handle errors and update directives with learnings
└── Reference skills in .github/skills/ for patterns

Layer 3: Execution (Doing the work)
├── src/services/ - Core singleton services
├── src/agents/ - LLM-powered agent logic
├── src/mcpServer/ - JSON-RPC 2.0 integration
├── src/ui/ - TreeDataProviders and webviews
└── src/config/ - Configuration with Zod validation
```

**Why this works:** LLMs are probabilistic; business logic is deterministic. By pushing complexity into tested TypeScript code, you focus on decision-making while execution remains reliable.

## Operating Principles

### 1. Check existing code first
Before writing new code, check if patterns exist in `src/` or are documented in `.github/skills/`. Only create new files if none exist.

### 2. Self-anneal when things break
- Read error message and stack trace
- Fix the code and test it again
- Update relevant docs with what you learned (API limits, edge cases, timing)
- Example: Hit an API rate limit → investigate → find batch endpoint → rewrite → test → update directive

### 3. Update docs as you learn
When you discover constraints, better approaches, or common errors:
- Update the relevant skill in `.github/skills/`
- Add notes to the master plan if it affects task estimates
- Don't overwrite directives without asking unless explicitly told to

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

**Stage 1: Foundation & Core Infrastructure**
- 9/27 tasks complete (33.3%)
- Recently completed: Config system with Zod validation (MT-001.10)
- Current blocker: MT-001.11 (Config imports in all services)

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

When something breaks:
1. Fix the code
2. Update tests
3. Verify tests pass
4. Update skill docs or directives with new learnings
5. System is now stronger

---

**Full Documentation**: `.github/copilot-instructions.md`
**Skills Index**: `.github/skills/README.md`
**Master Plan**: `Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List .md`
