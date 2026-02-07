/**
 * Plan Drift Detection (MT-033.36-40)
 *
 * **Simple explanation**: Monitors your codebase and compares it against the
 * plan to detect when implementation diverges from the original design.
 * Alerts you when reality doesn't match the plan.
 *
 * @module planning/driftDetection
 */

import { CompletePlan, FeatureBlock, DeveloperStory } from './types';

// ============================================================================
// Types
// ============================================================================

export interface DriftReport {
    /** Report ID */
    id: string;
    /** Plan being checked */
    planId: string;
    /** When the check was run */
    timestamp: string;
    /** Overall drift status */
    status: DriftStatus;
    /** Individual drift findings */
    findings: DriftFinding[];
    /** Summary statistics */
    summary: DriftSummary;
}

export type DriftStatus = 'in-sync' | 'minor-drift' | 'major-drift' | 'critical-drift';

export interface DriftFinding {
    /** Finding ID */
    id: string;
    /** Type of drift */
    type: DriftType;
    /** Severity */
    severity: 'low' | 'medium' | 'high' | 'critical';
    /** What drifted */
    subject: DriftSubject;
    /** Description of the drift */
    description: string;
    /** Expected state (from plan) */
    expected?: string;
    /** Actual state (from codebase) */
    actual?: string;
    /** Suggested action */
    suggestion: string;
}

export type DriftType =
    | 'missing-feature'       // Feature in plan not found in code
    | 'unplanned-feature'     // Feature in code not in plan
    | 'incomplete-feature'     // Feature partially implemented
    | 'missing-test'          // No tests for planned feature
    | 'outdated-doc'          // Documentation doesn't match code
    | 'dependency-change'      // Dependencies changed from plan
    | 'api-change'            // API differs from plan
    | 'scope-creep'           // Implementation exceeds plan scope
    | 'technical-debt'        // Shortcuts taken vs. plan;

export interface DriftSubject {
    /** Type of subject */
    type: 'feature' | 'story' | 'file' | 'function' | 'test' | 'doc';
    /** Subject name/identifier */
    name: string;
    /** Plan reference (if applicable) */
    planRef?: string;
    /** File path (if applicable) */
    filePath?: string;
}

export interface DriftSummary {
    /** Total findings */
    total: number;
    /** Findings by severity */
    bySeverity: Record<string, number>;
    /** Findings by type */
    byType: Record<string, number>;
    /** Features in sync */
    featuresInSync: number;
    /** Features with drift */
    featuresWithDrift: number;
    /** Overall health score (0-100) */
    healthScore: number;
}

export interface DriftMonitorConfig {
    /** Check interval in milliseconds */
    checkInterval: number;
    /** Directories to scan */
    scanDirectories: string[];
    /** File patterns to include */
    includePatterns: string[];
    /** File patterns to exclude */
    excludePatterns: string[];
    /** Enable automatic checks */
    autoCheck: boolean;
    /** Alert threshold (drift count) */
    alertThreshold: number;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_DRIFT_CONFIG: DriftMonitorConfig = {
    checkInterval: 3600000, // 1 hour
    scanDirectories: ['src'],
    includePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
    excludePatterns: ['**/node_modules/**', '**/dist/**', '**/*.test.ts'],
    autoCheck: false,
    alertThreshold: 5,
};

// Patterns that indicate feature implementation
const FEATURE_INDICATORS = {
    filePatterns: /^src\/.*\.(ts|js|tsx|jsx)$/,
    exportPattern: /export\s+(function|class|const|interface|type)\s+(\w+)/g,
    testPattern: /\.(test|spec)\.(ts|js|tsx|jsx)$/,
};

// ============================================================================
// Drift Detection
// ============================================================================

/**
 * Run drift detection on a plan against codebase markers.
 *
 * Note: In a real implementation, this would scan the file system.
 * This version works with provided codebase markers for testing.
 */
export function detectDrift(
    plan: CompletePlan,
    codebaseMarkers: CodebaseMarkers,
    config: DriftMonitorConfig = DEFAULT_DRIFT_CONFIG
): DriftReport {
    const findings: DriftFinding[] = [];

    // Check for missing features (in plan, not in code)
    findings.push(...detectMissingFeatures(plan, codebaseMarkers));

    // Check for unplanned features (in code, not in plan)
    findings.push(...detectUnplannedFeatures(plan, codebaseMarkers));

    // Check for incomplete features
    findings.push(...detectIncompleteFeatures(plan, codebaseMarkers));

    // Check for missing tests
    findings.push(...detectMissingTests(plan, codebaseMarkers));

    // Check for documentation drift
    findings.push(...detectDocumentationDrift(plan, codebaseMarkers));

    // Calculate summary
    const summary = calculateDriftSummary(findings, plan);

    return {
        id: generateId(),
        planId: plan.overview.name,
        timestamp: new Date().toISOString(),
        status: determineDriftStatus(summary),
        findings,
        summary,
    };
}

/**
 * Markers extracted from codebase for drift detection.
 */
export interface CodebaseMarkers {
    /** Implemented features (module/class names) */
    implementedFeatures: string[];
    /** Test files and what they test */
    testCoverage: Map<string, string[]>;
    /** Documentation files */
    documentationFiles: string[];
    /** File modification timestamps */
    fileTimestamps: Map<string, string>;
    /** Exported symbols per file */
    exports: Map<string, string[]>;
}

function detectMissingFeatures(plan: CompletePlan, markers: CodebaseMarkers): DriftFinding[] {
    const findings: DriftFinding[] = [];

    for (const feature of plan.featureBlocks) {
        const featureName = normalizeFeatureName(feature.name);
        const implemented = markers.implementedFeatures.some(
            impl => normalizeFeatureName(impl).includes(featureName) ||
                featureName.includes(normalizeFeatureName(impl))
        );

        if (!implemented) {
            findings.push({
                id: generateId(),
                type: 'missing-feature',
                severity: feature.priority === 'critical' ? 'critical' :
                    feature.priority === 'high' ? 'high' : 'medium',
                subject: {
                    type: 'feature',
                    name: feature.name,
                    planRef: feature.id,
                },
                description: `Feature "${feature.name}" is in the plan but not found in the codebase`,
                expected: `Implementation of ${feature.name}`,
                actual: 'Not found',
                suggestion: `Create implementation for ${feature.name} or update plan if feature was descoped`,
            });
        }
    }

    return findings;
}

function detectUnplannedFeatures(plan: CompletePlan, markers: CodebaseMarkers): DriftFinding[] {
    const findings: DriftFinding[] = [];
    const plannedNames = new Set(plan.featureBlocks.map(f => normalizeFeatureName(f.name)));

    for (const impl of markers.implementedFeatures) {
        const normalizedImpl = normalizeFeatureName(impl);
        const isPlanned = [...plannedNames].some(
            planned => normalizedImpl.includes(planned) || planned.includes(normalizedImpl)
        );

        if (!isPlanned && !isCommonUtility(impl)) {
            findings.push({
                id: generateId(),
                type: 'unplanned-feature',
                severity: 'medium',
                subject: {
                    type: 'feature',
                    name: impl,
                },
                description: `Feature "${impl}" exists in codebase but is not in the plan`,
                expected: 'No implementation or documented in plan',
                actual: `Found: ${impl}`,
                suggestion: `Add "${impl}" to the plan or document why it exists outside the plan`,
            });
        }
    }

    return findings;
}

function detectIncompleteFeatures(plan: CompletePlan, markers: CodebaseMarkers): DriftFinding[] {
    const findings: DriftFinding[] = [];

    for (const feature of plan.featureBlocks) {
        const featureName = normalizeFeatureName(feature.name);
        const exports = findRelatedExports(featureName, markers.exports);

        if (exports.length > 0) {
            // Feature is implemented, check completeness
            const expectedExports = estimateExpectedExports(feature);
            const missingExports = expectedExports.filter(
                exp => !exports.some(e => e.toLowerCase().includes(exp.toLowerCase()))
            );

            if (missingExports.length > 0 && missingExports.length < expectedExports.length) {
                findings.push({
                    id: generateId(),
                    type: 'incomplete-feature',
                    severity: 'low',
                    subject: {
                        type: 'feature',
                        name: feature.name,
                        planRef: feature.id,
                    },
                    description: `Feature "${feature.name}" appears to be partially implemented`,
                    expected: `Expected exports: ${expectedExports.join(', ')}`,
                    actual: `Found exports: ${exports.join(', ')}`,
                    suggestion: `Review implementation of ${feature.name} for completeness`,
                });
            }
        }
    }

    return findings;
}

function detectMissingTests(plan: CompletePlan, markers: CodebaseMarkers): DriftFinding[] {
    const findings: DriftFinding[] = [];

    for (const feature of plan.featureBlocks) {
        const featureName = normalizeFeatureName(feature.name);
        const hasTests = [...markers.testCoverage.keys()].some(
            testFile => testFile.toLowerCase().includes(featureName)
        );

        if (!hasTests) {
            // Check if feature is implemented
            const isImplemented = markers.implementedFeatures.some(
                impl => normalizeFeatureName(impl).includes(featureName)
            );

            if (isImplemented) {
                findings.push({
                    id: generateId(),
                    type: 'missing-test',
                    severity: feature.priority === 'critical' ? 'high' : 'medium',
                    subject: {
                        type: 'test',
                        name: feature.name,
                        planRef: feature.id,
                    },
                    description: `Feature "${feature.name}" is implemented but has no test coverage`,
                    suggestion: `Add tests for ${feature.name}`,
                });
            }
        }
    }

    return findings;
}

function detectDocumentationDrift(plan: CompletePlan, markers: CodebaseMarkers): DriftFinding[] {
    const findings: DriftFinding[] = [];

    // Check if README or docs folder exists
    const hasReadme = markers.documentationFiles.some(f =>
        f.toLowerCase().includes('readme')
    );
    const hasDocsFolder = markers.documentationFiles.some(f =>
        f.toLowerCase().includes('/docs/')
    );

    if (!hasReadme && plan.featureBlocks.length > 0) {
        findings.push({
            id: generateId(),
            type: 'outdated-doc',
            severity: 'low',
            subject: {
                type: 'doc',
                name: 'README.md',
            },
            description: 'Project has planned features but no README documentation',
            suggestion: 'Create a README.md documenting the project and its features',
        });
    }

    // Check for feature documentation
    for (const feature of plan.featureBlocks.filter(f => f.priority === 'critical' || f.priority === 'high')) {
        const featureName = normalizeFeatureName(feature.name);
        const hasFeatureDoc = markers.documentationFiles.some(f =>
            f.toLowerCase().includes(featureName)
        );

        if (!hasFeatureDoc && markers.implementedFeatures.some(impl =>
            normalizeFeatureName(impl).includes(featureName)
        )) {
            findings.push({
                id: generateId(),
                type: 'outdated-doc',
                severity: 'low',
                subject: {
                    type: 'doc',
                    name: feature.name,
                    planRef: feature.id,
                },
                description: `High-priority feature "${feature.name}" lacks documentation`,
                suggestion: `Add documentation for ${feature.name}`,
            });
        }
    }

    return findings;
}

// ============================================================================
// Summary & Status
// ============================================================================

function calculateDriftSummary(findings: DriftFinding[], plan: CompletePlan): DriftSummary {
    const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    const byType: Record<string, number> = {};

    for (const finding of findings) {
        bySeverity[finding.severity]++;
        byType[finding.type] = (byType[finding.type] || 0) + 1;
    }

    // Calculate features with drift
    const featuresWithDrift = new Set(
        findings
            .filter(f => f.subject.type === 'feature')
            .map(f => f.subject.planRef || f.subject.name)
    ).size;

    const featuresInSync = plan.featureBlocks.length - featuresWithDrift;

    // Calculate health score
    const severityWeights = { critical: 25, high: 15, medium: 5, low: 1 };
    const totalPenalty = findings.reduce((sum, f) => sum + severityWeights[f.severity], 0);
    const maxPenalty = plan.featureBlocks.length * 25; // If everything was critical
    const healthScore = Math.max(0, Math.round(100 - (totalPenalty / maxPenalty) * 100));

    return {
        total: findings.length,
        bySeverity,
        byType,
        featuresInSync,
        featuresWithDrift,
        healthScore,
    };
}

function determineDriftStatus(summary: DriftSummary): DriftStatus {
    if (summary.bySeverity.critical > 0) return 'critical-drift';
    if (summary.bySeverity.high > 2) return 'major-drift';
    if (summary.total > 5) return 'minor-drift';
    return 'in-sync';
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Render drift report as HTML.
 */
export function renderDriftReport(report: DriftReport): string {
    const statusColors: Record<DriftStatus, string> = {
        'in-sync': '#28a745',
        'minor-drift': '#fd7e14',
        'major-drift': '#dc3545',
        'critical-drift': '#dc3545',
    };

    const statusLabels: Record<DriftStatus, string> = {
        'in-sync': '✓ In Sync',
        'minor-drift': '⚠ Minor Drift',
        'major-drift': '⚠ Major Drift',
        'critical-drift': '❌ Critical Drift',
    };

    return `
    <div class="drift-report">
      <div class="drift-header">
        <h3>Drift Detection Report</h3>
        <span class="drift-timestamp">${formatDate(report.timestamp)}</span>
      </div>

      <div class="drift-status" style="--status-color: ${statusColors[report.status]}">
        <span class="status-icon">${statusLabels[report.status]}</span>
        <div class="health-score">
          <span class="score-value">${report.summary.healthScore}</span>
          <span class="score-label">Health Score</span>
        </div>
      </div>

      <div class="drift-summary">
        <div class="summary-item">
          <span class="count">${report.summary.featuresInSync}</span>
          <span class="label">In Sync</span>
        </div>
        <div class="summary-item drift">
          <span class="count">${report.summary.featuresWithDrift}</span>
          <span class="label">With Drift</span>
        </div>
        <div class="summary-item">
          <span class="count">${report.summary.total}</span>
          <span class="label">Findings</span>
        </div>
      </div>

      ${report.findings.length > 0 ? `
        <div class="drift-findings">
          <h4>Findings</h4>
          ${report.findings.map(finding => renderDriftFinding(finding)).join('')}
        </div>
      ` : `
        <div class="no-drift">
          <span class="icon">🎉</span>
          <span>No drift detected! Your codebase matches the plan.</span>
        </div>
      `}
    </div>
  `;
}

function renderDriftFinding(finding: DriftFinding): string {
    const severityIcons: Record<string, string> = {
        critical: '❌',
        high: '⚠️',
        medium: '⚡',
        low: 'ℹ️',
    };

    return `
    <div class="drift-finding ${finding.severity}">
      <div class="finding-header">
        <span class="severity-icon">${severityIcons[finding.severity]}</span>
        <span class="finding-type">${formatDriftType(finding.type)}</span>
        <span class="finding-subject">${finding.subject.name}</span>
      </div>
      <div class="finding-description">${finding.description}</div>
      ${finding.expected && finding.actual ? `
        <div class="finding-diff">
          <div class="expected">Expected: ${finding.expected}</div>
          <div class="actual">Actual: ${finding.actual}</div>
        </div>
      ` : ''}
      <div class="finding-suggestion">💡 ${finding.suggestion}</div>
    </div>
  `;
}

function formatDriftType(type: DriftType): string {
    const labels: Record<DriftType, string> = {
        'missing-feature': 'Missing Feature',
        'unplanned-feature': 'Unplanned Feature',
        'incomplete-feature': 'Incomplete Feature',
        'missing-test': 'Missing Tests',
        'outdated-doc': 'Outdated Documentation',
        'dependency-change': 'Dependency Changed',
        'api-change': 'API Changed',
        'scope-creep': 'Scope Creep',
        'technical-debt': 'Technical Debt',
    };
    return labels[type] || type;
}

/**
 * Get CSS styles for drift report.
 */
export function getDriftStyles(): string {
    return `
    .drift-report {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 8px;
      padding: 16px;
    }

    .drift-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .drift-header h3 {
      margin: 0;
      font-size: 16px;
    }

    .drift-timestamp {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .drift-status {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: var(--vscode-input-background);
      border-radius: 6px;
      border-left: 4px solid var(--status-color);
      margin-bottom: 16px;
    }

    .status-icon {
      font-size: 18px;
      font-weight: 600;
    }

    .health-score {
      text-align: center;
    }

    .health-score .score-value {
      font-size: 32px;
      font-weight: 700;
      color: var(--status-color);
    }

    .health-score .score-label {
      display: block;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .drift-summary {
      display: flex;
      gap: 24px;
      margin-bottom: 16px;
    }

    .summary-item {
      text-align: center;
    }

    .summary-item .count {
      font-size: 24px;
      font-weight: 600;
      display: block;
    }

    .summary-item .label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .summary-item.drift .count {
      color: #fd7e14;
    }

    .drift-findings h4 {
      margin: 0 0 12px;
      font-size: 14px;
    }

    .drift-finding {
      padding: 12px;
      margin-bottom: 8px;
      border-radius: 6px;
      border-left: 3px solid;
    }

    .drift-finding.critical { background: rgba(220, 53, 69, 0.1); border-color: #dc3545; }
    .drift-finding.high { background: rgba(253, 126, 20, 0.1); border-color: #fd7e14; }
    .drift-finding.medium { background: rgba(13, 110, 253, 0.1); border-color: #0d6efd; }
    .drift-finding.low { background: rgba(108, 117, 125, 0.1); border-color: #6c757d; }

    .finding-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .finding-type {
      font-size: 11px;
      text-transform: uppercase;
      opacity: 0.7;
    }

    .finding-subject {
      font-weight: 600;
    }

    .finding-description {
      font-size: 13px;
      margin-bottom: 8px;
    }

    .finding-diff {
      font-size: 12px;
      background: var(--vscode-textBlockQuote-background);
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 8px;
    }

    .finding-suggestion {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .no-drift {
      text-align: center;
      padding: 24px;
      color: #28a745;
    }

    .no-drift .icon {
      font-size: 32px;
      display: block;
      margin-bottom: 8px;
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
    return 'drift_' + Math.random().toString(36).substring(2, 11);
}

function normalizeFeatureName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

function isCommonUtility(name: string): boolean {
    const commonUtils = ['utils', 'helpers', 'constants', 'types', 'index', 'config', 'logger'];
    const normalized = normalizeFeatureName(name);
    return commonUtils.some(util => normalized.includes(util));
}

function findRelatedExports(featureName: string, exports: Map<string, string[]>): string[] {
    const related: string[] = [];
    for (const [file, fileExports] of exports) {
        if (file.toLowerCase().includes(featureName)) {
            related.push(...fileExports);
        }
    }
    return related;
}

function estimateExpectedExports(feature: FeatureBlock): string[] {
    // Generate expected exports based on feature name and type
    const baseName = feature.name.split(/[\s-_]+/).map(
        (word, i) => i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');

    return [
        baseName,
        `initialize${baseName.charAt(0).toUpperCase()}${baseName.slice(1)}`,
        `${baseName}Options`,
        `${baseName}Result`,
    ];
}

function formatDate(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
}
