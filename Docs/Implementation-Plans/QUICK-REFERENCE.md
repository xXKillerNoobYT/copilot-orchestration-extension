# Custom Agent Features - Quick Reference Guide

**Generated**: February 6, 2026  
**Total Effort**: 100 minutes planned (actual: {in progress})  
**Status**: Ready to implement (all dependencies complete ✅)

---

## 🎯 Three Features at a Glance

### Feature 1️⃣: MT-030.8 Metadata Fields (20 min)
| Aspect | Details |
|--------|---------|
| **What** | Add author, version, tags, priority to agents |
| **Where** | Schema updates + UI input fields |
| **Validation** | Semantic versioning (1.0.0 format) |
| **Tests** | 30+ tests covering validation, persistence, display |
| **Risk Level** | LOW - schema already 90% done |
| **Key File** | `src/agents/custom/schema.ts` + UI updates |

**Quick Start**: Schema is complete; just add JSDoc.describe(), then wire UI inputs.

---

### Feature 2️⃣: MT-030.7 Custom Lists (45 min)
| Aspect | Details |
|--------|---------|
| **What** | Create 0-7 reusable lists in agent config |
| **Where** | Web UI form with CRUD interface |
| **Structure** | name, description, items (1-100 each) |
| **UX** | Collapse/expand, color coding, export to JSON |
| **Tests** | 40+ tests for CRUD, validation, persistence |
| **Risk Level** | MEDIUM - UI-heavy, lots of state management |
| **Key File** | `src/ui/customAgentBuilder.ts` |

**Quick Start**: Create HTML templates, CustomListManager class, wiring, CSS.

---

### Feature 3️⃣: MT-030.11 Preview/Test Mode (35 min)
| Aspect | Details |
|--------|---------|
| **What** | "Test" button to preview agent responses |
| **Where** | Bottom of builder form + modal panel |
| **Behavior** | Input sample query → execute → show response + tokens + timing |
| **UX** | Loading spinner, error handling, retries |
| **Tests** | 40+ tests for execution, substitution, error handling |
| **Risk Level** | MEDIUM - async/await complexity |
| **Key File** | `src/ui/customAgentBuilder.ts` + executor integration |

**Quick Start**: UI panel, test manager class, extension message handler, variable substitution logic.

---

## 📋 Implementation Checklist

### Before You Start
```
□ Verify all dependencies complete (MT-030.1, 030.3, 030.10 ✅)
□ npm run compile succeeds
□ npm run test:once passes
□ Read full plan: Docs/Implementation-Plans/CUSTOM-AGENT-FEATURES-BREAKDOWN.md
□ Create test files for each feature
□ Git commit current state
```

### MT-030.8 Execution
```
□ Update schema.ts - verify AgentMetadataSchema complete
□ Add HTML form section (author, version, tags)
□ Add CSS styling (.metadata-section)
□ Add TypeScript message handlers (fieldChanged cases)
□ Create tests/agents/custom/schema.metadata.test.ts
□ Create tests/ui/customAgentBuilder.metadata.test.ts
□ npm run test:once -- customAgent (verify all pass)
□ npm run compile (verify no errors)
Actual Time: ___ minutes
```

### MT-030.7 Execution
```
□ Create HTML templates (list item, list, color indicator)
□ Implement CustomListManager class
□ Add message handlers (addCustomList, removeCustomList, etc.)
□ Add CSS styling (.custom-lists-section, .list-item, .list-color-indicator, etc.)
□ Add renderCustomLists() and updateListCount() methods
□ Create tests/ui/customAgentBuilder.customLists.test.ts
□ Test CRUD operations (create, add item, remove item, export)
□ npm run test:once -- customList (verify all pass)
□ npm run compile (verify no errors)
Actual Time: ___ minutes
```

### MT-030.11 Execution
```
□ Create HTML test panel (query input, output area, metrics)
□ Implement AgentTestManager class
□ Add message handler for 'testAgent'
□ Implement executeAgentTest() method with variable substitution
□ Add CSS styling (.test-panel, .test-response, .test-status, .test-metrics)
□ Add variable substitution logic ({{task_id}}, {{current_date}}, etc.)
□ Add timeout handling (30 seconds max)
□ Create tests/ui/customAgentBuilder.preview.test.ts
□ Create tests/services/customAgentExecutor.testMode.test.ts
□ Test with various agents (with/without custom lists)
□ npm run test:once -- preview (verify all pass)
□ npm run compile (verify no errors)
Actual Time: ___ minutes
```

### Final Verification
```
□ npm run test:once (all tests pass)
□ npm run compile (no errors)
□ Manual test in VS Code:
  □ Create agent with metadata
  □ Add 3-5 custom lists
  □ Click Test button
  □ Enter sample query
  □ Verify response displays
  □ Save agent
  □ Load agent and verify all data persisted
□ Check for console errors
□ Update time tracker
```

---

## ⏱️ Time Tracking

**Start Time**: ___________  
**End Time**: ___________  

| Feature | Planned | Actual | Notes |
|---------|---------|--------|-------|
| MT-030.8 Metadata | 20 min | ___ | |
| MT-030.7 Lists | 45 min | ___ | |
| MT-030.11 Preview | 35 min | ___ | |
| **TOTAL** | **100 min** | **___** | |

---

## 🚨 Top 5 Pitfalls to Watch

1. **Unique list name constraint** (HIGH RISK)
   - Problem: Duplicates allowed when updating name
   - Solution: Check existing names: `lists.some((l, i) => i !== idx && l.name.toLowerCase() === newName.toLowerCase())`

2. **Minimum items violated** (HIGH RISK)  
   - Problem: Remove last item from list
   - Solution: Block removal if `list.items.length <= 1`

3. **Test timeout hangs** (HIGH RISK)
   - Problem: Agent test never completes  
   - Solution: Wrap in `Promise.race([execution, timeout(30000)])`

4. **Character count lag** (MEDIUM RISK)
   - Problem: Counts not updating in real-time
   - Solution: Use `input` event, not `change`: `el.addEventListener('input', updateCount)`

5. **Agent not validated before test** (HIGH RISK)
   - Problem: Invalid config still executes
   - Solution: `validateCustomAgent()` first, reject if errors exist

---

## 🔗 Key Files Reference

| File | Purpose | Size |
|------|---------|------|
| `src/agents/custom/schema.ts` | Zod validation schemas | 548 lines |
| `src/ui/customAgentBuilder.ts` | Builder webview/UI | 2170 lines |
| `src/agents/custom/storage.ts` | Agent persistence | 650 lines |
| `src/agents/custom/executor.ts` | Agent execution | 680 lines |
| `src/agents/custom/routing.ts` | Task routing | 699 lines |

**Test Files to Create**:
- `tests/agents/custom/schema.metadata.test.ts` (30+ tests)
- `tests/ui/customAgentBuilder.metadata.test.ts` (8 tests)
- `tests/ui/customAgentBuilder.customLists.test.ts` (40+ tests)
- `tests/ui/customAgentBuilder.preview.test.ts` (20+ tests)
- `tests/services/customAgentExecutor.testMode.test.ts` (12+ tests)

---

## 📖 Documentation Links

Full implementation details: `Docs/Implementation-Plans/CUSTOM-AGENT-FEATURES-BREAKDOWN.md`

**Each feature includes**:
- ✅ Complete code examples (copy-paste ready)
- ✅ Test case breakdowns (30-40 tests per feature)
- ✅ CSS styling complete
- ✅ Pitfall analysis with solutions
- ✅ Time estimate breakdowns

---

## 🎓 Learning Path (if new to codebase)

If this is your first time implementing features, follow this order:

1. **Read these instruction files** (15 min)
   - `.github/copilot-instructions.md` - Project architecture
   - `.github/skills/02-service-patterns.md` - Singleton pattern
   - `.github/skills/03-testing-guidelines.md` - Jest conventions

2. **Examine existing code** (15 min)
   - Look at `MT-030.6` (Checklist Manager) - similar UI pattern
   - Look at `MT-030.10` (Executor) - understand async/await patterns
   - Look at existing tests in `tests/ui/` - test pattern examples

3. **Start with MT-030.8** (20 min)
   - Simplest feature, no complex UI
   - Mostly schema and message handlers
   - Great way to verify your environment works

4. **Then MT-030.7** (45 min)
   - More complex UI
   - Introduces CustomListManager pattern
   - Good practice for state management

5. **Finally MT-030.11** (35 min)
   - Most complex
   - Async/await with timeouts
   - Variable substitution logic

---

## ❓ FAQ & Troubleshooting

### "Tests won't compile"
**Solution**: Check imports at top of test file:
```typescript
import { validateCustomAgent, CustomAgent } from '../../src/agents/custom/schema';
import { CustomListManager } from '../../src/ui/customAgentBuilder';
```

### "Message not being received in webview"
**Solution**: Check message type string matches exactly - case-sensitive!
```typescript
// These must match:
vscode.postMessage({ type: 'testAgent', ... })  // sender
case 'testAgent': { ... }  // receiver
```

### "Variable substitution not working"
**Solution**: Use proper regex with global flag:
```typescript
const subs = { '{{foo}}': 'bar' };
const result = text.replace(/\{\{(\w+)\}\}/g, (m) => subs[m] ?? m);
```

### "Timeout doesn't work"
**Solution**: Use Promise.race() not setTimeout():
```typescript
await Promise.race([
  executeQuery(),
  new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 30000))
]);
```

---

## 🏁 Success Criteria (Final Checklist)

### Feature 1: Metadata ✅ when...
- [ ] Semantic version validation works (1.0.0 accepted, 1.0 rejected)
- [ ] Author field accepts 0-100 chars
- [ ] Tags parsed from comma-separated input
- [ ] Metadata persists when saving/loading agent
- [ ] All 8 test suites pass (30+ tests)

### Feature 2: Lists ✅ when...
- [ ] Can create 0-7 lists (enforced)
- [ ] List name requires 1-50 chars, unique
- [ ] List items required 1-100 per list
- [ ] Character counts update real-time
- [ ] Collapse/expand toggle works
- [ ] Color coding displays for each list
- [ ] Export to JSON works
- [ ] All 14 test suites pass (40+ tests)

### Feature 3: Preview ✅ when...
- [ ] Test button visible in form
- [ ] Test panel opens/closes properly
- [ ] Agent validated before test
- [ ] Sample query executes
- [ ] Response displays in modal
- [ ] Token counts show correctly
- [ ] Response timing shows in ms
- [ ] Errors handled gracefully
- [ ] Timeout after 30 seconds
- [ ] All 22 test suites pass (40+ tests)

---

**Total Test Coverage**: 110+ tests  
**Estimated 100% Coverage**: ✅

---

**Ready? Start with Feature #1: `Docs/Implementation-Plans/CUSTOM-AGENT-FEATURES-BREAKDOWN.md` → Section "Feature 1: MT-030.8 Agent Metadata Fields"**
