# Noob Proofing Skill

**Purpose**: Make COE accessible and safe for new developers  
**Related Files**: Skills documentation, onboarding guides, error messages  
**Keywords**: beginner-friendly, safe-defaults, clear-messages, learning-friendly

## Noob Proofing Principles

### 1. Simple Explanations First

Every skill should explain WHAT before diving into HOW.

✅ Better:
```
Singleton Pattern = "Only one copy exists"
**Simple explanation**: Like the restaurant manager - there's only one,
everyone asks them for decisions. This function gets you that manager.
```

❌ Worse:
```
template<typename T>
class Singleton {
    static T& getInstance() { // Implementation details...
```

### 2. Real Examples, Not Theory

Always show actual code from this codebase - not generic examples.

✅ Better:
```typescript
// From our actual orchestrator.ts
class Orchestrator {
    private taskQueue: Task[] = [];
    
    async getNextTask(): Promise<Task | null> {
        return this.taskQueue.shift() || null;
    }
}
```

❌ Worse:
```typescript
// Abstract example
class ServiceExample {
    private queue: Item[] = [];
    process(): Item { /* ... */ }
}
```

### 3. Build Safety Rails

Make it hard to do things wrong.

```
Safe: 
- Singletons reset in test beforeEach
- Errors logged, not swallowed
- Timeouts prevent hangs
- Fallbacks prevent crashes

Unsafe:
- "Just use any type"
- Silent failures
- No error messages
- Can break easily
```

### 4. Clear Error Messages

When something goes wrong, help them fix it.

```typescript
// BAD - leaves developer confused
throw new Error('Service not initialized');

// GOOD - tells them exactly what to do
throw new Error('Orchestrator not initialized. Call initializeOrchestrator(context) in extension.activate() before using getOrchestratorInstance()');
```

### 5. Obvious Mistakes = Big Tests

Wrap common mistakes in guard tests so they catch them early.

```typescript
// Test that catches "forgetting to reset singleton"
it('Test 1: should fail if singleton not reset', async () => {
    await initializeMyService(context);
    
    // If they forget resets, this fails loudly
    expect(() => initializeMyService(context)).toThrow('already initialized');
});
```

## Beginner Onboarding Checklist

For new developer starting on COE:

- [ ] Read `README.md` (5 min)
- [ ] Read `.github/skills/README.md` (5 min)
- [ ] Read `.github/copilot-instructions.md` (10 min)
- [ ] Pick one skill, read end-to-end (15 min)
- [ ] Try to write simple code using that skill
- [ ] Run tests (see that they pass)
- [ ] Read one test file (understand patterns)
- [ ] Try to modify one test
- [ ] Do guided code review with mentor

## Common Beginner Mistakes

Create guards for each:

### Mistake 1: Wrong Initialization Order
```typescript
// ❌ WRONG - config not initialized yet
await initializeOrchestrator(context);
await initializeConfig(context);

// ✅ RIGHT - config first
await initializeConfig(context);
await initializeOrchestrator(context);
```

Guard: Test that checks order
```typescript
it('should throw if orchestrator accessed before config', () => {
    expect(() => getOrchestratorInstance()).toThrow('not initialized');
});
```

### Mistake 2: Forgetting Service Reset in Tests
```typescript
// ❌ WRONG - state leaks between tests
test1(): await initializeMyService();
test2(): await initializeMyService(); // Error!

// ✅ RIGHT - reset in beforeEach
beforeEach(() => resetMyServiceForTests());
```

### Mistake 3: Missing Await
```typescript
// ❌ WRONG - doesn't wait for async
for (const ticket of tickets) {
    processTicket(ticket.id); // continues immediately
}
console.log('Done!'); // Lies!

// ✅ RIGHT - waits for each
for (const ticket of tickets) {
    await processTicket(ticket.id);
}
```

### Mistake 4: Wrong Error Handling
```typescript
// ❌ WRONG - uses 'any'
catch (error: any) {
    logError(error.message); // Could crash!
}

// ✅ RIGHT - checks type first
catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(msg);
}
```

## Documentation for Beginners

Every concept needs a "Why"

```
PATTERN: Singleton Services

What: Only one instance of service exists
Why: Single source of truth, easier testing, prevents confusion

How: Use getter function (getXInstance)

When: Always for core services (Config, DB, LLM, Orchestrator)

Example: orchestrator.ts uses getOrchestratorInstance()

Mistake to avoid: Creating multiple instances
```

## Making Errors Obvious

### Good Error Messages

```typescript
// ❌ Cryptic
throw new Error('Service not init');

// ✅ Clear and actionable
throw new Error(`Orchestrator not initialized.
Call initializeOrchestrator(context) in extension.activate()
BEFORE any code tries to use getOrchestratorInstance().

Did you call initializeOrchestrator in the right place?`);
```

### Guard Clauses Make Intent Clear

```typescript
// ✅ Obvious what's needed
export function getOrchestratorInstance(): Orchestrator {
    if (!instance) {
        throw new Error(`Orchestrator not initialized.
            Did you call initializeOrchestrator(context)?`);
    }
    return instance;
}
```

## Gradual Complexity

Introduce complexity gradually:

```
Week 1: Read skills 01-04 (architecture, basics)
Week 2: Read skills 05-09 (UI and integration)
Week 3: Read skills 10-13 (patterns)
Week 4: Read skills 14-15 (advanced)
Month 2: Contribute new patterns
```

## Pair Programming Prompts

When helping new dev:
- "Why do you think that pattern exists?"
- "What would go wrong if we didn't do X?"
- "Where would you look to find that answer?"
- "How would we test that?"

## Related Skills
- **[04-jsdoc-style.md](04-jsdoc-style.md)** - Documentation style
- **[03-testing-conventions.md](03-testing-conventions.md)** - Test patterns
- **[14-common-pitfalls.md](14-common-pitfalls.md)** - Mistakes to avoid
