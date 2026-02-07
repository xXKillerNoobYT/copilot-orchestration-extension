# Custom Agent Builder: Feature Implementation Breakdown
**Date**: February 6, 2026  
**Target Features**: MT-030.8, MT-030.7, MT-030.11  
**Total Planned Time**: 100 minutes  
**Actual Time**: ___ minutes (to be tracked)

---

## 📋 Executive Summary

Three complementary features to enhance the custom agent builder:

| Feature | Effort | Dependencies | Status |
|---------|--------|--------------|--------|
| **MT-030.8** Metadata Fields | 20 min | MT-030.1 ✅ | Ready |
| **MT-030.7** Custom Lists | 45 min | MT-030.3 ✅ | Ready |
| **MT-030.11** Preview/Test Mode | 35 min | MT-030.10 ✅ | Ready |

All dependencies are complete. **Recommended implementation order**: 8 → 7 → 11

---

## 🎯 Feature 1: MT-030.8 Agent Metadata Fields (20 min planned)

### Overview
Add optional fields to agent configuration for better organization and tracking. Metadata already exists in schema but needs UI exposure and comprehensive testing.

### Scope
- **File**: `src/agents/custom/schema.ts` (update AgentMetadataSchema)
- **Fields**: author, version (semantic), tags, priority, createdAt, updatedAt
- **Validation**: Semantic versioning (e.g., "1.0.0")
- **Existing**: name, description (keep as required)

### Code Changes Needed

#### 1.1 Schema Updates (Already mostly complete, minor enhancements)
**File**: `src/agents/custom/schema.ts`

```typescript
// Status: ✅ DONE - AgentMetadataSchema exists (lines 205-260)
// Just verify the version regex is tight:
version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must be semantic (e.g., 1.0.0)')
    .default('1.0.0'),

// Ensure all fields have proper constraints and error messages
author: z
    .string()
    .max(CUSTOM_AGENT_CONSTRAINTS.AUTHOR_MAX_LENGTH)
    .optional()
    .describe('Name of the agent creator'),

tags: z
    .array(z.string().min(1).max(CUSTOM_AGENT_CONSTRAINTS.TAG_MAX_LENGTH))
    .max(CUSTOM_AGENT_CONSTRAINTS.TAGS_MAX)
    .default([])
    .describe('Categorization tags for discovery'),
```

**Changes Required**: NONE - Schema is complete. Just add .describe() for clarity.

#### 1.2 UI Integration
**File**: `src/ui/customAgentBuilder.ts`

**Add HTML form section** (after system prompt, before goals):
```html
<!-- Metadata Section -->
<div class="metadata-section">
    <h3>Agent Metadata (Optional)</h3>
    
    <div class="form-group">
        <label for="author">Author</label>
        <input type="text" id="author" name="author" placeholder="Your name" 
               maxlength="${CUSTOM_AGENT_CONSTRAINTS.AUTHOR_MAX_LENGTH}">
        <span class="char-count"><span id="author-count">0</span>/${CUSTOM_AGENT_CONSTRAINTS.AUTHOR_MAX_LENGTH}</span>
    </div>

    <div class="form-group">
        <label for="version">Version</label>
        <input type="text" id="version" name="version" placeholder="1.0.0" 
               pattern="^\d+\.\d+\.\d+$">
        <span class="help-text">Format: semver (e.g., 1.0.0)</span>
        <span id="version-error" class="error-message"></span>
    </div>

    <div class="form-group">
        <label for="tags">Tags</label>
        <input type="text" id="tags" name="tags" placeholder="comma, separated, tags">
        <span class="help-text">Up to 10 tags, max 30 chars each. Comma-separated.</span>
        <span id="tags-error" class="error-message"></span>
    </div>
</div>
```

**Add TypeScript handlers**:
```typescript
// In the WebviewToExtensionMessage type, update fieldChanged to include metadata:
case 'fieldChanged':
    if (message.fieldName === 'author') {
        this.currentAgent.metadata ||= {};
        this.currentAgent.metadata.author = message.fieldValue as string;
    }
    if (message.fieldName === 'version') {
        this.currentAgent.metadata ||= {};
        this.currentAgent.metadata.version = message.fieldValue as string;
    }
    if (message.fieldName === 'tags') {
        this.currentAgent.metadata ||= {};
        this.currentAgent.metadata.tags = (message.fieldValue as string)
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);
    }
    break;
```

**Add CSS**:
```css
.metadata-section {
    background-color: rgba(100, 100, 255, 0.05);
    border-left: 3px solid #5555ff;
    padding: 12px;
    margin: 16px 0;
    border-radius: 4px;
}

.metadata-section h3 {
    margin-top: 0;
    margin-bottom: 12px;
    color: #6666cc;
}

.metadata-section .form-group {
    margin-bottom: 12px;
}

.meta-readonly {
    background-color: #f5f5f5;
    color: #999;
    cursor: not-allowed;
}
```

### Test Cases

#### Test File: `tests/agents/custom/schema.metadata.test.ts`

**Create new test file with these test suites**:

```typescript
describe('Test Suite 1: Semantic Version Validation', () => {
    it('Test 1.1: Should accept valid semver (1.0.0)', ...)
    it('Test 1.2: Should accept valid semver (2.5.13)', ...)
    it('Test 1.3: Should reject invalid semver (1.0)', ...)
    it('Test 1.4: Should reject invalid semver (1.0.0.0)', ...)
    it('Test 1.5: Should reject non-numeric versions (1.a.0)', ...)
    it('Test 1.6: Should default to 1.0.0 if not provided', ...)
});

describe('Test Suite 2: Author Validation', () => {
    it('Test 2.1: Should accept author string up to 100 chars', ...)
    it('Test 2.2: Should reject author over 100 chars', ...)
    it('Test 2.3: Should allow optional author (undefined)', ...)
    it('Test 2.4: Should trim whitespace from author', ...)
});

describe('Test Suite 3: Tags Validation', () => {
    it('Test 3.1: Should accept 0 tags (empty array)', ...)
    it('Test 3.2: Should accept up to 10 tags', ...)
    it('Test 3.3: Should reject 11+ tags', ...)
    it('Test 3.4: Should reject tag over 30 chars', ...)
    it('Test 3.5: Should reject empty tag strings', ...)
    it('Test 3.6: Should default to empty array if not provided', ...)
});

describe('Test Suite 4: Metadata Integration', () => {
    it('Test 4.1: Should persist metadata when saving agent', ...)
    it('Test 4.2: Should load metadata from saved agent', ...)
    it('Test 4.3: Should validate complete agent with metadata', ...)
    it('Test 4.4: Should reject agent with invalid version in metadata', ...)
});

describe('Test Suite 5: createdAt/updatedAt Timestamps', () => {
    it('Test 5.1: Should accept ISO string for createdAt', ...)
    it('Test 5.2: Should accept ISO string for updatedAt', ...)
    it('Test 5.3: Should reject invalid ISO string', ...)
    it('Test 5.4: Should auto-set createdAt on agent creation', ...)
    it('Test 5.5: Should auto-update updatedAt on save', ...)
});
```

#### Test File: `tests/ui/customAgentBuilder.metadata.test.ts`

```typescript
describe('Test Suite 6: Metadata UI Input Validation', () => {
    it('Test 6.1: Should accept metadata input and update form state', ...)
    it('Test 6.2: Should validate version format in real-time', ...)
    it('Test 6.3: Should show error for invalid version (1.0)', ...)
    it('Test 6.4: Should parse comma-separated tags correctly', ...)
    it('Test 6.5: Should trim whitespace from tags', ...)
});

describe('Test Suite 7: Metadata Persistence', () => {
    it('Test 7.1: Should save metadata with agent config', ...)
    it('Test 7.2: Should load metadata when editing agent', ...)
    it('Test 7.3: Should preserve metadata on format change', ...)
});

describe('Test Suite 8: Character Count Display', () => {
    it('Test 8.1: Should update author char count in real-time', ...)
    it('Test 8.2: Should disable submit when exceeding limits', ...)
    it('Test 8.3: Should show warning at 90% capacity', ...)
});
```

### Potential Pitfalls & Solutions

| Pitfall | Risk | Solution |
|---------|------|----------|
| **Forgetting to set timestamps** | Medium | Add auto-calculation in schema: `createdAt defaults to new Date().toISOString()` |
| **Version validation too strict** | Low | Use exact semver pattern: `/^\d+\.\d+\.\d+$/` |
| **Metadata optional but fields required** | High | Make entire metadata object optional with `.optional()` or `.default({})` |
| **UI not syncing with schema** | High | Add explicit message handlers for each metadata field in webview |
| **Tags array parsing fails** | Medium | Add error handling for split/trim: `tags.split(',').map(t => t.trim()).filter(Boolean)` |

### Success Criteria
- ✅ Schema validates semantic versions strictly
- ✅ UI has input fields for author, version, tags
- ✅ Character counts display correctly
- ✅ All 8 test suites pass (30+ tests)
- ✅ Metadata persists when saving/loading agent
- ✅ Invalid versions show clear error messages

### Time Estimate Breakdown
| Task | Time |
|------|------|
| Schema updates & validation | 3 min |
| UI HTML markup + CSS | 6 min |
| TypeScript message handlers | 5 min |
| Test writing | 8 min |
| Testing & debugging | 3 min |
| **Total Actual** | **25 min** ← Usually runs under estimate |

---

## 🎯 Feature 2: MT-030.7 Custom Lists (45 min planned)

### Overview
Support creating 0-7 custom lists in agent configuration. Each list is like a reusable checklist or reference table (e.g., "Coding Standards", "Required Files", "Test Scenarios").

### Scope
- **File**: `src/ui/customAgentBuilder.ts` (webview panel)
- **Schema**: Already complete in `schema.ts` (CustomListSchema, lines 158-183)
- **Constraints**: 0-7 lists per agent, each with:
  - Name: 1-50 chars, unique
  - Description: 0-200 chars
  - Items: 1-100 items, each 1-200 chars
- **UI Features**: Collapse/expand, color coding, export to JSON

### Code Changes Needed

#### 2.1 HTML Structure
**File**: `src/ui/customAgentBuilder.ts` → Add new section after checklist

```html
<!-- Custom Lists Section -->
<div class="custom-lists-section">
    <div class="section-header">
        <h3>Custom Lists (0-7)</h3>
        <span class="count-badge">
            <span id="lists-count">0</span>/7
        </span>
    </div>
    
    <div id="custom-lists-container">
        <!-- Lists dynamically inserted here -->
    </div>
    
    <button type="button" id="add-custom-list-btn" class="btn btn-secondary" 
            data-tooltip="Add a custom list (max 7)">
        + Add List
    </button>
</div>
```

**Template for each list** (reusable HTML template):

```html
<div class="custom-list-item" data-list-index="{index}">
    <div class="list-header">
        <div class="list-color-indicator" style="background-color: {color}"></div>
        
        <input type="text" class="list-name-input" 
               placeholder="List name (e.g., 'Coding Standards')"
               maxlength="${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_NAME_MAX_LENGTH}"
               value="{name}">
        
        <span class="char-count">
            <span class="name-count">{nameLength}</span>/${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_NAME_MAX_LENGTH}
        </span>
        
        <button type="button" class="btn-collapse" title="Expand/collapse list">
            ${collapsed ? '▶' : '▼'}
        </button>
        
        <button type="button" class="btn-delete-list" title="Remove this list">
            ✕
        </button>
    </div>
    
    <div class="list-body" ${collapsed ? 'style="display:none"' : ''}>
        <textarea class="list-description-input" 
                  placeholder="Description (optional, max 200 chars)"
                  maxlength="${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_DESCRIPTION_MAX_LENGTH}"
                  rows="2">{description}</textarea>
        <span class="char-count">
            <span class="desc-count">{descLength}</span>/${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_DESCRIPTION_MAX_LENGTH}
        </span>
        
        <div class="list-items-container">
            <!-- Items inserted here -->
        </div>
        
        <button type="button" class="btn-add-item" data-list-index="{index}">
            + Add Item
        </button>
    </div>
</div>
```

**Template for each item**:

```html
<div class="list-item" data-item-index="{itemIndex}">
    <div class="item-handle">⋮⋮</div>
    
    <input type="text" class="list-item-input" 
           placeholder="Item text (max 200 chars)"
           maxlength="${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEM_MAX_LENGTH}"
           value="{itemText}">
    
    <span class="char-count">
        <span class="item-count">{itemLength}</span>/${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEM_MAX_LENGTH}
    </span>
    
    <button type="button" class="btn-delete-item" title="Remove item">
        ✕
    </button>
</div>
```

#### 2.2 TypeScript Logic
**File**: `src/ui/customAgentBuilder.ts` → Add new class methods

```typescript
/**
 * Manage custom lists in the agent builder.
 * Handles CRUD operations, validation, and persistence.
 */
class CustomListManager {
    private lists: CustomList[] = [];
    private colorPalette = [
        '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4',
        '#ffeaa7', '#dfe6e9', '#a29bfe', '#fd79a8'
    ];
    
    /**
     * Add a new custom list.
     * Error if max lists reached.
     */
    addList(): CustomList {
        if (this.lists.length >= CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LISTS_MAX) {
            throw new Error(`Cannot exceed ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LISTS_MAX} lists`);
        }
        
        const newList: CustomList = {
            name: `List ${this.lists.length + 1}`,
            description: '',
            items: [''],
            order: this.lists.length,
            collapsed: false,
        };
        
        this.lists.push(newList);
        return newList;
    }
    
    /**
     * Remove custom list by index.
     */
    removeList(index: number): void {
        if (index < 0 || index >= this.lists.length) {
            throw new Error('Invalid list index');
        }
        this.lists.splice(index, 1);
        this.reorderLists();
    }
    
    /**
     * Add item to specific list.
     */
    addItem(listIndex: number, itemText: string = ''): void {
        const list = this.lists[listIndex];
        if (!list) throw new Error('List not found');
        
        if (list.items.length >= CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEMS_MAX) {
            throw new Error(`List "$ {list.name}" cannot exceed ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEMS_MAX} items`);
        }
        
        list.items.push(itemText);
    }
    
    /**
     * Remove item from specific list.
     */
    removeItem(listIndex: number, itemIndex: number): void {
        const list = this.lists[listIndex];
        if (!list) throw new Error('List not found');
        
        if (list.items.length <= CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEMS_MIN) {
            throw new Error(`List must have at least ${CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LIST_ITEMS_MIN} item`);
        }
        
        list.items.splice(itemIndex, 1);
    }
    
    /**
     * Update list name.
     */
    updateListName(index: number, name: string): void {
        const list = this.lists[index];
        if (!list) throw new Error('List not found');
        
        // Check uniqueness
        const isDuplicate = this.lists.some((l, i) => 
            i !== index && l.name.toLowerCase() === name.toLowerCase()
        );
        
        if (isDuplicate) {
            throw new Error('List names must be unique');
        }
        
        list.name = name;
    }
    
    /**
     * Collapse/expand list for UI.
     */
    toggleCollapse(index: number): void {
        const list = this.lists[index];
        if (!list) throw new Error('List not found');
        list.collapsed = !list.collapsed;
    }
    
    /**
     * Get color for list by index.
     */
    getColorForList(index: number): string {
        return this.colorPalette[index % this.colorPalette.length];
    }
    
    /**
     * Export lists to JSON.
     */
    exportJSON(): string {
        return JSON.stringify(this.lists, null, 2);
    }
    
    /**
     * Import lists from JSON.
     */
    importJSON(json: string): void {
        try {
            const imported = JSON.parse(json);
            const validation = z.array(CustomListSchema).safeParse(imported);
            
            if (!validation.success) {
                throw new Error(`Invalid format: ${validation.error.message}`);
            }
            
            this.lists = validation.data.slice(0, CUSTOM_AGENT_CONSTRAINTS.CUSTOM_LISTS_MAX);
            this.reorderLists();
        } catch (error) {
            throw new Error(`Failed to import lists: ${error}`);
        }
    }
    
    private reorderLists(): void {
        this.lists.forEach((list, index) => {
            list.order = index;
        });
    }
    
    getLists(): CustomList[] {
        return this.lists;
    }
}
```

#### 2.3 Webview Message Handlers
**File**: `src/ui/customAgentBuilder.ts` → Update message handling

```typescript
// Add these cases to the panel.onDidReceiveMessage handler:

case 'addCustomList': {
    const list = this.customListManager.addList();
    this.currentAgent.customLists = this.customListManager.getLists();
    this.renderCustomLists();
    this.updateListCount();
    this.updateValidation();
    break;
}

case 'removeCustomList': {
    if (message.listIndex === undefined) throw new Error('listIndex required');
    this.customListManager.removeList(message.listIndex);
    this.currentAgent.customLists = this.customListManager.getLists();
    this.renderCustomLists();
    this.updateListCount();
    this.updateValidation();
    break;
}

case 'addCustomListItem': {
    if (message.listIndex === undefined) throw new Error('listIndex required');
    this.customListManager.addItem(message.listIndex, '');
    this.currentAgent.customLists = this.customListManager.getLists();
    this.renderCustomLists();
    this.updateValidation();
    break;
}

case 'removeCustomListItem': {
    if (message.listIndex === undefined || message.itemIndex === undefined) {
        throw new Error('listIndex and itemIndex required');
    }
    this.customListManager.removeItem(message.listIndex, message.itemIndex);
    this.currentAgent.customLists = this.customListManager.getLists();
    this.renderCustomLists();
    this.updateValidation();
    break;
}

case 'fieldChanged': {
    if (message.fieldName?.startsWith('list-name-')) {
        const listIndex = parseInt(message.fieldName.split('-')[2]);
        this.customListManager.updateListName(listIndex, message.fieldValue as string);
        this.currentAgent.customLists = this.customListManager.getLists();
        this.updateValidation();
    }
    
    if (message.fieldName?.startsWith('list-item-')) {
        const [_, listIndex, itemIndex] = message.fieldName.split('-').map(Number);
        const list = this.customListManager.getLists()[listIndex];
        if (list) list.items[itemIndex] = message.fieldValue as string;
        this.updateValidation();
    }
    
    if (message.fieldName?.startsWith('list-desc-')) {
        const listIndex = parseInt(message.fieldName.split('-')[2]);
        const list = this.customListManager.getLists()[listIndex];
        if (list) list.description = message.fieldValue as string;
        this.updateValidation();
    }
    break;
}
```

#### 2.4 CSS Styling
**File**: `src/ui/customAgentBuilder.ts` → Add CSS

```css
/* Custom Lists Section */
.custom-lists-section {
    background-color: rgba(50, 200, 100, 0.05);
    border-left: 3px solid #32c864;
    padding: 12px;
    margin: 16px 0;
    border-radius: 4px;
}

.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

.section-header h3 {
    margin: 0;
    color: #2d8659;
}

.count-badge {
    background-color: #d4edda;
    color: #155724;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.85em;
    font-weight: 600;
}

/* Custom List Item */
.custom-list-item {
    background-color: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    margin-bottom: 12px;
    overflow: hidden;
}

.list-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background-color: #f9f9f9;
    border-bottom: 1px solid #eee;
    cursor: pointer;
}

.list-color-indicator {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    flex-shrink: 0;
}

.list-name-input {
    flex: 1;
    padding: 4px 8px;
    border: none;
    background-color: transparent;
    font-weight: 600;
    font-size: 0.95em;
}

.list-name-input:focus {
    outline: none;
    background-color: rgba(255, 255, 255, 0.5);
}

.list-body {
    padding: 12px;
}

.list-description-input {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    max-width: none;
    margin-bottom: 8px;
    font-family: inherit;
    font-size: 0.9em;
}

.list-items-container {
    margin: 12px 0;
    border: 1px dashed #ddd;
    border-radius: 4px;
    padding: 8px;
}

.list-item {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
    padding: 8px;
    background-color: #f5f5f5;
    border-radius: 4px;
}

.list-item:last-child {
    margin-bottom: 0;
}

.item-handle {
    cursor: move;
    flex-shrink: 0;
    color: #999;
    font-size: 0.8em;
}

.list-item-input {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background-color: white;
}

.list-item-input:focus {
    outline: none;
    border-color: #4ecdc4;
    box-shadow: 0 0 0 2px rgba(78, 205, 196, 0.1);
}

.btn-collapse {
    padding: 4px 8px;
    background: none;
    border: none;
    cursor: pointer;
    color: #666;
    font-size: 0.9em;
}

.btn-delete-list,
.btn-delete-item {
    padding: 4px 8px;
    background: none;
    border: none;
    cursor: pointer;
    color: #999;
    font-size: 0.85em;
}

.btn-delete-list:hover,
.btn-delete-item:hover {
    color: #e74c3c;
}

.btn-add-item {
    width: 100%;
    padding: 8px;
    background-color: #f0f0f0;
    border: 1px dashed #999;
    border-radius: 4px;
    cursor: pointer;
    color: #666;
    font-size: 0.9em;
}

.btn-add-item:hover {
    background-color: #e8f0f0;
}

#add-custom-list-btn {
    display: block;
    margin-top: 8px;
}
```

### Test Cases

#### Test File: `tests/ui/customAgentBuilder.customLists.test.ts`

```typescript
describe('Test Suite 9: Custom List CRUD', () => {
    it('Test 9.1: Should add new custom list', ...)
    it('Test 9.2: Should enforce maximum 7 lists', ...)
    it('Test 9.3: Should remove custom list by index', ...)
    it('Test 9.4: Should prevent removing list below min items (1)', ...)
    it('Test 9.5: Should reorder lists after deletion', ...)
    it('Test 9.6: Should reject duplicate list names (case-insensitive)', ...)
});

describe('Test Suite 10: Custom List Items', () => {
    it('Test 10.1: Should add item to custom list', ...)
    it('Test 10.2: Should enforce max 100 items per list', ...)
    it('Test 10.3: Should remove item from list', ...)
    it('Test 10.4: Should enforce min 1 item per list', ...)
    it('Test 10.5: Should validate item text length (max 200 chars)', ...)
    it('Test 10.6: Should prevent empty items', ...)
});

describe('Test Suite 11: Custom List Validation', () => {
    it('Test 11.1: Should validate list name (1-50 chars)', ...)
    it('Test 11.2: Should validate list description (max 200 chars)', ...)
    it('Test 11.3: Should require at least 1 item per list', ...)
    it('Test 11.4: Should validate entire list structure', ...)
});

describe('Test Suite 12: Custom List UI Rendering', () => {
    it('Test 12.1: Should render custom list HTML correctly', ...)
    it('Test 12.2: Should update count badge (X/7)', ...)
    it('Test 12.3: Should add color indicator to each list', ...)
    it('Test 12.4: Should toggle collapse/expand state', ...)
    it('Test 12.5: Should update character counts in real-time', ...)
});

describe('Test Suite 13: Custom List Persistence', () => {
    it('Test 13.1: Should save custom lists with agent', ...)
    it('Test 13.2: Should load custom lists when editing agent', ...)
    it('Test 13.3: Should preserve list order on save/load', ...)
    it('Test 13.4: Should validate lists on load', ...)
});

describe('Test Suite 14: Import/Export', () => {
    it('Test 14.1: Should export custom lists to JSON', ...)
    it('Test 14.2: Should import lists from valid JSON', ...)
    it('Test 14.3: Should reject invalid import JSON', ...)
    it('Test 14.4: Should enforce max 7 lists on import', ...)
});
```

### Potential Pitfalls & Solutions

| Pitfall | Risk | Solution |
|---------|------|----------|
| **Unique name constraint not enforced** | High | Add check when updating name: `lists.some((l, i) => i !== index && l.name.toLowerCase() === name.toLowerCase())` |
| **Minimum items violated** | High | Block removal if `list.items.length <= 1` |
| **Character count updates lag** | Medium | Use `input` event, not `change`: `inputEl.addEventListener('input', updateCount)` |
| **Render performance with 7 lists × 100 items** | Medium | Use debounce for validation: `_.debounce(updateValidation, 300)` |
| **Color palette runs out** | Low | Cycle with modulo: `colors[index % colors.length]` |
| **Item order lost on add/remove** | Low | Don't rely on array index; use item ID or be explicit about order |
| **Collapse state not synced** | Medium | Store `collapsed` boolean in CustomList object, not in DOM |

### Success Criteria
- ✅ Can create 0-7 custom lists in agent
- ✅ Each list has name, description, items (1-100)
- ✅ Character limits enforced with real-time display
- ✅ Unique list names (case-insensitive)
- ✅ Collapse/expand toggles work
- ✅ Color coding displays (8-color palette)
- ✅ Export to JSON works
- ✅ All 14 test suites pass (40+ tests)
- ✅ Lists persist when saving/loading agent

### Time Estimate Breakdown
| Task | Time |
|------|------|
| HTML templates | 8 min |
| CSS styling | 7 min |
| CustomListManager class | 10 min |
| Message handlers | 8 min |
| Rendering & DOM manipulation | 5 min |
| Test writing | 10 min |
| Testing & debugging | 5 min |
| **Total Actual** | **53 min** ← Typically 10-20% over estimate |

---

## 🎯 Feature 3: MT-030.11 Agent Preview/Test Mode (35 min planned)

### Overview
Add a "Test" button to preview how the agent responds to sample queries without saving. Uses mock LLM for speed, shows token usage and response timing.

### Scope
- **File**: `src/ui/customAgentBuilder.ts` (webview panel)
- **Behavior**: 
  - Test button at bottom of form
  - Modal/panel shows preview output
  - Send sample query to agent executor
  - Display response + token usage + timing
  - Show errors gracefully

### Code Changes Needed

#### 3.1 UI Components
**File**: `src/ui/customAgentBuilder.ts` → Add test panel HTML

```html
<!-- Test Mode Button -->
<div class="builder-actions">
    <button type="button" id="test-agent-btn" class="btn btn-primary">
        🧪 Test Agent
    </button>
    <button type="submit" id="save-agent-btn" class="btn btn-success">
        💾 Save Agent
    </button>
    <button type="button" id="cancel-agent-btn" class="btn btn-secondary">
        Cancel
    </button>
</div>

<!-- Test Mode Panel (initially hidden) -->
<div id="test-mode-panel" class="test-panel" style="display: none;">
    <div class="test-panel-header">
        <h2>Agent Test Mode</h2>
        <button type="button" id="close-test-btn" class="btn-close">✕</button>
    </div>
    
    <div class="test-panel-body">
        <!-- Input Section -->
        <div class="test-input-section">
            <label for="test-query">Sample Query</label>
            <textarea id="test-query" 
                      placeholder="Enter a sample question or request..."
                      rows="3"></textarea>
            <button type="button" id="submit-test-btn" class="btn btn-primary">
                Send Test Query
            </button>
        </div>
        
        <!-- Status Section -->
        <div id="test-status" class="test-status" style="display: none;">
            <div class="status-indicator spinner"></div>
            <span>Testing agent...</span>
        </div>
        
        <!-- Output Section -->
        <div id="test-output-section" class="test-output-section" style="display: none;">
            <h3>Response</h3>
            <pre id="test-response" class="test-response"></pre>
            
            <div class="test-metrics">
                <div class="metric">
                    <span class="metric-label">Prompt Tokens</span>
                    <span id="prompt-tokens" class="metric-value">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Completion Tokens</span>
                    <span id="completion-tokens" class="metric-value">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Total Tokens</span>
                    <span id="total-tokens" class="metric-value">-</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Response Time</span>
                    <span id="response-time" class="metric-value">-</span>
                </div>
            </div>
        </div>
        
        <div id="test-error-section" class="test-error" style="display: none;">
            <h3>⚠️ Error</h3>
            <pre id="test-error-message"></pre>
        </div>
    </div>
</div>
```

#### 3.2 TypeScript Logic
**File**: `src/ui/customAgentBuilder.ts` → Add test manager class

```typescript
/**
 * Manage agent testing and preview.
 */
class AgentTestManager {
    private testPanel: HTMLElement | null = null;
    private isTestingActive = false;
    
    /**
     * Initialize test mode UI.
     */
    init(webview: vscode.Webview): void {
        this.testPanel = document.getElementById('test-mode-panel');
        
        // Test button handler
        document.getElementById('test-agent-btn')?.addEventListener('click', () => {
            this.openTestPanel();
        });
        
        // Close button handler
        document.getElementById('close-test-btn')?.addEventListener('click', () => {
            this.closeTestPanel();
        });
        
        // Submit test query handler
        document.getElementById('submit-test-btn')?.addEventListener('click', () => {
            this.submitTestQuery();
        });
        
        // Allow Enter key to submit
        document.getElementById('test-query')?.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.submitTestQuery();
            }
        });
    }
    
    /**
     * Open test panel and validate current agent config.
     */
    private openTestPanel(): void {
        // Validate agent config first
        const validation = validateCustomAgent(this.currentAgent);
        if (!validation.success) {
            this.showTestError('Please fix validation errors before testing:\n' +
                validation.errors?.issues.map(i => '• ' + i.message).join('\n')
            );
            return;
        }
        
        if (!this.testPanel) return;
        
        this.testPanel.style.display = 'block';
        const queryInput = document.getElementById('test-query') as HTMLTextAreaElement;
        if (queryInput) queryInput.focus();
        
        this.clearTestOutput();
    }
    
    /**
     * Close test panel.
     */
    private closeTestPanel(): void {
        if (!this.testPanel) return;
        this.testPanel.style.display = 'none';
        this.clearTestOutput();
    }
    
    /**
     * Submit test query to agent executor.
     */
    private async submitTestQuery(): Promise<void> {
        const query = (document.getElementById('test-query') as HTMLTextAreaElement)?.value;
        
        if (!query || query.trim().length === 0) {
            this.showTestError('Please enter a sample query');
            return;
        }
        
        if (this.isTestingActive) return;
        
        this.isTestingActive = true;
        this.showTestStatus();
        
        try {
            const startTime = performance.now();
            
            const result = await this.executeTestQuery(query);
            
            const endTime = performance.now();
            const responseTime = (endTime - startTime).toFixed(0);
            
            this.showTestOutput(result, responseTime);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.showTestError(errorMessage);
        } finally {
            this.isTestingActive = false;
            this.hideTestStatus();
        }
    }
    
    /**
     * Execute test query against agent executor.
     */
    private async executeTestQuery(query: string): Promise<{
        response: string;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    }> {
        // Call the agent executor with test mode
        return new Promise((resolve, reject) => {
            // Send message to extension to execute test
            vscode.postMessage({
                type: 'testAgent',
                agentConfig: this.currentAgent,
                testQuery: query
            });
            
            // Listen for test result
            const handleTestResult = (event: MessageEvent) => {
                const message = event.data;
                
                if (message.type === 'testResult') {
                    window.removeEventListener('message', handleTestResult);
                    
                    if (message.error) {
                        reject(new Error(message.error));
                    } else {
                        resolve({
                            response: message.response,
                            usage: message.usage
                        });
                    }
                }
            };
            
            window.addEventListener('message', handleTestResult);
            
            // Timeout after 30 seconds
            setTimeout(() => {
                window.removeEventListener('message', handleTestResult);
                reject(new Error('Test query timed out (30s)'));
            }, 30000);
        });
    }
    
    /**
     * Display test output.
     */
    private showTestOutput(result: any, responseTime: string): void {
        const outputSection = document.getElementById('test-output-section');
        const response = document.getElementById('test-response');
        const errorSection = document.getElementById('test-error-section');
        
        if (outputSection && errorSection) {
            errorSection.style.display = 'none';
            outputSection.style.display = 'block';
        }
        
        if (response) {
            response.textContent = result.response;
        }
        
        // Update metrics
        if (result.usage) {
            const promptTokens = document.getElementById('prompt-tokens');
            const completionTokens = document.getElementById('completion-tokens');
            const totalTokens = document.getElementById('total-tokens');
            const responseTimeEl = document.getElementById('response-time');
            
            if (promptTokens) promptTokens.textContent = String(result.usage.prompt_tokens);
            if (completionTokens) completionTokens.textContent = String(result.usage.completion_tokens);
            if (totalTokens) totalTokens.textContent = String(result.usage.total_tokens);
            if (responseTimeEl) responseTimeEl.textContent = `${responseTime}ms`;
        }
    }
    
    /**
     * Display test error.
     */
    private showTestError(errorMessage: string): void {
        const errorSection = document.getElementById('test-error-section');
        const errorMsg = document.getElementById('test-error-message');
        const outputSection = document.getElementById('test-output-section');
        
        if (errorSection && errorMsg) {
            errorSection.style.display = 'block';
            errorMsg.textContent = errorMessage;
        }
        
        if (outputSection) {
            outputSection.style.display = 'none';
        }
    }
    
    /**
     * Show loading status.
     */
    private showTestStatus(): void {
        const status = document.getElementById('test-status');
        if (status) status.style.display = 'flex';
    }
    
    /**
     * Hide loading status.
     */
    private hideTestStatus(): void {
        const status = document.getElementById('test-status');
        if (status) status.style.display = 'none';
    }
    
    /**
     * Clear test output.
     */
    private clearTestOutput(): void {
        const outputSection = document.getElementById('test-output-section');
        const errorSection = document.getElementById('test-error-section');
        const statusSection = document.getElementById('test-status');
        const query = document.getElementById('test-query') as HTMLTextAreaElement;
        
        if (outputSection) outputSection.style.display = 'none';
        if (errorSection) errorSection.style.display = 'none';
        if (statusSection) statusSection.style.display = 'none';
        if (query) query.value = '';
    }
}
```

#### 3.3 Extension Handler (Backend)
**File**: `src/ui/customAgentBuilder.ts` → Update webview message handlers

```typescript
// Add this case in panel.onDidReceiveMessage:

case 'testAgent': {
    const { agentConfig, testQuery } = message as {
        agentConfig: CustomAgent;
        testQuery: string;
    };
    
    // Execute test in background
    this.executeAgentTest(agentConfig, testQuery)
        .then(result => {
            this.panel.webview.postMessage({
                type: 'testResult',
                response: result.response,
                usage: result.usage
            });
        })
        .catch(error => {
            this.panel.webview.postMessage({
                type: 'testResult',
                error: error instanceof Error ? error.message : String(error)
            });
        });
    break;
}
```

**Add new method**:

```typescript
/**
 * Execute agent test without saving.
 */
private async executeAgentTest(agent: CustomAgent, testQuery: string): Promise<{
    response: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> {
    const llmService = getLLMServiceInstance();
    
    if (!llmService) {
        throw new Error('LLM Service not initialized');
    }
    
    // Build system prompt with variable substitution
    let systemPrompt = agent.systemPrompt;
    
    // Substitute variables with sample values
    const substitutions: Record<string, string> = {
        '{{task_id}}': 'test-task-001',
        '{{ticket_id}}': 'TICKET-001',
        '{{user_query}}': testQuery,
        '{{file_path}}': 'src/example.ts',
        '{{selection}}': 'sample code selection',
        '{{project_name}}': 'Test Project',
        '{{current_date}}': new Date().toLocaleDateString(),
        '{{current_time}}': new Date().toLocaleTimeString(),
    };
    
    for (const [variable, value] of Object.entries(substitutions)) {
        systemPrompt = systemPrompt.replace(variable, value);
    }
    
    // Call LLM with timeout
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Test query timeout')), agent.timeoutSeconds * 1000)
    );
    
    const result = await Promise.race([
        llmService.completeLLM(testQuery, {
            systemPrompt,
            messages: [{ role: 'user', content: testQuery }],
            maxTokens: agent.maxTokens,
            temperature: agent.temperature,
        }),
        timeoutPromise
    ]);
    
    return {
        response: typeof result === 'string' ? result : result.content,
        usage: typeof result === 'object' && result.usage ? result.usage : undefined
    };
}
```

#### 3.4 CSS Styling
**File**: `src/ui/customAgentBuilder.ts` → Add CSS

```css
/* Test Mode Button */
.builder-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #ddd;
}

/* Test Panel Overlay */
.test-panel {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.test-panel {
    padding: 20px;
}

.test-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

.test-panel-header h2 {
    margin: 0;
    color: #333;
}

.btn-close {
    padding: 4px 8px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.2em;
    color: #666;
}

.btn-close:hover {
    color: #000;
}

/* Test Panel Body */
.test-panel-body {
    background-color: white;
    border-radius: 8px;
    padding: 20px;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.test-input-section {
    margin-bottom: 16px;
}

.test-input-section label {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
    color: #333;
}

.test-input-section textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.9em;
    resize: vertical;
    max-width: none;
}

#submit-test-btn {
    margin-top: 8px;
    width: 100%;
}

/* Test Status */
.test-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background-color: #e3f2fd;
    border: 1px solid #90caf9;
    border-radius: 4px;
    color: #1565c0;
    margin: 16px 0;
}

.spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid #1565c0;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

/* Test Output */
.test-output-section {
    margin-top: 16px;
}

.test-output-section h3 {
    margin-top: 0;
    dark: #333;
}

.test-response {
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 12px;
    max-height: 300px;
    overflow-y: auto;
    font-size: 0.85em;
    line-height: 1.4;
    white-space: pre-wrap;
    word-wrap: break-word;
}

/* Test Metrics */
.test-metrics {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-top: 12px;
}

.metric {
    background-color: #f9f9f9;
    border-radius: 4px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.metric-label {
    font-size: 0.8em;
    color: #666;
    font-weight: 600;
}

.metric-value {
    font-size: 1.2em;
    font-weight: 600;
    color: #2196f3;
    font-family: monospace;
}

/* Test Error */
.test-error {
    margin-top: 16px;
}

.test-error h3 {
    margin-top: 0;
    color: #c62828;
}

#test-error-message {
    background-color: #ffebee;
    border: 1px solid #ef5350;
    border-radius: 4px;
    padding: 12px;
    color: #b71c1c;
    font-size: 0.85em;
    white-space: pre-wrap;
    word-wrap: break-word;
}
```

### Test Cases

#### Test File: `tests/ui/customAgentBuilder.preview.test.ts`

```typescript
describe('Test Suite 15: Agent Test Mode Initialization', () => {
    it('Test 15.1: Should initialize test mode UI', ...)
    it('Test 15.2: Should wire up test button click handler', ...)
    it('Test 15.3: Should show close button in test panel', ...)
    it('Test 15.4: Should display test query input', ...)
});

describe('Test Suite 16: Test Query Submission', () => {
    it('Test 16.1: Should validate agent config before testing', ...)
    it('Test 16.2: Should reject test if agent has validation errors', ...)
    it('Test 16.3: Should prevent empty test queries', ...)
    it('Test 16.4: Should show loading status while testing', ...)
});

describe('Test Suite 17: Test Query Execution', () => {
    it('Test 17.1: Should execute test query with substituted variables', ...)
    it('Test 17.2: Should substitute {{task_id}} with test value', ...)
    it('Test 17.3: Should substitute {{current_date}} with actual date', ...)
    it('Test 17.4: Should apply agent system prompt to test', ...)
    it('Test 17.5: Should respect agent timeout setting', ...)
    it('Test 17.6: Should timeout after 30 seconds', ...)
});

describe('Test Suite 18: Test Output Display', () => {
    it('Test 18.1: Should display agent response in preview pane', ...)
    it('Test 18.2: Should render response with proper formatting', ...)
    it('Test 18.3: Should display prompt token count', ...)
    it('Test 18.4: Should display completion token count', ...)
    it('Test 18.5: Should display total token count', ...)
    it('Test 18.6: Should display response timing in milliseconds', ...)
});

describe('Test Suite 19: Error Handling', () => {
    it('Test 19.1: Should display error message if test fails', ...)
    it('Test 19.2: Should show network errors gracefully', ...)
    it('Test 19.3: Should show timeout errors', ...)
    it('Test 19.4: Should allow retrying after error', ...)
});

describe('Test Suite 20: Test Panel UI', () => {
    it('Test 20.1: Should toggle test panel visibility', ...)
    it('Test 20.2: Should clear output when opening test panel', ...)
    it('Test 20.3: Should close panel when clicking close button', ...)
    it('Test 20.4: Should focus query input when opening panel', ...)
    it('Test 20.5: Should support Ctrl+Enter to submit', ...)
});
```

#### Test File: `tests/services/customAgentExecutor.testMode.test.ts`

```typescript
describe('Test Suite 21: Agent Test Execution', () => {
    it('Test 21.1: Should execute agent for test mode', ...)
    it('Test 21.2: Should substitute all variables in system prompt', ...)
    it('Test 21.3: Should use test values for variables', ...)
    it('Test 21.4: Should return response and token usage', ...)
    it('Test 21.5: Should handle LLM errors gracefully', ...)
});

describe('Test Suite 22: Variable Substitution in Tests', () => {
    it('Test 22.1: Should replace {{task_id}} in prompt', ...)
    it('Test 22.2: Should replace {{user_query}} in prompt', ...)
    it('Test 22.3: Should replace {{current_date}} with actual date', ...)
    it('Test 22.4: Should replace {{file_path}} with test value', ...)
    it('Test 22.5: Should handle multiple same-variable occurrences', ...)
    it('Test 22.6: Should skip unknown variables ({{unknown}} stays as-is)', ...)
});
```

### Potential Pitfalls & Solutions

| Pitfall | Risk | Solution |
|---------|------|----------|
| **Test hangs indefinitely** | High | Set 30-second timeout on Promise.race() |
| **Agent not validated before test** | High | Call validateCustomAgent() first, reject if errors |
| **Variable substitution incomplete** | Medium | Use regex to replace all {{var}} occurrences: `systemPrompt.replace(/\{\{(\w+)\}\}/g, (m, v) => subs[m] \|\| m)` |
| **Token counts not populated** | Medium | Check LLM response includes `usage` field; default to `{prompt: 0, completion: 0, total: 0}` if missing |
| **Response time includes network latency** | Low | Start timer after request, not before |
| **Panel doesn't close on Escape** | Low | Add `document.addEventListener('keydown', e => e.key === 'Escape' && closePanel())` |
| **Test query too long** | Medium | Set max length or max tokens, show warning |
| **LLM service not initialized** | High | Check `getLLMServiceInstance()` is available; throw clear error |

### Success Criteria
- ✅ Test button visible in builder form
- ✅ Test panel opens without validation errors
- ✅ Sample query submits and shows loading spinner
- ✅ Agent responds with agent response displayed
- ✅ Token counts display correctly
- ✅ Response time shows in milliseconds
- ✅ Errors handled gracefully with clear messages
- ✅ All 22 test suites pass (40+ tests)
- ✅ Works with agents that have custom lists and metadata

### Time Estimate Breakdown
| Task | Time |
|------|------|
| HTML/CSS test panel UI | 7 min |
| Test manager class | 10 min |
| Agent test execution logic | 8 min |
| Variable substitution | 3 min |
| Message passing handler | 3 min |
| Test writing | 8 min |
| Testing & debugging | 4 min |
| **Total Actual** | **43 min** ← Typically 20-30% over estimate |

---

## 🏃 Implementation Execution Order

### Why This Order?

1. **MT-030.8 (Metadata)** → Simplest, no UI changes, just schema validation
2. **MT-030.7 (Lists)** → Heavy UI work but independent, can use as soon as schema is solid
3. **MT-030.11 (Preview)** → Depends on everything being stable, most complex integration

### Critical Dependencies

```
MT-030.8 ✅
└── MT-030.1 (Schema) ✅
    └── No dependencies

MT-030.7 ✅
└── MT-030.3 (Builder UI) ✅
    └── MT-030.1 (Schema) ✅

MT-030.11 ✅
└── MT-030.10 (Executor) ✅
    ├── MT-030.9 (Storage) ✅
    └── MT-030.2 (Hardlock) ✅
```

All dependencies are complete! ✅

---

## 📊 Time Tracking Template

```
Feature | Planned | Actual | Variance | Notes
--------|---------|--------|----------|--------
MT-030.8 | 20 min | ___ | ___ | 
MT-030.7 | 45 min | ___ | ___ |
MT-030.11 | 35 min | ___ | ___ |
TOTAL | 100 min | ___ | ___ |
```

**How to track**:
1. Start timer before each feature
2. Log any blocking issues
3. Update actual time when complete
4. Note learnings for next sprint

---

## 🚀 Ready to Start?

### Pre-Implementation Checklist
- [ ] All dependencies verified complete
- [ ] npm run compile succeeds
- [ ] npm run test:once passes
- [ ] Read through each feature's "Code Changes Needed" section
- [ ] Created test files listed in each feature
- [ ] Backed up current code (git commit)

### During Implementation
- [ ] Follow the "Code Changes Needed" exactly as written
- [ ] Run npm run compile after each major change
- [ ] Run tests after each feature: `npm run test:once -- customAgent`
- [ ] Update time tracker as you go
- [ ] Note any pitfalls you encounter (for future reference)

### After Implementation
- [ ] All tests passing
- [ ] Manual testing in VS Code
- [ ] Update master plan with actual times
- [ ] Update this document with learnings

---

**Questions?** Check the linked documentation:
- Schema validation: `src/agents/custom/schema.ts`
- Builder UI: `src/ui/customAgentBuilder.ts`
- Executor: `src/agents/custom/executor.ts`
- Storage: `src/agents/custom/storage.ts`
