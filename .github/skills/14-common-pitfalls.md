# Common Pitfalls and Solutions

**Purpose**: Known issues, mistakes to avoid, and performance considerations  
**Related Files**: All COE files  
**Keywords**: pitfalls, mistakes, performance, debugging, gotchas

## Quick Reference Checklist

Before committing code, verify:

- [ ] All services initialized in correct order
- [ ] Singletons reset in test `beforeEach()`
- [ ] Fake timers cleaned up in `afterEach()`
- [ ] All async operations have `await`
- [ ] Config values read from `getConfigInstance()`, not hardcoded
- [ ] Catch blocks use `catch (error: unknown)`
- [ ] Errors logged, not swallowed silently
- [ ] No `console.log` in MCP server code
- [ ] TreeView refresh called after data changes
- [ ] EventEmitter `.fire()` called after DB modifications
- [ ] Conversation history trimmed to max exchanges
- [ ] Token limits checked before LLM requests
- [ ] Intervals/timeouts cleaned up in `finally` blocks
- [ ] Migrations are idempotent
- [ ] Test descriptions prefixed with "Test N:"

See full documentation in related skills.