# Safety Checklist Skill

**Purpose**: Pre-flight safety checks before committing code to prevent bugs and drift  
**Related Files**: All source files, tests, documentation  
**Keywords**: safety-checks, pre-commit, quality-gate, verification, checklist

## What is a Safety Checklist?

**Safety checklist** is a set of verifications performed before code is merged.

**Simple explanation**: Like a pilot's pre-flight checklist. Pilots don't just "feel" ready to fly - they check every critical system. Same with code - check everything critical before "taking off" (merging).

## The Master Safety Checklist

### 🔴 CRITICAL (Must Pass)

- [ ] **Code compiles without errors**
  ```bash
  npm run compile
  # Should exit with code 0
  ```

- [ ] **All tests pass**
  ```bash
  npm run test:once
  # Should show all tests passing
  ```

- [ ] **No lint errors**
  ```bash
  npm run lint
  # Should show 0 errors
  ```

- [ ] **Code matches plan (skill 23)**
  - Re-read original plan
  - Verify all requirements met
  - Check no extra features added
  - Confirm patterns followed

- [ ] **No security vulnerabilities introduced**
  - No hardcoded credentials
  - No SQL injection risks
  - No XSS vulnerabilities
  - Error messages don't leak secrets

### 🟡 HIGH PRIORITY (Should Pass)

- [ ] **Test coverage maintained/improved**
  ```bash
  npm run test:once -- --coverage
  # Check coverage didn't drop below 70%
  # Target: 85%+
  ```

- [ ] **Patterns match COE conventions**
  - Singletons follow skill 02 pattern
  - Tests follow skill 03 pattern
  - Errors follow skill 11 pattern
  - JSDoc follows skill 04 pattern

- [ ] **Documentation updated**
  - JSDoc comments added
  - README updated if needed
  - Skills updated if new pattern
  - Inline comments for complex logic

- [ ] **No performance regressions**
  - Check operation timing
  - Compare to baselines (skill 15)
  - Profile if suspiciously slow

### 🟢 RECOMMENDED (Nice to Have)

- [ ] **Code reviewed by peer**
  - Second pair of eyes
  - Catches things you miss
  - Knowledge sharing

- [ ] **Manual testing performed**
  - Actually run the feature
  - Try edge cases
  - Verify UX makes sense

- [ ] **Related skills referenced**
  - Add skill references in comments
  - Help future developers
  - Document pattern choices

## Quick Safety Check (30 Seconds)

Minimum checks before commit:

```bash
# 1. Does it compile?
npm run compile

# 2. Do tests pass?
npm run test:once

# 3. Any lint errors?
npm run lint

# 4. Did I check it matches plan?
# (Re-read plan quickly)

# All green? ✅ Safe to commit
```

## Detailed Safety Check (5 Minutes)

Thorough verification:

### Step 1: Code Quality (1 min)
```bash
npm run compile  # Compiles?
npm run lint     # Clean?
```

### Step 2: Tests (2 min)
```bash
npm run test:once -- --coverage

# Check:
# - All tests pass? ✓
# - Coverage > 70%? ✓
# - New code tested? ✓
```

### Step 3: Plan Verification (1 min)
```
Re-read plan:
- All steps completed? ✓
- No extra features? ✓
- Correct patterns? ✓
```

### Step 4: Documentation (1 min)
```
Check docs:
- JSDoc added? ✓
- Skills updated? ✓
- Comments clear? ✓
```

## Safety Checklist by Task Type

### For New Features

- [ ] Feature matches plan exactly
- [ ] Tests cover happy path
- [ ] Tests cover error cases
- [ ] Tests cover edge cases
- [ ] Documentation explains why (not just what)
- [ ] No breaking changes to existing features
- [ ] Configuration updated if needed

### For Bug Fixes

- [ ] Bug is actually fixed (verify manually)
- [ ] Test added to prevent regression
- [ ] Root cause addressed (not symptom)
- [ ] No new bugs introduced
- [ ] Related code checked for same bug
- [ ] Documentation updated if bug was doc issue

### For Refactoring

- [ ] Behavior unchanged (tests still pass)
- [ ] All tests still pass
- [ ] No performance regression
- [ ] Code is actually clearer/simpler
- [ ] Related documentation updated
- [ ] Patterns consistent throughout

### For Tests

- [ ] Test follows skill 03 conventions
- [ ] "Test N:" prefix used
- [ ] beforeEach/afterEach setup correct
- [ ] Singletons reset properly
- [ ] Timers cleaned up
- [ ] Test actually tests right thing
- [ ] Test name describes what it tests

## Pre-Commit Safety Script

Create automated safety check:

```typescript
// safety-check.ts
/**
 * Run all safety checks before commit
 * 
 * **Simple explanation**: Like a robot checklist that runs 
 * all the boring but critical checks for you
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface CheckResult {
    name: string;
    passed: boolean;
    message: string;
}

async function runSafetyChecks(): Promise<boolean> {
    const results: CheckResult[] = [];
    
    // Check 1: Compile
    try {
        await execAsync('npm run compile');
        results.push({
            name: 'Compile',
            passed: true,
            message: '✅ Code compiles'
        });
    } catch (error) {
        results.push({
            name: 'Compile',
            passed: false,
            message: '❌ Compilation failed'
        });
    }
    
    // Check 2: Tests
    try {
        await execAsync('npm run test:once');
        results.push({
            name: 'Tests',
            passed: true,
            message: '✅ All tests pass'
        });
    } catch (error) {
        results.push({
            name: 'Tests',
            passed: false,
            message: '❌ Tests failing'
        });
    }
    
    // Check 3: Lint
    try {
        await execAsync('npm run lint');
        results.push({
            name: 'Lint',
            passed: true,
            message: '✅ No lint errors'
        });
    } catch (error) {
        results.push({
            name: 'Lint',
            passed: false,
            message: '❌ Lint errors found'
        });
    }
    
    // Report results
    console.log('\n🔒 SAFETY CHECK RESULTS\n');
    results.forEach(r => console.log(`${r.message}`));
    
    const allPassed = results.every(r => r.passed);
    
    if (allPassed) {
        console.log('\n✅ ALL CHECKS PASSED - Safe to commit\n');
    } else {
        console.log('\n❌ CHECKS FAILED - Do NOT commit\n');
    }
    
    return allPassed;
}

// Run checks
runSafetyChecks().then(passed => {
    process.exit(passed ? 0 : 1);
});
```

## Common Safety Check Failures

### Failure: "Tests pass locally but fail in CI"

**Cause**: Different environment (Node version, dependencies, etc.)

**Fix**:
```bash
# Match CI environment
nvm use 18  # Use same Node as CI
npm ci      # Clean install like CI
npm test    # Now should match CI
```

### Failure: "Coverage dropped below threshold"

**Cause**: New code not tested, or existing tests deleted

**Fix**:
```typescript
// Add tests for new code
it('Test 1: should handle new feature', () => {
    expect(newFeature()).toBeDefined();
});

it('Test 2: should handle edge case', () => {
    expect(newFeature(null)).toThrow();
});
```

### Failure: "Code doesn't match plan"

**Cause**: Drift during implementation (skill 23)

**Fix**:
- Re-read plan carefully
- Remove extra features
- Add missing features
- Follow correct patterns

## Emergency Override (Use Sparingly)

Sometimes you need to commit with checks failing:

### When Override is Acceptable ✅
- Hotfix for production crash (document why)
- Documentation-only changes
- Temporary commit to share with team
- CI system is broken (not your code)

### When Override is NOT Acceptable ❌
- "I'll fix it later" (you won't)
- "Tests are annoying" (they catch bugs)
- "It works on my machine" (it won't in prod)
- "I'm in a hurry" (make time for quality)

### Override Process
```bash
# Document WHY override needed
git commit -m "feat: emergency hotfix

SAFETY CHECK BYPASSED because:
- Production crash affecting users
- Fix verified manually
- Tests will be added in follow-up PR #123

See ticket #456 for context"
```

## Safety Checklist for Different Roles

### For Developers
```
Before committing:
✓ Code compiles
✓ Tests pass
✓ Lint clean
✓ Matches plan
✓ Documented
```

### For Reviewers
```
Before approving:
✓ Code makes sense
✓ Tests adequate
✓ No security issues
✓ Patterns match conventions
✓ Documentation clear
```

### For Orchestrator Agent
```
Before marking task complete:
✓ All requirements met
✓ Quality checks passed
✓ No drift detected
✓ Tests cover changes
✓ Ready for review
```

## Pre-Merge Final Checklist

Right before clicking "Merge":

- [ ] All review comments addressed
- [ ] CI pipeline green
- [ ] No merge conflicts
- [ ] Branch up to date with main
- [ ] One last manual test
- [ ] Documentation reviewed
- [ ] Team notified if breaking changes

## Safety Check Integration

### Pre-Commit Hook
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run safety-check"
    }
  }
}
```

### CI/CD Pipeline
```yaml
# .github/workflows/safety.yml
name: Safety Checks
on: [pull_request]
jobs:
  safety:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm ci
      - run: npm run compile
      - run: npm run test:once
      - run: npm run lint
```

## Related Skills
- **[23-plan-drift-detection.md](23-plan-drift-detection.md)** - Plan verification
- **[25-fixing-plan-drift.md](25-fixing-plan-drift.md)** - Drift correction
- **[24-observation-skill.md](24-observation-skill.md)** - Monitoring
- **[03-testing-conventions.md](03-testing-conventions.md)** - Test patterns
- **[22-test-fixer.md](22-test-fixer.md)** - Fixing test failures
- **[14-common-pitfalls.md](14-common-pitfalls.md)** - Common mistakes
