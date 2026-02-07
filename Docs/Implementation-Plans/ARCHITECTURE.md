# Custom Agent Features - Architecture & Dependency Reference

**Date**: February 6, 2026  
**Purpose**: Visual reference for implementation dependencies and code structure

---

## 📊 Feature Dependency Graph

```
COMPLETED FEATURES (Foundation)
│
├─ MT-030.1: Schema ✅
│  └─ Used by: Everything (metadata schema, custom list schema)
│
├─ MT-030.2: Hardlock ✅
│  └─ Used by: Executor (enforces read-only operations)
│
├─ MT-030.3: Builder UI ✅
│  └─ Used by: All UI features (forms, inputs, validation)
│
├─ MT-030.9: Storage ✅
│  └─ Used by: All save/load operations
│
└─ MT-030.10: Executor ✅
   └─ Used by: Test mode (executes agent with variables)

                    │ All dependencies met ✅
                    ▼

NEW FEATURES (This Sprint)
│
├─ [ ] MT-030.8: METADATA FIELDS (20 min)
│  ├─ Depends: MT-030.1 ✅
│  ├─ Schema: Add .describe() to fields
│  ├─ UI: Add HTML inputs + message handlers
│  └─ Tests: 30+ tests (validation, persistence)
│
├─ [ ] MT-030.7: CUSTOM LISTS (45 min)
│  ├─ Depends: MT-030.3 ✅
│  ├─ Schema: CustomListSchema (already complete)
│  ├─ UI: CustomListManager class + templates
│  ├─ Tests: 40+ tests (CRUD, validation, export)
│  └─ NOTE: Can start immediately after MT-030.8
│
└─ [ ] MT-030.11: PREVIEW/TEST MODE (35 min)
   ├─ Depends: MT-030.10 ✅
   ├─ Depends: MT-030.7 ✅ (indirectly - for full featured agent)
   ├─ UI: Test panel + AgentTestManager
   ├─ Executor: executeAgentTest() method
   ├─ Tests: 40+ tests (execution, substitution, errors)
   └─ NOTE: Implement last (it depends on stable agent config)

RECOMMENDED ORDER: 8 → 7 → 11
```

---

## 🏗️ Code Architecture

### Layer 1: Schema (Foundation)
```
src/agents/custom/schema.ts
│
├─ CustomListSchema
│  ├─ name: string (1-50 chars, unique)
│  ├─ description: string (0-200 chars, optional)
│  ├─ items: string[] (1-100 items, each 1-200 chars)
│  ├─ order: number (for display)
│  └─ collapsed: boolean (UI state)
│
├─ AgentMetadataSchema       ← MT-030.8 updates this
│  ├─ author: string (optional)
│  ├─ version: string (semantic, e.g., 1.0.0)
│  ├─ tags: string[] (0-10 tags, each 1-30 chars)
│  ├─ createdAt: ISO string (optional)
│  └─ updatedAt: ISO string (optional)
│
└─ CustomAgentSchema (main config)
   ├─ name, description, systemPrompt, goals ← Required
   ├─ checklist, customLists ← MT-030.7 uses this
   ├─ priority, routing, metadata ← MT-030.8 uses this
   ├─ isActive, timeoutSeconds, maxTokens, temperature
   └─ (COMPLETE - no schema changes needed for 030.7/030.11)
```

### Layer 2: Storage/Persistence
```
src/agents/custom/storage.ts
│
├─ saveCustomAgent(agent: CustomAgent) → Saves to .coe/agents/custom/{name}/
├─ loadCustomAgent(name: string) → Loads from disk
├─ listCustomAgents() → Returns all agent names
└─ customAgentExists(name: string) → Checks existence
```

### Layer 3: Execution
```
src/agents/custom/executor.ts
│
├─ executeCustomAgent(name: string, query: string) ← MT-030.11 uses this
│  ├─ Load agent config
│  ├─ Substitute variables in system prompt
│  ├─ Call LLM with system prompt + user query
│  ├─ Enforce hardlock tools (read-only)
│  └─ Return response + token usage
│
├─ substituteVariables(text, context) ← Key for MT-030.11
│  ├─ {{task_id}} → from context
│  ├─ {{current_date}} → today's date
│  ├─ {{user_query}} → the actual query
│  └─ ... 5 more variables
│
└─ CustomAgentExecutor (class)
   └─ Used for bulk operations
```

### Layer 4: UI (customAgentBuilder.ts)
```
src/ui/customAgentBuilder.ts (2170 lines)
│
├─ CustomAgentBuilderPanel (main)
│  ├─ panel: vscode.WebviewPanel
│  ├─ mode: 'create' | 'edit'
│  ├─ currentAgent: Partial<CustomAgent>
│  └─ disposables: vscode.Disposable[]
│
├─ AgentTestManager (NEW - MT-030.11)     ← You'll add this
│  ├─ init(webview)
│  ├─ openTestPanel()
│  ├─ submitTestQuery()
│  ├─ executeTestQuery(query) → async
│  ├─ showTestOutput(result)
│  └─ showTestError(msg)
│
├─ CustomListManager (NEW - MT-030.7)      ← You'll add this
│  ├─ addList() → CustomList
│  ├─ removeList(index)
│  ├─ addItem(listIndex, text)
│  ├─ removeItem(listIndex, itemIndex)
│  ├─ updateListName(index, name)
│  ├─ toggleCollapse(index)
│  ├─ exportJSON() → string
│  ├─ importJSON(json)
│  └─ getLists() → CustomList[]
│
└─ Message Handlers (webview ↔ extension)
   ├─ 'addCustomList' ← MT-030.7
   ├─ 'removeCustomList' ← MT-030.7
   ├─ 'addCustomListItem' ← MT-030.7
   ├─ 'removeCustomListItem' ← MT-030.7
   ├─ 'testAgent' ← MT-030.11
   └─ 'fieldChanged' (updated to support metadata)
```

---

## 🔄 Data Flow: How Features Interact

### MT-030.8: Adding Metadata

```
User fills form
│
├─ Author field → fieldChanged message → message handler
├─ Version field → fieldChanged message → message handler
└─ Tags field → fieldChanged message → message handler
   │
   ├─ currentAgent.metadata ||= {}
   ├─ currentAgent.metadata.author = value
   ├─ currentAgent.metadata.version = value
   └─ currentAgent.metadata.tags = value.split(',')
      │
      └─ validateCustomAgent(currentAgent)
         │
         └─ AgentMetadataSchema validates
            ├─ version matches /^\d+\.\d+\.\d+$/
            ├─ author <= 100 chars
            ├─ tags[] all <= 30 chars, count <= 10
            └─ ✅ Or ❌ error message

Save → saveCustomAgent(currentAgent)
   │
   └─ Stores metadata in .coe/agents/custom/{name}/config.json
```

### MT-030.7: Adding Custom Lists

```
User clicks +Add List
   │
   └─ CustomListManager.addList()
      │
      ├─ Check list count < 7 (throw if >7)
      ├─ Create new CustomList:
      │  ├─ name: "List 1"
      │  ├─ description: ""
      │  ├─ items: [""]
      │  ├─ order: 0
      │  └─ collapsed: false
      │
      ├─ Push to this.lists[]
      └─ renderCustomLists() → update DOM
         │
         └─ For each list:
            ├─ Generate HTML (name input, description textarea, items area)
            ├─ Apply color (getColorForList(index))
            ├─ Wire message handlers (add item, remove item, etc.)
            └─ Show count badge (X/7)

User adds item to list
   │
   └─ CustomListManager.addItem(listIndex, "")
      │
      ├─ Check list.items.length < 100
      ├─ Push "" to list.items[]
      └─ renderCustomLists() → update DOM

User edits list name
   │
   └─ 'fieldChanged' message → message handler
      │
      ├─ CustomListManager.updateListName(index, newName)
      │  │
      │  └─ Check for duplicates (case-insensitive)
      │     └─ If duplicate: throw error
      │
      └─ validateCustomAgent() to check whole config

Save → saveCustomAgent(currentAgent)
   │
   └─ Stores customLists[] in .coe/agents/custom/{name}/config.json
      │
      └─ Each list saved with name, description, items[], order, collapsed
```

### MT-030.11: Testing Agent

```
User fills form (with metadata + custom lists)
   │
   ├─ MT-030.8 metadata fields
   └─ MT-030.7 custom lists
      │
      └─ User clicks 🧪 Test Agent
         │
         ├─ validateCustomAgent(currentAgent)
         │  └─ If errors: show and return (don't test)
         │
         └─ Open test panel (modal with query input)
            │
            └─ User enters sample query, clicks "Send Test Query"
               │
               ├─ AgentTestManager.submitTestQuery()
               │  │
               │  ├─ Get query text from textarea
               │  ├─ Check not empty
               │  ├─ Show loading spinner
               │  │
               │  └─ executeTestQuery(query) → async
               │     │
               │     └─ Post message: type='testAgent', agentConfig, testQuery
               │        │
               │        ├─ Extension receives 'testAgent'
               │        │  │
               │        │  └─ Extension calls executeAgentTest(config, query)
               │        │     │
               │        │     ├─ Load agent (but don't save)
               │        │     ├─ Build system prompt with variable substitution
               │        │     │  ├─ {{task_id}} → "test-task-001"
               │        │     │  ├─ {{current_date}} → "2/6/2026"
               │        │     │  ├─ {{user_query}} → actual query
               │        │     │  └─ ... 5 more variables
               │        │     │
               │        │     ├─ Call LLM:
               │        │     │  ├─ systemPrompt: substituted prompt
               │        │     │  ├─ userMessage: sample query
               │        │     │  ├─ maxTokens: agent.maxTokens
               │        │     │  └─ temperature: agent.temperature
               │        │     │
               │        │     ├─ Timeout after 30 seconds
               │        │     │
               │        │     └─ Return: { response, usage }
               │        │
               │        └─ Send response to webview via 'testResult' message
               │
               └─ Webview receives 'testResult'
                  │
                  ├─ Hide loading spinner
                  ├─ Display response in pre-formatted box
                  ├─ Show metrics:
                  │  ├─ Prompt tokens: 45
                  │  ├─ Completion tokens: 120
                  │  ├─ Total tokens: 165
                  │  └─ Response time: 1250ms
                  │
                  └─ User can: retry, edit query, close panel, or save agent
```

---

## 📁 File Organization (After Implementation)

```
src/agents/custom/
├─ schema.ts           (UPDATE - add .describe() to AgentMetadataSchema)
├─ hardlock.ts         (no change)
├─ executor.ts         (no change - already has executeCustomAgent)
├─ routing.ts          (no change)
└─ storage.ts          (no change)

src/ui/
├─ customAgentBuilder.ts  (UPDATE - add UI sections + classes)
│  ├─ HTML: .metadata-section (author, version, tags inputs)
│  ├─ HTML: .custom-lists-section (list manager UI)
│  ├─ HTML: .test-panel (test mode modal)
│  ├─ CSS: styling for all new sections
│  ├─ Class CustomListManager (CRUD for lists)
│  ├─ Class AgentTestManager (test execution)
│  └─ Message handlers (fieldChanged, testAgent, etc.)
│
└─ (other UI files - no change)

tests/agents/custom/
├─ schema.test.ts
└─ schema.metadata.test.ts        (NEW - 30+ tests)

tests/ui/
├─ customAgentBuilder.test.ts
├─ customAgentBuilder.metadata.test.ts    (NEW - 8 tests)
├─ customAgentBuilder.customLists.test.ts (NEW - 40+ tests)
└─ customAgentBuilder.preview.test.ts     (NEW - 20+ tests)

tests/services/
└─ customAgentExecutor.testMode.test.ts  (NEW - 12+ tests)

Docs/Implementation-Plans/
├─ CUSTOM-AGENT-FEATURES-BREAKDOWN.md (CREATED - full plan)
├─ QUICK-REFERENCE.md               (CREATED - checklist + FAQ)
└─ ARCHITECTURE.md                  (YOU ARE HERE - visual reference)
```

---

## 🔌 Message Protocol

### Webview → Extension Messages

```typescript
interface WebviewToExtensionMessage {
    type: string;
    
    // For MT-030.7 (Custom Lists)
    | 'addCustomList'          // Add new list
    | 'removeCustomList'       // Remove list by index
    | 'addCustomListItem'      // Add item to list
    | 'removeCustomListItem'   // Remove item from list
    
    // For MT-030.8 (Metadata)
    | 'fieldChanged'           // author, version, tags field update
    
    // For MT-030.11 (Test Mode)
    | 'testAgent'              // Request agent test
    
    agentConfig?: Partial<CustomAgent>;
    listIndex?: number;
    itemIndex?: number;
    fieldName?: string;
    fieldValue?: string | string[];
    testQuery?: string;
}
```

### Extension → Webview Messages

```typescript
interface ExtensionToWebviewMessage {
    type: string;
    
    // For MT-030.11 (Test Mode Response)
    | 'testResult'             // Response from agent test
    
    response?: string;         // Agent response text
    usage?: {                  // Token usage
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    error?: string;           // Error message if test failed
}
```

---

## 🧪 Test Structure

### Test Organization Pattern

```
tests/
├─ agents/custom/
│  └─ schema.metadata.test.ts
│     ├─ Test Suite 1: Semantic Version Validation (6 tests)
│     ├─ Test Suite 2: Author Validation (4 tests)
│     ├─ Test Suite 3: Tags Validation (6 tests)
│     ├─ Test Suite 4: Metadata Integration (4 tests)
│     └─ Test Suite 5: Timestamps (5 tests)
│
├─ ui/
│  ├─ customAgentBuilder.metadata.test.ts
│  │  ├─ Test Suite 6: UI Input Validation (5 tests)
│  │  ├─ Test Suite 7: Persistence (3 tests)
│  │  └─ Test Suite 8: Character Count (3 tests)
│  │
│  ├─ customAgentBuilder.customLists.test.ts
│  │  ├─ Test Suite 9: CRUD (6 tests)
│  │  ├─ Test Suite 10: Items (6 tests)
│  │  ├─ Test Suite 11: Validation (4 tests)
│  │  ├─ Test Suite 12: UI Rendering (5 tests)
│  │  ├─ Test Suite 13: Persistence (4 tests)
│  │  └─ Test Suite 14: Import/Export (4 tests)
│  │
│  └─ customAgentBuilder.preview.test.ts
│     ├─ Test Suite 15: Initialization (4 tests)
│     ├─ Test Suite 16: Submission (4 tests)
│     ├─ Test Suite 17: Execution (6 tests)
│     ├─ Test Suite 18: Output Display (6 tests)
│     ├─ Test Suite 19: Error Handling (4 tests)
│     └─ Test Suite 20: UI Behavior (5 tests)
│
└─ services/
   └─ customAgentExecutor.testMode.test.ts
      ├─ Test Suite 21: Agent Test Execution (5 tests)
      └─ Test Suite 22: Variable Substitution (6 tests)

TOTAL: 110+ Tests Across 5 Test Files
```

---

## 🎨 UI Component Tree (customAgentBuilder.ts)

```
Form Container
│
├─ Agent Basic Info (EXISTING)
│  ├─ Name input
│  ├─ Description textarea
│  └─ System Prompt editor with autocomplete
│
├─ Metadata Section (MT-030.8 - NEW)
│  ├─ Author input
│  │  └─ Char count: 0/100
│  ├─ Version input
│  │  └─ Error message for invalid version
│  └─ Tags input
│     └─ Comma-separated tag list
│
├─ Goals Section (EXISTING)
│  └─ Goal items with add/remove
│
├─ Checklist Section (EXISTING)
│  └─ Checkbox items with add/remove
│
├─ Custom Lists Section (MT-030.7 - NEW)
│  ├─ Count badge: 0/7
│  ├─ Custom List Items (repeating):
│  │  ├─ Color indicator
│  │  ├─ List name input
│  │  ├─ Collapse/expand button
│  │  ├─ List body (when expanded):
│  │  │  ├─ Description textarea
│  │  │  ├─ List items container:
│  │  │  │  └─ Item (repeating):
│  │  │  │     ├─ Drag handle
│  │  │  │     ├─ Item text input
│  │  │  │     └─ Delete button
│  │  │  └─ +Add Item button
│  │  └─ Delete list button
│  └─ +Add List button (disabled at 7)
│
├─ Priority Section (EXISTING)
│  └─ Priority dropdown (P0-P3)
│
├─ Builder Actions (EXISTING + UPDATE for MT-030.11)
│  ├─ 🧪 Test Agent button (NEW - MT-030.11)
│  ├─ 💾 Save Agent button
│  └─ Cancel button
│
└─ Test Mode Panel (MT-030.11 - NEW, initially hidden)
   ├─ Modal overlay
   ├─ Header: "Agent Test Mode"
   ├─ Test Input Section:
   │  ├─ Label: "Sample Query"
   │  ├─ Textarea (3 rows)
   │  └─ "Send Test Query" button
   ├─ Status Section (while executing):
   │  ├─ Spinner animation
   │  └─ "Testing agent..."
   ├─ Output Section (after success):
   │  ├─ Response (pre-formatted text)
   │  └─ Metrics grid:
   │     ├─ Prompt Tokens
   │     ├─ Completion Tokens
   │     ├─ Total Tokens
   │     └─ Response Time
   └─ Error Section (if failed):
      └─ Error message (pre-formatted)
```

---

## 🔄 Integration Points with Existing Code

### MT-030.8 Integration
```
AgentMetadataSchema (schema.ts) → Lines 205-260
    ↓
CustomAgentSchema (schema.ts) → Uses metadata field
    ↓
customAgentBuilder.ts HTML → Metadata section inputs
    ↓
customAgentBuilder.ts TypeScript → Message handlers for metadata
    ↓
storage.ts (no change) → Already persists entire agent including metadata
    ↓
Tests → Validate metadata during agent CRUD
```

### MT-030.7 Integration
```
CustomListSchema (schema.ts) → Lines 158-183 (COMPLETE)
    ↓
CustomAgentSchema (schema.ts) → customLists field (COMPLETE)
    ↓
customAgentBuilder.ts HTML → Custom lists section (NEW)
    ↓
CustomListManager class (NEW) → CRUD operations
    ↓
storage.ts (no change) → Already persists customLists array
    ↓
Tests → Validate list CRUD, persistence, uniqueness
```

### MT-030.11 Integration
```
executeCustomAgent() (executor.ts) → Line 120 (COMPLETE)
    ↓
AgentTestManager class (NEW) → Test panel + submission logic
    ↓
executeAgentTest() (new method) → Variable substitution + LLM call
    ↓
Message protocol → 'testAgent' → 'testResult'
    ↓
Tests → Validate execution, substitution, timing, errors
```

---

## 📋 Completion Criteria Matrix

| Feature | Schema | UI | Logic | Tests | Docs |
|---------|--------|----|----|----|----|
| **MT-030.8** | Add .describe() | 1 section | Message handlers | 30+ tests | ✅ |
| **MT-030.7** | Complete ✅ | Full section | Manager class | 40+ tests | ✅ |
| **MT-030.11** | Complete ✅ | Modal panel | Test executor | 40+ tests | ✅ |

---

## 🚀 Implementation Checklist (at a glance)

```
BEFORE START:
□ All dependencies complete (MT-030.1 ✅, 030.3 ✅, 030.10 ✅)
□ npm run compile succeeds
□ npm run test:once passes
□ This document fully read

MT-030.8 (20 min):
□ Schema: Add .describe() to AgentMetadataSchema fields
□ UI: Add HTML form section with author, version, tags inputs
□ UI: Add CSS styling for metadata section
□ Logic: Add message handlers for metadata field updates
□ Tests: Create schema.metadata.test.ts (30+ tests)
□ Tests: Create customAgentBuilder.metadata.test.ts (8 tests)

MT-030.7 (45 min):
□ UI: Create HTML templates (list, item, color indicator)
□ Logic: Implement CustomListManager class
□ Logic: Add message handlers (add/remove list/item)
□ UI: Add CSS styling for custom lists
□ Logic: Add renderCustomLists() and updateListCount() methods
□ Tests: Create customAgentBuilder.customLists.test.ts (40+ tests)

MT-030.11 (35 min):
□ UI: Create test mode panel HTML (query, output, metrics)
□ Logic: Implement AgentTestManager class
□ Logic: Add executeAgentTest() method with variable substitution
□ Logic: Add message handlers ('testAgent', 'testResult')
□ UI: Add CSS styling for test panel
□ Tests: Create customAgentBuilder.preview.test.ts (20+ tests)
□ Tests: Create customAgentExecutor.testMode.test.ts (12+ tests)

VERIFICATION:
□ npm run test:once (all 110+ tests pass)
□ npm run compile (no errors)
□ Manual testing in VS Code
□ Update master plan with actual times
```

---

## 📞 Quick Support

**Common Questions?**

- **"Where do I add the HTML?"** → In `getHtmlContent()` method, add section AFTER system prompt section
- **"How do I wire message handlers?"** → In `panel.onDidReceiveMessage()`, add new `case 'yourMessageType':`
- **"How do I update validation?"** → Call `this.validate()` after any state change, which calls `validateCustomAgent()`
- **"How do I handle errors?"** → Use typed catch blocks: `catch(e: unknown) { const msg = e instanceof Error ? e.message : String(e); }`
- **"How do I render to DOM?"** → Use template literals + `document.getElementById().innerHTML = ...`

**Still stuck?**

1. Re-read the failing test case (tests show expected behavior)
2. Compare with similar existing code (e.g., checklist manager for lists)
3. Check console errors (F12 in VS Code debugger)
4. Review the full implementation plan document

---

**You've got this! 🚀 Start with MT-030.8 (simplest), then 7, then 11.**
