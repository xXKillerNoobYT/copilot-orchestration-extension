/**
 * Plan Error Handler (MT-033.31-35)
 *
 * **Simple explanation**: Comprehensive error handling for the planning system.
 * Catches errors, provides recovery options, and guides users through fixes.
 *
 * @module planning/errorHandler
 */

import { CompletePlan, FeatureBlock, BlockLink } from './types';

// ============================================================================
// Types
// ============================================================================

export interface PlanError {
    /** Unique error ID */
    id: string;
    /** Error code for programmatic handling */
    code: PlanErrorCode;
    /** Error severity */
    severity: ErrorSeverity;
    /** Human-readable message */
    message: string;
    /** Detailed explanation */
    details?: string;
    /** Where in the plan the error occurred */
    location?: ErrorLocation;
    /** Suggested fixes */
    suggestions: ErrorSuggestion[];
    /** Whether auto-fix is available */
    autoFixAvailable: boolean;
    /** Timestamp */
    timestamp: string;
}

export type PlanErrorCode =
    // Validation errors
    | 'MISSING_REQUIRED_FIELD'
    | 'INVALID_FORMAT'
    | 'DUPLICATE_ID'
    | 'CIRCULAR_DEPENDENCY'
    | 'ORPHAN_REFERENCE'
    // Structural errors
    | 'EMPTY_PLAN'
    | 'NO_FEATURES'
    | 'MISSING_CRITERIA'
    // Constraint violations
    | 'NAME_TOO_LONG'
    | 'DESCRIPTION_TOO_LONG'
    | 'TOO_MANY_FEATURES'
    | 'TOO_MANY_CRITERIA'
    // Execution errors
    | 'SAVE_FAILED'
    | 'LOAD_FAILED'
    | 'EXPORT_FAILED'
    | 'IMPORT_FAILED'
    // Recovery errors
    | 'RECOVERY_FAILED'
    | 'BACKUP_NOT_FOUND'
    // Unknown
    | 'UNKNOWN_ERROR';

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface ErrorLocation {
    /** Section of plan (overview, features, stories, etc.) */
    section: 'overview' | 'feature' | 'user-story' | 'developer-story' | 'link' | 'criteria';
    /** Specific item ID */
    itemId?: string;
    /** Field name */
    field?: string;
    /** Index (for arrays) */
    index?: number;
}

export interface ErrorSuggestion {
    /** Action label */
    label: string;
    /** Action to perform */
    action: 'fix' | 'ignore' | 'retry' | 'manual';
    /** Action description */
    description: string;
    /** Whether this can be auto-applied */
    autoApply: boolean;
    /** Fix function (if autoApply) */
    fix?: () => void;
}

export interface ErrorRecovery {
    /** Recovery ID */
    id: string;
    /** Error that triggered recovery */
    errorId: string;
    /** Recovery type */
    type: 'auto-fix' | 'manual-fix' | 'restore-backup' | 'ignore';
    /** Whether recovery succeeded */
    success: boolean;
    /** Recovery message */
    message: string;
    /** Changes made during recovery */
    changes?: string[];
    /** Timestamp */
    timestamp: string;
}

// ============================================================================
// Error Handler Class
// ============================================================================

/**
 * Central error handler for the planning system.
 */
export class PlanErrorHandler {
    private errors: Map<string, PlanError> = new Map();
    private recoveries: ErrorRecovery[] = [];
    private listeners: Set<(errors: PlanError[]) => void> = new Set();

    /**
     * Report a new error.
     */
    reportError(
        code: PlanErrorCode,
        message: string,
        options: {
            severity?: ErrorSeverity;
            details?: string;
            location?: ErrorLocation;
            suggestions?: ErrorSuggestion[];
        } = {}
    ): PlanError {
        const error: PlanError = {
            id: generateErrorId(),
            code,
            severity: options.severity || 'error',
            message,
            details: options.details,
            location: options.location,
            suggestions: options.suggestions || getDefaultSuggestions(code),
            autoFixAvailable: hasAutoFix(code),
            timestamp: new Date().toISOString(),
        };

        this.errors.set(error.id, error);
        this.notifyListeners();
        return error;
    }

    /**
     * Clear an error.
     */
    clearError(errorId: string): void {
        this.errors.delete(errorId);
        this.notifyListeners();
    }

    /**
     * Clear all errors.
     */
    clearAllErrors(): void {
        this.errors.clear();
        this.notifyListeners();
    }

    /**
     * Get all current errors.
     */
    getErrors(): PlanError[] {
        return Array.from(this.errors.values());
    }

    /**
     * Get errors by severity.
     */
    getErrorsBySeverity(severity: ErrorSeverity): PlanError[] {
        return this.getErrors().filter(e => e.severity === severity);
    }

    /**
     * Check if there are blocking errors.
     */
    hasBlockingErrors(): boolean {
        return this.getErrors().some(e => e.severity === 'error');
    }

    /**
     * Attempt to auto-fix an error.
     */
    attemptAutoFix(errorId: string, plan: CompletePlan): ErrorRecovery {
        const error = this.errors.get(errorId);
        if (!error) {
            return createRecovery(errorId, 'auto-fix', false, 'Error not found');
        }

        if (!error.autoFixAvailable) {
            return createRecovery(errorId, 'auto-fix', false, 'No auto-fix available for this error');
        }

        const recovery = applyAutoFix(error, plan);
        this.recoveries.push(recovery);

        if (recovery.success) {
            this.clearError(errorId);
        }

        return recovery;
    }

    /**
     * Attempt to fix all auto-fixable errors.
     */
    attemptAutoFixAll(plan: CompletePlan): ErrorRecovery[] {
        const recoveries: ErrorRecovery[] = [];
        const autoFixableErrors = this.getErrors().filter(e => e.autoFixAvailable);

        for (const error of autoFixableErrors) {
            const recovery = this.attemptAutoFix(error.id, plan);
            recoveries.push(recovery);
        }

        return recoveries;
    }

    /**
     * Subscribe to error changes.
     */
    onErrorChange(listener: (errors: PlanError[]) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        const errors = this.getErrors();
        this.listeners.forEach(listener => listener(errors));
    }
}

// ============================================================================
// Auto-Fix Functions
// ============================================================================

function hasAutoFix(code: PlanErrorCode): boolean {
    const autoFixable: PlanErrorCode[] = [
        'DUPLICATE_ID',
        'NAME_TOO_LONG',
        'DESCRIPTION_TOO_LONG',
        'MISSING_CRITERIA',
        'ORPHAN_REFERENCE',
    ];
    return autoFixable.includes(code);
}

function getDefaultSuggestions(code: PlanErrorCode): ErrorSuggestion[] {
    switch (code) {
        case 'MISSING_REQUIRED_FIELD':
            return [{
                label: 'Add missing field',
                action: 'manual',
                description: 'Navigate to the field and provide a value',
                autoApply: false,
            }];

        case 'DUPLICATE_ID':
            return [{
                label: 'Generate new ID',
                action: 'fix',
                description: 'Automatically generate a unique ID',
                autoApply: true,
            }];

        case 'CIRCULAR_DEPENDENCY':
            return [{
                label: 'Remove dependency',
                action: 'manual',
                description: 'Remove one of the dependencies causing the cycle',
                autoApply: false,
            }, {
                label: 'View dependency graph',
                action: 'manual',
                description: 'Open the dependency graph to visualize the cycle',
                autoApply: false,
            }];

        case 'NAME_TOO_LONG':
            return [{
                label: 'Truncate name',
                action: 'fix',
                description: 'Shorten the name to the maximum allowed length',
                autoApply: true,
            }];

        case 'DESCRIPTION_TOO_LONG':
            return [{
                label: 'Truncate description',
                action: 'fix',
                description: 'Shorten the description to the maximum allowed length',
                autoApply: true,
            }];

        case 'MISSING_CRITERIA':
            return [{
                label: 'Add placeholder criterion',
                action: 'fix',
                description: 'Add a placeholder acceptance criterion',
                autoApply: true,
            }];

        case 'ORPHAN_REFERENCE':
            return [{
                label: 'Remove reference',
                action: 'fix',
                description: 'Remove the reference to the non-existent item',
                autoApply: true,
            }];

        default:
            return [{
                label: 'Ignore',
                action: 'ignore',
                description: 'Ignore this error and continue',
                autoApply: false,
            }];
    }
}

function applyAutoFix(error: PlanError, plan: CompletePlan): ErrorRecovery {
    const changes: string[] = [];

    try {
        switch (error.code) {
            case 'DUPLICATE_ID':
                if (error.location?.section === 'feature' && error.location.itemId) {
                    const feature = plan.featureBlocks.find(f => f.id === error.location?.itemId);
                    if (feature) {
                        const newId = `${feature.id}_${Date.now()}`;
                        changes.push(`Changed feature ID from ${feature.id} to ${newId}`);
                        feature.id = newId;
                    }
                }
                break;

            case 'NAME_TOO_LONG':
                if (error.location?.section === 'feature' && error.location.itemId) {
                    const feature = plan.featureBlocks.find(f => f.id === error.location?.itemId);
                    if (feature && feature.name.length > 100) {
                        const oldName = feature.name;
                        feature.name = feature.name.slice(0, 97) + '...';
                        changes.push(`Truncated feature name from "${oldName}" to "${feature.name}"`);
                    }
                }
                break;

            case 'DESCRIPTION_TOO_LONG':
                if (error.location?.section === 'feature' && error.location.itemId) {
                    const feature = plan.featureBlocks.find(f => f.id === error.location?.itemId);
                    if (feature && feature.description && feature.description.length > 2000) {
                        feature.description = feature.description.slice(0, 1997) + '...';
                        changes.push(`Truncated feature description to 2000 characters`);
                    }
                }
                break;

            case 'MISSING_CRITERIA':
                if (error.location?.section === 'feature' && error.location.itemId) {
                    const feature = plan.featureBlocks.find(f => f.id === error.location?.itemId);
                    if (feature && feature.acceptanceCriteria.length === 0) {
                        feature.acceptanceCriteria.push('TODO: Define acceptance criteria');
                        changes.push(`Added placeholder criterion to feature "${feature.name}"`);
                    }
                }
                break;

            case 'ORPHAN_REFERENCE':
                if (error.location?.section === 'link' && error.location.itemId) {
                    const linkIndex = plan.blockLinks.findIndex(l => l.id === error.location?.itemId);
                    if (linkIndex >= 0) {
                        const link = plan.blockLinks[linkIndex];
                        plan.blockLinks.splice(linkIndex, 1);
                        changes.push(`Removed orphan link ${link.id}`);
                    }
                }
                break;
        }

        return createRecovery(error.id, 'auto-fix', changes.length > 0,
            changes.length > 0 ? 'Auto-fix applied successfully' : 'No changes made',
            changes
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return createRecovery(error.id, 'auto-fix', false, `Auto-fix failed: ${msg}`);
    }
}

// ============================================================================
// Plan Validation
// ============================================================================

/**
 * Validate a plan and return all errors.
 */
export function validatePlanWithErrors(plan: CompletePlan, handler: PlanErrorHandler): PlanError[] {
    handler.clearAllErrors();

    // Check for empty plan
    if (!plan.overview.name || plan.overview.name.trim() === '') {
        handler.reportError('MISSING_REQUIRED_FIELD', 'Plan name is required', {
            severity: 'error',
            location: { section: 'overview', field: 'name' },
        });
    }

    // Check for no features
    if (plan.featureBlocks.length === 0) {
        handler.reportError('NO_FEATURES', 'Plan must have at least one feature', {
            severity: 'error',
            location: { section: 'feature' },
        });
    }

    // Validate features
    const featureIds = new Set<string>();
    plan.featureBlocks.forEach((feature, index) => {
        // Check for duplicate IDs
        if (featureIds.has(feature.id)) {
            handler.reportError('DUPLICATE_ID', `Duplicate feature ID: ${feature.id}`, {
                severity: 'error',
                location: { section: 'feature', itemId: feature.id, index },
            });
        }
        featureIds.add(feature.id);

        // Check for missing name
        if (!feature.name || feature.name.trim() === '') {
            handler.reportError('MISSING_REQUIRED_FIELD', `Feature ${index + 1} is missing a name`, {
                severity: 'error',
                location: { section: 'feature', itemId: feature.id, field: 'name', index },
            });
        }

        // Check for name too long
        if (feature.name && feature.name.length > 100) {
            handler.reportError('NAME_TOO_LONG', `Feature name exceeds 100 characters`, {
                severity: 'warning',
                location: { section: 'feature', itemId: feature.id, field: 'name', index },
            });
        }

        // Check for missing acceptance criteria
        if (feature.acceptanceCriteria.length === 0) {
            handler.reportError('MISSING_CRITERIA', `Feature "${feature.name}" has no acceptance criteria`, {
                severity: 'warning',
                location: { section: 'feature', itemId: feature.id, field: 'acceptanceCriteria', index },
            });
        }
    });

    // Validate links
    plan.blockLinks.forEach((link, index) => {
        // Check for orphan references
        if (!featureIds.has(link.sourceBlockId)) {
            handler.reportError('ORPHAN_REFERENCE', `Link references non-existent source: ${link.sourceBlockId}`, {
                severity: 'error',
                location: { section: 'link', itemId: link.id, field: 'sourceBlockId', index },
            });
        }
        if (!featureIds.has(link.targetBlockId)) {
            handler.reportError('ORPHAN_REFERENCE', `Link references non-existent target: ${link.targetBlockId}`, {
                severity: 'error',
                location: { section: 'link', itemId: link.id, field: 'targetBlockId', index },
            });
        }
    });

    // Check for circular dependencies
    const cycles = detectCycles(plan.featureBlocks, plan.blockLinks);
    if (cycles.length > 0) {
        handler.reportError('CIRCULAR_DEPENDENCY', `Circular dependency detected: ${cycles[0].join(' → ')}`, {
            severity: 'error',
            details: `Found ${cycles.length} circular dependency chain(s)`,
        });
    }

    return handler.getErrors();
}

function detectCycles(features: FeatureBlock[], links: BlockLink[]): string[][] {
    const cycles: string[][] = [];
    const graph = new Map<string, string[]>();

    // Build adjacency list for 'requires' dependencies
    features.forEach(f => graph.set(f.id, []));
    links.forEach(l => {
        if (l.dependencyType === 'requires') {
            const edges = graph.get(l.sourceBlockId) || [];
            edges.push(l.targetBlockId);
            graph.set(l.sourceBlockId, edges);
        }
    });

    // DFS cycle detection
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    function dfs(nodeId: string): boolean {
        if (recursionStack.has(nodeId)) {
            const cycleStart = path.indexOf(nodeId);
            cycles.push([...path.slice(cycleStart), nodeId]);
            return true;
        }

        if (visited.has(nodeId)) return false;

        visited.add(nodeId);
        recursionStack.add(nodeId);
        path.push(nodeId);

        const neighbors = graph.get(nodeId) || [];
        for (const neighbor of neighbors) {
            dfs(neighbor);
        }

        path.pop();
        recursionStack.delete(nodeId);
        return false;
    }

    for (const feature of features) {
        dfs(feature.id);
    }

    return cycles;
}

// ============================================================================
// Error Display
// ============================================================================

/**
 * Render error list as HTML.
 */
export function renderErrorList(errors: PlanError[]): string {
    if (errors.length === 0) {
        return `
      <div class="error-list empty">
        <div class="no-errors">
          <span class="icon">✓</span>
          <span>No issues found</span>
        </div>
      </div>
    `;
    }

    const errorsByType = {
        error: errors.filter(e => e.severity === 'error'),
        warning: errors.filter(e => e.severity === 'warning'),
        info: errors.filter(e => e.severity === 'info'),
    };

    return `
    <div class="error-list">
      <div class="error-summary">
        ${errorsByType.error.length > 0 ? `<span class="count error">${errorsByType.error.length} error(s)</span>` : ''}
        ${errorsByType.warning.length > 0 ? `<span class="count warning">${errorsByType.warning.length} warning(s)</span>` : ''}
        ${errorsByType.info.length > 0 ? `<span class="count info">${errorsByType.info.length} info</span>` : ''}
      </div>
      
      <div class="error-items">
        ${errors.map(error => renderErrorItem(error)).join('')}
      </div>
      
      ${errors.some(e => e.autoFixAvailable) ? `
        <div class="error-actions">
          <button class="btn-primary" onclick="fixAllErrors()">
            🔧 Fix All Auto-fixable Issues
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderErrorItem(error: PlanError): string {
    const icon = error.severity === 'error' ? '❌' : error.severity === 'warning' ? '⚠️' : 'ℹ️';

    return `
    <div class="error-item ${error.severity}" data-error-id="${error.id}">
      <div class="error-header">
        <span class="error-icon">${icon}</span>
        <span class="error-message">${escapeHtml(error.message)}</span>
        <span class="error-code">${error.code}</span>
      </div>
      
      ${error.details ? `<div class="error-details">${escapeHtml(error.details)}</div>` : ''}
      
      ${error.location ? `
        <div class="error-location">
          📍 ${error.location.section}${error.location.field ? ` → ${error.location.field}` : ''}
        </div>
      ` : ''}
      
      ${error.suggestions.length > 0 ? `
        <div class="error-suggestions">
          ${error.suggestions.map(s => `
            <button class="suggestion-btn ${s.action}" 
                    onclick="applySuggestion('${error.id}', '${s.action}')"
                    ${s.autoApply ? '' : 'disabled'}>
              ${s.label}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Get CSS styles for error display.
 */
export function getErrorStyles(): string {
    return `
    .error-list {
      background: var(--vscode-input-background);
      border-radius: 6px;
      padding: 12px;
    }

    .error-list.empty {
      text-align: center;
      padding: 24px;
    }

    .no-errors {
      color: var(--vscode-testing-iconPassed);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .error-summary {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-input-border);
    }

    .error-summary .count {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
    }

    .count.error { background: #dc3545; color: white; }
    .count.warning { background: #fd7e14; color: white; }
    .count.info { background: #0d6efd; color: white; }

    .error-items {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .error-item {
      padding: 10px;
      border-radius: 4px;
      border-left: 3px solid;
    }

    .error-item.error {
      background: rgba(220, 53, 69, 0.1);
      border-color: #dc3545;
    }

    .error-item.warning {
      background: rgba(253, 126, 20, 0.1);
      border-color: #fd7e14;
    }

    .error-item.info {
      background: rgba(13, 110, 253, 0.1);
      border-color: #0d6efd;
    }

    .error-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .error-icon { font-size: 14px; }

    .error-message {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
    }

    .error-code {
      font-size: 10px;
      font-family: var(--vscode-editor-font-family);
      opacity: 0.7;
    }

    .error-details {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 6px;
    }

    .error-location {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 6px;
    }

    .error-suggestions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }

    .suggestion-btn {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
    }

    .error-actions {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-input-border);
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateErrorId(): string {
    return 'err_' + Math.random().toString(36).substring(2, 11);
}

function createRecovery(
    errorId: string,
    type: ErrorRecovery['type'],
    success: boolean,
    message: string,
    changes?: string[]
): ErrorRecovery {
    return {
        id: 'rec_' + Math.random().toString(36).substring(2, 11),
        errorId,
        type,
        success,
        message,
        changes,
        timestamp: new Date().toISOString(),
    };
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============================================================================
// Singleton Instance
// ============================================================================

let errorHandlerInstance: PlanErrorHandler | null = null;

/**
 * Get the singleton error handler instance.
 */
export function getErrorHandler(): PlanErrorHandler {
    if (!errorHandlerInstance) {
        errorHandlerInstance = new PlanErrorHandler();
    }
    return errorHandlerInstance;
}

/**
 * Reset the error handler (for testing).
 */
export function resetErrorHandler(): void {
    errorHandlerInstance = null;
}
