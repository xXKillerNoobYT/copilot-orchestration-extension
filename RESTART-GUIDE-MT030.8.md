# IMPLEMENTATION RESTART GUIDE - MT-030.8

## CURRENT PROGRESS
✅ get_errors: FIXED (31 tests passing)
🟠 MT-030.8: IN PROGRESS

## IMMEDIATE NEXT STEPS (Copy-paste ready)

### Action 1: Update line 593 in src/ui/customAgentBuilder.ts
Current code (around line 585-595):
```typescript
${this.getBasicInfoSection()}
${this.getSystemPromptSection()}
${this.getGoalsSection()}
${this.getChecklistSection()}
${this.getCustomListsSection()}
```

Replace with:
```typescript
${this.getBasicInfoSection()}
${this.getSystemPromptSection()}
${this.getGoalsSection()}
${this.getChecklistSection()}
${this.getCustomListsSection()}
${this.getMetadataSection()}
```

### Action 2: Add getMetadataSection() method
Location: After getCustomListsSection() method (find it and add after ~line 1300)
Copy-paste this entire method:

```typescript
    /**
     * Metadata section for agent information (author, version, tags)
     */
    private getMetadataSection(): string {
        return `
            <div class="section" id="section-metadata">
                <div class="section-header" data-section="metadata">
                    <h2 class="section-title">📋 Metadata (Optional)</h2>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="section-content" id="content-metadata">
                    <div class="form-group">
                        <label class="form-label">Author</label>
                        <input type="text" id="author" maxlength="100" placeholder="Enter author name">
                        <span class="char-count"><span id="author-count">0</span>/100</span>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Version</label>
                        <input type="text" id="version" placeholder="1.0.0" pattern="^\\d+\\.\\d+\\.\\d+$">
                        <span id="version-error" class="error"></span>
                        <span class="form-hint">Format: Major.Minor.Patch (e.g., 1.0.0)</span>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tags</label>
                        <input type="text" id="tags" placeholder="comma, separated, tags" maxlength="300">
                        <span class="form-hint">Max 10 tags. Separate with commas.</span>
                    </div>
                </div>
            </div>
        `;
    }
```

### Action 3: Find getCssStyles() method and add CSS
Location: getCssStyles() method at line 614
Look for the closing triple backtick and add this CSS before it:

```css
/* Metadata Section */
#section-metadata {
    background-color: rgba(100, 100, 255, 0.05);
    border-left: 3px solid #5555ff;
}

.metadata-section .form-group {
    margin-bottom: 12px;
}

#author-count, #version-error {
    font-size: 12px;
    color: #999;
    margin-left: 8px;
}

#version-error.has-error {
    color: #ff4444;
}
```

## CRITICAL LINE NUMBERS
- Action 1: Line 593 (getHtmlContent) ✅ DONE
- Action 2: Add after line 1280 (after getCustomListsSection which ends ~1280)
- Action 3: getCssStyles() at line 614 (add CSS before final ```)
- Action 4: getJavaScript() setupEventListeners (~line 1980+)
- Action 5: loadAgent() function (~line 500)
Add this code block:

```typescript
// Metadata field handlers
document.getElementById('author')?.addEventListener('input', (e) => {
    const authorInput = e.target as HTMLInputElement;
    currentAgent.metadata = currentAgent.metadata || {};
    currentAgent.metadata.author = authorInput.value;
    document.getElementById('author-count')!.textContent = authorInput.value.length;
});

document.getElementById('version')?.addEventListener('change', (e) => {
    const versionInput = e.target as HTMLInputElement;
    const isValid = /^\d+\.\d+\.\d+$/.test(versionInput.value);
    const errorEl = document.getElementById('version-error')!;
    
    if (isValid || versionInput.value === '') {
        currentAgent.metadata = currentAgent.metadata || {};
        currentAgent.metadata.version = versionInput.value || '1.0.0';
        errorEl.classList.remove('has-error');
        errorEl.textContent = '';
    } else {
        errorEl.classList.add('has-error');
        errorEl.textContent = 'Invalid format. Use: X.Y.Z';
    }
});

document.getElementById('tags')?.addEventListener('input', (e) => {
    const tagsInput = e.target as HTMLInputElement;
    const tags = tagsInput.value
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
    
    currentAgent.metadata = currentAgent.metadata || {};
    currentAgent.metadata.tags = tags;
});
```

### Action 5: In loadAgent() function, add metadata loading
Location: loadAgent() function (around line 500+), after loading other fields add:

```typescript
// Load metadata if present
if (agent.metadata?.author) {
    (document.getElementById('author') as HTMLInputElement).value = agent.metadata.author;
    document.getElementById('author-count')!.textContent = agent.metadata.author.length;
}
if (agent.metadata?.version) {
    (document.getElementById('version') as HTMLInputElement).value = agent.metadata.version;
}
if (agent.metadata?.tags && agent.metadata.tags.length > 0) {
    (document.getElementById('tags') as HTMLInputElement).value = agent.metadata.tags.join(', ');
}
```

## VERIFICATION STEPS
1. npm run compile (should show 0 errors)
2. Check src/ui/customAgentBuilder.ts has all 5 changes
3. Open VS Code and verify metadata section appears in webview
4. Enter author name, verify char count updates
5. Enter version like "1.0.0", verify no error
6. Enter version like "1.0", verify error appears
7. Enter tags like "ai, research, custom", verify parsed correctly

## FILES MODIFIED
- src/ui/customAgentBuilder.ts (5 changes total)

## NEXT AFTER THIS
- Write tests in tests/ui/customAgentBuilder.metadata.test.ts
- Run npm run test:once 
- Then move to MT-030.7 (Custom Lists)

## IMPORTANT
- Schema already complete (src/agents/custom/schema.ts)
- No changes to schema needed
- Just exposing existing schema in UI
