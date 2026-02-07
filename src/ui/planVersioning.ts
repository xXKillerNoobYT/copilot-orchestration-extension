/**
 * Plan Versioning (MT-033.15)
 *
 * **Simple explanation**: Automatically saves versions of your plan as you work,
 * lets you compare versions side-by-side, and roll back to previous versions.
 * Like "undo" but for your entire plan at specific points in time.
 *
 * @module ui/planVersioning
 */

import * as crypto from 'crypto';
import { CompletePlan } from '../planning/types';

// ============================================================================
// Types
// ============================================================================

export interface PlanVersion {
    /** Unique version ID */
    id: string;
    /** Version number (auto-incremented) */
    versionNumber: number;
    /** User-provided label (optional) */
    label?: string;
    /** When this version was saved */
    timestamp: Date;
    /** What triggered this save */
    trigger: VersionTrigger;
    /** Deep copy of the plan at this version */
    plan: CompletePlan;
    /** Brief description of changes */
    description?: string;
    /** Author who saved this version */
    author?: string;
}

export type VersionTrigger =
    | 'auto_save'        // Periodic auto-save
    | 'page_navigation'  // User navigated to another page
    | 'manual_save'      // User clicked save
    | 'before_export'    // Before exporting
    | 'before_execute'   // Before executing plan
    | 'rollback';        // After rolling back

export interface VersionDiff {
    /** Fields that were added */
    added: string[];
    /** Fields that were removed */
    removed: string[];
    /** Fields that were changed */
    changed: DiffChange[];
    /** Summary statistics */
    summary: {
        totalChanges: number;
        addedCount: number;
        removedCount: number;
        changedCount: number;
    };
}

export interface DiffChange {
    /** Path to the changed field */
    fieldPath: string;
    /** Previous value */
    oldValue: unknown;
    /** New value */
    newValue: unknown;
    /** Type of change */
    changeType: 'added' | 'removed' | 'modified';
}

export interface VersioningState {
    /** All saved versions */
    versions: PlanVersion[];
    /** Current version index */
    currentVersionIndex: number;
    /** Auto-save interval in milliseconds */
    autoSaveInterval: number;
    /** Last auto-save timestamp */
    lastAutoSave: Date | null;
    /** Maximum versions to keep */
    maxVersions: number;
}

// ============================================================================
// Constants
// ============================================================================

export const VERSION_DEFAULTS = {
    AUTO_SAVE_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
    MAX_VERSIONS: 50,
    MIN_CHANGE_THRESHOLD: 1, // Minimum changes to trigger auto-save
} as const;

// ============================================================================
// Version Management
// ============================================================================

/**
 * Create initial versioning state.
 */
export function createVersioningState(initialPlan: CompletePlan): VersioningState {
    const initialVersion: PlanVersion = {
        id: crypto.randomUUID(),
        versionNumber: 1,
        label: 'Initial version',
        timestamp: new Date(),
        trigger: 'manual_save',
        plan: deepClone(initialPlan),
        description: 'Plan created',
    };

    return {
        versions: [initialVersion],
        currentVersionIndex: 0,
        autoSaveInterval: VERSION_DEFAULTS.AUTO_SAVE_INTERVAL_MS,
        lastAutoSave: new Date(),
        maxVersions: VERSION_DEFAULTS.MAX_VERSIONS,
    };
}

/**
 * Save a new version of the plan.
 *
 * **Simple explanation**: Takes a snapshot of your plan and stores it.
 * You can go back to this snapshot later if needed.
 */
export function saveVersion(
    state: VersioningState,
    plan: CompletePlan,
    trigger: VersionTrigger,
    options: {
        label?: string;
        description?: string;
        author?: string;
        force?: boolean;
    } = {}
): PlanVersion | null {
    // Check if there are meaningful changes (unless forced)
    if (!options.force && state.versions.length > 0) {
        const latestPlan = state.versions[state.versions.length - 1].plan;
        const diff = comparePlans(latestPlan, plan);

        if (diff.summary.totalChanges < VERSION_DEFAULTS.MIN_CHANGE_THRESHOLD) {
            return null; // No significant changes
        }
    }

    const newVersion: PlanVersion = {
        id: crypto.randomUUID(),
        versionNumber: state.versions.length + 1,
        label: options.label,
        timestamp: new Date(),
        trigger,
        plan: deepClone(plan),
        description: options.description,
        author: options.author,
    };

    state.versions.push(newVersion);
    state.currentVersionIndex = state.versions.length - 1;

    // Prune old versions if over limit
    if (state.versions.length > state.maxVersions) {
        // Keep first version, remove oldest non-labeled versions
        const keepIndices = new Set<number>([0, state.versions.length - 1]);

        // Keep labeled versions
        state.versions.forEach((v, i) => {
            if (v.label) keepIndices.add(i);
        });

        // If still over limit, remove by age
        const versionsToRemove = state.versions.length - state.maxVersions;
        let removed = 0;

        state.versions = state.versions.filter((_, i) => {
            if (keepIndices.has(i)) return true;
            if (removed < versionsToRemove) {
                removed++;
                return false;
            }
            return true;
        });

        // Recalculate current index
        state.currentVersionIndex = state.versions.length - 1;
    }

    if (trigger === 'auto_save') {
        state.lastAutoSave = new Date();
    }

    return newVersion;
}

/**
 * Roll back to a specific version.
 *
 * **Simple explanation**: Restores your plan to how it was at a specific
 * point in time. The current state is saved first so you don't lose work.
 */
export function rollbackToVersion(
    state: VersioningState,
    versionId: string,
    currentPlan: CompletePlan
): CompletePlan | null {
    const targetIndex = state.versions.findIndex(v => v.id === versionId);
    if (targetIndex === -1) return null;

    // Save current state before rollback
    saveVersion(state, currentPlan, 'rollback', {
        description: `Before rollback to version ${state.versions[targetIndex].versionNumber}`,
    });

    state.currentVersionIndex = targetIndex;
    return deepClone(state.versions[targetIndex].plan);
}

/**
 * Get a specific version.
 */
export function getVersion(state: VersioningState, versionId: string): PlanVersion | undefined {
    return state.versions.find(v => v.id === versionId);
}

/**
 * Get version by number.
 */
export function getVersionByNumber(state: VersioningState, versionNumber: number): PlanVersion | undefined {
    return state.versions.find(v => v.versionNumber === versionNumber);
}

/**
 * Get the latest version.
 */
export function getLatestVersion(state: VersioningState): PlanVersion {
    return state.versions[state.versions.length - 1];
}

/**
 * Update version label.
 */
export function setVersionLabel(state: VersioningState, versionId: string, label: string): boolean {
    const version = state.versions.find(v => v.id === versionId);
    if (!version) return false;

    version.label = label;
    return true;
}

// ============================================================================
// Version Comparison
// ============================================================================

/**
 * Compare two plans and return differences.
 *
 * **Simple explanation**: Shows exactly what changed between two versions
 * of your plan - what was added, removed, or modified.
 */
export function comparePlans(oldPlan: CompletePlan, newPlan: CompletePlan): VersionDiff {
    const changes: DiffChange[] = [];

    // Compare overview
    if (oldPlan.overview.name !== newPlan.overview.name) {
        changes.push({
            fieldPath: 'overview.name',
            oldValue: oldPlan.overview.name,
            newValue: newPlan.overview.name,
            changeType: 'modified',
        });
    }

    if (oldPlan.overview.description !== newPlan.overview.description) {
        changes.push({
            fieldPath: 'overview.description',
            oldValue: oldPlan.overview.description,
            newValue: newPlan.overview.description,
            changeType: 'modified',
        });
    }

    // Compare goals (arrays)
    compareArrays(
        oldPlan.overview.goals,
        newPlan.overview.goals,
        'overview.goals',
        changes
    );

    // Compare feature blocks
    compareNamedArrays(
        oldPlan.featureBlocks,
        newPlan.featureBlocks,
        'featureBlocks',
        'id',
        changes
    );

    // Compare block links
    compareNamedArrays(
        oldPlan.blockLinks,
        newPlan.blockLinks,
        'blockLinks',
        'id',
        changes
    );

    // Compare user stories
    compareNamedArrays(
        oldPlan.userStories,
        newPlan.userStories,
        'userStories',
        'id',
        changes
    );

    // Compare developer stories
    compareNamedArrays(
        oldPlan.developerStories,
        newPlan.developerStories,
        'developerStories',
        'id',
        changes
    );

    // Compare success criteria
    compareNamedArrays(
        oldPlan.successCriteria,
        newPlan.successCriteria,
        'successCriteria',
        'id',
        changes
    );

    const added = changes.filter(c => c.changeType === 'added').map(c => c.fieldPath);
    const removed = changes.filter(c => c.changeType === 'removed').map(c => c.fieldPath);
    const changed = changes.filter(c => c.changeType === 'modified');

    return {
        added,
        removed,
        changed,
        summary: {
            totalChanges: changes.length,
            addedCount: added.length,
            removedCount: removed.length,
            changedCount: changed.length,
        },
    };
}

function compareArrays(
    oldArr: string[],
    newArr: string[],
    basePath: string,
    changes: DiffChange[]
): void {
    const oldSet = new Set(oldArr);
    const newSet = new Set(newArr);

    // Items in new but not in old (added)
    for (const item of newArr) {
        if (!oldSet.has(item)) {
            changes.push({
                fieldPath: basePath,
                oldValue: undefined,
                newValue: item,
                changeType: 'added',
            });
        }
    }

    // Items in old but not in new (removed)
    for (const item of oldArr) {
        if (!newSet.has(item)) {
            changes.push({
                fieldPath: basePath,
                oldValue: item,
                newValue: undefined,
                changeType: 'removed',
            });
        }
    }
}

function compareNamedArrays<T extends { id: string }>(
    oldArr: T[],
    newArr: T[],
    basePath: string,
    idField: 'id',
    changes: DiffChange[]
): void {
    const oldMap = new Map(oldArr.map(item => [item[idField], item]));
    const newMap = new Map(newArr.map(item => [item[idField], item]));

    // Check for added items
    for (const [id, item] of newMap) {
        if (!oldMap.has(id)) {
            changes.push({
                fieldPath: `${basePath}[${id}]`,
                oldValue: undefined,
                newValue: item,
                changeType: 'added',
            });
        }
    }

    // Check for removed items
    for (const [id, item] of oldMap) {
        if (!newMap.has(id)) {
            changes.push({
                fieldPath: `${basePath}[${id}]`,
                oldValue: item,
                newValue: undefined,
                changeType: 'removed',
            });
        }
    }

    // Check for modified items
    for (const [id, newItem] of newMap) {
        const oldItem = oldMap.get(id);
        if (oldItem && JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
            changes.push({
                fieldPath: `${basePath}[${id}]`,
                oldValue: oldItem,
                newValue: newItem,
                changeType: 'modified',
            });
        }
    }
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Renders version history panel.
 */
export function renderVersionHistoryPanel(state: VersioningState): string {
    const versions = state.versions.slice().reverse(); // Newest first

    return `
    <div class="version-history-panel">
      <div class="version-header">
        <h4>📜 Version History</h4>
        <button class="btn-small" onclick="saveVersionManual()">Save Version</button>
      </div>
      
      <div class="version-list">
        ${versions.map((version, i) => {
        const isLatest = i === 0;
        const isCurrent = state.versions.indexOf(version) === state.currentVersionIndex;

        return `
            <div class="version-item ${isCurrent ? 'current' : ''}" data-version-id="${version.id}">
              <div class="version-info">
                <div class="version-number">
                  v${version.versionNumber}
                  ${isLatest ? '<span class="badge">Latest</span>' : ''}
                  ${isCurrent ? '<span class="badge current">Current</span>' : ''}
                </div>
                ${version.label ? `<div class="version-label">${escapeHtml(version.label)}</div>` : ''}
                <div class="version-meta">
                  <span class="version-time">${formatTime(version.timestamp)}</span>
                  <span class="version-trigger">${formatTrigger(version.trigger)}</span>
                </div>
                ${version.description ? `<div class="version-desc">${escapeHtml(version.description)}</div>` : ''}
              </div>
              <div class="version-actions">
                <button class="btn-icon" onclick="compareToCurrent('${version.id}')" title="Compare">🔍</button>
                ${!isCurrent ? `<button class="btn-icon" onclick="rollbackTo('${version.id}')" title="Restore">↩️</button>` : ''}
                <button class="btn-icon" onclick="labelVersion('${version.id}')" title="Label">🏷️</button>
              </div>
            </div>
          `;
    }).join('')}
      </div>
    </div>
  `;
}

/**
 * Renders version comparison view.
 */
export function renderVersionComparison(
    oldVersion: PlanVersion,
    newVersion: PlanVersion,
    diff: VersionDiff
): string {
    return `
    <div class="version-comparison">
      <div class="comparison-header">
        <div class="comparison-version old">
          <span class="version-badge">v${oldVersion.versionNumber}</span>
          <span class="version-time">${formatTime(oldVersion.timestamp)}</span>
        </div>
        <div class="comparison-arrow">→</div>
        <div class="comparison-version new">
          <span class="version-badge">v${newVersion.versionNumber}</span>
          <span class="version-time">${formatTime(newVersion.timestamp)}</span>
        </div>
      </div>

      <div class="comparison-summary">
        <span class="stat added">+${diff.summary.addedCount} added</span>
        <span class="stat removed">-${diff.summary.removedCount} removed</span>
        <span class="stat changed">~${diff.summary.changedCount} changed</span>
      </div>

      <div class="comparison-changes">
        ${diff.changed.length > 0 ? `
          <div class="change-section">
            <h5>Modified</h5>
            ${diff.changed.map(change => `
              <div class="change-item modified">
                <div class="change-path">${escapeHtml(change.fieldPath)}</div>
                <div class="change-values">
                  <div class="old-value">${formatValue(change.oldValue)}</div>
                  <div class="arrow">→</div>
                  <div class="new-value">${formatValue(change.newValue)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${diff.added.length > 0 ? `
          <div class="change-section">
            <h5>Added</h5>
            ${diff.added.map(path => `
              <div class="change-item added">
                <div class="change-path">+ ${escapeHtml(path)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${diff.removed.length > 0 ? `
          <div class="change-section">
            <h5>Removed</h5>
            ${diff.removed.map(path => `
              <div class="change-item removed">
                <div class="change-path">- ${escapeHtml(path)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${diff.summary.totalChanges === 0 ? `
          <div class="no-changes">No differences found</div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Get CSS styles for versioning.
 */
export function getVersioningStyles(): string {
    return `
    .version-history-panel {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      padding: 16px;
    }

    .version-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .version-header h4 {
      margin: 0;
    }

    .version-list {
      max-height: 400px;
      overflow-y: auto;
    }

    .version-item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 6px;
      background: var(--vscode-input-background);
      transition: background 0.15s;
    }

    .version-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .version-item.current {
      border-left: 3px solid var(--vscode-activityBarBadge-background);
    }

    .version-number {
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-weight: normal;
    }

    .badge.current {
      background: var(--vscode-activityBarBadge-background);
    }

    .version-label {
      font-size: 13px;
      margin-top: 4px;
    }

    .version-meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
      display: flex;
      gap: 8px;
    }

    .version-desc {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .version-actions {
      display: flex;
      gap: 4px;
    }

    /* Comparison View */
    .version-comparison {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      padding: 16px;
    }

    .comparison-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      margin-bottom: 16px;
    }

    .comparison-version {
      padding: 8px 12px;
      background: var(--vscode-input-background);
      border-radius: 4px;
    }

    .comparison-arrow {
      font-size: 20px;
      color: var(--vscode-descriptionForeground);
    }

    .comparison-summary {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin-bottom: 16px;
      padding: 8px;
      background: var(--vscode-input-background);
      border-radius: 4px;
    }

    .comparison-summary .stat {
      font-weight: 600;
      font-size: 13px;
    }

    .stat.added { color: var(--vscode-testing-iconPassed); }
    .stat.removed { color: var(--vscode-errorForeground); }
    .stat.changed { color: var(--vscode-editorWarning-foreground); }

    .change-section {
      margin-bottom: 16px;
    }

    .change-section h5 {
      margin: 0 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
    }

    .change-item {
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 6px;
      font-size: 13px;
    }

    .change-item.added {
      background: rgba(40, 167, 69, 0.1);
      border-left: 3px solid var(--vscode-testing-iconPassed);
    }

    .change-item.removed {
      background: rgba(220, 53, 69, 0.1);
      border-left: 3px solid var(--vscode-errorForeground);
    }

    .change-item.modified {
      background: rgba(255, 193, 7, 0.1);
      border-left: 3px solid var(--vscode-editorWarning-foreground);
    }

    .change-path {
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .change-values {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .old-value, .new-value {
      padding: 4px 8px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      font-size: 12px;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .no-changes {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      padding: 20px;
    }
  `;
}

/**
 * Get JavaScript for versioning.
 */
export function getVersioningScript(): string {
    return `
    function saveVersionManual() {
      const label = prompt('Version label (optional):');
      vscode.postMessage({ command: 'saveVersion', label: label || undefined });
    }

    function compareToCurrent(versionId) {
      vscode.postMessage({ command: 'compareVersions', versionId });
    }

    function rollbackTo(versionId) {
      if (confirm('Roll back to this version? Current state will be saved first.')) {
        vscode.postMessage({ command: 'rollbackToVersion', versionId });
      }
    }

    function labelVersion(versionId) {
      const label = prompt('Enter version label:');
      if (label) {
        vscode.postMessage({ command: 'labelVersion', versionId, label });
      }
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatTime(date: Date): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function formatTrigger(trigger: VersionTrigger): string {
    switch (trigger) {
        case 'auto_save': return '⏱️ Auto';
        case 'page_navigation': return '📄 Navigation';
        case 'manual_save': return '💾 Manual';
        case 'before_export': return '📤 Export';
        case 'before_execute': return '▶️ Execute';
        case 'rollback': return '↩️ Rollback';
        default: return trigger;
    }
}

function formatValue(value: unknown): string {
    if (value === undefined) return '<empty>';
    if (value === null) return 'null';
    if (typeof value === 'string') return `"${value.slice(0, 50)}${value.length > 50 ? '...' : ''}"`;
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 50) + '...';
    return String(value);
}
