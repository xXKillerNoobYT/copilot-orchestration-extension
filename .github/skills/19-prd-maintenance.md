# PRD Maintenance Skill

**Purpose**: Keep Product Requirements Document current with development progress  
**Related Files**: `PRD.md`, issue tracking, project status  
**Keywords**: prd, requirements, roadmap, feature-status, development-progress

## PRD Role

The PRD (Product Requirements Document) is the "north star" - it defines what COE should do and why. Keep it current so everyone knows project direction.

**Simple explanation**: Like a ship's compass. It always shows where you're going. Update it when direction changes.

## PRD Maintenance Tasks

### 1. Track Feature Status

```markdown
## Feature: Auto-Processing Mode

| Status | Details |
|--------|---------|
| Phase | Implementation |
| Completion | 65% |
| Expected | Feb 15, 2026 |
| Blockers | LLM token limit issue |
| Owner | Orchestrator Agent |
```

### 2. Update Requirements as Learning Happens

When team discovers:
- New requirements
- Removed features (no longer needed)
- Changed priorities  
- Technical constraints discovered

Add to PRD with dates and rationale.

### 3. Mark Completed Features

```markdown
### ✅ Complete
- [x] Multi-agent orchestration
- [x] SQLite ticket system
- [x] VS Code extension integration

### 🔄 In Progress
- [ ] Research Agent (advanced mode)
- [ ] Real-time progress dashboard

### ⏳ Planned
- [ ] GitHub Issues sync
- [ ] Slack notifications
```

### 4. Document Design Decisions

Why did we choose this approach?

```markdown
## Decision: Singleton Services

**Decision**: All services use singleton pattern

**Why**: 
- Single source of truth (no multiple instances)
- Easier to test (reset in beforeEach)
- Matches VS Code patterns

**Alternatives Considered**:
- Dependency injection (more flexibility, more complexity)
- Global variables (works but unsafe)

**Date**: 2026-02-01
**Impact**: Architecture decision
```

## PRD Structure

```markdown
# COE Product Requirements Document

## Mission
One-sentence purpose of the project

## Vision  
Where project is headed (6-12 months)

## Core Features
What makes COE unique

## Current Phase
What we're working on now

## Completed Milestones
What's done

## In-Flight Features
Active development items

## Future Roadmap
Nice-to-have features

## Technical Constraints
Limits and boundaries

## Success Metrics
How we measure success
```

## Maintenance Triggers

Update PRD when:

1. **Major milestone achieved**: Mark as complete
2. **Feature deprioritized**: Move to "Future" or remove
3. **New blocker found**: Document impact
4. **Team learns something**: Add to constraints/decisions
5. **Direction changes**: Update vision
6. **Release happens**: Document what shipped

## PRD and Skills Connection

PRD describes **what**, Skills describe **how**.

```
PRD: "Add user authentication to system"
  ↓
Planning Agent (via skill 12-agent-coordination)
  ↓
Generate steps (skill 02-service-patterns shows how)
  ↓
Implement (skill 06-llm-integration, 09-vscode-api)
  ↓
Verify (skill 11-error-handling-patterns)
  ↓
PRD: Mark authentication ✅ Complete
```

## PRD Update Checklist

When significant progress made:

- [ ] Update feature status percentages
- [ ] Move completed items to "Done" section
- [ ] Document any new decisions
- [ ] Update timeline if changed
- [ ] List any new blockers
- [ ] Note what was learned
- [ ] Update metrics if needed
- [ ] Get team feedback

## Example PRD Entry

```markdown
## Feature: Real-Time Agent Status Tracking

**Status**: In Progress (50% complete)

**Description**: Show which agents are active, what they're working on, and progress.

**Requirements**:
- agents-tree-provider updates in real-time
- Shows status icons (idle/active/error)
- Displays current task
- Shows completion percentage

**Completion**: 50%
- ✅ agentStatusTracker.ts singleton created
- ✅ Status enums defined  
- ⏳ TreeView provider integration
- ⏳ Real-time updates via EventEmitter

**Expected**: Feb 8, 2026

**Blockers**: None

**Owner**: Orchestrator Agent + Frontend team

**Skills Used**: 
- [05-treeview-providers.md](05-treeview-providers.md)
- [02-service-patterns.md](02-service-patterns.md)
```

## Related Skills
- **[20-noob-proofing.md](20-noob-proofing.md)** - New dev onboarding
- **[17-document-updater.md](17-document-updater.md)** - Doc updates
- **[21-copilot-instructions-updater.md](21-copilot-instructions-updater.md)** - API docs
