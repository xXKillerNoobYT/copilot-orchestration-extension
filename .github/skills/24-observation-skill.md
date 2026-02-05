# Observation Skill

**Purpose**: Observe code patterns, behavior, and team interactions to detect issues early  
**Related Files**: All source files, test results, agent outputs  
**Keywords**: observation, monitoring, pattern-detection, early-warning, behavior-analysis

## What is the Observation Skill?

**Observation** is actively watching for patterns, anomalies, and potential problems.

**Simple explanation**: Like a security guard watching cameras. They don't just stare blankly - they look for suspicious patterns, unusual behavior, things that don't fit. Same with code observation.

## What to Observe

### 1. Code Pattern Observations

Watch for:
- ✅ Patterns used consistently (good)
- 🚨 Same mistake repeated multiple times (bad)
- 🚨 Patterns diverging over time (drift)
- ✅ Code style improving (learning)

```typescript
// OBSERVATION: Three files all handle errors differently

// File 1:
try { doThing(); } catch (e) { console.log(e); }

// File 2:
try { doThing(); } catch (error: unknown) { 
    logError(error instanceof Error ? error.message : String(error));
}

// File 3:
doThing(); // No error handling!

// 🚨 FINDING: Inconsistent error handling = need skill/standard
```

### 2. Test Failure Patterns

```typescript
// OBSERVATION: Same test fails 3 times in a row

// First failure: "Service not initialized"
// Second failure: "Service not initialized"  
// Third failure: "Service not initialized"

// 🚨 FINDING: Pattern suggests missing beforeEach() reset
// ACTION: Check skill 03-testing-conventions.md
```

### 3. Agent Behavior Observations

Watch how agents perform:
- Planning Agent: Are plans getting clearer over time?
- Verification Agent: Catching bugs or missing them?
- Answer Agent: Giving helpful answers or generic ones?

```
OBSERVATION LOG:

Feb 1: Planning Agent created 10-step plan (2 vague steps)
Feb 2: Planning Agent created 8-step plan (all clear)
Feb 3: Planning Agent created 12-step plan (all actionable)

🚨 FINDING: Quality improving! Success pattern emerging.
```

### 4. Performance Degradation

```typescript
// OBSERVATION: Response times over 5 days

Day 1: Plan generation = 25s avg
Day 2: Plan generation = 28s avg
Day 3: Plan generation = 35s avg ⚠️
Day 4: Plan generation = 42s avg 🚨
Day 5: Plan generation = 58s avg 🔴

// 🚨 FINDING: 130% slower in 5 days
// ACTION: Investigate (see skill 15-dev-workflows.md profiling)
```

## Observation Workflow

```
1. WATCH
   - Monitor behavior over time
   - Track patterns
   - Note anomalies

2. DETECT
   - Spot trends (improving/degrading)
   - Identify outliers
   - Recognize patterns

3. ANALYZE
   - Why is this happening?
   - Is it good or bad?
   - What's the root cause?

4. REPORT
   - Document findings
   - Alert team if urgent
   - Suggest actions

5. TRACK
   - Monitor resolution
   - Verify improvement
   - Update patterns
```

## Observable Metrics

### Code Quality Metrics

| Metric | Good | Warning | Bad |
|--------|------|---------|-----|
| Test coverage | 85%+ | 70-84% | <70% |
| Lint errors | 0 | 1-5 | >5 |
| Function complexity | Low | Medium | High |
| Code duplication | <3% | 3-10% | >10% |

### Agent Performance Metrics

| Agent | Good Response | Warning | Too Slow |
|-------|---------------|---------|----------|
| Planning | <30s | 30-45s | >45s |
| Verification | <5s | 5-8s | >8s |
| Answer | <10s | 10-15s | >15s |

### Development Velocity

```typescript
// OBSERVATION: Task completion rate

Week 1: 8 tasks completed
Week 2: 10 tasks completed
Week 3: 12 tasks completed
Week 4: 7 tasks completed ⚠️

// 🚨 FINDING: Velocity dropped 42%
// INVESTIGATION: What changed in week 4?
```

## Early Warning Signs

### 🚨 Developer Struggling
```
OBSERVED:
- Same developer asks same question 3 times
- Multiple attempts to fix same bug
- Tests keep failing in same area

ACTION: Pair programming or skill training needed
```

### 🚨 Code Quality Declining
```
OBSERVED:
- Test coverage dropped from 85% to 72%
- Lint errors increased from 0 to 8
- Complex functions appearing

ACTION: Code review stricter, refactoring session
```

### 🚨 Agent Hallucinating
```
OBSERVED:
- Planning Agent suggests non-existent functions
- Answer Agent gives wrong file paths
- Verification passes buggy code

ACTION: Review agent prompts, adjust context window
```

## Observation Logging Pattern

```typescript
/**
 * Log observation for pattern detection
 * 
 * **Simple explanation**: Like a ship's log - record what 
 * happened so we can spot patterns later
 */
interface Observation {
    timestamp: Date;
    category: 'code' | 'test' | 'agent' | 'performance';
    severity: 'info' | 'warning' | 'error';
    finding: string;
    context: string;
    actionNeeded?: string;
}

// Example observation
const obs: Observation = {
    timestamp: new Date(),
    category: 'test',
    severity: 'warning',
    finding: 'Same test failing 3x in row',
    context: 'orchestrator.test.ts line 45',
    actionNeeded: 'Add beforeEach() reset - see skill 03'
};
```

## Daily Observation Checklist

Morning:
- [ ] Check overnight test results
- [ ] Review agent performance metrics
- [ ] Check for new lint errors
- [ ] Review overnight commits

Midday:
- [ ] Monitor active development progress
- [ ] Check if anyone stuck on same problem
- [ ] Verify agents staying on task
- [ ] Watch for pattern deviations

Evening:
- [ ] Review day's code changes
- [ ] Check test coverage didn't drop
- [ ] Verify all drift reported (skill 23)
- [ ] Log observations for tomorrow

## Pattern Recognition Examples

### Good Pattern: Learning Curve
```
Week 1: New dev makes 8 mistakes (expected)
Week 2: New dev makes 5 mistakes (improving)
Week 3: New dev makes 2 mistakes (good!)
Week 4: New dev makes 0 mistakes (excellent!)

✅ PATTERN: Normal learning curve
ACTION: None, keep supporting
```

### Bad Pattern: Regression
```
Week 1: Experienced dev makes 1 mistake
Week 2: Experienced dev makes 3 mistakes
Week 3: Experienced dev makes 5 mistakes
Week 4: Experienced dev makes 8 mistakes

🚨 PATTERN: Something wrong (burnout? distraction?)
ACTION: Check in with developer
```

## Observation vs Micromanagement

### ✅ GOOD Observation
- Watch for patterns over time
- Look for systemic issues
- Help team improve
- Early warning system

### ❌ BAD Micromanagement
- Watch every keystroke
- Criticize minor details
- Create pressure/stress
- Control instead of guide

## Automated Observation Tools

```typescript
/**
 * Auto-detect common observation patterns
 */
class ObservationMonitor {
    private observations: Observation[] = [];
    
    // Detect repeated test failures
    detectRepeatedFailures(testResults: TestResult[]): void {
        const failures = new Map<string, number>();
        
        testResults.forEach(result => {
            if (!result.passed) {
                const count = failures.get(result.testName) || 0;
                failures.set(result.testName, count + 1);
            }
        });
        
        // Alert if same test failed 3+ times
        failures.forEach((count, testName) => {
            if (count >= 3) {
                this.log({
                    category: 'test',
                    severity: 'error',
                    finding: `Test "${testName}" failed ${count} times`,
                    context: 'Repeated failure pattern',
                    actionNeeded: 'Fix root cause, not just symptoms'
                });
            }
        });
    }
    
    // Detect performance degradation
    detectSlowdown(metrics: PerformanceMetric[]): void {
        if (metrics.length < 2) return;
        
        const recent = metrics[metrics.length - 1].duration;
        const baseline = metrics[0].duration;
        const increase = ((recent - baseline) / baseline) * 100;
        
        if (increase > 50) {
            this.log({
                category: 'performance',
                severity: 'warning',
                finding: `${increase.toFixed(0)}% slower than baseline`,
                context: `${baseline}s → ${recent}s`,
                actionNeeded: 'Profile and optimize'
            });
        }
    }
}
```

## Real-World Observation Example

```markdown
## Observation Report: Week of Feb 1-7, 2026

### Code Quality Trends
✅ Test coverage: 70% → 75% (improving)
✅ Lint errors: 8 → 2 (improving)
⚠️ Complex functions: 3 → 5 (increasing)

### Agent Performance
✅ Planning: 28s avg (within target)
✅ Verification: 4s avg (good)
🚨 Answer: 12s avg (slower than 10s target)

### Pattern Detected: Answer Agent Slowdown
- Answer Agent response time increased 20%
- Observation: Conversation history growing too large
- Root cause: Not pruning old messages (skill 07)
- Fix applied: Implemented history limit
- Result: Back to 8s avg ✓

### Recommendations
1. Monitor complex function trend
2. Refactor if >7 complex functions
3. Continue test coverage push to 85%
```

## Related Skills
- **[23-plan-drift-detection.md](23-plan-drift-detection.md)** - Detecting drift
- **[25-fixing-plan-drift.md](25-fixing-plan-drift.md)** - Correcting issues
- **[26-safety-checklist.md](26-safety-checklist.md)** - Pre-merge checks
- **[14-common-pitfalls.md](14-common-pitfalls.md)** - What to watch for
- **[15-dev-workflows.md](15-dev-workflows.md)** - Profiling tools
