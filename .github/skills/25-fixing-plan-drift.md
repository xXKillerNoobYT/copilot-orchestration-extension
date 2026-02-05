# Fixing Plan Drift Skill

**Purpose**: Correct deviations from plan and restore alignment between code and requirements  
**Related Files**: All implementation files, planning documents  
**Keywords**: drift-correction, realignment, plan-sync, deviation-fix

## What is Drift Correction?

**Drift correction** is the process of getting code back on track with the original plan.

**Simple explanation**: Like GPS recalculating your route when you take a wrong turn. It finds where you went off course and guides you back to the destination.

## Two Approaches to Fixing Drift

### Approach 1: Update Code to Match Plan ✅
When plan was right, code went wrong.

### Approach 2: Update Plan to Match Code ⚠️
When code is right, plan was wrong or incomplete.

## Decision Matrix: Which Approach?

| Situation | Fix Code | Fix Plan |
|-----------|----------|----------|
| Plan matches requirements | ✅ Yes | ❌ No |
| Code violates security | ✅ Yes | ❌ Never |
| Code uses wrong pattern | ✅ Yes | ❌ No |
| Plan missed edge case | ❌ No | ✅ Yes |
| Better solution found | Maybe | Maybe |
| Requirements changed | ❌ No | ✅ Yes |

## Fixing Code Drift

### Step-by-Step Process

```
1. IDENTIFY exact deviation
   - What did plan say?
   - What did code do?
   - Where's the difference?

2. UNDERSTAND why drift happened
   - Misread plan?
   - Forgot requirement?
   - Found "better" way?

3. VERIFY plan is correct
   - Re-read requirements
   - Check with stakeholders
   - Confirm approach valid

4. FIX the code
   - Remove extra features
   - Add missing features
   - Correct wrong patterns

5. RE-VERIFY against plan
   - All requirements met?
   - Patterns correct?
   - Nothing extra?

6. TEST thoroughly
   - Does it work?
   - No regressions?
   - Meets success criteria?
```

### Example: Correcting Pattern Drift

```typescript
// DRIFT DETECTED: Wrong pattern used
// PLAN SAID: "Use singleton pattern like other services"

// ❌ CURRENT CODE (drifted):
export class MyService {
    constructor() {
        // initialization
    }
    
    async processData(): Promise<void> {
        // logic
    }
}

// ✅ CORRECTED CODE (matches plan):
let instance: MyService | null = null;

export async function initializeMyService(
    context: vscode.ExtensionContext
): Promise<void> {
    instance = new MyService();
    await instance.init();
}

export function getMyServiceInstance(): MyService {
    if (!instance) {
        throw new Error('MyService not initialized. Call initializeMyService() first.');
    }
    return instance;
}

// For tests
export function resetMyServiceForTests(): void {
    instance = null;
}

class MyService {
    async init(): Promise<void> {
        // initialization
    }
    
    async processData(): Promise<void> {
        // logic
    }
}
```

### Example: Removing Scope Creep

```typescript
// DRIFT: Added features not in plan

// PLAN SAID: "Update ticket status in database"

// ❌ DRIFTED CODE:
async function updateTicketStatus(id: string, status: string) {
    await db.update(id, { status });
    await sendEmailNotification(id, status);  // ← Not in plan
    await updateSlackChannel(id, status);      // ← Not in plan
    await logToAnalytics(id, status);          // ← Not in plan
    await refreshDashboard(id);                // ← Not in plan
}

// ✅ CORRECTED CODE:
async function updateTicketStatus(id: string, status: string) {
    await db.update(id, { status });
}

// IF those features are needed:
// 1. Add them to plan first
// 2. Get approval
// 3. THEN implement
// 4. Keep them separate if possible
```

## Fixing Plan Drift

### When to Update Plan Instead

Update plan when:
- ✅ Requirements genuinely changed
- ✅ Better approach discovered (with team approval)
- ✅ Edge case found that plan didn't cover
- ✅ Technical constraint requires different approach

### Plan Update Process

```
1. DOCUMENT the change
   - What's different?
   - Why is it better?
   - What's the impact?

2. GET APPROVAL
   - From orchestrator
   - From team lead
   - Update ticket/issue

3. UPDATE plan documents
   - Ticket description
   - Architecture docs (if needed)
   - Related skills (if needed)

4. COMMUNICATE changes
   - Notify team
   - Update PRD (skill 19)
   - Document decision rationale

5. VERIFY new plan
   - Does code match updated plan?
   - Are edge cases covered?
   - Is it documented?
```

### Example: Legitimate Plan Update

```markdown
## Plan Update: Ticket #45

**Original Plan**:
"Use bcrypt for password hashing"

**Change Requested**:
"Use Argon2 instead of bcrypt"

**Rationale**:
- Argon2 won best password hashing algorithm award
- Better resistance to GPU attacks
- Minor performance trade-off acceptable
- Industry best practice in 2026

**Impact**:
- Add new dependency: argon2
- Update security documentation
- Slightly slower hashing (60ms vs 50ms)

**Approved By**: Security team, orchestrator
**Date**: Feb 4, 2026

**Updated Plan**:
✅ Install argon2 package
✅ Implement Argon2 hashing
✅ Update security docs
✅ Add tests for hash verification
```

## Drift Correction Checklist

Before marking drift as fixed:

- [ ] Identified exact deviation from plan
- [ ] Understood why drift happened
- [ ] Decided: fix code OR fix plan
- [ ] If fixing code:
  - [ ] Removed extra features
  - [ ] Added missing features
  - [ ] Corrected wrong patterns
  - [ ] Re-verified against plan
  - [ ] Tests pass
- [ ] If fixing plan:
  - [ ] Documented change rationale
  - [ ] Got approval from orchestrator
  - [ ] Updated plan documents
  - [ ] Communicated to team
  - [ ] Verified code matches new plan
- [ ] No new drift introduced during fix

## Common Drift Fixes

### Fix 1: Missing Error Handling

```typescript
// PLAN: "Add error handling to all async functions"

// ❌ DRIFTED (missing):
async function fetchData(id: string) {
    const response = await fetch(`/api/${id}`);
    return response.json();
}

// ✅ CORRECTED:
async function fetchData(id: string) {
    try {
        const response = await fetch(`/api/${id}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to fetch data for ${id}: ${msg}`);
        throw error; // Re-throw after logging
    }
}
```

### Fix 2: Wrong Test Pattern

```typescript
// PLAN: "Follow test conventions from skill 03"

// ❌ DRIFTED (missing "Test N:" prefix):
it('should initialize service', async () => {
    await initializeService();
    expect(getServiceInstance()).toBeDefined();
});

// ✅ CORRECTED:
it('Test 1: should initialize service', async () => {
    await initializeService();
    expect(getServiceInstance()).toBeDefined();
});

it('Test 2: should throw if accessed before init', () => {
    expect(() => getServiceInstance()).toThrow('not initialized');
});
```

### Fix 3: Incomplete Implementation

```typescript
// PLAN: "Add CRUD operations: Create, Read, Update, Delete"

// ❌ DRIFTED (only has Create and Read):
class DataService {
    async create(data: Data): Promise<void> { /* ... */ }
    async read(id: string): Promise<Data> { /* ... */ }
}

// ✅ CORRECTED (all 4 operations):
class DataService {
    async create(data: Data): Promise<void> { /* ... */ }
    async read(id: string): Promise<Data> { /* ... */ }
    async update(id: string, data: Partial<Data>): Promise<void> { /* ... */ }
    async delete(id: string): Promise<void> { /* ... */ }
}
```

## Preventing Future Drift

### During Planning
```
✅ Make plans specific
✅ List all requirements explicitly
✅ Define success criteria
✅ Reference skills to follow
```

### During Implementation
```
✅ Keep plan visible while coding
✅ Check off completed steps
✅ Ask before adding features
✅ Verify patterns against skills
```

### During Review
```
✅ Compare code to plan line-by-line
✅ Use skill 26 safety checklist
✅ Run skill 23 drift detection
✅ Get second pair of eyes
```

## Drift Correction Report Template

```markdown
## Drift Correction Report

**Task**: [task name]
**Drift Detected**: [date]
**Drift Fixed**: [date]

### Deviation Summary
- **Original Plan**: [what plan said]
- **Actual Implementation**: [what was built]
- **Type of Drift**: [pattern/scope/incomplete/wrong]

### Root Cause
[Why did drift happen?]

### Correction Applied
- [ ] Updated code to match plan
- [ ] Updated plan to match code

### Changes Made
[List of changes]

### Verification
- [ ] Code matches plan
- [ ] Tests pass
- [ ] No regressions
- [ ] Documentation updated
- [ ] Team notified

### Lessons Learned
[How to prevent this drift in future]
```

## Related Skills
- **[23-plan-drift-detection.md](23-plan-drift-detection.md)** - Detecting drift
- **[24-observation-skill.md](24-observation-skill.md)** - Monitoring patterns
- **[26-safety-checklist.md](26-safety-checklist.md)** - Pre-merge verification
- **[16-orchestrator-agent.md](16-orchestrator-agent.md)** - Task coordination
- **[14-common-pitfalls.md](14-common-pitfalls.md)** - Common mistakes
