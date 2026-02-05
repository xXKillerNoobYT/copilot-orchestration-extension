# Failing Tests Analysis - 14 Test Failures

**Last Test Run**: 2026-02-05
**Total Tests**: 596 | **Passed**: 582 | **Failed**: 14
**Failure Rate**: 2.34%

---

## Summary by Category

| Category | Count | Location |
|----------|-------|----------|
| Cache Functions | 2 | `tests/cache/cacheManagement.spec.ts` |
| TicketDb Operations | 12 | `tests/ticketDb.test.ts` |

---

## CACHE MANAGEMENT FAILURES (2 tests)

### TEST 1: Cache Statistics Calculation

**FILE**: `tests/cache/cacheManagement.spec.ts:312-319`
**TEST NAME**: `Test 14: should calculate cache statistics`

**EXPECTED**: 
```typescript
stats.totalItems = 0  // Integer
stats.bySource = {}   // Empty object
stats.byType = {}     // Empty object
```

**ACTUAL**: 
```typescript
stats.totalItems = undefined
// entire stats object likely undefined
```

**ROOT CAUSE**: 
The `getCacheStats()` function in `src/services/cache/index.ts` (line 360) should always return an object with numeric properties, even on error. However, the function returns `undefined` instead of the error fallback object. This suggests:
1. The function is not properly exported or compiled
2. The error handling catch block is not being reached/executed properly
3. The function signature mismatch between source and compiled code

**FIX**: 
1. Verify `getCacheStats` is exported in `out/services/cache/index.js` (confirmed: line 55 shows it is exported)
2. Check if the try-catch block is reaching the catch handler
3. Ensure return type always includes the fallback object
4. **CODE CHANGE**:
   ```typescript
   // In src/services/cache/index.ts line 360
   export function getCacheStats(context: vscode.ExtensionContext): {
       totalItems: number;
       // ... other properties ...
   } {
       try {
           const index = loadCacheIndex(context);
           // ... processing ...
           return { /* stats object */ };
       } catch (error: unknown) {
           const msg = error instanceof Error ? error.message : String(error);
           logWarn(`Failed to get cache stats: ${msg}`);
           // ENSURE THIS ALWAYS RETURNS - check if function is missing return here
           return {
               totalItems: 0,
               totalSizeBytes: 0,
               totalSizeMB: 0,
               oldestItem: null,
               newestItem: null,
               bySource: {},
               byType: {},
           };
       }
   }
   ```

---

### TEST 2: Cache Size Information

**FILE**: `tests/cache/cacheManagement.spec.ts:391-395`
**TEST NAME**: `Test 21: should get cache size info`

**EXPECTED**:
```typescript
info.totalBytes = 0     // Integer, not undefined
info.itemCount = 0      // Integer, not undefined
```

**ACTUAL**:
```typescript
info.totalBytes = undefined
info.itemCount = undefined
```

**ROOT CAUSE**: 
Same as TEST 1. The `getCacheSizeInfo()` function in `src/services/cache/pruning.ts` (line 217) has proper error handling in source, but appears to return `undefined` instead of the fallback object. 

Likely causes:
1. Exception thrown before catch block or in a nested scope
2. Function not properly compiled
3. Missing explicit return statement in catch block

**FIX**: 
Similar to TEST 1, ensure the catch block always returns the fallback:
```typescript
// In src/services/cache/pruning.ts line 217
export function getCacheSizeInfo(context: vscode.ExtensionContext): {
    totalBytes: number;
    totalMB: number;
    itemCount: number;
    largestItem: { hash: string; bytes: number } | null;
    averageItemSize: number;
} {
    try {
        const index = loadCacheIndex(context);
        // ... processing ...
        return { /* stats object */ };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to get cache size info: ${msg}`);
        // ENSURE THIS ALWAYS RETURNS
        return {
            totalBytes: 0,
            totalMB: 0,
            itemCount: 0,
            largestItem: null,
            averageItemSize: 0,
        };
    }
}
```

---

## TICKETDB FAILURES (12 tests)

### TEST 3: Create Ticket in SQLite Mode

**FILE**: `tests/ticketDb.test.ts:385-405`
**TEST NAME**: `SQLite Mode Operations > should create ticket in SQLite mode`

**EXPECTED**:
```typescript
mockRunSpy.toHaveBeenCalled()  // db.run() called
ticket.title = 'SQLite Test'
```

**ACTUAL**:
```typescript
mockRunSpy.toHaveBeenCalled() = 0 calls  // MOCK NOT CALLED
```

**ROOT CAUSE**: 
The test uses `jest.doMock('sqlite3')` before requiring the module, but doesn't call `jest.resetModules()`. The comment in the code says "Removed jest.resetModules() to preserve config singleton" (line 469). This means:
1. The old cached module is still loaded
2. The mock doesn't take effect
3. The system falls back to in-memory mode instead of using the mocked SQLite

**FIX**:
Need to ensure module mocking works while preserving config singleton. Two approaches:
1. **APPROACH A** (Simpler): Call `jest.resetModules()` and re-initialize config after doMock:
   ```typescript
   beforeEach(async () => {
       jest.clearAllMocks();
       jest.doMock('sqlite3', () => {
           throw new Error('sqlite3 module not found (simulated)');
       });
       jest.resetModules(); // THIS IS NEEDED for doMock to take effect
       
       mockContext = new ExtensionContext('/mock/extension/path');
       resetConfigForTests();
       await initializeConfig(mockContext); // Reinitialize after resetModules
       
       mockFs.existsSync.mockReturnValue(true);
       mockFs.readFileSync.mockReturnValue(JSON.stringify({
           tickets: { dbPath: './.coe/tickets.db' }
       }));
   });
   ```

2. **APPROACH B** (Better): Use a setup function before the test suite instead of per-test:
   ```typescript
   // At module level, BEFORE describe blocks
   jest.doMock('sqlite3', () => {
       throw new Error('sqlite3 module not found');
   });
   ```

---

### TEST 4: Retrieve All Tickets from SQLite

**FILE**: `tests/ticketDb.test.ts:410-461`
**TEST NAME**: `SQLite Mode Operations > should retrieve all tickets from SQLite`

**EXPECTED**:
```typescript
mockAllSpy.toHaveBeenCalled()  // db.all() called for SELECT
tickets.length = 2
tickets[0].title = 'First'
tickets[1].title = 'Second'
```

**ACTUAL**:
```typescript
mockAllSpy.toHaveBeenCalled() = 0 calls  // MOCK NOT CALLED
```

**ROOT CAUSE**: 
Same as TEST 3. The SQLite mock is not taking effect because `jest.resetModules()` is missing.

**FIX**: 
Apply same fix as TEST 3 - use `jest.resetModules()` after `jest.doMock()`.

---

### TEST 5: Update Ticket in In-Memory Mode

**FILE**: `tests/ticketDb.test.ts:490-512`
**TEST NAME**: `updateTicket > should update ticket in in-memory mode`

**EXPECTED**:
```typescript
updated.createdAt = created.createdAt  // "2026-02-05T04:19:43.248Z"
updated.title = 'Updated Title'
updated.status = 'done'
updated.updatedAt ≠ created.updatedAt   // Should change
```

**ACTUAL**:
```typescript
updated.createdAt = null  // ← PROBLEM: should be the original createdAt
updated.title = 'Updated Title'  // ✓ Correct
updated.status = 'done'  // ✓ Correct
```

**ROOT CAUSE**: 
The `updateTicket()` function in TicketDatabase class (line 247-276) spreads existing ticket then explicitly sets `createdAt: existing.createdAt`. For createdAt to be null, one of these must be true:

1. **Most Likely**: `getTicket(id)` is returning a Ticket object where createdAt was never set or was set to null during creation
2. **Alternative**: The spread operator or object literal is not including createdAt from existing
3. **Possible**: The in-memory store is returning tickets with null createdAt for some reason

Investigation needed:
- Verify `createTicket` properly sets createdAt in in-memory store
- Check if in-memory store Map is properly storing all properties
- Verify getTicket returns full Ticket object with all properties

**FIX**:  
Ensure createdAt is never null:
```typescript
// In src/services/ticketDb.ts line 247
async updateTicket(id: string, updates: Partial<Omit<Ticket, 'id' | 'createdAt'>>): Promise<Ticket | null> {
    const existing = await this.getTicket(id);
    if (!existing) {
        logWarn(`Ticket ${id} not found for update`);
        return null;
    }

    // DEFENSIVE: Ensure createdAt exists
    if (!existing.createdAt) {
        logError(`Ticket ${id} missing createdAt - this should not happen!`);
        return null; // Or throw
    }

    const now = new Date().toISOString();
    const updated: Ticket = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt, // Preserve original
        updatedAt: now,
    };

    if (this.isInMemoryMode) {
        this.inMemoryStore!.set(id, updated);
    } else {
        // ... SQLite update ...
    }

    logInfo(`Updated ticket: ${id}`);
    this._changeEmitter.emit('change');
    return updated;
}
```

---

### TEST 6: Update Ticket in SQLite Mode

**FILE**: `tests/ticketDb.test.ts:514-580`
**TEST NAME**: `updateTicket > should update ticket in SQLite mode`

**EXPECTED**:
```typescript
mockRunSpy.toHaveBeenCalled()  // db.run() for UPDATE
mockRunSpy includes 'UPDATE tickets' in SQL
updated.title = 'Updated'
```

**ACTUAL**:
```typescript
mockRunSpy.toHaveBeenCalled() = 0 calls  // MOCK NOT CALLED
```

**ROOT CAUSE**: 
Same as TEST 3 & 4. The SQLite mock setup requires `jest.resetModules()` to take effect.

**FIX**: 
Apply same fix as TEST 3.

---

### TEST 7: Migrate SQLite Table Without Type Column

**FILE**: `tests/ticketDb.test.ts:642-696`
**TEST NAME**: `Migration & Backward Compatibility > should migrate SQLite table without type column`

**EXPECTED**:
```typescript
mockRunSpy.toHaveBeenCalled()  // db.run() for ALTER TABLE  
mockRunSpy includes 'ALTER TABLE' and 'ADD COLUMN type'
```

**ACTUAL**:
```typescript
mockRunSpy.toHaveBeenCalled() = 0 calls  // MOCK NOT CALLED
```

**ROOT CAUSE**: 
Same as TEST 3, 4, 6. SQLite mock not taking effect without `jest.resetModules()`.

**FIX**: 
Apply same fix as TEST 3.

---

### TEST 8: Read Old Tickets Without Type Field

**FILE**: `tests/ticketDb.test.ts:710-736`
**TEST NAME**: `Migration & Backward Compatibility > should read old tickets without type field as undefined`

**EXPECTED**:
```typescript
ticket ≠ null  // Should find the ticket
ticket.id = 'OLD-001'
ticket.title = 'Old Ticket'
ticket.type = undefined  // Backward compatibility
```

**ACTUAL**:
```typescript
ticket = null  // TICKET NOT FOUND
```

**ROOT CAUSE**: 
The test sets up a mock SQLite database and calls `getTicket('OLD-001')`. When ticket is not found, getTicket returns null. This happens because:

1. The mock SQLite db.get() is not properly returning the old ticket data
2. OR the ticket was never inserted into the mock database in the first place
3. OR the SQLite mock setup is incorrect and falling back to in-memory mode

**FIX**:
Ensure the mock database properly returns the old ticket:
```typescript
// In test setup, ensure the mock returns the pre-populated record
const oldTicket = {
    id: 'OLD-001',
    title: 'Old Ticket',
    status: 'open',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z'
    // Note: no 'type' field - simulating old schema
};

const mockDB = {
    get: jest.fn((sql, params, callback) => {
        // Ensure callback is properly called with the ticket
        if (params[0] === 'OLD-001') {
            setTimeout(() => callback(null, oldTicket), 0);
        }
    }),
    // ... other methods ...
};
```

---

### TEST 9: Full CRUD Lifecycle - Create through Read

**FILE**: `tests/ticketDb.test.ts:761-794`
**TEST NAME**: `Integration: Full CRUD Flow > should complete full CRUD lifecycle: create ↔ read ↔ update ↔ read`

**EXPECTED**:
```typescript
// Step 1: Create
created.createdAt = timestamp string

// Step 2: Read
retrieved.createdAt = created.createdAt

// Step 3: Update
updated.createdAt = created.createdAt (preserved)
updated.title = 'Updated Integration Test'

// Step 4: Read again
final.createdAt = created.createdAt (preserved)
```

**ACTUAL**:
```typescript
updated.createdAt = null  // PROBLEM: should be preserved
```

**ROOT CAUSE**: 
Same as TEST 5. The updateTicket function is setting createdAt to null instead of preserving it.

**FIX**: 
Apply defensive fix from TEST 5 to ensure createdAt is never null.

---

### TEST 10: Handle Concurrent Updates on Same Ticket

**FILE**: `tests/ticketDb.test.ts:798-824`
**TEST NAME**: `Integration: Full CRUD Flow > should handle concurrent updates on same ticket`

**EXPECTED**:
```typescript
// Create ticket
ticket.title = 'Concurrent Test'

// Update 1
title = 'Update 1'

// Update 2 (concurrent)
final.title = 'Update 2'  // Last update should win
```

**ACTUAL**:
```typescript
final.title = 'Concurrent Test'  // NOT updated - shows create title
```

**ROOT CAUSE**: 
The concurrent updates are not being applied. Likely issue:
1. The second update is not properly waiting before checking results
2. OR the getTicket is returning stale data (wrong instance from in-memory store)
3. OR updates are not being persisted to the store

The in-memory store uses a Map and should handle this synchronously. The issue might be:
- Timing problem in the test (not waiting for promises)
- OR the in-memory store is not being updated properly in updateTicket

**FIX**:
```typescript
// Ensure all updates are properly awaited
const update1Promise = updateConcur(ticket.id, { title: 'Update 1' });
const update2Promise = updateConcur(ticket.id, { title: 'Update 2' });

// Wait for both
await Promise.all([update1Promise, update2Promise]);

// THEN read
const final = await getConcur(ticket.id);
expect(final?.title).toBe('Update 2');  // Last update should be in store
```

---

### TEST 11: Handle createTicket Error in SQLite Mode

**FILE**: `tests/ticketDb.test.ts:917-925`
**TEST NAME**: `Error Handling > should handle createTicket error in SQLite mode`

**EXPECTED**:
```typescript
createErr() throws/rejects with an Error
// Promise should reject
```

**ACTUAL**:
```typescript
createErr() resolves successfully with ticket object
// Promise resolves instead of rejecting
```

**ROOT CAUSE**: 
The test sets up a mock that should cause db.run() to fail with an error. However, it appears the mock is not working or the error is being caught and a default ticket is returned instead of throwing.

The mock setup expects the callback to be called with an error:
```typescript
(err) => {  // If err is passed, should reject
    reject(err);
}
```

But if the mock's db.run() is not calling the callback with an error, the promise resolves instead.

**FIX**:
Ensure the error is properly passed to the callback:
```typescript
const mockRunSpyErr = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
    const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
    // IMPORTANT: Call callback WITH AN ERROR to trigger rejection
    if (cb) setTimeout(() => cb(new Error('Simulated DB Error')), 0);
});
```

---

### TEST 12: Handle getAllTickets Error in SQLite Mode

**FILE**: `tests/ticketDb.test.ts:934-942`
**TEST NAME**: `Error Handling > should handle getAllTickets error in SQLite mode`

**EXPECTED**:
```typescript
listErr() throws/rejects with an Error  
// db.all() should pass error to callback
```

**ACTUAL**:
```typescript
listErr() resolves with array of tickets
// Error not being passed through
```

**ROOT CAUSE**: 
Same as TEST 11. The mock db.all() is not calling the callback with an error.

**FIX**:
Ensure db.all() mock passes error:
```typescript
this.all = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
    const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
    // IMPORTANT: Call callback WITH ERROR
    if (cb) setTimeout(() => cb(new Error('Simulated DB Error')), 0);
});
```

---

### TEST 13: Handle getTicket Error in SQLite Mode

**FILE**: `tests/ticketDb.test.ts:952-959`
**TEST NAME**: `Error Handling > should handle getTicket error in SQLite mode`

**EXPECTED**:
```typescript
getErr('TICKET-001') throws/rejects with Error
```

**ACTUAL**:
```typescript
getErr('TICKET-001') resolves with null
// Error not being passed through
```

**ROOT CAUSE**: 
Same as TEST 11 & 12. The mock db.get() is not calling the callback with an error.

**FIX**:
Ensure db.get() mock passes error:
```typescript
this.get = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
    const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
    // IMPORTANT: Call callback WITH ERROR
    if (cb) setTimeout(() => cb(new Error('Simulated DB Error')), 0);
});
```

---

### TEST 14: Warn When Initialize Called Twice

**FILE**: `tests/ticketDb.test.ts:978-990`
**TEST NAME**: `Error Handling > should warn when initialize is called twice`

**EXPECTED**:
```typescript
mockLogWarn.toHaveBeenCalled()  // logWarn() called
warnCalls includes message with 'already initialized'
```

**ACTUAL**:
```typescript
mockLogWarn.toHaveBeenCalled() = 0 calls  // MOCK NOT CALLED
```

**ROOT CAUSE**: 
Looking at the initializeTicketDb function:
```typescript
export async function initializeTicketDb(context: vscode.ExtensionContext): Promise<void> {
    if (dbInstance !== null) {
        logWarn('TicketDb already initialized');  // ← This should be called
        return;
    }
    // ...
}
```

The test calls initialize twice, expecting the second to log a warning. But `logWarn` is not being called. This suggests:

1. The global `dbInstance` is being reset between calls
2. OR the mock for `logWarn` is not properly tracking calls
3. OR the condition `dbInstance !== null` is evaluating to false when it should be true

**FIX**:
Ensure dbInstance persists between the two initialize calls:
```typescript
it('should warn when initialize is called twice', async () => {
    const { 
        initializeTicketDb: initErr, 
        resetTicketDbForTests: resetErr 
    } = require('../src/services/ticketDb');
    
    // DON'T reset here - we want to call init twice
    // resetErr();  // <-- REMOVE THIS
    
    await initErr(mockContext);  // First call - sets up dbInstance
    // NOTE: Do NOT reset dbInstance between calls
    
    await initErr(mockContext);  // Second call - should find dbInstance already set
    
    // Assert: Warning should be logged
    expect(mockLogWarn).toHaveBeenCalled();
    const warnCalls = mockLogWarn.mock.calls.map((call: any[]) => call[0]);
    expect(warnCalls.some((msg: string) => msg.includes('already initialized'))).toBe(true);
});
```

---

## Summary of Root Causes

| # | Root Cause | Affected Tests | Severity |
|---|-----------|-----------------|----------|
| 1 | Cache function returns `undefined` instead of fallback object | Tests 1-2 | HIGH |
| 2 | Jest mock not taking effect (missing `jest.resetModules()`) | Tests 3, 4, 6, 7 | HIGH |
| 3 | createdAt being set to null in updateTicket | Tests 5, 9 | HIGH |
| 4 | Concurrent updates test timing or update persistence issue | Test 10 | MEDIUM |
| 5 | Error mocks not passing error to callback | Tests 11, 12, 13 | MEDIUM |
| 6 | dbInstance not persisting between initialize calls | Test 14 | MEDIUM |

---

## Recommended Fix Priority

1. **FIRST** (Highest Impact): Fix jest mock setup (Tests 3,4,6,7) - Add `jest.resetModules()` after `jest.doMock()`
2. **SECOND**: Fix createdAt null issue (Tests 5,9) - Add defensive null checks in updateTicket
3. **THIRD**: Fix error mock callbacks (Tests 11,12,13) - Ensure errors are passed to callbacks
4. **FOURTH**: Fix cache function returns (Tests 1,2) - Verify try-catch blocks execute properly
5. **FIFTH**: Fix concurrent updates test (Test 10) - Ensure proper async/await handling
6. **SIXTH**: Fix double-init warning test (Test 14) - Don't reset dbInstance before second init

---

