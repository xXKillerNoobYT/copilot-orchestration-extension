/**
 * Plan JSON Schema Validation for Planning Team
 * 
 * **Simple explanation**: This module validates plan.json files against a schema,
 * making sure all required fields are present and properly formatted - like a 
 * proofreader for your project plan.
 * 
 * @module agents/planning/planValidator
 */

import { logInfo, logWarn, logError } from '../../logger';

/**
 * Plan.json task schema
 */
export interface PlanTask {
    /** Unique task ID (required) */
    id: string;
    /** Task title (required) */
    title: string;
    /** Detailed description */
    description?: string;
    /** Parent feature/epic ID */
    featureId?: string;
    /** Task IDs this depends on */
    dependsOn?: string[];
    /** Estimated minutes (15-60) */
    estimateMinutes?: number;
    /** Priority (P0-P3) */
    priority?: 'P0' | 'P1' | 'P2' | 'P3';
    /** Acceptance criteria */
    acceptanceCriteria?: string[];
    /** Files to create/modify */
    files?: string[];
    /** Task status */
    status?: 'pending' | 'ready' | 'in_progress' | 'verification' | 'done' | 'blocked';
}

/**
 * Plan.json feature/epic schema
 */
export interface PlanFeature {
    /** Unique feature ID (required) */
    id: string;
    /** Feature name (required) */
    name: string;
    /** Feature description */
    description?: string;
    /** Whether this is UI-related */
    isUI?: boolean;
    /** Child tasks */
    tasks?: PlanTask[];
    /** Priority (P0-P3) */
    priority?: 'P0' | 'P1' | 'P2' | 'P3';
}

/**
 * Plan.json root schema
 */
export interface PlanSchema {
    /** Plan version (semver) */
    version: string;
    /** Plan name */
    name: string;
    /** Plan description */
    description?: string;
    /** Features/epics */
    features: PlanFeature[];
    /** Creation timestamp */
    createdAt?: string;
    /** Last modified timestamp */
    updatedAt?: string;
    /** Plan metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Validation error with context
 */
export interface ValidationError {
    /** JSON path to the error (e.g., "features[0].tasks[2].id") */
    path: string;
    /** Error message */
    message: string;
    /** Error severity */
    severity: 'error' | 'warning';
    /** Line number in source (if available) */
    line?: number;
    /** Column number in source (if available) */
    column?: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
    /** Whether the plan is valid */
    isValid: boolean;
    /** Validation errors */
    errors: ValidationError[];
    /** Validation warnings */
    warnings: ValidationError[];
    /** Total task count */
    taskCount: number;
    /** Total feature count */
    featureCount: number;
    /** Validation timestamp */
    timestamp: Date;
}

/**
 * Configuration for plan validation
 */
export interface PlanValidatorConfig {
    /** Strict mode - treat warnings as errors */
    strictMode: boolean;
    /** Minimum task estimate in minutes */
    minEstimateMinutes: number;
    /** Maximum task estimate in minutes */
    maxEstimateMinutes: number;
    /** Minimum acceptance criteria per task */
    minAcceptanceCriteria: number;
    /** Allow empty features */
    allowEmptyFeatures: boolean;
}

const DEFAULT_CONFIG: PlanValidatorConfig = {
    strictMode: false,
    minEstimateMinutes: 15,
    maxEstimateMinutes: 60,
    minAcceptanceCriteria: 3,
    allowEmptyFeatures: false
};

/**
 * Valid priority values
 */
const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;

/**
 * Valid task statuses
 */
const VALID_STATUSES = ['pending', 'ready', 'in_progress', 'verification', 'done', 'blocked'] as const;

/**
 * PlanValidator class for validating plan.json files
 * 
 * **Simple explanation**: Like a spell-checker for project plans that makes sure
 * everything is formatted correctly and nothing important is missing.
 */
export class PlanValidator {
    private config: PlanValidatorConfig;

    constructor(config: Partial<PlanValidatorConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Validate a plan object
     * 
     * @param plan - Plan object to validate
     * @returns Validation result
     */
    validate(plan: unknown): ValidationResult {
        logInfo('[PlanValidator] Validating plan');

        const errors: ValidationError[] = [];
        const warnings: ValidationError[] = [];
        let taskCount = 0;
        let featureCount = 0;

        // Validate root object
        if (!plan || typeof plan !== 'object') {
            errors.push({
                path: '',
                message: 'Plan must be a non-null object',
                severity: 'error'
            });
            return this.createResult(false, errors, warnings, taskCount, featureCount);
        }

        const p = plan as Record<string, unknown>;

        // Validate required fields
        if (!this.validateString(p['version'])) {
            errors.push({
                path: 'version',
                message: 'version is required and must be a string',
                severity: 'error'
            });
        }

        if (!this.validateString(p['name'])) {
            errors.push({
                path: 'name',
                message: 'name is required and must be a string',
                severity: 'error'
            });
        }

        // Validate features array
        if (!Array.isArray(p['features'])) {
            errors.push({
                path: 'features',
                message: 'features must be an array',
                severity: 'error'
            });
        } else {
            featureCount = (p['features'] as unknown[]).length;
            const features = p['features'] as unknown[];
            const featureIds = new Set<string>();

            for (let i = 0; i < features.length; i++) {
                const featureErrors = this.validateFeature(features[i], `features[${i}]`, featureIds);
                errors.push(...featureErrors.errors);
                warnings.push(...featureErrors.warnings);
                taskCount += featureErrors.taskCount;
            }
        }

        // Validate optional timestamps
        if (p['createdAt'] !== undefined && !this.validateTimestamp(p['createdAt'])) {
            warnings.push({
                path: 'createdAt',
                message: 'createdAt should be a valid ISO timestamp',
                severity: 'warning'
            });
        }

        if (p['updatedAt'] !== undefined && !this.validateTimestamp(p['updatedAt'])) {
            warnings.push({
                path: 'updatedAt',
                message: 'updatedAt should be a valid ISO timestamp',
                severity: 'warning'
            });
        }

        const isValid = errors.length === 0 && (!this.config.strictMode || warnings.length === 0);
        logInfo(`[PlanValidator] Validation complete: ${isValid ? 'valid' : 'invalid'}, ${errors.length} errors, ${warnings.length} warnings`);

        return this.createResult(isValid, errors, warnings, taskCount, featureCount);
    }

    /**
     * Validate a JSON string
     * 
     * @param json - JSON string to validate
     * @returns Validation result with line numbers
     */
    validateJson(json: string): ValidationResult {
        try {
            const plan = JSON.parse(json);
            return this.validate(plan);
        } catch (error: unknown) {
            const message = error instanceof SyntaxError ? error.message : 'Invalid JSON';
            return this.createResult(false, [{
                path: '',
                message: `JSON parse error: ${message}`,
                severity: 'error'
            }], [], 0, 0);
        }
    }

    /**
     * Validate a feature
     */
    private validateFeature(feature: unknown, path: string, existingIds: Set<string>): {
        errors: ValidationError[];
        warnings: ValidationError[];
        taskCount: number;
    } {
        const errors: ValidationError[] = [];
        const warnings: ValidationError[] = [];
        let taskCount = 0;

        if (!feature || typeof feature !== 'object') {
            errors.push({
                path,
                message: 'Feature must be a non-null object',
                severity: 'error'
            });
            return { errors, warnings, taskCount };
        }

        const f = feature as Record<string, unknown>;

        // Validate ID
        if (!this.validateString(f['id'])) {
            errors.push({
                path: `${path}.id`,
                message: 'Feature id is required and must be a string',
                severity: 'error'
            });
        } else {
            const id = f['id'] as string;
            if (existingIds.has(id)) {
                errors.push({
                    path: `${path}.id`,
                    message: `Duplicate feature ID: ${id}`,
                    severity: 'error'
                });
            }
            existingIds.add(id);
        }

        // Validate name
        if (!this.validateString(f['name'])) {
            errors.push({
                path: `${path}.name`,
                message: 'Feature name is required and must be a string',
                severity: 'error'
            });
        }

        // Validate priority if present
        if (f['priority'] !== undefined && !VALID_PRIORITIES.includes(f['priority'] as typeof VALID_PRIORITIES[number])) {
            warnings.push({
                path: `${path}.priority`,
                message: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
                severity: 'warning'
            });
        }

        // Validate tasks
        if (f['tasks'] !== undefined) {
            if (!Array.isArray(f['tasks'])) {
                errors.push({
                    path: `${path}.tasks`,
                    message: 'Feature tasks must be an array',
                    severity: 'error'
                });
            } else {
                const tasks = f['tasks'] as unknown[];
                taskCount = tasks.length;
                const taskIds = new Set<string>();

                if (tasks.length === 0 && !this.config.allowEmptyFeatures) {
                    warnings.push({
                        path: `${path}.tasks`,
                        message: 'Feature has no tasks',
                        severity: 'warning'
                    });
                }

                for (let i = 0; i < tasks.length; i++) {
                    const taskResult = this.validateTask(tasks[i], `${path}.tasks[${i}]`, taskIds);
                    errors.push(...taskResult.errors);
                    warnings.push(...taskResult.warnings);
                }
            }
        }

        return { errors, warnings, taskCount };
    }

    /**
     * Validate a task
     */
    private validateTask(task: unknown, path: string, existingIds: Set<string>): {
        errors: ValidationError[];
        warnings: ValidationError[];
    } {
        const errors: ValidationError[] = [];
        const warnings: ValidationError[] = [];

        if (!task || typeof task !== 'object') {
            errors.push({
                path,
                message: 'Task must be a non-null object',
                severity: 'error'
            });
            return { errors, warnings };
        }

        const t = task as Record<string, unknown>;

        // Validate ID (required)
        if (!this.validateString(t['id'])) {
            errors.push({
                path: `${path}.id`,
                message: 'Task id is required and must be a string',
                severity: 'error'
            });
        } else {
            const id = t['id'] as string;
            if (existingIds.has(id)) {
                errors.push({
                    path: `${path}.id`,
                    message: `Duplicate task ID: ${id}`,
                    severity: 'error'
                });
            }
            existingIds.add(id);
        }

        // Validate title (required)
        if (!this.validateString(t['title'])) {
            errors.push({
                path: `${path}.title`,
                message: 'Task title is required and must be a string',
                severity: 'error'
            });
        }

        // Validate estimate if present
        if (t['estimateMinutes'] !== undefined) {
            const estimate = t['estimateMinutes'];
            if (typeof estimate !== 'number' || !Number.isInteger(estimate)) {
                warnings.push({
                    path: `${path}.estimateMinutes`,
                    message: 'estimateMinutes should be an integer',
                    severity: 'warning'
                });
            } else if (estimate < this.config.minEstimateMinutes || estimate > this.config.maxEstimateMinutes) {
                warnings.push({
                    path: `${path}.estimateMinutes`,
                    message: `estimateMinutes should be between ${this.config.minEstimateMinutes} and ${this.config.maxEstimateMinutes}`,
                    severity: 'warning'
                });
            }
        }

        // Validate priority if present
        if (t['priority'] !== undefined && !VALID_PRIORITIES.includes(t['priority'] as typeof VALID_PRIORITIES[number])) {
            warnings.push({
                path: `${path}.priority`,
                message: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
                severity: 'warning'
            });
        }

        // Validate status if present
        if (t['status'] !== undefined && !VALID_STATUSES.includes(t['status'] as typeof VALID_STATUSES[number])) {
            warnings.push({
                path: `${path}.status`,
                message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
                severity: 'warning'
            });
        }

        // Validate dependsOn array
        if (t['dependsOn'] !== undefined) {
            if (!Array.isArray(t['dependsOn'])) {
                errors.push({
                    path: `${path}.dependsOn`,
                    message: 'dependsOn must be an array of task IDs',
                    severity: 'error'
                });
            } else {
                const deps = t['dependsOn'] as unknown[];
                for (let i = 0; i < deps.length; i++) {
                    if (typeof deps[i] !== 'string') {
                        warnings.push({
                            path: `${path}.dependsOn[${i}]`,
                            message: 'Each dependency must be a string task ID',
                            severity: 'warning'
                        });
                    }
                }
            }
        }

        // Validate acceptance criteria
        if (t['acceptanceCriteria'] !== undefined) {
            if (!Array.isArray(t['acceptanceCriteria'])) {
                errors.push({
                    path: `${path}.acceptanceCriteria`,
                    message: 'acceptanceCriteria must be an array of strings',
                    severity: 'error'
                });
            } else {
                const criteria = t['acceptanceCriteria'] as unknown[];
                if (criteria.length < this.config.minAcceptanceCriteria) {
                    warnings.push({
                        path: `${path}.acceptanceCriteria`,
                        message: `Task should have at least ${this.config.minAcceptanceCriteria} acceptance criteria`,
                        severity: 'warning'
                    });
                }
            }
        } else {
            warnings.push({
                path: `${path}.acceptanceCriteria`,
                message: 'Task is missing acceptance criteria',
                severity: 'warning'
            });
        }

        // Validate files array
        if (t['files'] !== undefined && !Array.isArray(t['files'])) {
            warnings.push({
                path: `${path}.files`,
                message: 'files should be an array of file paths',
                severity: 'warning'
            });
        }

        return { errors, warnings };
    }

    /**
     * Validate string field
     */
    private validateString(value: unknown): value is string {
        return typeof value === 'string' && value.length > 0;
    }

    /**
     * Validate timestamp
     */
    private validateTimestamp(value: unknown): boolean {
        if (typeof value !== 'string') return false;
        const date = new Date(value);
        return !isNaN(date.getTime());
    }

    /**
     * Create validation result
     */
    private createResult(
        isValid: boolean,
        errors: ValidationError[],
        warnings: ValidationError[],
        taskCount: number,
        featureCount: number
    ): ValidationResult {
        return {
            isValid,
            errors,
            warnings,
            taskCount,
            featureCount,
            timestamp: new Date()
        };
    }

    /**
     * Format validation errors for display
     * 
     * @param result - Validation result
     * @returns Formatted error string
     */
    formatErrors(result: ValidationResult): string {
        const lines: string[] = [];

        if (result.errors.length > 0) {
            lines.push('Errors:');
            for (const error of result.errors) {
                const loc = error.line ? ` (line ${error.line})` : '';
                lines.push(`  ✗ ${error.path}${loc}: ${error.message}`);
            }
        }

        if (result.warnings.length > 0) {
            lines.push('Warnings:');
            for (const warning of result.warnings) {
                const loc = warning.line ? ` (line ${warning.line})` : '';
                lines.push(`  ⚠ ${warning.path}${loc}: ${warning.message}`);
            }
        }

        if (lines.length === 0) {
            return '✓ Plan validation passed';
        }

        return lines.join('\n');
    }
}

// Singleton instance
let instance: PlanValidator | null = null;

/**
 * Get the singleton PlanValidator
 */
export function getPlanValidator(): PlanValidator {
    if (!instance) {
        instance = new PlanValidator();
    }
    return instance;
}

/**
 * Reset the singleton for testing
 */
export function resetPlanValidatorForTests(): void {
    instance = null;
}
