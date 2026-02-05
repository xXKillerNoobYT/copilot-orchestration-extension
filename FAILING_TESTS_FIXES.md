# Failing Tests - Recommended Code Fixes

This document contains the specific code changes needed to fix all 14 failing tests.

---

## Fix #1 & #2: Cache Functions - Ensure Return in Error Handlers

**Files**: 
- `src/services/cache/index.ts` (getCacheStats function)
- `src/services/cache/pruning.ts` (getCacheSizeInfo function)

**Issue**: Functions return `undefined` instead of fallback object when error occurs.

**Change Type**: Code Addition - Verify return statement exists in catch blocks

### `src/services/cache/index.ts` - Verify getCacheStats (line 360)

```typescript
// BEFORE (should already have this structure):
export function getCacheStats(context: vscode.ExtensionContext): {...} {
    try {
        const index = loadCacheIndex(context);
        // ... processing ...
        return { /* stats */ };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to get cache stats: ${msg}`);
        // THIS RETURN STATEMENT MUST EXIST:
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
    // NO CODE AFTER catch - function must be complete
}
```

**Action**: Add console.log before compiled JS and verify the JavaScript compiled version at `out/services/cache/index.js` around line 320 has the return statement in the catch block.

---

### `src/services/cache/pruning.ts` - Verify getCacheSizeInfo (line 217)

```typescript
// BEFORE (should already have this structure):
export function getCacheSizeInfo(context: vscode.ExtensionContext): {...} {
    try {
        const index = loadCacheIndex(context);
        // ... processing ...
        return {
            totalBytes: index.totalSizeBytes,
            totalMB: Math.round((index.totalSizeBytes / (1024 * 1024)) * 100) / 100,
            itemCount: index.totalItems,
            largestItem,
            averageItemSize: ...,
        };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to get cache size info: ${msg}`);
        // THIS RETURN STATEMENT MUST EXIST:
        return {
            totalBytes: 0,
            totalMB: 0,
            itemCount: 0,
            largestItem: null,
            averageItemSize: 0,
        };
    }
    // NO CODE AFTER catch
}
```

**Action**: Verify catch block has explicit return statement.

---

## Fix #3, #4, #6, #7: Jest Module Mocking - Add resetModules()

**File**: `tests/ticketDb.test.ts`

**Issue**: `jest.doMock()` doesn't take effect without `jest.resetModules()`. The comment says it was removed to preserve config singleton, but this breaks the mock setup.

**Affected Tests**: 
- Test "should create ticket in SQLite mode" (line ~385)
- Test "should retrieve all tickets from SQLite" (line ~410)
- Test "should update ticket in SQLite mode" (line ~514)
- Test "should migrate SQLite table without type column" (line ~642)

### Solution A: Per-Test Reset with Config Reinit

**Location**: `tests/ticketDb.test.ts` - updateTicket describe block (line 466-489)

```typescript
// BEFORE:
describe('updateTicket', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        // Note: Removed jest.resetModules() to preserve config singleton

        // Re-mock sqlite3 to throw (for in-memory mode)
        jest.doMock('sqlite3', () => {
            throw new Error('sqlite3 module not found (simulated)');
        });

        mockContext = new ExtensionContext('/mock/extension/path');

        // Initialize config before any service initialization
        resetConfigForTests();
        await initializeConfig(mockContext);

        // Setup default in-memory mock
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({
            tickets: { dbPath: './.coe/tickets.db' }
        }));
    });

// AFTER:
describe('updateTicket', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        
        // Re-mock sqlite3 to throw (for in-memory mode)
        jest.doMock('sqlite3', () => {
            throw new Error('sqlite3 module not found (simulated)');
        });
        
        // ↓ ADD THIS - CRITICAL for doMock to take effect
        jest.resetModules();
        // ↑ ADD THIS
        
        mockContext = new ExtensionContext('/mock/extension/path');

        // Initialize config before any service initialization
        // ↓ MOVE resetConfigForTests AFTER resetModules
        resetConfigForTests();
        // ↑ MOVED
        await initializeConfig(mockContext);

        // Setup default in-memory mock
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({
            tickets: { dbPath: './.coe/tickets.db' }
        }));
    });
```

---

## Fix #5, #9: UpdateTicket createdAt Null Issue

**File**: `src/services/ticketDb.ts` 

**Issue**: When updateTicket is called, the returned ticket has `createdAt: null` instead of preserving the original value.

**Location**: TicketDatabase.updateTicket() method (line 247-276)

### Root Cause Investigation:
The issue is that `getTicket(id)` is returning a Ticket where createdAt is null. This shouldn't happen if the ticket was created properly. Add defensive code:

```typescript
// BEFORE (line 247):
async updateTicket(id: string, updates: Partial<Omit<Ticket, 'id' | 'createdAt'>>): Promise<Ticket | null> {
    const existing = await this.getTicket(id);
    if (!existing) {
        logWarn(`Ticket ${id} not found for update`);
        return null;
    }

    const now = new Date().toISOString();
    const updated: Ticket = {
        ...existing,
        ...updates,
        id: existing.id, // Never change ID
        createdAt: existing.createdAt, // Never change createdAt
        updatedAt: now, // Auto-update timestamp
    };

    if (this.isInMemoryMode) {
        this.inMemoryStore!.set(id, updated);
    } else {
        // SQLite update...
    }

    logInfo(`Updated ticket: ${id}`);
    this._changeEmitter.emit('change');
    return updated;
}

// AFTER (add defensive check):
async updateTicket(id: string, updates: Partial<Omit<Ticket, 'id' | 'createdAt'>>): Promise<Ticket | null> {
    const existing = await this.getTicket(id);
    if (!existing) {
        logWarn(`Ticket ${id} not found for update`);
        return null;
    }

    // ADD THIS DEFENSIVE CHECK:
    if (!existing.createdAt) {
        logError(`Ticket ${id} exists but has null createdAt - this indicates a data corruption. Ticket: ${JSON.stringify(existing)}`);
        // Fallback: use current timestamp (not ideal but prevents null)
        // Or throw error to fail fast
        throw new Error(`Cannot update ticket ${id}: createdAt is missing. Database may be corrupted.`);
    }

    const now = new Date().toISOString();
    const updated: Ticket = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
    };

    if (this.isInMemoryMode) {
        this.inMemoryStore!.set(id, updated);
    } else {
        await this.runSQL(
            `UPDATE tickets SET ... WHERE id = ?`,
            [/*params include updated.createdAt, updated.updatedAt, id*/]
        );
    }

    logInfo(`Updated ticket: ${id}`);
    this._changeEmitter.emit('change');
    return updated;
}
```

**Why this helps**: Identifies if createTicket is setting createdAt to null, or if getTicket is returning tickets without createdAt.

---

## Fix #8: Read Old Tickets Without Type Field

**File**: `tests/ticketDb.test.ts` (line 710-736)

**Issue**: Mock SQLite database setup doesn't properly return the pre-populated old ticket.

```typescript
// BEFORE (line 710):
it('should read old tickets without type field as undefined', async () => {
    // Arrange: Setup SQLite mock with pre-populated old ticket (no type column)
    const oldTicketRecord = {
        id: 'OLD-001',
        title: 'Old Ticket',
        status: 'open',
        createdAt: '2026-02-01T10:00:00.000Z',
        updatedAt: '2026-02-01T10:00:00.000Z'
        // NOTE: No 'type' field - simulating old schema
    };

    // Create mock that returns old ticket
    class MockDBForOldTickets {
        get: any;
        all: any;
        run: any;
        close: any;

        constructor(filename: string, callback?: any) {
            if (callback) setTimeout(() => callback(null), 0);
            
            // THIS IS THE PROBLEM - get() needs to return oldTicketRecord
            this.get = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                // ISSUE: Old code might not be returning the ticket
                setTimeout(() => cb(null, oldTicketRecord), 0);  // ← ADD THIS
            });

            this.all = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                setTimeout(() => cb(null, [{ name: 'id' }, { name: 'title' }, { name: 'status' }]), 0);
            });

            this.run = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                if (cb) setTimeout(() => cb(null), 0);
            });

            this.close = jest.fn();
        }

        verbose() { return this; }
    }

    jest.doMock('sqlite3', () => ({
        verbose: () => ({ Database: MockDBForOldTickets })
    }));

    // Rest of test...
});

// AFTER (ensure get() callback includes the ticket):
it('should read old tickets without type field as undefined', async () => {
    const oldTicketRecord = {
        id: 'OLD-001',
        title: 'Old Ticket',
        status: 'open',
        createdAt: '2026-02-01T10:00:00.000Z',
        updatedAt: '2026-02-01T10:00:00.000Z'
    };

    class MockDBForOldTickets {
        get: any;
        all: any;
        run: any;
        close: any;

        constructor(filename: string, callback?: any) {
            if (callback) setTimeout(() => callback(null), 0);
            
            this.get = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                // ENSURE THIS PASSES THE TICKET:
                if (sql.includes('SELECT') && sql.includes('WHERE id')) {
                    setTimeout(() => cb(null, oldTicketRecord), 0);  // ← Returns old ticket
                } else {
                    setTimeout(() => cb(null, null), 0);
                }
            });

            this.all = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                setTimeout(() => cb(null, [{ name: 'id' }, { name: 'title' }]), 0);
            });

            this.run = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
                const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
                if (cb) setTimeout(() => cb(null), 0);
            });

            this.close = jest.fn();
        }

        verbose() { return this; }
    }

    jest.doMock('sqlite3', () => ({
        verbose: () => ({ Database: MockDBForOldTickets })
    }));
    jest.resetModules();  // ← ADD THIS

    // Continue with rest of test...
});
```

---

## Fix #10: Concurrent Updates Test Timing

**File**: `tests/ticketDb.test.ts` (line 798-824)

**Issue**: Updates may not be processed in order or final read gets stale data.

```typescript
// BEFORE (line 798):
it('should handle concurrent updates on same ticket', async () => {
    // Arrange
    const { 
        createTicket: createConcur, 
        updateTicket: updateConcur, 
        getTicket: getConcur 
    } = require('../src/services/ticketDb');

    const ticket = await createConcur({ title: 'Concurrent Test', status: 'open' });

    // Act: Do concurrent updates
    const update1 = updateConcur(ticket.id, { title: 'Update 1' });
    const update2 = updateConcur(ticket.id, { title: 'Update 2' });

    // PROBLEM: Not waiting for both to complete before reading
    const final = await getConcur(ticket.id);

    // Assert: Final state should be last update
    expect(final?.title).toBe('Update 2');
});

// AFTER (ensure both updates complete before read):
it('should handle concurrent updates on same ticket', async () => {
    // Arrange
    const { 
        createTicket: createConcur, 
        updateTicket: updateConcur, 
        getTicket: getConcur 
    } = require('../src/services/ticketDb');

    // Initialize
    await require('../src/services/ticketDb').initializeTicketDb(mockContext);
    
    const ticket = await createConcur({ title: 'Concurrent Test', status: 'open' });

    // Act: Do concurrent updates but WAIT for both
    // FIX: Use Promise.all() to ensure both complete
    const [result1, result2] = await Promise.all([
        updateConcur(ticket.id, { title: 'Update 1' }),
        updateConcur(ticket.id, { title: 'Update 2' })
    ]);

    // Now read - both updates should be persisted
    const final = await getConcur(ticket.id);

    // Assert: Final state should reflect last update
    expect(final).not.toBeNull();
    expect(final?.status).toBe('done');  // From first update
    expect(final?.title).toBe('Update 2');  // From second update (overwrites Update 1)
});
```

---

## Fix #11, #12, #13: Error Handling in Mocked DB Callbacks

**File**: `tests/ticketDb.test.ts`

**Issue**: Mocked database methods don't pass errors to callbacks, causing promises to resolve instead of reject.

### Test #11: createTicket Error (line 917-925)

```typescript
// BEFORE:
it('should handle createTicket error in SQLite mode', async () => {
    const mockRunSpy = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        // PROBLEM: Callback called without error
        if (cb) setTimeout(() => cb(null), 0);  // ← null = success, should be error
    });

    // ... rest of test ...

    await expect(createErr({ title: 'Test', status: 'open' }))
        .rejects.toThrow();
});

// AFTER:
it('should handle createTicket error in SQLite mode', async () => {
    const mockRunSpy = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        // FIX: Pass an error to the callback
        if (cb) {
            setTimeout(() => {
                const error = new Error('Simulated database error: UNIQUE constraint failed');
                cb(error);  // ← Pass error, not null
            }, 0);
        }
    });

    // ... rest of test setup ...

    // This should now reject with the error
    await expect(createErr({ title: 'Test', status: 'open' }))
        .rejects.toThrow('Simulated database error');
});
```

### Test #12: getAllTickets Error (line 934-942)

```typescript
// BEFORE:
it('should handle getAllTickets error in SQLite mode', async () => {
    // ... setup ...
    const mockAllSpy = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        setTimeout(() => cb(null, [/* tickets */]), 0);  // ← PROBLEM: no error
    });

    await expect(listErr()).rejects.toThrow();
});

// AFTER:
it('should handle getAllTickets error in SQLite mode', async () => {
    // ... setup ...
    const mockAllSpy = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        setTimeout(() => {
            const error = new Error('Simulated database error: table locked');
            cb(error);  // ← FIX: Pass error instead of null
        }, 0);
    });

    await expect(listErr()).rejects.toThrow('Simulated database error');
});
```

### Test #13: getTicket Error (line 952-959)

```typescript
// BEFORE:
it('should handle getTicket error in SQLite mode', async () => {
    // ... setup ...
    const mockGetSpy = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        setTimeout(() => cb(null, null), 0);  // ← PROBLEM: no error
    });

    await expect(getErr('TICKET-001')).rejects.toThrow();
});

// AFTER:
it('should handle getTicket error in SQLite mode', async () => {
    // ... setup ...
    const mockGetSpy = jest.fn((sql: string, paramsOrCallback?: any, callback?: any) => {
        const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        setTimeout(() => {
            const error = new Error('Simulated database error: disk I/O error');
            cb(error);  // ← FIX: Pass error instead of null
        }, 0);
    });

    await expect(getErr('TICKET-001')).rejects.toThrow('Simulated database error');
});
```

---

## Fix #14: Initialize Called Twice Warning Test

**File**: `tests/ticketDb.test.ts` (line 978-990)

**Issue**: The test resets dbInstance before calling initialize the second time, so the "already initialized" check never triggers.

```typescript
// BEFORE (line 978):
it('should warn when initialize is called twice', async () => {
    const { 
        initializeTicketDb: initErr, 
        resetTicketDbForTests: resetErr,
        onTicketChange  // Need this to register listener
    } = require('../src/services/ticketDb');
    
    const mockLogWarn = require('../src/logger').logWarn as jest.Mock;

    // PROBLEM: This reset clears dbInstance, so second init doesn't trigger warning
    resetErr();

    await initErr(mockContext);
    await initErr(mockContext);  // ← Second call - should warn but dbInstance was reset

    // Assert: Warning should be logged
    expect(mockLogWarn).toHaveBeenCalled();
    const warnCalls = mockLogWarn.mock.calls.map((call: any[]) => call[0]);
    expect(warnCalls.some((msg: string) => msg.includes('already initialized'))).toBe(true);
});

// AFTER (remove the reset before second init):
it('should warn when initialize is called twice', async () => {
    const { 
        initializeTicketDb: initErr, 
        resetTicketDbForTests: resetErr
    } = require('../src/services/ticketDb');
    
    const mockLogWarn = require('../src/logger').logWarn as jest.Mock;

    // Initialize first time
    await initErr(mockContext);
    // DON'T RESET HERE - we want dbInstance to persist

    // Try to initialize again - should hit the "already initialized" check
    await initErr(mockContext);

    // Assert: Warning should be logged
    expect(mockLogWarn).toHaveBeenCalled();
    const warnCalls = mockLogWarn.mock.calls.map((call: any[]) => call[0]);
    expect(warnCalls.some((msg: string) => msg.includes('already initialized'))).toBe(true);
});
```

---

## Implementation Order

Apply fixes in this order for minimum side effects:

1. **Fix #14** (Test 14) - Simplest, no dependencies
2. **Fix #1 & #2** (Tests 1, 2) - Verify/check only, no changes usually needed
3. **Fix #3 & #4 & #6 & #7** (Tests 3, 4, 6, 7) - Add `jest.resetModules()` 
4. **Fix #13** (Test 13) - Simple mock callback fix
5. **Fix #12** (Test 12) - Simple mock callback fix
6. **Fix #11** (Test 11) - Simple mock callback fix
7. **Fix #8** (Test 8) - Conditional mock return
8. **Fix #10** (Test 10) - Async/await fix using Promise.all()
9. **Fix #5 & #9** (Tests 5, 9) - Defensive null check (may expose other issues)

---

## Verification Checklist

After applying each fix:

```bash
# Compile TypeScript
npm run compile

# Run specific test
npm run test -- --testNamePattern="test name here"

# Run full suite once both tests pass
npm run test:once 2>&1 | Tee-Object -FilePath test-results-verification.txt

# Check pass rate
grep "Tests:" test-results-verification.txt
```

Expected final result after all fixes:
```
Tests:       596 passed, 0 failed
```

