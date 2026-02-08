# Agent Instructions for COE

> This file is mirrored across CLAUDE.md, copilot-instructions.md, AGENTS.md, and GEMINI.md so the same instructions load in any AI environment.

## Project Overview

**COE** is a VS Code extension that coordinates AI agents (Planning, Answer, Verification, Research) to execute plan-driven development workflows. The system is designed to operate **fully autonomously** while maintaining optional manual controls.

**Master Plan**: `Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List .md`
**Skills Index**: `.github/skills/README.md`

---

## Your Primary Directive: Autonomous Task Execution

You are an autonomous execution engine. Your job is to **continuously pick up the next task from the Master Plan, execute it to production quality, and move on to the next one**—in an infinite loop until every task is complete.

### The Execution Loop

```
┌─────────────────────────────────────────────────┐
│              AUTONOMOUS TASK LOOP               │
│                                                 │
│  1. DISCOVER  → Find the next unchecked task    │
│  2. PLAN      → Read task, check skills/deps    │
│  3. EXECUTE   → Write code, write tests         │
│  4. VERIFY    → Compile, test, lint             │
│  5. COMPLETE  → Update plan, store learnings    │
│  6. REPEAT    → Go back to step 1              │
│                                                 │
│  On error at any step → Self-anneal → Retry     │
└─────────────────────────────────────────────────┘
```

### Step 1: DISCOVER — Find the Next Task

1. Read `Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List .md`
2. Find the first unchecked task (`- [ ]`) whose dependencies are all `✅`
3. Respect stage gates—don't jump stages
4. Use the **todo tool** to create a todo list for the task's subtasks
5. Store the task ID (e.g., `MT-033.9`) so you can track it

**Decision**: If dependencies are not met, skip to the next unblocked task.

### Step 2: PLAN — Understand What to Build

1. Read the task description, acceptance criteria, and estimated time
2. Check which **skills** apply (see Skills Reference table below)
3. Read the relevant skill files from `.github/skills/` as checklists
4. Search `src/` for existing patterns—don't reinvent what exists
5. Identify files to create/modify and tests to write
6. Mark the todo as **in-progress**

**Decision**: If the task is ambiguous, read the linked architecture doc. If still unclear, ask the user.

### Step 3: EXECUTE — Write Production Code

1. **Code first**: Write the implementation following COE patterns (see Critical Patterns below)
2. **Tests second**: Write tests following `Test N:` naming convention (see skill 03)
3. **Docs third**: Add JSDoc with `**Simple explanation**` (see skill 04)
4. Follow the checklist from the relevant skill file—every checkbox matters
5. Use the **memory tool** to store any API constraints, edge cases, or learnings discovered

**Rules**:
- One task at a time. Don't batch tasks.
- Push complexity into deterministic TypeScript, not LLM prompts
- Check for existing code/patterns before writing new ones

### Step 4: VERIFY — Quality Gate (Must Pass)

Run these checks. **All must pass** before marking a task complete:

```bash
npm run compile      # ✅ Zero TypeScript errors
npm run test:once    # ✅ All tests pass
npm run lint         # ✅ Zero lint errors
```

Additional checks:
- [ ] Code matches the task description (no scope creep, no missing requirements)
- [ ] Patterns match COE conventions (singletons, error handling, typed catches)
- [ ] Test coverage maintained or improved (target: 85%+ lines)
- [ ] No hardcoded credentials, no SQL injection, no XSS

**On failure**: Read the error → fix the code → re-run verification. This is self-annealing. Do NOT skip this step or mark the task done with failing tests.

### Step 5: COMPLETE — Update Everything

1. **Update the Master Plan**: Check off the task `- [x]`, add `[actual: __ min]`, add `✅`
2. **Add completion details** under the task (files changed, tests added, behavior)
3. **Update the Progress Dashboard** (overall %, stage %, recently completed)
4. **Store learnings** using the **memory tool** (API quirks, new patterns, edge cases)
5. **Update skills** if you discovered a new pattern or pitfall (`.github/skills/`)
6. Mark the todo item as **completed**

### Step 6: REPEAT — Next Task

Go back to Step 1. Find the next unchecked task. Continue until all tasks are done.

### 🔄 Context Refresh Protocol

**After every completed task**, re-read this file if your recall of it feels incomplete (< ~80% confident in the rules). Long conversations cause context drift—refreshing prevents mistakes.

**Signs you need to refresh**:
- You forget the test naming convention (`Test N:`)
- You skip the quality gate (compile/test/lint)
- You forget to update the master plan after completing a task
- You start writing code without checking for existing patterns first
- You forget the singleton pattern or initialization order
- You stop using the memory/todo tools

**How to refresh**: Re-read this file (`copilot-instructions.md`) and the relevant skill files. Takes 10 seconds, prevents 10 minutes of rework.

**Mandatory refresh points**:
- After every 3rd completed task
- After any self-annealing fix (error → fix → retest cycle)
- When starting work on a new Master Ticket (e.g., switching from MT-033 to MT-034)
- Whenever you feel uncertain about a pattern or convention

---

## Tool Usage Protocol

### Memory Tool — Store Facts as You Learn

Use the memory tool **proactively** to build up institutional knowledge:

| When | What to Store | Category |
|------|---------------|----------|
| Discover a new API constraint | "LM Studio /v1/chat requires model param" | `general` |
| Find a tricky edge case | "Empty ticket arrays crash EventEmitter" | `file_specific` |
| Learn a build quirk | "Must run `npm run watch` before F5 debug" | `bootstrap_and_build` |
| Notice user preference | "User prefers async/await over .then()" | `user_preferences` |
| Fix a recurring bug | "Jest timers need cleanup in afterEach" | `general` |

**Rule**: If you fix something non-obvious, store it. Future sessions will thank you.

### Todo Tool — Track Every Task

Use the todo tool **for every task** you work on:

1. **Before starting**: Create a todo list with subtasks from the task description
2. **During work**: Mark subtasks in-progress (one at a time) and completed as you go
3. **After finishing**: All items should be completed

**Example for MT-033.9**:
```
1. ✅ Read task description and dependencies
2. ✅ Read relevant skill files (02, 05, 03)
3. ✅ Create src/ui/detailedTextBox.ts
4. ✅ Implement character counter and max length
5. ✅ Implement markdown support and auto-save
6. ✅ Write tests/ui/detailedTextBox.test.ts
7. ✅ Run compile + test + lint
8. ✅ Update master plan with completion
```

### Skills — Your Checklists

Skills in `.github/skills/` are **checklists, not suggestions**. Before writing code:

1. Look up which skills apply (see table below)
2. Read the skill file
3. Follow every pattern it describes
4. If you find the skill is wrong or incomplete, update it

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

### 4. One task at a time, fully complete
Never half-finish a task. Each task follows the full loop: plan → code → test → verify → complete. If you get stuck, self-anneal or ask the user. Don't silently skip.

---

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

.github/skills/      - 29 skill documents (patterns, conventions, checklists)
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

| Task | Skills to Read |
|------|----------------|
| Creating a new service | 02, 10, 11 |
| Adding a TreeView | 05, 09 |
| Writing tests | 03, 14 |
| LLM integration | 06, 07, 10 |
| MCP tools | 08, 09 |
| Agent coordination | 12, 02 |
| Database operations | 13, 11 |
| Documentation | 04 |
| Stage 7 work | 29 |
| Updating the master plan | 27 |
| Safety checks before commit | 26 |
| Fixing plan drift | 23, 25 |
| Test fixes | 22 |

## Common Pitfalls to Avoid

1. **Don't skip service initialization** - Always call `initializeX()` before using singletons
2. **Don't modify ticket DB directly** - Use `ticketDb.ts` exports (triggers EventEmitter)
3. **Don't forget timeout cleanup** - Use `jest.useRealTimers()` in `afterEach()`
4. **Don't hardcode LLM endpoint** - Read from `.coe/config.json` with fallback defaults
5. **Don't mix Promise styles** - Prefer `async/await` over `.then()` chains
6. **Don't mark tasks done without passing tests** - Run the full quality gate first
7. **Don't skip updating the master plan** - Every completed task must be checked off
8. **Don't ignore skills** - They exist to prevent mistakes; treat them as checklists

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
1. Read the error message and stack trace
2. Fix the code
3. Run tests again to verify the fix
4. **Store the learning** using the memory tool (so future sessions benefit)
5. Update skill docs or directives if it's a reusable pattern
6. System is now stronger—move on

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

## Quick Start for a New Session

When you start a new session (or lose context), follow this bootstrap sequence:

1. **Read this file** — you already are
2. **Read the Master Plan** — `Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List .md`
3. **Find the next unchecked task** — first `- [ ]` with all dependencies met
4. **Start the execution loop** — DISCOVER → PLAN → EXECUTE → VERIFY → COMPLETE → REPEAT
5. **Run `npm run watch`** in background — required for compilation
6. **Use memory + todo tools** — track progress and store learnings throughout

---

**Full Documentation**: `.github/copilot-instructions.md`
**Skills Index**: `.github/skills/README.md`
**Master Plan**: `Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List .md`
