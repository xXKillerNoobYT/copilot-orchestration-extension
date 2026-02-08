# Stage 7 Execution Patterns

**Purpose**: Comprehensive reference for completing Stage 7 (Testing, Integration & Advanced Features)  
**Related Files**: MT-033, MT-034, all `src/agents/`, `src/ui/`, `src/generators/`  
**Keywords**: stage-7, coverage, planning-wizard, lm-studio, integration

## Stage 7 Overview

**Scope**: 176 tasks across 4 master tickets
- MT-030: Custom Agent Builder ✅ COMPLETE
- MT-031: Testing Infrastructure (18 tasks)  
- MT-032: Test Coverage Improvement (52 tasks)
- MT-033: Planning Wizard (50 tasks, Phases 1-2 ✅)
- MT-034: LM Studio Integration (28 tasks)

**Target Metrics**:
- Line coverage: 85%+ (from 65.67%)
- Function coverage: 80%+ (from 59.26%)
- Branch coverage: 70%+ (from 51.64%)
- Total tests: 8,500+ (from ~6,249)

---

## Zero-Coverage File Testing Pattern

### When to Use
Files at 0% coverage are **highest priority** because they:
1. Represent untested code paths (potential bugs)
2. Block accurate coverage reporting
3. Often contain critical utility functions

### How to Test

1. **Read the source file** - Understand all exports
2. **Map functions to test categories**:
   - Happy path (normal input → expected output)
   - Edge cases (empty, null, undefined, very large)
   - Error paths (invalid input → proper error)
   - Boundary conditions (min/max values)

3. **Use this template**:
```typescript
// tests/[path]/[filename].test.ts
import { functionA, functionB } from '../../src/[path]/[filename]';

describe('[Filename] Tests', () => {
    describe('functionA', () => {
        it('Test 1: should return expected result for valid input', () => {
            expect(functionA('valid')).toBe('expected');
        });
        
        it('Test 2: should handle empty input', () => {
            expect(functionA('')).toBe('');
        });
        
        it('Test 3: should throw for null input', () => {
            expect(() => functionA(null as any)).toThrow();
        });
    });
});
```

4. **Coverage target per file**: 80%+ lines, 70%+ branches

### Files Currently at 0%

| File | Lines | Functions | Priority |
|------|-------|-----------|----------|
| `src/agents/custom/templates.ts` | 22 | 12 | P0 |
| `src/agents/custom/variables.ts` | 28 | 9 | P0 |
| `src/agents/orchestrator/routing/codingAI.ts` | 75 | 13 | P0 |
| `src/agents/orchestrator/routing/verification.ts` | 92 | 18 | P0 |
| `src/agents/orchestrator/index.ts` | 14 | 4 | P1 |

---

## MT-033 Planning Wizard Architecture

### Page Flow
```
Page 1: Project Overview     → Name, description, problem, users
Page 2: Feature Blocks       → Add/edit/reorder features
Page 3: Dependencies         → Link features with visual graph
Page 4: User Stories         → Auto-generated from features
Page 5: Developer Stories    → Technical implementation details
Page 6: Success Criteria     → Metrics, milestones, risks
Page 7: Review & Export      → Summary, export options
```

### State Management
- State stored in `PlanningWizardPanel._currentPlan`
- Each page reads/writes to relevant plan sections
- Navigation preserves state via `_updatePlan()` method
- Export creates snapshot of final state

### Handler Implementation Pattern
```typescript
// In wizardHtml.ts, each page has:
private _getPage${N}Handlers(): string {
    return `
        <script>
            const vscode = acquireVsCodeApi();
            
            // Form field handlers
            document.getElementById('field').addEventListener('change', (e) => {
                vscode.postMessage({
                    type: 'updateField',
                    page: ${N},
                    field: 'fieldName',
                    value: e.target.value
                });
            });
            
            // Navigation
            document.getElementById('next').addEventListener('click', () => {
                vscode.postMessage({ type: 'navigate', direction: 'next' });
            });
        </script>
    `;
}
```

### Testing Wizard Components
```typescript
describe('Planning Wizard Page N', () => {
    let panel: PlanningWizardPanel;
    let mockWebview: jest.Mocked<vscode.Webview>;
    
    beforeEach(() => {
        mockWebview = createMockWebview();
        panel = new PlanningWizardPanel(mockContext, mockWebview);
    });
    
    it('Test 1: should render page N HTML', () => {
        const html = panel.getPageHtml(N);
        expect(html).toContain('page-N-content');
    });
    
    it('Test 2: should handle field update message', async () => {
        await panel.handleMessage({
            type: 'updateField',
            page: N,
            field: 'name',
            value: 'Test Project'
        });
        expect(panel.getCurrentPlan().name).toBe('Test Project');
    });
});
```

---

## MT-034 LM Studio Integration Patterns

### API v1 Structure
```typescript
// src/llm/lmStudioClient.ts
interface LMStudioRequest {
    model: string;
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}

interface LMStudioResponse {
    id: string;
    choices: { message: { content: string; role: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number };
}
```

### Dual API Support
```typescript
// llmService.ts modification
async chat(messages: Message[]): Promise<string> {
    const apiVersion = await this.detectApiVersion();
    
    if (apiVersion === 'v1') {
        return this._chatV1(messages);
    } else {
        return this._chatLegacy(messages);
    }
}
```

### Tool Calling Pattern
```typescript
interface ToolDefinition {
    name: string;
    description: string;
    parameters: JsonSchema;
}

// Agentic loop
async executeWithTools(prompt: string, tools: ToolDefinition[]): Promise<string> {
    let response = await this.chat([{ role: 'user', content: prompt }], { tools });
    
    while (response.toolCalls?.length) {
        const results = await this.executeToolCalls(response.toolCalls);
        response = await this.chat([...history, { role: 'tool', content: results }]);
    }
    
    return response.content;
}
```

---

## Coverage Improvement Strategies

### Quick Coverage Wins
1. **Index files** - Usually just re-exports, 100% with simple import tests
2. **Type-only files** - May not need tests if no runtime code
3. **Utility functions** - High test density, quick to write

### Branch Coverage Focus
- `if/else` statements need both paths
- `switch` cases need all branches + default
- Ternary operators count as branches
- Optional chaining `?.` counts as branch

### Test Organization
```
tests/
├── agents/
│   ├── custom/           # MT-030 tests
│   ├── planning/         # MT-033 agent tests
│   └── orchestrator/     # Routing tests
├── ui/                   # MT-033 UI tests
├── llm/                  # MT-034 tests
├── services/             # Service layer tests
└── integration/          # E2E tests
```

---

## Verification Checklists

### Per-Task Checklist
- [ ] Source file identified and read
- [ ] All exports/functions listed
- [ ] Test file created with naming convention
- [ ] "Test N:" prefix on all descriptions
- [ ] Happy path tests written
- [ ] Edge case tests written
- [ ] Error path tests written
- [ ] `npm test -- [test-file]` passes
- [ ] Coverage checked: `npm run test:coverage`
- [ ] Target coverage (80%+) achieved
- [ ] No TypeScript errors
- [ ] No ESLint warnings

### Per-Phase Checklist
- [ ] All phase tasks completed
- [ ] All tests passing (`npm run test:once`)
- [ ] Coverage target met
- [ ] No regressions in existing tests
- [ ] Documentation updated (if applicable)
- [ ] PROJECT-BREAKDOWN updated with completions

### Stage 7 Completion Checklist
- [ ] 176/176 tasks complete
- [ ] 85%+ line coverage
- [ ] 80%+ function coverage
- [ ] 70%+ branch coverage
- [ ] 8,500+ tests passing
- [ ] All MT tickets marked complete
- [ ] Stage gate passed

---

## Common Pitfalls (Stage 7 Specific)

### 1. Wizard State Loss
**Problem**: Navigation between pages loses entered data  
**Solution**: Always call `_updatePlan()` before navigation, verify state persistence in tests

### 2. Coverage Report Staleness
**Problem**: Coverage numbers don't reflect recent changes  
**Solution**: Run `npm run test:coverage` after each file change, clear `coverage/` if needed

### 3. LM Studio Connection
**Problem**: Tests fail when LM Studio not running  
**Solution**: Mock all LM Studio calls in tests, only use live connection in integration tests

### 4. Circular Dependencies
**Problem**: Import cycles between planning/orchestrator modules  
**Solution**: Use index.ts barrel exports, check with `madge --circular src/`

### 5. Test Isolation
**Problem**: Tests pass individually but fail together  
**Solution**: Reset all singletons in `beforeEach()`, use `jest.resetModules()`

---

## Quick Reference Commands

```bash
# Run all tests
npm run test:once

# Run specific test file
npm test -- tests/agents/custom/templates.test.ts

# Run with coverage
npm run test:coverage

# View coverage report
start coverage/lcov-report/index.html  # Windows
open coverage/lcov-report/index.html   # macOS

# Check for TypeScript errors
npm run compile

# Lint
npm run lint

# Watch mode for development
npm run watch
```

---

## Priority Task Order (Stage 7)

### P0: Critical Blockers (~16 hours)
1. Zero-coverage files: templates.ts, variables.ts, codingAI.ts, verification.ts
2. Low-coverage boost: acceptanceCriteria.ts (5% → 80%), designSystem.ts (6% → 80%)
3. MT-033 Phase 3: Page 1-7 JavaScript handlers
4. Integration test: Full wizard flow

### P1: High Priority (~22 hours)
1. MT-033 Phase 4: Templates, exports, graph, validation
2. MT-034 Phase 1: LM Studio REST API v1 client
3. Additional coverage targets

### P2: Medium Priority (~30 hours)
1. MT-033 Phases 5-6: Code generation, orchestration
2. MT-034 Phases 2-3: Tool calling, MCP

### P3: Lower Priority (~15 hours)
1. MT-033 Phases 7-8: Error detection, doc sync
2. MT-034 Phase 4: Advanced streaming
3. Polish and documentation

---

## File References

### MT-033 Core Files
- `src/planning/types.ts` - Plan data structures
- `src/planning/schema.ts` - Zod validation
- `src/services/planningService.ts` - Business logic
- `src/ui/planningWizard.ts` - Panel controller
- `src/ui/wizardHtml.ts` - HTML/CSS/JS generation
- `src/ui/wizardPages.ts` - Page content renderers

### MT-034 Core Files (to create)
- `src/llm/lmStudioClient.ts` - API client
- `src/llm/mcpBridge.ts` - MCP integration
- `src/llm/toolExecutor.ts` - Tool calling

### Test Directories
- `tests/agents/custom/` - Custom agent tests
- `tests/agents/orchestrator/` - Orchestrator tests
- `tests/agents/planning/` - Planning agent tests
- `tests/ui/` - UI component tests
- `tests/llm/` - LLM integration tests
