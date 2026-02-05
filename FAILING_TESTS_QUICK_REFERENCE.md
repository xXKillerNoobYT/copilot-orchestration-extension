# Quick Reference: 14 Failing Tests Summary

**Generated**: 2026-02-05  
**Test Suite**: Jest | **Environment**: Node.js/TypeScript  
**Total Tests**: 596 | **Passed**: 582 | **Failed**: 14 | **Pass Rate**: 97.66%

---

## All 14 Failures at a Glance

| # | Test Name | File | Line | Status | Root Cause | Priority |
|---|-----------|------|------|--------|-----------|----------|
| 1 | should calculate cache statistics | cache/cacheManagement.spec.ts | 312 | ❌ RETURN UNDEFINED | Function returns undefined instead of fallback object | HIGH |
| 2 | should get cache size info | cache/cacheManagement.spec.ts | 391 | ❌ RETURN UNDEFINED | Function returns undefined instead of fallback object | HIGH |
| 3 | should create ticket in SQLite mode | ticketDb.test.ts | 385 | ❌ MOCK NOT CALLED | Missing `jest.resetModules()` after `jest.doMock()` | HIGH |
| 4 | should retrieve all tickets from SQLite | ticketDb.test.ts | 410 | ❌ MOCK NOT CALLED | Missing `jest.resetModules()` after `jest.doMock()` | HIGH |
| 5 | should update ticket in in-memory mode | ticketDb.test.ts | 490 | ❌ NULL PROPERTY | createdAt set to null instead of preserved | HIGH |
| 6 | should update ticket in SQLite mode | ticketDb.test.ts | 514 | ❌ MOCK NOT CALLED | Missing `jest.resetModules()` after `jest.doMock()` | HIGH |
| 7 | should migrate SQLite table without type | ticketDb.test.ts | 642 | ❌ MOCK NOT CALLED | Missing `jest.resetModules()` after `jest.doMock()` | HIGH |
| 8 | should read old tickets without type field | ticketDb.test.ts | 710 | ❌ NOT FOUND (NULL) | Mock db.get() doesn't return ticket data | MEDIUM |
| 9 | should complete full CRUD lifecycle | ticketDb.test.ts | 761 | ❌ NULL PROPERTY | createdAt set to null during update | HIGH |
| 10 | should handle concurrent updates | ticketDb.test.ts | 798 | ❌ STALE DATA | Updates not properly awaited before read | MEDIUM |
| 11 | should handle createTicket error | ticketDb.test.ts | 917 | ❌ PROMISE RESOLVED | Mock error callback not passing error | MEDIUM |
| 12 | should handle getAllTickets error | ticketDb.test.ts | 934 | ❌ PROMISE RESOLVED | Mock error callback not passing error | MEDIUM |
| 13 | should handle getTicket error | ticketDb.test.ts | 952 | ❌ PROMISE RESOLVED | Mock error callback not passing error | MEDIUM |
| 14 | should warn on double initialize | ticketDb.test.ts | 978 | ❌ NOT CALLED (0) | dbInstance reset before second init call | MEDIUM |

---

## Failures by Root Cause

### ROOT CAUSE A: `jest.resetModules()` Missing (4 Tests)
- Tests: 3, 4, 6, 7
- **Fix**: Add `jest.resetModules()` after `jest.doMock()` 
- **Location**: `tests/ticketDb.test.ts` - beforeEach hook
- **Effort**: 2 minutes (1-line change)

```typescript
jest.doMock('sqlite3', () => {
    throw new Error('sqlite3 module not found (simulated)');
});
jest.resetModules();  // ← ADD THIS LINE
```

---

### ROOT CAUSE B: Function Returns `undefined` (2 Tests)
- Tests: 1, 2
- **Fix**: Verify catch blocks have explicit return statement
- **Location**: `src/services/cache/index.ts` and `src/services/cache/pruning.ts`
- **Status**: Likely already correct in source, may be compilation issue
- **Effort**: 5 minutes (investigate + possible recompile)

---

### ROOT CAUSE C: `createdAt` Set to Null (2 Tests)
- Tests: 5, 9
- **Fix**: Add defensive null check in updateTicket method
- **Location**: `src/services/ticketDb.ts` line 247
- **Effort**: 10 minutes (add validation + error handling)

```typescript
if (!existing.createdAt) {
    logError(`Ticket ${id} has null createdAt - data corruption!`);
    throw new Error(`Cannot update ticket: createdAt missing`);
}
```

---

### ROOT CAUSE D: Error Not Passed to Mock Callback (3 Tests)
- Tests: 11, 12, 13
- **Fix**: Pass error to callback instead of null
- **Location**: `tests/ticketDb.test.ts` - mock db methods
- **Effort**: 10 minutes (3 mock setup fixes)

```typescript
// CHANGE FROM:
if (cb) setTimeout(() => cb(null), 0);

// CHANGE TO:
if (cb) setTimeout(() => cb(new Error('DB Error')), 0);
```

---

### ROOT CAUSE E: DBInstance Reset Between Calls (1 Test)
- Tests: 14
- **Fix**: Don't call resetErr() before second init call
- **Location**: `tests/ticketDb.test.ts` line 966
- **Effort**: 2 minutes (remove 1 line)

---

### ROOT CAUSE F: Test Setup and Async Issues (2 Tests)
- Tests: 8, 10
- **Fix A (Test 8)**: Ensure mock db.get() returns ticket data
- **Fix B (Test 10)**: Use `Promise.all()` to wait for both updates
- **Effort**: 15 minutes total

---

## Fix Implementation Timeline

**Estimated Total Time**: 45-60 minutes

| Step | Fix | Tests | Time | Complexity |
|------|-----|-------|------|-----------|
| 1 | Add `jest.resetModules()` | 3,4,6,7 | 5 min | LOW |
| 2 | Fix error callbacks | 11,12,13 | 10 min | LOW |
| 3 | Remove dbInstance reset | 14 | 2 min | LOW |
| 4 | Verify cache functions | 1,2 | 10 min | MEDIUM |
| 5 | Fix concurrent update test | 10 | 10 min | MEDIUM |
| 6 | Fix old ticket mock | 8 | 10 min | MEDIUM |
| 7 | Add createdAt null check | 5,9 | 15 min | MEDIUM |
| 8 | Verify all tests pass | ALL | 5 min | LOW |

---

## Quick Action Items

### IMMEDIATE (Do First - 20 mins)
1. [ ] Add `jest.resetModules()` at line ~471 in ticketDb.test.ts (fixes 4 tests)
2. [ ] Remove `resetErr()` call in double-init test (fixes 1 test)
3. [ ] Fix error callbacks in createTicket/getAllTickets/getTicket mocks (fixes 3 tests)

### NEXT (Do Second - 25 mins)
4. [ ] Verify cache function returns are complete
5. [ ] Add defensive null check to updateTicket
6. [ ] Fix mock db.get() to return ticket data
7. [ ] Use Promise.all() in concurrent update test

### FINAL
8. [ ] Compile: `npm run compile`
9. [ ] Test: `npm run test:once`
10. [ ] Verify: All 596 tests pass ✅

---

## File Changes Summary

### Files to Modify (7 total)

| File | Changes | Impact |
|------|---------|--------|
| `tests/ticketDb.test.ts` | 8 changes | Fixes tests 3,4,5,6,7,8,10,14 |
| `src/services/ticketDb.ts` | 1 change | Fixes tests 5,9 |
| `src/services/cache/index.ts` | 1 verify | Fixes tests 1,2 |
| `src/services/cache/pruning.ts` | 1 verify | Fixes tests 1,2 |

---

## Verification Commands

```bash
# Before starting fixes - confirm all 14 are failing
npm run test:once 2>&1 | grep -E "(✓|×|Tests:)"

# After Fix 1-3 (should fix 8 tests)
npm run compile && npm run test:once 2>&1 | grep "Tests:"

# After Fix 4-7 (should fix remaining 6 tests)
npm run compile && npm run test:once 2>&1 | grep "Tests:"

# Final verification
npm run test:once 2>&1 | tail -20
```

Expected final output:
```
Test Suites: 33 passed, 0 failed, 33 total
Tests:       596 passed, 0 failed, 596 total
```

---

## Detailed Documentation

For complete details on each failure, see:
- **FAILING_TESTS_ANALYSIS.md** - Root cause analysis for each test
- **FAILING_TESTS_FIXES.md** - Exact code changes needed

---

## Notes

- All failures are **logic/setup issues**, not fundamental design problems
- No database changes needed
- No API changes needed
- All fixes are backward compatible
- Estimated success rate after fixes: **100%** (all 14 should pass)

