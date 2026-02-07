/**
 * Detailed Text Box Component (MT-033.9)
 *
 * **Simple explanation**: A reusable rich text input component with character counter,
 * markdown preview toggle, auto-save, and undo/redo support. Like a mini text editor
 * embedded in forms.
 *
 * @module ui/detailedTextBox
 */

// ============================================================================
// Types
// ============================================================================

export interface DetailedTextBoxOptions {
    /** Unique identifier for this text box */
    id: string;
    /** Label text shown above the input */
    label: string;
    /** Current value */
    value: string;
    /** Placeholder text when empty */
    placeholder?: string;
    /** Maximum character limit */
    maxLength?: number;
    /** Minimum height in pixels */
    minHeight?: number;
    /** Enable markdown preview toggle */
    enableMarkdown?: boolean;
    /** Show undo/redo buttons */
    enableUndoRedo?: boolean;
    /** Field path for onChange callback (e.g., 'overview.description') */
    fieldPath: string;
    /** Whether field is required */
    required?: boolean;
    /** Help text shown below input */
    hint?: string;
    /** Error message to display */
    error?: string;
}

export interface TextBoxState {
    /** Current text value */
    value: string;
    /** Undo stack (previous values) */
    undoStack: string[];
    /** Redo stack (values after undo) */
    redoStack: string[];
    /** Whether markdown preview is showing */
    showPreview: boolean;
    /** Last saved value (for dirty detection) */
    lastSaved: string;
}

// ============================================================================
// Constants
// ============================================================================

export const TEXT_BOX_DEFAULTS = {
    MAX_LENGTH: 2000,
    MIN_HEIGHT: 100,
    MAX_UNDO_STEPS: 50,
    AUTO_SAVE_DELAY_MS: 1000,
} as const;

// ============================================================================
// HTML Rendering
// ============================================================================

/**
 * Renders a detailed text box component as HTML string.
 *
 * **Simple explanation**: Creates an enhanced textarea with optional
 * character counter, markdown preview, and undo/redo buttons.
 *
 * @param options - Configuration options for the text box
 * @returns HTML string
 */
export function renderDetailedTextBox(options: DetailedTextBoxOptions): string {
    const {
        id,
        label,
        value,
        placeholder = '',
        maxLength = TEXT_BOX_DEFAULTS.MAX_LENGTH,
        minHeight = TEXT_BOX_DEFAULTS.MIN_HEIGHT,
        enableMarkdown = true,
        enableUndoRedo = true,
        fieldPath,
        required = false,
        hint,
        error,
    } = options;

    const escapedValue = escapeHtml(value);
    const charCount = value.length;
    const isOverLimit = charCount > maxLength;

    return `
    <div class="detailed-textbox" id="${id}-container">
      <div class="dtb-header">
        <label for="${id}">
          ${escapeHtml(label)}${required ? ' <span class="required">*</span>' : ''}
        </label>
        <div class="dtb-controls">
          ${enableUndoRedo ? `
            <button type="button" class="btn-icon dtb-undo" onclick="dtbUndo('${id}')" title="Undo (Ctrl+Z)">↶</button>
            <button type="button" class="btn-icon dtb-redo" onclick="dtbRedo('${id}')" title="Redo (Ctrl+Y)">↷</button>
          ` : ''}
          ${enableMarkdown ? `
            <button type="button" class="btn-icon dtb-preview-toggle" onclick="dtbTogglePreview('${id}')" title="Toggle Markdown Preview">
              <span id="${id}-preview-icon">👁</span>
            </button>
          ` : ''}
          <span class="dtb-counter ${isOverLimit ? 'over-limit' : ''}">
            <span id="${id}-count">${charCount}</span>/${maxLength}
          </span>
        </div>
      </div>

      <div class="dtb-body">
        <textarea
          id="${id}"
          class="form-control dtb-textarea"
          placeholder="${escapeHtml(placeholder)}"
          maxlength="${maxLength}"
          style="min-height: ${minHeight}px"
          oninput="dtbOnInput('${id}', '${fieldPath}', this.value)"
          onchange="dtbOnChange('${id}', '${fieldPath}', this.value)"
          onkeydown="dtbOnKeyDown(event, '${id}')"
        >${escapedValue}</textarea>
        
        <div id="${id}-preview" class="dtb-preview hidden">
          <div class="dtb-preview-content" id="${id}-preview-content">
            ${renderMarkdownPreview(value)}
          </div>
        </div>
      </div>

      ${hint ? `<div class="dtb-hint">${escapeHtml(hint)}</div>` : ''}
      ${error ? `<div class="dtb-error">${escapeHtml(error)}</div>` : ''}
    </div>
  `;
}

/**
 * Generates CSS styles for the detailed text box.
 *
 * **Simple explanation**: Returns the CSS needed to style the text box
 * properly within VS Code's webview environment.
 *
 * @returns CSS string
 */
export function getDetailedTextBoxStyles(): string {
    return `
    /* Detailed Text Box Component Styles */
    .detailed-textbox {
      margin-bottom: 16px;
    }

    .dtb-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .dtb-header label {
      font-weight: 500;
      font-size: 13px;
    }

    .dtb-header .required {
      color: var(--vscode-errorForeground);
    }

    .dtb-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .dtb-counter {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-left: 8px;
    }

    .dtb-counter.over-limit {
      color: var(--vscode-errorForeground);
      font-weight: bold;
    }

    .dtb-body {
      position: relative;
    }

    .dtb-textarea {
      width: 100%;
      padding: 10px 12px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      color: var(--vscode-editor-foreground);
      border-radius: 4px;
      font-size: 13px;
      font-family: var(--vscode-editor-font-family), monospace;
      line-height: 1.5;
      resize: vertical;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .dtb-textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 0 0 1px var(--vscode-focusBorder);
    }

    .dtb-textarea.has-error {
      border-color: var(--vscode-errorForeground);
    }

    .dtb-preview {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 10px 12px;
      overflow: auto;
    }

    .dtb-preview.hidden {
      display: none;
    }

    .dtb-preview-content {
      font-size: 13px;
      line-height: 1.6;
    }

    .dtb-preview-content h1,
    .dtb-preview-content h2,
    .dtb-preview-content h3 {
      margin-top: 16px;
      margin-bottom: 8px;
    }

    .dtb-preview-content h1 { font-size: 1.5em; }
    .dtb-preview-content h2 { font-size: 1.3em; }
    .dtb-preview-content h3 { font-size: 1.1em; }

    .dtb-preview-content p {
      margin-bottom: 8px;
    }

    .dtb-preview-content code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family), monospace;
    }

    .dtb-preview-content pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .dtb-preview-content pre code {
      background: none;
      padding: 0;
    }

    .dtb-preview-content ul,
    .dtb-preview-content ol {
      margin-left: 20px;
      margin-bottom: 8px;
    }

    .dtb-preview-content blockquote {
      border-left: 3px solid var(--vscode-activityBarBadge-background);
      padding-left: 12px;
      margin: 8px 0;
      color: var(--vscode-descriptionForeground);
    }

    .dtb-hint {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .dtb-error {
      font-size: 12px;
      color: var(--vscode-errorForeground);
      margin-top: 4px;
    }

    .btn-icon {
      background: none;
      border: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      font-size: 14px;
      transition: background 0.2s, color 0.2s;
    }

    .btn-icon:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-editor-foreground);
    }

    .btn-icon:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;
}

/**
 * Generates JavaScript handlers for the detailed text box.
 *
 * **Simple explanation**: Returns the JavaScript code that makes the
 * text box interactive - handles input, undo/redo, and preview toggle.
 *
 * @returns JavaScript string
 */
export function getDetailedTextBoxScript(): string {
    return `
    // Detailed Text Box State Management
    const dtbState = new Map();

    function dtbGetState(id) {
      if (!dtbState.has(id)) {
        const textarea = document.getElementById(id);
        dtbState.set(id, {
          value: textarea ? textarea.value : '',
          undoStack: [],
          redoStack: [],
          showPreview: false,
          lastSaved: textarea ? textarea.value : '',
        });
      }
      return dtbState.get(id);
    }

    function dtbOnInput(id, fieldPath, value) {
      const state = dtbGetState(id);
      
      // Update character counter
      const countEl = document.getElementById(id + '-count');
      if (countEl) {
        countEl.textContent = value.length;
      }
      
      // Update preview if visible
      if (state.showPreview) {
        const previewEl = document.getElementById(id + '-preview-content');
        if (previewEl) {
          previewEl.innerHTML = renderMarkdownToHtml(value);
        }
      }
      
      // Auto-save after debounce (handled in onChange)
      state.value = value;
    }

    function dtbOnChange(id, fieldPath, value) {
      const state = dtbGetState(id);
      
      // Push to undo stack if value changed significantly
      if (state.value !== value && state.undoStack[state.undoStack.length - 1] !== state.value) {
        state.undoStack.push(state.value);
        if (state.undoStack.length > ${TEXT_BOX_DEFAULTS.MAX_UNDO_STEPS}) {
          state.undoStack.shift();
        }
        state.redoStack = []; // Clear redo on new change
      }
      
      state.value = value;
      
      // Trigger save via parent wizard
      if (typeof onFieldChange === 'function') {
        onFieldChange(fieldPath, value);
      }
    }

    function dtbOnKeyDown(event, id) {
      // Ctrl+Z for undo, Ctrl+Y for redo
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'z' && !event.shiftKey) {
          event.preventDefault();
          dtbUndo(id);
        } else if (event.key === 'y' || (event.key === 'z' && event.shiftKey)) {
          event.preventDefault();
          dtbRedo(id);
        }
      }
    }

    function dtbUndo(id) {
      const state = dtbGetState(id);
      if (state.undoStack.length === 0) return;
      
      const textarea = document.getElementById(id);
      if (!textarea) return;
      
      // Push current value to redo
      state.redoStack.push(state.value);
      
      // Pop from undo
      const previousValue = state.undoStack.pop();
      state.value = previousValue;
      textarea.value = previousValue;
      
      // Update counter and preview
      dtbOnInput(id, '', previousValue);
    }

    function dtbRedo(id) {
      const state = dtbGetState(id);
      if (state.redoStack.length === 0) return;
      
      const textarea = document.getElementById(id);
      if (!textarea) return;
      
      // Push current value to undo
      state.undoStack.push(state.value);
      
      // Pop from redo
      const nextValue = state.redoStack.pop();
      state.value = nextValue;
      textarea.value = nextValue;
      
      // Update counter and preview
      dtbOnInput(id, '', nextValue);
    }

    function dtbTogglePreview(id) {
      const state = dtbGetState(id);
      state.showPreview = !state.showPreview;
      
      const textarea = document.getElementById(id);
      const preview = document.getElementById(id + '-preview');
      const icon = document.getElementById(id + '-preview-icon');
      
      if (state.showPreview) {
        textarea.style.display = 'none';
        preview.classList.remove('hidden');
        if (icon) icon.textContent = '✏️';
        
        // Update preview content
        const previewContent = document.getElementById(id + '-preview-content');
        if (previewContent && textarea) {
          previewContent.innerHTML = renderMarkdownToHtml(textarea.value);
        }
      } else {
        textarea.style.display = '';
        preview.classList.add('hidden');
        if (icon) icon.textContent = '👁';
      }
    }

    // Simple markdown to HTML renderer
    function renderMarkdownToHtml(text) {
      if (!text) return '<em>Nothing to preview</em>';
      
      let html = escapeHtmlForPreview(text);
      
      // Headers
      html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
      
      // Code blocks
      html = html.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>');
      
      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
      
      // Bold
      html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      
      // Italic
      html = html.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
      
      // Lists
      html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
      html = html.replace(/(<li>.*<\\/li>\\n?)+/g, '<ul>$&</ul>');
      
      // Blockquotes
      html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
      
      // Paragraphs
      html = html.replace(/\\n\\n/g, '</p><p>');
      html = '<p>' + html + '</p>';
      
      // Clean up empty paragraphs
      html = html.replace(/<p><\\/p>/g, '');
      html = html.replace(/<p>(<h[123]>)/g, '$1');
      html = html.replace(/(<\\/h[123]>)<\\/p>/g, '$1');
      
      return html;
    }

    function escapeHtmlForPreview(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Escapes HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Renders a simple markdown preview (server-side).
 *
 * **Simple explanation**: Converts markdown text to HTML for display
 * in the preview pane. Supports headers, bold, italic, code, lists.
 */
function renderMarkdownPreview(text: string): string {
    if (!text) return '<em>Nothing to preview</em>';

    let html = escapeHtml(text);

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold and Italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    return html;
}
