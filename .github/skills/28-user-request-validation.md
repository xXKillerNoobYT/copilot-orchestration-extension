# User Request Validation & Safety Checks

**Purpose**: Validate user requests and stop work on counterproductive actions  
**Keywords**: safety, validation, blocked-tasks, dependencies, quality-control  
**Skill Level**: Critical - Always check before starting work

---

## 🛑 When to Stop and Question

Before starting ANY user request, check if it matches these "bad request" patterns:

### 1. 🔒 Blocked Task Requests

**Pattern**: User asks to work on a task marked with 🔒

**Why it's bad**:
- Task has unmet dependencies
- Will fail or create broken code
- Wastes time on impossible work
- Creates technical debt

**How to respond**:
```
❌ Cannot start MT-XXX.Y - this task is blocked (🔒)

**Why blocked**: Depends on [list dependencies]

**What to do instead**:
1. Complete dependency tasks first: [list with ✅ status]
2. Or choose from "Next Up: Easy Wins" section
3. See PROJECT-BREAKDOWN for task status

**Still want to proceed?** Please confirm you understand:
- Code will likely not compile/work
- May need to redo work later
- Could break existing functionality
```

### 2. ❌ Dependency-Skipping Requests

**Pattern**: "Skip MT-XXX.Y and just do MT-XXX.Z"

**Why it's bad**:
- Later tasks depend on earlier work
- Will create compilation errors
- Breaks architectural assumptions

**How to respond**:
```
❌ Cannot skip MT-XXX.Y to do MT-XXX.Z

**Dependency chain**:
MT-XXX.Y → MT-XXX.Z (Z requires Y to be complete)

**What Y provides**: [explain dependency]

**Options**:
1. Complete MT-XXX.Y first (estimated __ min)
2. Choose different task without this dependency
3. Explain why you need to skip (may revise plan)
```

### 3. 🚫 Pattern-Breaking Requests

**Pattern**: "Don't use singleton pattern" / "Skip tests" / "Ignore TypeScript errors"

**Why it's bad**:
- Breaks project conventions (see copilot-instructions.md)
- Creates inconsistent codebase
- Fails CI/CD checks

**How to respond**:
```
❌ Cannot proceed - request violates project patterns

**Pattern required**: [singleton/testing/etc - reference skill]

**Why it matters**:
- Consistency across codebase
- Prevents future bugs
- Required by quality gates

**Alternatives**:
1. Follow established pattern (see skill XX)
2. Propose pattern change (requires team approval)
3. Explain exceptional circumstance
```

### 4. ⚠️ Safety-Bypass Requests

**Pattern**: "Don't check coverage" / "Skip verification" / "Commit without tests"

**Why it's bad**:
- Introduces bugs to main branch
- Breaks builds for other developers
- Violates coverage requirements (85%+)

**How to respond**:
```
❌ Cannot bypass safety checks

**Required checks** (see skill 26):
- ✅ Tests written and passing
- ✅ Coverage ≥ 85%
- ✅ No TypeScript errors
- ✅ Verification agent approved

**Current status**: [list what's missing]

**To proceed**:
1. Complete missing safety checks
2. Or explain emergency situation (requires approval)
```

### 5. 📋 Out-of-Order Work Requests

**Pattern**: "Work on Stage 3 tasks" (when Stage 1 incomplete)

**Why it's bad**:
- Stage gates exist for good reason
- Later stages depend on earlier infrastructure
- Will create merge conflicts

**How to respond**:
```
❌ Cannot work on Stage X - Stage Y incomplete

**Gate status**:
Stage Y: __/__ tasks complete (gate: 🔒 Locked)

**Blocker**: Must complete ALL Stage Y tasks first

**Why gates matter**:
- Each stage builds on previous infrastructure
- Prevents rework when foundations change
- Ensures quality at each milestone

**Options**:
1. Work on remaining Stage Y tasks
2. Review which specific Stage X feature you need
   (might be able to add minimal implementation)
```

---

## ✅ Valid Override Scenarios

Sometimes the user has good reasons. Allow work to proceed if:

### Scenario 1: Prototyping/Proof of Concept
```
User: "I know MT-005 is blocked, but I want to prototype the UI to show the team"

✅ VALID - Prototype work doesn't affect main codebase

Response:
"Understood! Creating prototype for MT-005.

**Prototype mode**:
- Creating in separate /prototype directory
- Not merging to main branch
- Will mark clearly as non-production
- Real implementation still requires dependencies

Proceeding with prototype..."
```

### Scenario 2: Investigation/Research
```
User: "Can you look at MT-010 even though it's blocked? Just want to understand it"

✅ VALID - Reading/understanding doesn't execute changes

Response:
"Sure! I'll review MT-010 for understanding.

**Research mode**:
- Reading documentation
- Explaining approach
- Identifying dependencies
- Not writing actual implementation

This is safe because we're not changing code yet."
```

### Scenario 3: Emergency Hotfix
```
User: "Production is down, need to fix auth ASAP, skip tests for now"

✅ VALID - Time-critical emergency (but add ticket)

Response:
"Emergency mode activated for production hotfix.

**⚠️ Post-emergency TODO**:
- [ ] Created ticket: Add tests for auth fix
- [ ] Scheduled tech debt review
- [ ] Will run tests after deployment

Proceeding with minimal-viable fix..."
```

### Scenario 4: Explicit Plan Revision
```
User: "I've decided MT-003 is actually duplicate of MT-001.10. Mark it complete."

✅ VALID - User owns the plan and can revise

Response:
"Updating plan based on your revision.

**Plan change**:
- Marking MT-003.1-4 as complete (duplicate work)
- Adding note explaining relationship to MT-001.10
- Updating dependency chains
- Recording in PROJECT-BREAKDOWN

Following skill 27 for plan maintenance..."
```

---

## 🔍 Red Flags in Request Language

Watch for these phrases that indicate potentially bad requests:

| Phrase | Red Flag | What to Check |
|--------|----------|---------------|
| "Just skip..." | Dependency bypass | Is order important? |
| "Don't worry about..." | Safety bypass | Is it a required check? |
| "Quick hack for..." | Pattern breaking | Is there a proper way? |
| "Ignore the errors..." | Quality bypass | Are errors blocking for a reason? |
| "We'll fix it later..." | Tech debt creation | Will "later" actually happen? |
| "It's only temporary..." | Permanent temporary code | Is there time to do it right? |
| "Nobody will notice..." | Hidden shortcuts | What's the blast radius? |

**Action**: When you see these phrases, ask clarifying questions BEFORE proceeding.

---

## 🎯 Decision Framework

Use this flowchart for every user request:

```
User makes request
    ↓
Does it violate patterns? ────NO───→ Proceed normally
    ↓ YES
    │
Is it a 🔒 task? ────YES───→ STOP: Require dependency completion
    ↓ NO                     (or prototype/research exception)
    │
Does it skip safety? ────YES───→ STOP: Require safety checks
    ↓ NO                        (or emergency exception)
    │
Does it break order? ────YES───→ STOP: Explain dependency chain
    ↓ NO                        (or valid plan revision)
    │
User has valid reason? ────NO───→ STOP: Suggest better approach
    ↓ YES
    │
Document exception & proceed with warning
```

---

## 📝 Response Templates

### Template 1: Blocked Task Stop
```markdown
## ❌ Request Validation Failed

**What you asked for**: [restate request]
**Why I cannot proceed**: Task MT-XXX.Y is blocked (🔒)

### Dependencies Required:
1. ✅/❌ MT-AAA.B: [description] - [status]
2. ✅/❌ MT-CCC.D: [description] - [status]

### What Happens if We Skip:
- [specific consequence 1]
- [specific consequence 2]

### Recommended Approach:
**Option 1**: Complete dependencies first
- Start with MT-AAA.B (est. __ min, marked ✅)

**Option 2**: Choose different task
- See "Next Up: Easy Wins" in PROJECT-BREAKDOWN
- [Suggest 2-3 specific alternatives]

**Option 3**: Explain special circumstance
- Prototype/research only?
- Emergency situation?
- Plan needs revision?

**How to proceed**: Please choose an option or explain why this is exceptional.
```

### Template 2: Safety Bypass Stop
```markdown
## ⚠️ Safety Check Required

**What you asked for**: [restate request]
**Safety check being skipped**: [test coverage / verification / etc]

### Why This Check Exists:
[Explain the purpose - prevent bugs, maintain quality, etc]

### Current Status:
- [ ] Tests written and passing
- [ ] Coverage ≥ 85%
- [ ] No TypeScript/ESLint errors
- [ ] Verification agent approved
- [ ] Documentation updated

### Risk of Skipping:
- **Immediate**: [what breaks now]
- **Short-term**: [what breaks in days/weeks]
- **Long-term**: [what breaks in months]

### To Proceed Safely:
1. [Specific action to complete check]
2. [Estimated time: __ min]
3. [Skill reference for how-to]

**Emergency override**: If this is time-critical, I can proceed with:
- Warning documented in code
- TODO ticket created
- Scheduled for follow-up

**Confirm**: Type "OVERRIDE" if you accept these risks.
```

### Template 3: Valid Exception Proceed
```markdown
## ✅ Exception Approved - Proceeding with Caution

**Request**: [restate]
**Exception type**: [Prototype / Research / Emergency / Plan Revision]

### Safeguards Applied:
- ✅ [specific safeguard 1]
- ✅ [specific safeguard 2]
- ✅ Follow-up ticket created: [ID]

### Scope Limitations:
This work is:
- ✓ [what it IS]
- ✗ [what it is NOT]

### Post-Work Requirements:
- [ ] [cleanup action 1]
- [ ] [cleanup action 2]

Proceeding now...
```

---

## 🧰 Practical Examples

### Example 1: Good Stop
```
User: "Start MT-005.1 (Create tickets table)"

YOU: Check PROJECT-BREAKDOWN...
- MT-005 says "Dependencies: MT-001 (MCP Server), MT-002 (Error Handling)"
- Stage 2 gate status: 🔒 Locked (Stage 1 incomplete)

❌ Cannot start MT-005.1 - Stage 1 gate not passed

**Required first**:
- Complete ALL 28 Stage 1 tasks (currently 10/28 done)
- See "Next Up: Easy Wins" for ready tasks

**Why**: Database tasks require MCP server foundation and error handling to be complete and tested.
```

### Example 2: Good Allow
```
User: "I want to read through the Stage 3 tasks to understand the LLM integration approach before we get there"

YOU: ✅ Research request - safe to proceed

I'll review Stage 3 (LLM Integration) tasks and explain the approach. This doesn't execute any changes, just helps you understand what's coming.

[Proceeds to explain Stage 3 architecture]
```

### Example 3: Good Challenge-Then-Allow
```
User: "Skip the tests for MT-002.2, I'll add them later"

YOU: ❌ Cannot skip tests - required by skill 26 safety checklist

**Coverage requirement**: 85% (current: 70%)
**Missing**: MT-002.2 validation error tests

**Time to add tests**: ~10 min (see skill 03)

User: "It's 2am and production auth is failing with validation errors. Need the fix deployed NOW, will add tests first thing tomorrow morning and create ticket"

YOU: ✅ Emergency exception approved

**Emergency mode**:
- Implementing MT-002.2 minimal fix
- Created: TODO-URGENT-001: Add MT-002.2 tests (assigned to you, due: 8am tomorrow)
- Documented in code: // FIXME: Missing tests - see TODO-URGENT-001
- Will verify manually before deployment

Proceeding with hotfix...
```

---

## 🎓 Integration with Other Skills

This skill works together with:

- **Skill 23** (Plan Drift Detection): Detect when request leads to drift
- **Skill 24** (Observation): Monitor user request patterns over time
- **Skill 25** (Fixing Plan Drift): Correct course when drift happens
- **Skill 26** (Safety Checklist): Pre-commit safety requirements
- **Skill 27** (PROJECT-BREAKDOWN Maintenance): Valid plan revisions

**Workflow**:
1. **Skill 28** (this): Validate request doesn't violate rules
2. If suspicious → **Skill 23**: Check if it causes plan drift
3. If valid emergency → **Skill 24**: Observe and document pattern
4. If proceeding → **Skill 26**: Apply safety checklist at end
5. If plan changes → **Skill 27**: Update PROJECT-BREAKDOWN properly

---

## 📊 Success Metrics

You're using this skill well when:

- ✅ Stopped 0 blocked tasks from starting this session
- ✅ Suggested alternatives for all questionable requests
- ✅ Allowed valid exceptions with proper safeguards
- ✅ No failed builds due to skipped dependencies
- ✅ No production bugs from skipped safety checks

**Remember**: Saying "no" (with alternatives) protects both you and the user from wasted effort.

---

## 🚀 Quick Reference Card

**Before ANY work**, ask yourself:

1. ❓ Is task marked 🔒? → **STOP** + suggest ✅ alternatives
2. ❓ Does request skip dependencies? → **STOP** + explain chain
3. ❓ Does request violate patterns? → **STOP** + reference skills
4. ❓ Does request skip safety? → **STOP** + require checks
5. ❓ Is user aware of risks? → **CHALLENGE** + get confirmation
6. ❓ Is this an emergency/prototype/research? → **ALLOW** + add safeguards

**Default stance**: Helpful skepticism - assume user is smart but might not see full context.

**When in doubt**: ASK before proceeding. Better to over-communicate than to waste hours on blocked work.

---

**Last Updated**: February 4, 2026  
**Maintained By**: COE Quality Assurance Team  
**Related Files**: 
- .github/skills/23-plan-drift-detection.md
- .github/skills/26-safety-checklist.md
- .github/skills/27-project-breakdown-maintenance.md
- Docs/This Program's Plans/PROJECT-BREAKDOWN & TODO List.md
