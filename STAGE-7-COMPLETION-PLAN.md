# STAGE 7 COMPLETION PLAN - MT-030 Remaining Tasks

## Current Status: 11 / 22 Tasks Complete (50%)

### ✅ COMPLETED (11 tasks):
- MT-030.1: Agent schema ✅
- MT-030.2: Coding hardlock ✅  
- MT-030.3: Builder UI ✅
- MT-030.4: Prompt autocomplete ✅
- MT-030.5: Goal drag-reorder ✅
- MT-030.6: Checklist with templates ✅
- MT-030.9: Agent storage ✅
- MT-030.10: Execution framework ✅
- MT-030.15: Activation/deactivation ✅
- MT-030.16: Routing rules ✅
- Plus: get_errors MCP tool FIXED ✅

### ❌ REMAINING (11 tasks) - ESTIMATED 320 MINUTES TOTAL:

**Priority P0 (Critical - 115 min)**:
1. **MT-030.11**: Preview/test mode (35 min) - Implementation spec ready in MT-030.11-IMPLEMENTATION-SPEC.md
2. **MT-030.22**: Comprehensive custom agent tests (45 min) - Depends on all other tasks  
3. **MT-030.12**: Agent templates library (40 min) - P2 but needed for testing

**Priority P1 (High - 145 min)**:
4. **MT-030.13**: Variable substitution system (35 min)
5. **MT-030.19**: Agent permissions model (35 min)
6. **MT-030.20**: Agent context limits (25 min)
7. **MT-030.17**: Performance metrics (30 min)
8. **MT-030.18**: Agent export/sharing (30 min)

**Priority P2 (Medium - 60 min)**:
9. **MT-030.14**: Agent versioning (25 min)
10. **MT-030.21**: Agent gallery UI (40 min)

## Implementation Strategy

### PHASE 1: Quick Wins (First 3 tasks) - 120 minutes
1. **MT-030.11** (35 min) - Ready to implement, implementation spec exists
   - Add test button + modal to customAgentBuilder.ts
   - Wire to agent executor
   - Display response + metrics

2. **MT-030.12** (40 min) - Templates library
   - Create templates.ts with 5-10 starter templates
   - YAML/JSON loader
   - Tests for loading and instantiation

3. **MT-030.13** (35 min) - Variable substitution  
   - Create variables.ts
   - Support {{task_id}}, {{ticket_id}}, {{user_query}}, {{file_path}}, {{selection}}, {{custom_var}}
   - Autocomplete support in UI

### PHASE 2: Mid-Priority Tasks (4 tasks) - 125 minutes
4. **MT-030.19** (35 min) - Permissions model
   - Granular permissions: read_files, search_code, create_tickets, call_llm, access_network
   - Coding always denied (hardlock enforcement)
   
5. **MT-030.20** (25 min) - Context limits
   - Configurable token limits (default 4000)
   - Smart truncation with overflow warnings

6. **MT-030.17** (30 min) - Performance metrics
   - Track invocations, response time, success rate, user ratings
   - Charts and CSV export

7. **MT-030.18** (30 min) - Export/sharing
   - Export as YAML/JSON file
   - Import validation

### PHASE 3: Final Tasks (2 tasks) - 55 minutes  
8. **MT-030.14** (25 min) - Agent versioning
   - Last 5 versions, rollback support
   - Diff view between versions

9. **MT-030.21** (40 min) - Agent gallery UI
   - Browse, search, filter, install
   - Categories and ratings
   - Built-in + custom agents

### PHASE 4: Wrap-up (1 task) - 45 minutes
10. **MT-030.22** (45 min) - Comprehensive tests
    - Full workflow tests (create → configure → test → save → invoke → metrics)
    - ≥85% coverage on custom agent code
    - Hardlock enforcement verification

## Total Remaining Work
- **Time**: ~320 minutes (~5.3 hours)
- **Tasks**: 11 remaining
- **Recommended Approach**: Implement in order above, testing as you go

## Key Files to Modify
- src/ui/customAgentBuilder.ts (MT-030.11, MT-030.13 UI)
- src/agents/custom/executor.ts (MT-030.20 context limits)
- src/agents/custom/storage.ts (MT-030.14 versioning)
- src/agents/custom/*.ts (templates, variables, permissions, metrics, export)
- src/ui/*.ts (gallery UI)
- tests/agents/custom/*.test.ts (new tests for all new features)

## Ready-to-Use Resources
- MT-030.11-IMPLEMENTATION-SPEC.md - Copy-paste implementation guide
- Docs/Implementation-Plans/CUSTOM-AGENT-FEATURES-BREAKDOWN.md - Full guides for all features
- SESSION-2-FINAL-STATUS.md - Previous session summary

## Success Criteria for Stage 7 Completion
✅ All 22 MT-030 tasks completed  
✅ Comprehensive test coverage (≥85% on custom agent code)  
✅ Zero TypeScript errors  
✅ All tests passing  
✅ Documentation complete for all features
