# Test Fixer Skill

**Purpose**: Fix tests properly after code updates while maintaining quality standards  
**Related Files**: `tests/`, `jest.config.js`, `src/`  
**Keywords**: testing, test-fixes, debugging-tests, coverage, regression

## Test Fixer Responsibilities

### 1. Identify Broken Tests

When tests fail after code changes:
- Find the root cause (not just the symptom)
- Determine if code is wrong or test is wrong
- Fix the right layer

### 2. Fix Tests Properly

Never just make tests pass - ensure they actually validate behavior.

```typescript
// ❌ BAD - makes test pass by hiding problem
it('Test 1: should work', async () => {
    // Expected: 5
    // Actual: 3
    // Solution: Change test to expect 3 ✗ WRONG!
    expect(result).toBe(3);
});

// ✅ GOOD - fixes actual bug
it('Test 1: should work', async () => {
    // Expected: 5
    // Actual: 3
    // Root cause: Not multiplying by factor
    // Solution: Fix code ✓
    const result = processData(data, 5); // factor = 5
    expect(result).toBe(5);
});
```

### 3. Maintain Test Quality

After fixing:
- Coverage didn't drop
- Test still validates expected behavior
- New edge cases don't break test
- Test naming still makes sense

### 4. Prevent Regression

After fixing a test:
- Add guard to prevent this bug recurring
- Document why the bug happened
- Update related tests to catch similar issues

## Test Fixing Workflow

```
Step 1: Run failing test in isolation
    $ npm run test:once -- testName

Step 2: Read error message carefully
    Look for actual vs expected
    Check stack trace
    
Step 3: Determine root cause
    Code bug? → Fix code
    Test outdated? → Update test
    Missing setup? → Add to beforeEach
    
Step 4: Fix at root level
    Don't just make test pass
    Fix underlying issue
    
Step 5: Verify fix
    Run test again (should pass)
    Run full test suite (check for regression)
    Check coverage (shouldn't drop)
    
Step 6: Document
    Why test failed
    How it was fixed
    What to watch for
```

## Common Test Failures and Fixes

### Failure 1: Singleton Already Initialized

```
Error: Service already initialized

Root cause: Forgot to reset singleton in beforeEach()

Fix: Add resetServiceForTests() to beforeEach()

Example:
beforeEach(() => {
    resetMyServiceForTests(); // Add this line
});
```

### Failure 2: Fake Timer Leakage

```
Error: Test times out or behaves unexpectedly

Root cause: Fake timers from previous test

Fix: Cleanup timers in afterEach()

Example:
afterEach(() => {
    jest.useRealTimers(); // Always cleanup
});
```

### Failure 3: Async Not Awaited

```
Error: Expected X but got Y (incomplete execution)

Root cause: Test doesn't wait for async operation

Fix: Add await or return promise

Example:
// ❌ WRONG
processAsync();
expect(result).toBe(expected);

// ✅ RIGHT
await processAsync();
expect(result).toBe(expected);
```

### Failure 4: Mock Not Setup

```
Error: Mock called 0 times (expected 1)

Root cause: Forgot to setup mock before calling code

Fix: Setup mock before calling function

Example:
beforeEach(() => {
    mockFunction.mockResolvedValue(expected);
});
```

## Test Fixing Checklist

After fixing failing test:

- [ ] Test passes
- [ ] Related tests still pass
- [ ] Coverage didn't drop below 80%
- [ ] New test has "Test N:" numbering
- [ ] setUp/tearDown properly configured
- [ ] No console.log or debug code left
- [ ] Comment explains why test was failing
- [ ] Mock/spy thoroughly documented
- [ ] Test runs in isolation (works alone)
- [ ] Test runs in suite (works with others)

## Guard Tests (Prevent Regression)

Add test that catches the bug again:

```typescript
// The original bug (before we fix)
it('Test 1: should not happen again', () => {
    // This test catches the exact bug we just fixed
    // If someone reintroduces bug, test fails
    
    // Original problem: Forgot to reset singleton
    resetMyServiceForTests();
    
    // This should throw if they forgot reset
    expect(() => initializeMyService()).not.toThrow();
    expect(() => initializeMyService()).toThrow('already initialized');
});
```

## Test Documentation

When fixing a test, document:

```typescript
/**
 * Test 2: should handle configuration not found
 * 
 * History:
 * - 2026-02-04: Fixed - was using 'any' type, could crash
 *   Root cause: error instanceof Error not checked
 *   How fixed: Added typed catch block with fallback
 *   
 * Related: See 11-error-handling-patterns.md for pattern
 */
it('Test 2: should handle configuration not found', async () => {
    mockFs.existsSync.mockReturnValue(false);
    
    // Should not throw, should use defaults
    await initializeConfig(mockContext);
    expect(getConfigInstance()).toBeDefined();
});
```

## Coverage During Fixes

When fixing tests, check coverage:

```bash
# Run tests with coverage
npm run test:once -- --coverage

# View report
open coverage/lcov-report/index.html
```

Ensure:
- Lines: 80%+ covered
- Branches: 80%+ covered
- Functions: 80%+ covered
- Statements: 80%+ covered

If coverage drops, add more tests.

## Test Fixing Priorities

1. 🔴 **CRITICAL**: Tests that block deployment
   - Fix immediately
   
2. 🟡 **HIGH**: Core functionality tests
   - Fix within 1 hour
   
3. 🟢 **NORMAL**: Feature tests
   - Fix within 24 hours
   
4. ⚪ **LOW**: Edge case tests
   - Fix before new feature merge

## Related Skills
- **[03-testing-conventions.md](03-testing-conventions.md)** - Test patterns
- **[14-common-pitfalls.md](14-common-pitfalls.md)** - Test pitfalls
- **[11-error-handling-patterns.md](11-error-handling-patterns.md)** - Error testing
