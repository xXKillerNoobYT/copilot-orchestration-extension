# Tips & Learnings Log

> Important information gathered from user conversations and development experience.
> See `.github/skills/16-tips-and-learnings.md` for the tracking process.

---

## Infrastructure & Environment

### 2026-02-05 - LM Studio Runs on Separate Machine
**Source**: User
**Context**: Setting up LLM integration for COE extension
**Tip**: LM Studio is hosted at `http://192.168.1.205:1234` on a 3rd-party machine on the local network. Do NOT install LM Studio on the development computer - it doesn't have enough processing power.
**Impact**: All LLM endpoint configs must point to the network address, not localhost. Tests should mock LLM calls, never hit the real server.

### 2026-02-05 - LM Studio Needs Generous Timeouts
**Source**: User
**Context**: LLM calls were timing out during testing
**Tip**: The server is slow. Use 900s (15 min) timeout for operations and 300s (5 min) for startup. These are set in `.coe/config.json`.
**Impact**: Default timeout values in code should be high. Test timeouts should use mocks, not real network calls.

---

## LLM Usage & Agent Design

### 2026-02-05 - Small Models Need Step-by-Step Guidance
**Source**: User
**Context**: Designing agent prompts for the orchestration system
**Tip**: The local LLM models are small (1B-14B params). They need:
- Small, focused prompts (not walls of text)
- Detailed checklists with every step spelled out
- Step-by-step instructions rather than complex reasoning chains
- Testing to verify the model can handle a goal before assigning it
**Impact**: Agent system prompts must be broken into small, digestible instructions. Consider a "prompt chunking" pattern.

### 2026-02-05 - LLM Is for Guiding, Not Coding
**Source**: User
**Context**: Discussing the role of agents in the system
**Tip**: The LLM agents are meant to guide a coding agent (like Copilot) and check work in the background. They don't write code directly. They plan, verify, and research.
**Impact**: Agent role definitions should focus on oversight and guidance, not code generation.

### 2026-02-05 - Consider Structured Output for LM Studio
**Source**: User
**Context**: Improving reliability of LLM responses
**Tip**: LM Studio supports structured output (JSON schemas). This can help small models produce consistent, parseable responses instead of free-form text.
**Impact**: Agent implementations should use structured output schemas where possible. Setup instructions should include how to configure this in LM Studio.

### 2026-02-05 - No Model Loaded by Default
**Source**: User
**Context**: LM Studio server was freshly started
**Tip**: After restarting LM Studio, no model may be loaded. You can load any available model. The `pico-lamma-3.2-1b` is good for fast testing, `ministral-3-14b-reasoning` for real work.
**Impact**: Connection validation should check both server availability AND model loaded status.

---

## Project Organization

### 2026-02-05 - Keep Root Directory Clean
**Source**: User
**Context**: Root folder had accumulated 15+ temp files
**Tip**: Temporary test outputs, debug notes, and progress files should be moved to `.tmp/` or appropriate subdirectories. See Skill 15 for the full cleanup procedure.
**Impact**: Run cleanup after completing major tasks or before PRs.

### 2026-02-05 - Save User Tips as Learnings
**Source**: User
**Context**: Important operational info was being lost between sessions
**Tip**: When the user shares tips or important information not in the formal plan, save it immediately to this file AND update relevant skills.
**Impact**: New skill (16) created for this process. Always append, never overwrite.

---

## Development Workflow

### 2026-02-05 - Always Verify Before Continuing
**Source**: User
**Context**: Starting Stage 1 completion
**Tip**: Before marking tasks as done, verify:
1. Code compiles (`npm run compile`)
2. All tests pass (`npx jest --silent`)
3. Functionality matches the plan's acceptance criteria
**Impact**: Every task completion should include a verification step.

### 2026-02-05 - Update CLAUDE.md with Current Status
**Source**: Discovery
**Context**: CLAUDE.md showed 33.3% Stage 1 but it was actually 100%
**Tip**: Keep CLAUDE.md status section current after completing stages or major milestones.
**Impact**: AI agents reading CLAUDE.md get accurate context about project state.
