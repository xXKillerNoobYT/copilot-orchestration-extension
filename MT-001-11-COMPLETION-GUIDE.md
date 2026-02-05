# MT-001.11 Completion Guide
**Status**: 60% Complete (imports added, config read code needs manual replacement)  
**Date**: February 4, 2026  
**Last Updated By**: Automated implementation script

## What's Been Done ✅

1. **src/extension.ts**
   - ✅ Added `import { initializeConfig } from './config';`
   - ✅ Added `await initializeConfig(context);` in activate() after logger init

2. **All Services - Config Import Added**
   - ✅ src/services/llmService.ts: `import { getConfigInstance } from '../config';`
   - ✅ src/services/orchestrator.ts: `import { getConfigInstance } from '../config';`
   - ✅ src/services/ticketDb.ts: `import { getConfigInstance } from '../config';`
   - ✅ src/logger.ts: `import { getConfigInstance } from './config';`

3. **Build Status**
   - ✅ npm run compile: SUCCESS (zero TypeScript errors)

## What Still Needs To Be Done ❌

### 1. Fix orchestrator.ts Config Read (HIGHEST PRIORITY)
**File**: `src/services/orchestrator.ts`  
**Location**: Lines 135-168 (in the `initialize()` method)  
**Current Code**: Reading config from .coe/config.json file directly with try/catch  
**Old Code Pattern**:
```typescript
const configPath = path.join(context.extensionPath, '.coe', 'config.json');
try {
    if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        // ... validation logic ...
    }
} catch (err) {
    logWarn(`Failed to read orchestrator config: ${err}`);
}
```

**Replace With**:
```typescript
// Now using central config system
const config = getConfigInstance();
this.taskTimeoutSeconds = config.orchestrator.taskTimeoutSeconds;
```

### 2. Fix llmService.ts Config Read
**File**: `src/services/llmService.ts`  
**Location**: Lines ~206-230 (in the initialization section)  
**Current Code**: Reading LLM config from file with merging logic  
**Replace With**:
```typescript
// Now using central config system
const configInstance = getConfigInstance();
const config = configInstance.llm;
```

### 3. Fix ticketDb.ts Config Read
**File**: `src/services/ticketDb.ts`  
**Location**: Lines ~52-65 (in the `initialize()` method)  
**Current Code**: Reading tickets.dbPath from config.json  
**Replace With**:
```typescript
// Now using central config system
const config = getConfigInstance();
const dbPathFromConfig = config.tickets.dbPath;
```

### 4. Fix Test Initialization Order
**Issue**: Tests fail because `getConfigInstance()` is called in orchestrator before config is initialized in test setup  
**Fix**: Add this to test beforeEach() blocks:
```typescript
beforeEach(async () => {
    // Initialize config before any service that uses it
    await initializeConfig(mockContext);
    // Then initialize other services...
});
```

Or mock getConfigInstance() in tests to return a default config immediately.

## How To Complete

### Quick Manual Fix (10 minutes)
1. Open each file mentioned above in VS Code
2. Locate the config reading blocks (they have comments indicating them)
3. Replace with the getConfigInstance() calls above
4. Save all files

### Then Validate
```bash
npm run compile    # Should succeed
npm run test:once  # Should pass all tests
```

## Testing After Completion
```bash
# Test only the modified services
npm run test:once -- --testPathPattern="llmService|orchestrator|ticketDb"

# Full test suite with coverage
npm run test:once --coverage
```

## Success Criteria
- ✅ No TypeScript compilation errors
- ✅ All existing tests pass (zero regressions)
- ✅ Services no longer read directly from .coe/config.json files
- ✅ All services use getConfigInstance() for config access
- ✅ Config changes on reload take effect without restart

## Files Involved
- src/extension.ts (mostly done, just needs verification)
- src/services/llmService.ts
- src/services/orchestrator.ts
- src/services/ticketDb.ts
- src/logger.ts
- tests/ (may need initialization order fixes)

## Why This Matters
This task (MT-001.11) completes the foundation for:
- **MT-002** (Error Handling) - depends on working config system
- **MT-003** (Ticket Database) - depends on working ticketDb config
- **MT-004** (LLM Integration) - depends on working llmService config

**Blocking all of Stage 2 until complete!**

---

**Questions?** Refer to [Docs/This Program's Plans/01-Architecture-Document.md](../01-Architecture-Document.md) for architectural context.
