# Skill 16: Tips & Important Information Tracking

> Capture tips, constraints, and important context the user shares that isn't in the formal plan.

## Why This Matters

Users share critical operational knowledge during conversations that doesn't fit neatly into architecture docs or task descriptions. Things like "LM Studio is on a separate machine", "don't install on this computer", or "the model needs step-by-step guidance". If this information is lost between sessions, mistakes get repeated.

## Where To Store Tips

**File**: `Docs/TIPS-AND-LEARNINGS.md`

This is a living document. Append new learnings, never overwrite existing ones.

## Format

```markdown
## [Category]

### [Date] - [Brief Title]
**Source**: User / Discovery / Error
**Context**: What was happening when this was learned
**Tip**: The actual information
**Impact**: How this affects development
```

## Categories

### Infrastructure & Environment
- Machine specs, network topology, what runs where
- Software versions, limitations, workarounds
- "Don't install X on Y" type constraints

### LM Studio / LLM Operations
- Which models work best for which tasks
- Timeout values that work in practice
- Structured output requirements
- Prompt patterns that get good results from small models
- The LLM is for guiding, not coding - agents guide a coding agent

### Development Workflow
- Build quirks, test patterns that fail intermittently
- Files that shouldn't be modified without asking
- Preferred coding patterns not in the style guide

### Project Organization
- Where files should go (root cleanup rules)
- Documentation update expectations
- When to ask vs. when to proceed

## Rules

1. **Always save tips immediately** - Don't wait until end of session
2. **Never overwrite** - Append with date stamps
3. **Include context** - A tip without context is half a tip
4. **Cross-reference** - If a tip affects a skill, update that skill too
5. **User tips override defaults** - If the user says "use X", that's authoritative

## Current Tips (Seed List)

These tips have been gathered from conversations:

### Infrastructure
- LM Studio runs at `http://192.168.1.205:1234` on a 3rd-party machine
- Do NOT install LM Studio on the development machine (insufficient processing power)
- The LM Studio server is slow - use generous timeouts (900s timeout, 300s startup)

### LLM Usage
- Small models need step-by-step guidance with small prompts
- Agents should provide detailed checklists, not complex instructions
- Test if the LLM can handle a goal before assigning complex tasks
- Consider downloading a small/fast model for testing
- The LLM system is for guiding agents, not for writing code directly
- Structured output may be needed - check LM Studio docs for setup

### Project Organization
- Keep root directory clean (see Skill 15)
- Save important user tips as learnings (this skill)
- Update docs as you learn - directives are living documents
- Don't overwrite directives without asking unless explicitly told to
