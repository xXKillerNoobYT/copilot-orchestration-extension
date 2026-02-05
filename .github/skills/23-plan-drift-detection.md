# Plan Drift Detection and Informing Skill

**Purpose**: Detect when implementation deviates from plan and inform team immediately  
**Related Files**: `src/services/orchestrator.ts`, planning workflows  
**Keywords**: drift-detection, plan-verification, deviation-alerts, quality-control

## What is Plan Drift?

**Plan drift** occurs when code being written doesn't match the original plan.

**Simple explanation**: Like building a house but forgetting the blueprint. You might build rooms in wrong places or use wrong materials. Plan drift is when your code "forgets" what it was supposed to do.

## Common Causes of Drift

### 1. Requirements Misunderstood
```typescript
// PLAN SAID: "Add error logging to all API calls"
// WHAT WAS BUILT: Only logs errors in one function

// ✅ CORRECT: Logs in ALL API functions
async function callAPI(endpoint: string) {
    try {
        return await fetch(endpoint);
    } catch (error) {
        logError(`API call failed: ${endpoint}`, error); // ✓ Logged
    }
}
```

### 2. Scope Creep During Implementation
```typescript
// PLAN SAID: "Add ticket status update function"

// ❌ DRIFTED: Added extra features not in plan
async function updateTicketStatus(id: string, status: string) {
    await db.update(id, { status });
    await sendNotification(id);        // 🚨 NOT IN PLAN
    await updateDashboard(id);         // 🚨 NOT IN PLAN
    await logToAnalytics(id, status);  // 🚨 NOT IN PLAN
}

// ✅ CORRECT: Exactly what plan asked for
async function updateTicketStatus(id: string, status: string) {
    await db.update(id, { status });
}
```

### 3. Pattern Violations
```typescript
// PLAN SAID: "Use singleton pattern like other services"

// ❌ DRIFTED: Created class without singleton
export class NewService {
    constructor() { /* ... */ }
}

// ✅ CORRECT: Follows singleton pattern (see skill 02)
let instance: NewService | null = null;

export async function initializeNewService(): Promise<void> {
    instance = new NewService();
}

export function getNewServiceInstance(): NewService {
    if (!instance) throw new Error('NewService not initialized');
    return instance;
}
```

## Drift Detection Workflow

```
STEP 1: Read the plan
    - What does it say to do?
    - What's the success criteria?
    - What patterns should be followed?

STEP 2: Review implementation
    - Does code match plan requirements?
    - Are all steps completed?
    - Are patterns followed correctly?

STEP 3: Identify deviations
    - List what's missing
    - List what's extra (not in plan)
    - List what's wrong (wrong pattern)

STEP 4: Inform immediately
    - Flag drift to team/orchestrator
    - Explain what drifted and why
    - Suggest correction

STEP 5: Wait for decision
    - Update plan to match code? OR
    - Update code to match plan?
```

## Informing About Drift

### Good Drift Report Format

```markdown
🚨 PLAN DRIFT DETECTED

**Task**: Add user authentication system
**Plan Location**: Ticket #42, step 3

**Deviation Found**:
- Plan says: "Use bcrypt for password hashing"
- Code uses: Argon2 hashing instead

**Impact**: 
- Medium (different library, same security level)
- Adds new dependency not in plan

**Recommendation**:
1. Either update plan to allow Argon2, OR
2. Switch to bcrypt as originally planned

**Decision Needed**: Which approach?
```

### When to Report Drift

| Severity | When to Report | Example |
|----------|---------------|---------|
| 🔴 CRITICAL | Immediately | Security pattern violated |
| 🟡 MEDIUM | Before merge | Wrong pattern used |
| 🟢 LOW | End of day | Minor naming difference |

## Drift Detection Checklist

Before marking task complete:

- [ ] Re-read original plan
- [ ] Check all requirements met
- [ ] Verify patterns match COE conventions (skills 01-15)
- [ ] Confirm no extra features added
- [ ] Check no required features missing
- [ ] Verify file structure matches plan
- [ ] Test against success criteria
- [ ] Document any intentional changes

## Automated Drift Detection

### Plan Verification Function Pattern

```typescript
/**
 * Verify implementation matches plan requirements
 * 
 * **Simple explanation**: Like a building inspector checking 
 * if house matches blueprints
 */
async function verifyAgainstPlan(
    planRequirements: string[],
    implementedFeatures: string[]
): Promise<DriftReport> {
    const missing = planRequirements.filter(
        req => !implementedFeatures.includes(req)
    );
    
    const extra = implementedFeatures.filter(
        feat => !planRequirements.includes(feat)
    );
    
    return {
        hasDrift: missing.length > 0 || extra.length > 0,
        missingFeatures: missing,
        extraFeatures: extra,
        severity: calculateSeverity(missing, extra)
    };
}
```

## Common Drift Patterns to Watch

### 1. Feature Bloat
Adding features not in plan because "they're easy"

### 2. Pattern Deviation  
Using different patterns than project conventions

### 3. Incomplete Implementation
Forgetting parts of the plan

### 4. Wrong Dependencies
Installing packages not approved in plan

### 5. Scope Change
Solving different problem than planned

## Prevention Strategies

### During Planning
- Make plans specific and clear
- Define success criteria precisely
- List patterns to follow
- Document assumptions

### During Implementation
- Keep plan visible while coding
- Check plan after each file
- Ask if unsure about requirements
- Don't add "nice to have" features

### During Review
- Always verify against plan
- Check patterns match skills 01-22
- Confirm all requirements met
- Flag deviations immediately

## Example: Good vs Bad Drift Handling

### ❌ BAD: Silent Drift
```typescript
// Plan said: "Add basic logging"
// Developer added full analytics suite
// Nobody noticed until production
// Now removing features users expect
```

### ✅ GOOD: Detected and Informed
```typescript
// Plan said: "Add basic logging"
// Developer starts adding analytics
// STOPS immediately
// Reports: "Plan says logging. I want analytics. Update plan?"
// Team decides: Yes, update plan
// Now it's documented and approved
```

## Drift Report Template

```markdown
## Drift Detection Report

**Date**: [timestamp]
**Task**: [task name]
**Plan**: [link to plan/ticket]

### Deviations Detected

1. **Missing from implementation**:
   - [feature A not implemented]
   - [feature B incomplete]

2. **Added but not in plan**:
   - [extra feature C]
   - [extra dependency D]

3. **Wrong patterns used**:
   - [should use singleton, used class]
   - [should use async/await, used promises]

### Impact Assessment
- **Severity**: [Critical/Medium/Low]
- **Affected areas**: [list affected code]
- **Risk**: [what could go wrong?]

### Recommendations
1. [Option 1: Update code to match plan]
2. [Option 2: Update plan to match code]

### Action Required
- [ ] Decision from orchestrator
- [ ] Update plan OR update code
- [ ] Re-verify after fix
- [ ] Update documentation
```

## Related Skills
- **[16-orchestrator-agent.md](16-orchestrator-agent.md)** - Manager role and coordination
- **[25-fixing-plan-drift.md](25-fixing-plan-drift.md)** - How to correct drift
- **[24-observation-skill.md](24-observation-skill.md)** - What to watch for
- **[26-safety-checklist.md](26-safety-checklist.md)** - Pre-merge verification
- **[14-common-pitfalls.md](14-common-pitfalls.md)** - Common mistakes
