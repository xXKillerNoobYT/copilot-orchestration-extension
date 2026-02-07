/**
 * Block Property Panel (MT-033.21)
 *
 * **Simple explanation**: A side panel that shows all properties of a selected
 * block and lets you edit them. Like an inspector panel in design tools.
 *
 * @module ui/blockPropertyPanel
 */

import { CanvasBlock, PRIORITY_COLORS } from './blockCanvas';
import { FeatureBlock, DependencyType } from '../planning/types';

// ============================================================================
// Types
// ============================================================================

export interface PropertyPanelState {
    /** Currently selected block */
    selectedBlock: CanvasBlock | null;
    /** Full feature data for the selected block */
    featureData: FeatureBlock | null;
    /** Panel visibility */
    isVisible: boolean;
    /** Expanded sections */
    expandedSections: Set<string>;
}

export interface PropertyChange {
    /** Block ID being edited */
    blockId: string;
    /** Property path (e.g., 'name', 'priority', 'acceptanceCriteria[0]') */
    propertyPath: string;
    /** Old value */
    oldValue: unknown;
    /** New value */
    newValue: unknown;
}

// ============================================================================
// Panel State Management
// ============================================================================

/**
 * Create initial property panel state.
 */
export function createPropertyPanelState(): PropertyPanelState {
    return {
        selectedBlock: null,
        featureData: null,
        isVisible: true,
        expandedSections: new Set(['basic', 'description', 'criteria']),
    };
}

/**
 * Select a block for editing.
 */
export function selectBlockForEdit(
    state: PropertyPanelState,
    block: CanvasBlock,
    featureData?: FeatureBlock
): void {
    state.selectedBlock = block;
    state.featureData = featureData || null;
}

/**
 * Clear selection.
 */
export function clearPropertySelection(state: PropertyPanelState): void {
    state.selectedBlock = null;
    state.featureData = null;
}

/**
 * Toggle section expansion.
 */
export function toggleSection(state: PropertyPanelState, sectionId: string): void {
    if (state.expandedSections.has(sectionId)) {
        state.expandedSections.delete(sectionId);
    } else {
        state.expandedSections.add(sectionId);
    }
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Renders the property panel.
 */
export function renderPropertyPanel(state: PropertyPanelState): string {
    if (!state.isVisible) {
        return `<div class="property-panel collapsed">
      <button class="expand-btn" onclick="togglePropertyPanel()">◀</button>
    </div>`;
    }

    if (!state.selectedBlock) {
        return renderEmptyPanel();
    }

    const block = state.selectedBlock;
    const feature = state.featureData;

    return `
    <div class="property-panel">
      <div class="panel-header">
        <h4>Properties</h4>
        <button class="btn-icon" onclick="togglePropertyPanel()" title="Collapse">▶</button>
      </div>

      <div class="panel-content">
        ${renderBasicSection(block, state.expandedSections.has('basic'))}
        ${renderDescriptionSection(block, feature, state.expandedSections.has('description'))}
        ${renderCriteriaSection(feature, state.expandedSections.has('criteria'))}
        ${renderConnectionsSection(block, state.expandedSections.has('connections'))}
        ${renderAdvancedSection(block, state.expandedSections.has('advanced'))}
      </div>

      <div class="panel-actions">
        <button class="btn-danger" onclick="deleteSelectedBlock()">🗑️ Delete Block</button>
      </div>
    </div>
  `;
}

function renderEmptyPanel(): string {
    return `
    <div class="property-panel">
      <div class="panel-header">
        <h4>Properties</h4>
        <button class="btn-icon" onclick="togglePropertyPanel()" title="Collapse">▶</button>
      </div>
      <div class="panel-empty">
        <div class="empty-icon">📦</div>
        <div class="empty-text">Select a block to edit its properties</div>
      </div>
    </div>
  `;
}

function renderBasicSection(block: CanvasBlock, expanded: boolean): string {
    return `
    <div class="property-section ${expanded ? 'expanded' : ''}">
      <div class="section-header" onclick="togglePropertySection('basic')">
        <span class="section-icon">${expanded ? '▼' : '▶'}</span>
        <span class="section-title">Basic Info</span>
      </div>
      ${expanded ? `
        <div class="section-content">
          <div class="property-row">
            <label for="blockName">Name</label>
            <input 
              type="text" 
              id="blockName" 
              value="${escapeHtml(block.name)}"
              onchange="updateBlockProperty('name', this.value)"
            />
          </div>

          <div class="property-row">
            <label for="blockType">Type</label>
            <select id="blockType" onchange="updateBlockProperty('type', this.value)">
              <option value="feature" ${block.type === 'feature' ? 'selected' : ''}>📦 Feature</option>
              <option value="milestone" ${block.type === 'milestone' ? 'selected' : ''}>🚩 Milestone</option>
              <option value="note" ${block.type === 'note' ? 'selected' : ''}>📝 Note</option>
            </select>
          </div>

          <div class="property-row">
            <label for="blockPriority">Priority</label>
            <select id="blockPriority" onchange="updateBlockProperty('priority', this.value)">
              ${['critical', 'high', 'medium', 'low'].map(p => `
                <option value="${p}" ${block.priority === p ? 'selected' : ''}>
                  ${p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              `).join('')}
            </select>
            <div class="priority-preview" style="background: ${PRIORITY_COLORS[block.priority]}"></div>
          </div>

          <div class="property-row">
            <label>Position</label>
            <div class="position-inputs">
              <input 
                type="number" 
                id="blockX" 
                value="${Math.round(block.position.x)}"
                onchange="updateBlockProperty('position.x', parseInt(this.value))"
              />
              <span>×</span>
              <input 
                type="number" 
                id="blockY" 
                value="${Math.round(block.position.y)}"
                onchange="updateBlockProperty('position.y', parseInt(this.value))"
              />
            </div>
          </div>

          <div class="property-row">
            <label>Size</label>
            <div class="position-inputs">
              <input 
                type="number" 
                id="blockWidth" 
                value="${block.size.width}"
                onchange="updateBlockProperty('size.width', parseInt(this.value))"
                min="100"
                max="500"
              />
              <span>×</span>
              <input 
                type="number" 
                id="blockHeight" 
                value="${block.size.height}"
                onchange="updateBlockProperty('size.height', parseInt(this.value))"
                min="60"
                max="300"
              />
            </div>
          </div>

          <div class="property-row">
            <label for="blockColor">Custom Color</label>
            <input 
              type="color" 
              id="blockColor" 
              value="${block.color || PRIORITY_COLORS[block.priority]}"
              onchange="updateBlockProperty('color', this.value)"
            />
            <button class="btn-small" onclick="clearBlockColor()">Reset</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderDescriptionSection(block: CanvasBlock, feature: FeatureBlock | null, expanded: boolean): string {
    const description = feature?.description || block.description || '';

    return `
    <div class="property-section ${expanded ? 'expanded' : ''}">
      <div class="section-header" onclick="togglePropertySection('description')">
        <span class="section-icon">${expanded ? '▼' : '▶'}</span>
        <span class="section-title">Description</span>
      </div>
      ${expanded ? `
        <div class="section-content">
          <div class="property-row full-width">
            <textarea 
              id="blockDescription" 
              rows="4"
              placeholder="Describe what this feature does..."
              onchange="updateBlockProperty('description', this.value)"
            >${escapeHtml(description)}</textarea>
            <div class="char-count">${description.length} characters</div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderCriteriaSection(feature: FeatureBlock | null, expanded: boolean): string {
    const criteria = feature?.acceptanceCriteria || [];

    return `
    <div class="property-section ${expanded ? 'expanded' : ''}">
      <div class="section-header" onclick="togglePropertySection('criteria')">
        <span class="section-icon">${expanded ? '▼' : '▶'}</span>
        <span class="section-title">Acceptance Criteria</span>
        <span class="section-badge">${criteria.length}</span>
      </div>
      ${expanded ? `
        <div class="section-content">
          <div class="criteria-list" id="criteriaList">
            ${criteria.length > 0 ? criteria.map((c, i) => `
              <div class="criteria-item" data-index="${i}">
                <input 
                  type="text" 
                  value="${escapeHtml(c)}"
                  onchange="updateCriterion(${i}, this.value)"
                  placeholder="Criterion ${i + 1}"
                />
                <button class="btn-icon" onclick="removeCriterion(${i})" title="Remove">✕</button>
              </div>
            `).join('') : `
              <div class="criteria-empty">No acceptance criteria defined</div>
            `}
          </div>
          <button class="btn-secondary btn-full" onclick="addCriterion()">
            ➕ Add Criterion
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderConnectionsSection(block: CanvasBlock, expanded: boolean): string {
    return `
    <div class="property-section ${expanded ? 'expanded' : ''}">
      <div class="section-header" onclick="togglePropertySection('connections')">
        <span class="section-icon">${expanded ? '▼' : '▶'}</span>
        <span class="section-title">Connections</span>
      </div>
      ${expanded ? `
        <div class="section-content">
          <div class="connection-actions">
            <button class="btn-secondary btn-full" onclick="startNewConnection('requires')">
              🔗 Add "Requires" Link
            </button>
            <button class="btn-secondary btn-full" onclick="startNewConnection('blocks')">
              🚫 Add "Blocks" Link
            </button>
            <button class="btn-secondary btn-full" onclick="startNewConnection('suggests')">
              💡 Add "Suggests" Link
            </button>
          </div>
          <div class="existing-connections" id="existingConnections">
            <!-- Populated dynamically -->
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAdvancedSection(block: CanvasBlock, expanded: boolean): string {
    return `
    <div class="property-section ${expanded ? 'expanded' : ''}">
      <div class="section-header" onclick="togglePropertySection('advanced')">
        <span class="section-icon">${expanded ? '▼' : '▶'}</span>
        <span class="section-title">Advanced</span>
      </div>
      ${expanded ? `
        <div class="section-content">
          <div class="property-row">
            <label>Block ID</label>
            <code class="readonly-value">${block.id}</code>
          </div>
          <div class="property-row">
            <label>Created</label>
            <span class="readonly-value">N/A</span>
          </div>
          <div class="action-buttons">
            <button class="btn-secondary btn-full" onclick="duplicateBlock()">
              📋 Duplicate Block
            </button>
            <button class="btn-secondary btn-full" onclick="bringToFront()">
              ⬆️ Bring to Front
            </button>
            <button class="btn-secondary btn-full" onclick="sendToBack()">
              ⬇️ Send to Back
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Renders connection list for current block.
 */
export function renderBlockConnections(
    blockId: string,
    incomingConnections: Array<{ sourceId: string; sourceName: string; type: DependencyType }>,
    outgoingConnections: Array<{ targetId: string; targetName: string; type: DependencyType }>
): string {
    return `
    <div class="connection-list">
      ${outgoingConnections.length > 0 ? `
        <div class="connection-group">
          <h5>Outgoing</h5>
          ${outgoingConnections.map(conn => `
            <div class="connection-item outgoing ${conn.type}">
              <span class="connection-type">${conn.type}</span>
              <span class="connection-arrow">→</span>
              <span class="connection-target">${escapeHtml(conn.targetName)}</span>
              <button class="btn-icon" onclick="removeConnection('${blockId}', '${conn.targetId}')" title="Remove">✕</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${incomingConnections.length > 0 ? `
        <div class="connection-group">
          <h5>Incoming</h5>
          ${incomingConnections.map(conn => `
            <div class="connection-item incoming ${conn.type}">
              <span class="connection-source">${escapeHtml(conn.sourceName)}</span>
              <span class="connection-arrow">→</span>
              <span class="connection-type">${conn.type}</span>
              <button class="btn-icon" onclick="removeConnection('${conn.sourceId}', '${blockId}')" title="Remove">✕</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${incomingConnections.length === 0 && outgoingConnections.length === 0 ? `
        <div class="no-connections">No connections</div>
      ` : ''}
    </div>
  `;
}

/**
 * Get CSS styles for the property panel.
 */
export function getPropertyPanelStyles(): string {
    return `
    .property-panel {
      width: 280px;
      background: var(--vscode-sideBar-background);
      border-left: 1px solid var(--vscode-sideBar-border);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .property-panel.collapsed {
      width: 30px;
    }

    .expand-btn {
      width: 100%;
      height: 40px;
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
    }

    .panel-header h4 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
    }

    .panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .panel-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-icon {
      font-size: 48px;
      opacity: 0.5;
      margin-bottom: 12px;
    }

    .empty-text {
      font-size: 12px;
    }

    .property-section {
      margin-bottom: 8px;
      background: var(--vscode-input-background);
      border-radius: 6px;
      overflow: hidden;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      cursor: pointer;
      user-select: none;
    }

    .section-header:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .section-icon {
      font-size: 10px;
      width: 12px;
    }

    .section-title {
      flex: 1;
      font-size: 12px;
      font-weight: 600;
    }

    .section-badge {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
    }

    .section-content {
      padding: 12px;
      border-top: 1px solid var(--vscode-input-border);
    }

    .property-row {
      margin-bottom: 12px;
    }

    .property-row label {
      display: block;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }

    .property-row input[type="text"],
    .property-row input[type="number"],
    .property-row select,
    .property-row textarea {
      width: 100%;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      color: var(--vscode-input-foreground);
      font-size: 12px;
    }

    .property-row textarea {
      resize: vertical;
      min-height: 60px;
      font-family: inherit;
    }

    .property-row.full-width {
      margin-bottom: 8px;
    }

    .char-count {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-align: right;
      margin-top: 4px;
    }

    .position-inputs {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .position-inputs input {
      width: 80px;
    }

    .position-inputs span {
      color: var(--vscode-descriptionForeground);
    }

    .priority-preview {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      display: inline-block;
      margin-left: 8px;
      vertical-align: middle;
    }

    .property-row input[type="color"] {
      width: 40px;
      height: 30px;
      padding: 0;
      border: none;
      cursor: pointer;
    }

    .readonly-value {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
    }

    code.readonly-value {
      background: var(--vscode-textBlockQuote-background);
      padding: 2px 4px;
      border-radius: 2px;
    }

    .criteria-list {
      margin-bottom: 8px;
    }

    .criteria-item {
      display: flex;
      gap: 4px;
      margin-bottom: 6px;
    }

    .criteria-item input {
      flex: 1;
    }

    .criteria-empty {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 12px;
    }

    .connection-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }

    .connection-list {
      font-size: 12px;
    }

    .connection-group {
      margin-bottom: 12px;
    }

    .connection-group h5 {
      margin: 0 0 6px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
    }

    .connection-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      margin-bottom: 4px;
      border-left: 3px solid;
    }

    .connection-item.requires { border-color: #0d6efd; }
    .connection-item.blocks { border-color: #dc3545; }
    .connection-item.suggests { border-color: #6c757d; }
    .connection-item.triggers { border-color: #28a745; }

    .connection-type {
      font-size: 10px;
      text-transform: uppercase;
      opacity: 0.7;
    }

    .connection-arrow {
      color: var(--vscode-descriptionForeground);
    }

    .connection-source,
    .connection-target {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .no-connections {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      padding: 12px;
    }

    .action-buttons {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .btn-full {
      width: 100%;
    }

    .panel-actions {
      padding: 12px;
      border-top: 1px solid var(--vscode-sideBar-border);
    }

    .panel-actions .btn-danger {
      width: 100%;
    }
  `;
}

/**
 * Get JavaScript for property panel interactivity.
 */
export function getPropertyPanelScript(): string {
    return `
    function togglePropertyPanel() {
      vscode.postMessage({ command: 'togglePropertyPanel' });
    }

    function togglePropertySection(sectionId) {
      vscode.postMessage({ command: 'togglePropertySection', sectionId });
    }

    function updateBlockProperty(propertyPath, value) {
      vscode.postMessage({ command: 'updateBlockProperty', propertyPath, value });
    }

    function clearBlockColor() {
      vscode.postMessage({ command: 'updateBlockProperty', propertyPath: 'color', value: null });
    }

    function addCriterion() {
      const text = prompt('Enter acceptance criterion:');
      if (text) {
        vscode.postMessage({ command: 'addCriterion', text });
      }
    }

    function updateCriterion(index, value) {
      vscode.postMessage({ command: 'updateCriterion', index, value });
    }

    function removeCriterion(index) {
      if (confirm('Remove this criterion?')) {
        vscode.postMessage({ command: 'removeCriterion', index });
      }
    }

    function startNewConnection(type) {
      vscode.postMessage({ command: 'startNewConnection', type });
    }

    function removeConnection(sourceId, targetId) {
      if (confirm('Remove this connection?')) {
        vscode.postMessage({ command: 'removeConnection', sourceId, targetId });
      }
    }

    function deleteSelectedBlock() {
      if (confirm('Delete this block and all its connections?')) {
        vscode.postMessage({ command: 'deleteSelectedBlock' });
      }
    }

    function duplicateBlock() {
      vscode.postMessage({ command: 'duplicateBlock' });
    }

    function bringToFront() {
      vscode.postMessage({ command: 'bringToFront' });
    }

    function sendToBack() {
      vscode.postMessage({ command: 'sendToBack' });
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

