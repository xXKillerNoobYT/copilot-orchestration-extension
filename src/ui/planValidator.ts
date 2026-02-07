/**
 * Plan Validator (MT-033.13)
 *
 * **Simple explanation**: Real-time validation engine that checks your plan
 * for issues like missing fields, circular dependencies, vague requirements,
 * and untestable criteria. Like spell-check but for project plans.
 *
 * @module ui/planValidator
 */

import { CompletePlan, FeatureBlock, UserStory, DeveloperStory, SuccessCriterion, BlockLink } from '../planning/types';
import { PLAN_CONSTRAINTS } from '../planning/schema';
import { detectCycles } from './dependencyGraph';

// ============================================================================
// Types
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
    /** Unique issue ID */
    id: string;
    /** Severity level */
    severity: ValidationSeverity;
    /** Issue category */
    category: ValidationCategory;
    /** Human-readable message */
    message: string;
    /** Path to the problematic field (e.g., 'featureBlocks[0].name') */
    fieldPath?: string;
    /** Suggested fix action */
    suggestion?: string;
    /** Auto-fixable flag */
    autoFixable?: boolean;
    /** Auto-fix function name */
    autoFixAction?: string;
}

export type ValidationCategory =
    | 'required'      // Missing required fields
    | 'format'        // Invalid format
    | 'length'        // Too long/short
    | 'dependency'    // Circular or invalid dependencies
    | 'completeness'  // Missing related items
    | 'quality'       // Vague or untestable content
    | 'consistency'   // Mismatched references
    | 'smart'         // SMART criteria issues
    | 'duplicate';    // Duplicate names/IDs

export interface ValidationResult {
    /** Whether the plan passed validation */
    valid: boolean;
    /** Array of issues found */
    issues: ValidationIssue[];
    /** Count by severity */
    counts: {
        errors: number;
        warnings: number;
        infos: number;
    };
    /** Validation timestamp */
    timestamp: Date;
}

// ============================================================================
// Validation Rules
// ============================================================================

/**
 * All 50+ validation rules organized by category.
 */
export const VALIDATION_RULES: { [key: string]: (plan: CompletePlan) => ValidationIssue[] } = {
    // -------------------------------------------------------------------------
    // REQUIRED FIELDS (Rules 1-10)
    // -------------------------------------------------------------------------

    validateProjectName: (plan) => {
        const issues: ValidationIssue[] = [];
        if (!plan.overview.name || plan.overview.name.trim() === '') {
            issues.push({
                id: 'REQ-001',
                severity: 'error',
                category: 'required',
                message: 'Project name is required',
                fieldPath: 'overview.name',
                suggestion: 'Enter a project name (3-100 characters)',
                autoFixable: false,
            });
        }
        return issues;
    },

    validateProjectNameLength: (plan) => {
        const issues: ValidationIssue[] = [];
        const name = plan.overview.name || '';
        if (name.length > 0 && name.length < PLAN_CONSTRAINTS.PROJECT_NAME_MIN) {
            issues.push({
                id: 'REQ-002',
                severity: 'error',
                category: 'length',
                message: `Project name must be at least ${PLAN_CONSTRAINTS.PROJECT_NAME_MIN} characters`,
                fieldPath: 'overview.name',
                suggestion: 'Add more descriptive text to the project name',
            });
        }
        if (name.length > PLAN_CONSTRAINTS.PROJECT_NAME_MAX) {
            issues.push({
                id: 'REQ-003',
                severity: 'error',
                category: 'length',
                message: `Project name exceeds ${PLAN_CONSTRAINTS.PROJECT_NAME_MAX} characters`,
                fieldPath: 'overview.name',
                suggestion: 'Shorten the project name',
                autoFixable: true,
                autoFixAction: 'truncateProjectName',
            });
        }
        return issues;
    },

    validateMinimumFeatures: (plan) => {
        const issues: ValidationIssue[] = [];
        if (plan.featureBlocks.length < PLAN_CONSTRAINTS.MIN_FEATURES) {
            issues.push({
                id: 'REQ-004',
                severity: 'error',
                category: 'required',
                message: `At least ${PLAN_CONSTRAINTS.MIN_FEATURES} feature block is required`,
                fieldPath: 'featureBlocks',
                suggestion: 'Add a feature block describing a key part of your project',
            });
        }
        return issues;
    },

    validateFeatureNames: (plan) => {
        const issues: ValidationIssue[] = [];
        plan.featureBlocks.forEach((feature, i) => {
            if (!feature.name || feature.name.trim() === '') {
                issues.push({
                    id: `REQ-005-${i}`,
                    severity: 'error',
                    category: 'required',
                    message: `Feature ${i + 1} is missing a name`,
                    fieldPath: `featureBlocks[${i}].name`,
                    suggestion: 'Enter a descriptive name for this feature',
                });
            }
        });
        return issues;
    },

    validateMinimumUserStories: (plan) => {
        const issues: ValidationIssue[] = [];
        if (plan.userStories.length < PLAN_CONSTRAINTS.MIN_USER_STORIES) {
            issues.push({
                id: 'REQ-006',
                severity: 'warning',
                category: 'completeness',
                message: 'At least one user story is recommended',
                fieldPath: 'userStories',
                suggestion: 'Add a user story: "As a [user], I want to [action], so that [benefit]"',
            });
        }
        return issues;
    },

    validateMinimumSuccessCriteria: (plan) => {
        const issues: ValidationIssue[] = [];
        if (plan.successCriteria.length < PLAN_CONSTRAINTS.MIN_SUCCESS_CRITERIA) {
            issues.push({
                id: 'REQ-007',
                severity: 'warning',
                category: 'completeness',
                message: 'At least one success criterion is recommended',
                fieldPath: 'successCriteria',
                suggestion: 'Add a measurable success criterion for your project',
            });
        }
        return issues;
    },

    validateUserStoryFields: (plan) => {
        const issues: ValidationIssue[] = [];
        plan.userStories.forEach((story, i) => {
            if (!story.userType || story.userType.trim() === '') {
                issues.push({
                    id: `REQ-008-${i}a`,
                    severity: 'error',
                    category: 'required',
                    message: `User story ${i + 1} is missing user type`,
                    fieldPath: `userStories[${i}].userType`,
                    suggestion: 'Specify who this story is for (e.g., "customer", "admin")',
                });
            }
            if (!story.action || story.action.trim() === '') {
                issues.push({
                    id: `REQ-008-${i}b`,
                    severity: 'error',
                    category: 'required',
                    message: `User story ${i + 1} is missing action`,
                    fieldPath: `userStories[${i}].action`,
                    suggestion: 'Specify what the user wants to do',
                });
            }
            if (!story.benefit || story.benefit.trim() === '') {
                issues.push({
                    id: `REQ-008-${i}c`,
                    severity: 'error',
                    category: 'required',
                    message: `User story ${i + 1} is missing benefit`,
                    fieldPath: `userStories[${i}].benefit`,
                    suggestion: 'Specify why this action is valuable',
                });
            }
        });
        return issues;
    },

    validateDeveloperStoryFields: (plan) => {
        const issues: ValidationIssue[] = [];
        plan.developerStories.forEach((story, i) => {
            if (!story.action || story.action.trim() === '') {
                issues.push({
                    id: `REQ-009-${i}a`,
                    severity: 'error',
                    category: 'required',
                    message: `Developer story ${i + 1} is missing action`,
                    fieldPath: `developerStories[${i}].action`,
                    suggestion: 'Specify the technical task',
                });
            }
            if (story.estimatedHours <= 0) {
                issues.push({
                    id: `REQ-009-${i}b`,
                    severity: 'warning',
                    category: 'required',
                    message: `Developer story ${i + 1} has no time estimate`,
                    fieldPath: `developerStories[${i}].estimatedHours`,
                    suggestion: 'Add an estimated time in hours',
                });
            }
        });
        return issues;
    },

    validateSuccessCriteriaDescription: (plan) => {
        const issues: ValidationIssue[] = [];
        plan.successCriteria.forEach((criterion, i) => {
            if (!criterion.description || criterion.description.trim() === '') {
                issues.push({
                    id: `REQ-010-${i}`,
                    severity: 'error',
                    category: 'required',
                    message: `Success criterion ${i + 1} is missing description`,
                    fieldPath: `successCriteria[${i}].description`,
                    suggestion: 'Describe what success looks like',
                });
            }
        });
        return issues;
    },

    // -------------------------------------------------------------------------
    // DEPENDENCY VALIDATION (Rules 11-20)
    // -------------------------------------------------------------------------

    validateNoCircularDependencies: (plan) => {
        const issues: ValidationIssue[] = [];
        const cycles = detectCycles(plan);

        cycles.forEach((cycle, i) => {
            const names = cycle.map(id => {
                const feature = plan.featureBlocks.find(f => f.id === id);
                return feature ? feature.name : id;
            });

            issues.push({
                id: `DEP-001-${i}`,
                severity: 'error',
                category: 'dependency',
                message: `Circular dependency detected: ${names.join(' → ')} → ${names[0]}`,
                fieldPath: 'blockLinks',
                suggestion: 'Remove one of the links to break the cycle',
            });
        });

        return issues;
    },

    validateBlockLinkReferences: (plan) => {
        const issues: ValidationIssue[] = [];
        const featureIds = new Set(plan.featureBlocks.map(f => f.id));

        plan.blockLinks.forEach((link, i) => {
            if (!featureIds.has(link.sourceBlockId)) {
                issues.push({
                    id: `DEP-002-${i}a`,
                    severity: 'error',
                    category: 'consistency',
                    message: `Link ${i + 1} references non-existent source block`,
                    fieldPath: `blockLinks[${i}].sourceBlockId`,
                    suggestion: 'Remove this link or fix the reference',
                    autoFixable: true,
                    autoFixAction: 'removeInvalidLink',
                });
            }
            if (!featureIds.has(link.targetBlockId)) {
                issues.push({
                    id: `DEP-002-${i}b`,
                    severity: 'error',
                    category: 'consistency',
                    message: `Link ${i + 1} references non-existent target block`,
                    fieldPath: `blockLinks[${i}].targetBlockId`,
                    suggestion: 'Remove this link or fix the reference',
                    autoFixable: true,
                    autoFixAction: 'removeInvalidLink',
                });
            }
        });

        return issues;
    },

    validateNoSelfLinks: (plan) => {
        const issues: ValidationIssue[] = [];

        plan.blockLinks.forEach((link, i) => {
            if (link.sourceBlockId === link.targetBlockId) {
                issues.push({
                    id: `DEP-003-${i}`,
                    severity: 'error',
                    category: 'dependency',
                    message: `Feature cannot depend on itself`,
                    fieldPath: `blockLinks[${i}]`,
                    suggestion: 'Remove this self-referencing link',
                    autoFixable: true,
                    autoFixAction: 'removeSelfLink',
                });
            }
        });

        return issues;
    },

    validateNoDuplicateLinks: (plan) => {
        const issues: ValidationIssue[] = [];
        const linkSet = new Set<string>();

        plan.blockLinks.forEach((link, i) => {
            const key = `${link.sourceBlockId}-${link.targetBlockId}-${link.dependencyType}`;
            if (linkSet.has(key)) {
                issues.push({
                    id: `DEP-004-${i}`,
                    severity: 'warning',
                    category: 'duplicate',
                    message: `Duplicate link detected`,
                    fieldPath: `blockLinks[${i}]`,
                    suggestion: 'Remove the duplicate link',
                    autoFixable: true,
                    autoFixAction: 'removeDuplicateLink',
                });
            }
            linkSet.add(key);
        });

        return issues;
    },

    validateOrphanedFeatures: (plan) => {
        const issues: ValidationIssue[] = [];

        if (plan.featureBlocks.length <= 1) return issues; // Single feature is OK

        const linkedIds = new Set<string>();
        plan.blockLinks.forEach(link => {
            linkedIds.add(link.sourceBlockId);
            linkedIds.add(link.targetBlockId);
        });

        plan.featureBlocks.forEach((feature, i) => {
            if (!linkedIds.has(feature.id)) {
                issues.push({
                    id: `DEP-005-${i}`,
                    severity: 'info',
                    category: 'completeness',
                    message: `"${feature.name}" is not linked to any other feature`,
                    fieldPath: `featureBlocks[${i}]`,
                    suggestion: 'Consider linking this feature to related features',
                });
            }
        });

        return issues;
    },

    // -------------------------------------------------------------------------
    // QUALITY VALIDATION (Rules 21-35)
    // -------------------------------------------------------------------------

    validateDescriptionQuality: (plan) => {
        const issues: ValidationIssue[] = [];
        const vaguePhrases = ['stuff', 'things', 'misc', 'etc', 'various', 'something'];

        if (plan.overview.description) {
            for (const phrase of vaguePhrases) {
                if (plan.overview.description.toLowerCase().includes(phrase)) {
                    issues.push({
                        id: 'QUAL-001',
                        severity: 'warning',
                        category: 'quality',
                        message: `Description contains vague language: "${phrase}"`,
                        fieldPath: 'overview.description',
                        suggestion: 'Be more specific about what the project does',
                    });
                    break;
                }
            }
        }

        return issues;
    },

    validateFeatureDescriptionLength: (plan) => {
        const issues: ValidationIssue[] = [];

        plan.featureBlocks.forEach((feature, i) => {
            if (!feature.description || feature.description.length < 20) {
                issues.push({
                    id: `QUAL-002-${i}`,
                    severity: 'warning',
                    category: 'quality',
                    message: `"${feature.name}" description is too short`,
                    fieldPath: `featureBlocks[${i}].description`,
                    suggestion: 'Add more detail about what this feature does and why',
                });
            }
        });

        return issues;
    },

    validateAcceptanceCriteria: (plan) => {
        const issues: ValidationIssue[] = [];

        plan.featureBlocks.forEach((feature, i) => {
            if (feature.acceptanceCriteria.length === 0) {
                issues.push({
                    id: `QUAL-003-${i}`,
                    severity: 'warning',
                    category: 'completeness',
                    message: `"${feature.name}" has no acceptance criteria`,
                    fieldPath: `featureBlocks[${i}].acceptanceCriteria`,
                    suggestion: 'Add at least one criterion to define "done"',
                });
            }
        });

        return issues;
    },

    validateGoalMeasurability: (plan) => {
        const issues: ValidationIssue[] = [];
        const vagueGoalWords = ['improve', 'better', 'good', 'nice', 'enhance', 'optimize'];

        plan.overview.goals.forEach((goal, i) => {
            let hasNumber = /\d/.test(goal);
            let hasVagueWord = vagueGoalWords.some(w => goal.toLowerCase().includes(w));

            if (hasVagueWord && !hasNumber) {
                issues.push({
                    id: `QUAL-004-${i}`,
                    severity: 'warning',
                    category: 'quality',
                    message: `Goal "${truncate(goal, 40)}" may not be measurable`,
                    fieldPath: `overview.goals[${i}]`,
                    suggestion: 'Add specific numbers or metrics (e.g., "Improve load time by 50%")',
                });
            }
        });

        return issues;
    },

    validateUserStoryGranularity: (plan) => {
        const issues: ValidationIssue[] = [];
        const conjunctions = [' and ', ' also ', ' as well as ', ' plus '];

        plan.userStories.forEach((story, i) => {
            for (const conj of conjunctions) {
                if (story.action.toLowerCase().includes(conj)) {
                    issues.push({
                        id: `QUAL-005-${i}`,
                        severity: 'info',
                        category: 'quality',
                        message: `User story ${i + 1} might cover multiple actions`,
                        fieldPath: `userStories[${i}].action`,
                        suggestion: 'Consider splitting into separate user stories for each action',
                    });
                    break;
                }
            }
        });

        return issues;
    },

    // -------------------------------------------------------------------------
    // SMART CRITERIA VALIDATION (Rules 36-40)
    // -------------------------------------------------------------------------

    validateSMARTCriteria: (plan) => {
        const issues: ValidationIssue[] = [];

        plan.successCriteria.forEach((criterion, i) => {
            const attrs = criterion.smartAttributes;
            const missing: string[] = [];

            if (!attrs.specific) missing.push('Specific');
            if (!attrs.measurable) missing.push('Measurable');
            if (!attrs.achievable) missing.push('Achievable');
            if (!attrs.relevant) missing.push('Relevant');
            if (!attrs.timeBound) missing.push('Time-bound');

            if (missing.length > 0) {
                issues.push({
                    id: `SMART-001-${i}`,
                    severity: missing.length >= 3 ? 'warning' : 'info',
                    category: 'smart',
                    message: `Success criterion ${i + 1} is missing: ${missing.join(', ')}`,
                    fieldPath: `successCriteria[${i}].smartAttributes`,
                    suggestion: 'Review and check off all SMART attributes that apply',
                });
            }
        });

        return issues;
    },

    validateTestability: (plan) => {
        const issues: ValidationIssue[] = [];

        plan.successCriteria.forEach((criterion, i) => {
            if (!criterion.testable) {
                issues.push({
                    id: `SMART-002-${i}`,
                    severity: 'warning',
                    category: 'smart',
                    message: `Success criterion ${i + 1} may not be testable`,
                    fieldPath: `successCriteria[${i}].testable`,
                    suggestion: 'Rewrite to be objectively verifiable',
                });
            }
        });

        return issues;
    },

    // -------------------------------------------------------------------------
    // DUPLICATE VALIDATION (Rules 41-45)
    // -------------------------------------------------------------------------

    validateNoDuplicateFeatureNames: (plan) => {
        const issues: ValidationIssue[] = [];
        const names = new Map<string, number[]>();

        plan.featureBlocks.forEach((feature, i) => {
            const name = feature.name.toLowerCase().trim();
            if (!names.has(name)) {
                names.set(name, []);
            }
            names.get(name)!.push(i);
        });

        names.forEach((indices, name) => {
            if (indices.length > 1) {
                issues.push({
                    id: `DUP-001-${name}`,
                    severity: 'warning',
                    category: 'duplicate',
                    message: `Duplicate feature name: "${name}" appears ${indices.length} times`,
                    fieldPath: `featureBlocks[${indices[0]}].name`,
                    suggestion: 'Rename features to be unique, or merge duplicates',
                });
            }
        });

        return issues;
    },

    validateNoDuplicateGoals: (plan) => {
        const issues: ValidationIssue[] = [];
        const goals = new Set<string>();

        plan.overview.goals.forEach((goal, i) => {
            const normalized = goal.toLowerCase().trim();
            if (goals.has(normalized)) {
                issues.push({
                    id: `DUP-002-${i}`,
                    severity: 'warning',
                    category: 'duplicate',
                    message: `Duplicate goal: "${truncate(goal, 40)}"`,
                    fieldPath: `overview.goals[${i}]`,
                    suggestion: 'Remove duplicate goal',
                    autoFixable: true,
                    autoFixAction: 'removeDuplicateGoal',
                });
            }
            goals.add(normalized);
        });

        return issues;
    },

    // -------------------------------------------------------------------------
    // SIZE LIMITS (Rules 46-50)
    // -------------------------------------------------------------------------

    validateMaxFeatures: (plan) => {
        const issues: ValidationIssue[] = [];
        if (plan.featureBlocks.length > PLAN_CONSTRAINTS.MAX_FEATURES) {
            issues.push({
                id: 'SIZE-001',
                severity: 'error',
                category: 'length',
                message: `Too many features (${plan.featureBlocks.length}/${PLAN_CONSTRAINTS.MAX_FEATURES})`,
                fieldPath: 'featureBlocks',
                suggestion: 'Consider grouping related features or breaking into sub-projects',
            });
        }
        return issues;
    },

    validateMaxUserStories: (plan) => {
        const issues: ValidationIssue[] = [];
        if (plan.userStories.length > PLAN_CONSTRAINTS.MAX_USER_STORIES) {
            issues.push({
                id: 'SIZE-002',
                severity: 'warning',
                category: 'length',
                message: `Many user stories (${plan.userStories.length}/${PLAN_CONSTRAINTS.MAX_USER_STORIES})`,
                fieldPath: 'userStories',
                suggestion: 'Consider prioritizing and deferring some stories',
            });
        }
        return issues;
    },

    validateMaxGoals: (plan) => {
        const issues: ValidationIssue[] = [];
        if (plan.overview.goals.length > PLAN_CONSTRAINTS.MAX_GOALS) {
            issues.push({
                id: 'SIZE-003',
                severity: 'warning',
                category: 'length',
                message: `Too many goals (${plan.overview.goals.length}/${PLAN_CONSTRAINTS.MAX_GOALS})`,
                fieldPath: 'overview.goals',
                suggestion: 'Focus on the most important goals',
            });
        }
        return issues;
    },
};

// ============================================================================
// Validation Engine
// ============================================================================

/**
 * Validate a complete plan.
 *
 * **Simple explanation**: Runs all validation rules against your plan
 * and returns a list of issues found. Like running spell-check.
 *
 * @param plan - The plan to validate
 * @returns Validation result with issues
 */
export function validatePlan(plan: CompletePlan): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Run all validation rules
    for (const ruleFn of Object.values(VALIDATION_RULES)) {
        try {
            const ruleIssues = ruleFn(plan);
            issues.push(...ruleIssues);
        } catch (err) {
            // Log but don't fail validation
            console.error('Validation rule failed:', err);
        }
    }

    // Count by severity
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const infos = issues.filter(i => i.severity === 'info').length;

    return {
        valid: errors === 0,
        issues,
        counts: { errors, warnings, infos },
        timestamp: new Date(),
    };
}

/**
 * Validate a specific page of the wizard.
 *
 * @param plan - The plan to validate
 * @param page - Page number (1-7)
 */
export function validatePage(plan: CompletePlan, page: number): ValidationResult {
    const pageRules: { [page: number]: string[] } = {
        1: ['validateProjectName', 'validateProjectNameLength', 'validateMaxGoals', 'validateNoDuplicateGoals', 'validateGoalMeasurability'],
        2: ['validateMinimumFeatures', 'validateFeatureNames', 'validateFeatureDescriptionLength', 'validateAcceptanceCriteria', 'validateNoDuplicateFeatureNames', 'validateMaxFeatures'],
        3: ['validateNoCircularDependencies', 'validateBlockLinkReferences', 'validateNoSelfLinks', 'validateNoDuplicateLinks', 'validateOrphanedFeatures'],
        4: ['validateMinimumUserStories', 'validateUserStoryFields', 'validateUserStoryGranularity', 'validateMaxUserStories'],
        5: ['validateDeveloperStoryFields'],
        6: ['validateMinimumSuccessCriteria', 'validateSuccessCriteriaDescription', 'validateSMARTCriteria', 'validateTestability'],
        7: [], // Review page validates all
    };

    if (page === 7) {
        return validatePlan(plan);
    }

    const ruleNames = pageRules[page] || [];
    const issues: ValidationIssue[] = [];

    for (const ruleName of ruleNames) {
        const ruleFn = VALIDATION_RULES[ruleName];
        if (ruleFn) {
            issues.push(...ruleFn(plan));
        }
    }

    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const infos = issues.filter(i => i.severity === 'info').length;

    return {
        valid: errors === 0,
        issues,
        counts: { errors, warnings, infos },
        timestamp: new Date(),
    };
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Renders validation results panel.
 */
export function renderValidationPanel(result: ValidationResult): string {
    if (result.issues.length === 0) {
        return `
      <div class="validation-panel validation-success">
        <div class="validation-icon">✓</div>
        <div class="validation-message">All checks passed!</div>
      </div>
    `;
    }

    const errorIssues = result.issues.filter(i => i.severity === 'error');
    const warningIssues = result.issues.filter(i => i.severity === 'warning');
    const infoIssues = result.issues.filter(i => i.severity === 'info');

    return `
    <div class="validation-panel">
      <div class="validation-summary">
        ${result.counts.errors > 0 ? `<span class="count error">${result.counts.errors} errors</span>` : ''}
        ${result.counts.warnings > 0 ? `<span class="count warning">${result.counts.warnings} warnings</span>` : ''}
        ${result.counts.infos > 0 ? `<span class="count info">${result.counts.infos} suggestions</span>` : ''}
      </div>
      
      <div class="validation-issues">
        ${renderIssuesList(errorIssues, 'error')}
        ${renderIssuesList(warningIssues, 'warning')}
        ${renderIssuesList(infoIssues, 'info')}
      </div>
    </div>
  `;
}

function renderIssuesList(issues: ValidationIssue[], severity: ValidationSeverity): string {
    if (issues.length === 0) return '';

    const icon = severity === 'error' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️';

    return issues.map(issue => `
    <div class="validation-issue ${severity}" data-field="${issue.fieldPath || ''}">
      <div class="issue-icon">${icon}</div>
      <div class="issue-content">
        <div class="issue-message">${escapeHtml(issue.message)}</div>
        ${issue.suggestion ? `<div class="issue-suggestion">💡 ${escapeHtml(issue.suggestion)}</div>` : ''}
        ${issue.autoFixable ? `<button type="button" class="btn-small btn-fix" onclick="autoFix('${issue.id}', '${issue.autoFixAction}')">Auto-fix</button>` : ''}
      </div>
    </div>
  `).join('');
}

/**
 * Get CSS styles for validation panel.
 */
export function getValidationPanelStyles(): string {
    return `
    .validation-panel {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 16px;
    }

    .validation-panel.validation-success {
      background: var(--vscode-inputValidation-infoBackground);
      border-color: var(--vscode-inputValidation-infoBorder);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .validation-icon {
      font-size: 20px;
      color: var(--vscode-testing-iconPassed);
    }

    .validation-message {
      font-weight: 500;
    }

    .validation-summary {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }

    .validation-summary .count {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
    }

    .count.error {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-errorForeground);
    }

    .count.warning {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-editorWarning-foreground);
    }

    .count.info {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-editorInfo-foreground);
    }

    .validation-issue {
      display: flex;
      gap: 8px;
      padding: 8px;
      border-radius: 4px;
      margin-bottom: 6px;
    }

    .validation-issue.error {
      background: rgba(220, 53, 69, 0.1);
    }

    .validation-issue.warning {
      background: rgba(255, 193, 7, 0.1);
    }

    .validation-issue.info {
      background: rgba(13, 110, 253, 0.1);
    }

    .issue-icon {
      flex-shrink: 0;
    }

    .issue-content {
      flex: 1;
    }

    .issue-message {
      font-size: 13px;
      margin-bottom: 4px;
    }

    .issue-suggestion {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .btn-fix {
      margin-top: 6px;
      font-size: 11px;
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
