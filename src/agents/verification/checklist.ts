/**
 * Verification Checklist System
 * 
 * **Simple explanation**: A checklist of items that must pass before
 * code can be marked as verified. Like a pre-flight checklist for pilots.
 * 
 * @module agents/verification/checklist
 */

import { logInfo, logWarn } from '../../logger';

/**
 * Checklist item status
 */
export type ChecklistStatus = 'pending' | 'passed' | 'failed' | 'skipped' | 'n/a';

/**
 * A checklist item
 */
export interface ChecklistItem {
    /** Unique item ID */
    id: string;
    /** Item category */
    category: ChecklistCategory;
    /** Item description */
    description: string;
    /** Current status */
    status: ChecklistStatus;
    /** Evidence for pass/fail */
    evidence?: string;
    /** Required for verification to pass */
    required: boolean;
    /** Automatic or manual check */
    checkType: 'automatic' | 'manual';
    /** Time when checked */
    checkedAt?: Date;
}

/**
 * Checklist categories
 */
export type ChecklistCategory =
    | 'tests'
    | 'lint'
    | 'build'
    | 'coverage'
    | 'types'
    | 'security'
    | 'performance'
    | 'accessibility'
    | 'documentation'
    | 'review';

/**
 * Checklist result
 */
export interface ChecklistResult {
    /** All items passed required checks */
    passed: boolean;
    /** Pass percentage */
    passPercent: number;
    /** Items by status */
    byStatus: Record<ChecklistStatus, number>;
    /** Items by category */
    byCategory: Record<ChecklistCategory, { passed: number; total: number }>;
    /** Failed required items */
    failedRequired: ChecklistItem[];
    /** Summary message */
    summary: string;
}

/**
 * Default checklist template
 */
const DEFAULT_CHECKLIST: Omit<ChecklistItem, 'status' | 'checkedAt'>[] = [
    // Tests
    {
        id: 'tests-pass',
        category: 'tests',
        description: 'All unit tests pass',
        required: true,
        checkType: 'automatic'
    },
    {
        id: 'tests-new',
        category: 'tests',
        description: 'New tests added for new functionality',
        required: false,
        checkType: 'automatic'
    },
    // Build
    {
        id: 'build-success',
        category: 'build',
        description: 'TypeScript compilation succeeds',
        required: true,
        checkType: 'automatic'
    },
    // Lint
    {
        id: 'lint-pass',
        category: 'lint',
        description: 'No ESLint errors',
        required: true,
        checkType: 'automatic'
    },
    {
        id: 'lint-warnings',
        category: 'lint',
        description: 'ESLint warnings reviewed',
        required: false,
        checkType: 'manual'
    },
    // Types
    {
        id: 'types-strict',
        category: 'types',
        description: 'No TypeScript errors',
        required: true,
        checkType: 'automatic'
    },
    // Coverage
    {
        id: 'coverage-threshold',
        category: 'coverage',
        description: 'Code coverage meets threshold',
        required: false,
        checkType: 'automatic'
    },
    // Documentation
    {
        id: 'docs-updated',
        category: 'documentation',
        description: 'Documentation updated if needed',
        required: false,
        checkType: 'manual'
    },
    {
        id: 'jsdoc-added',
        category: 'documentation',
        description: 'JSDoc comments on public functions',
        required: false,
        checkType: 'automatic'
    }
];

/**
 * Verification Checklist Manager
 */
export class VerificationChecklist {
    private items: ChecklistItem[] = [];
    private taskId: string;

    constructor(taskId: string, customItems: Omit<ChecklistItem, 'status' | 'checkedAt'>[] = []) {
        this.taskId = taskId;

        // Initialize with default items
        const allItems = [...DEFAULT_CHECKLIST, ...customItems];
        this.items = allItems.map(item => ({
            ...item,
            status: 'pending' as ChecklistStatus
        }));

        logInfo(`[Checklist] Created checklist for ${taskId} with ${this.items.length} items`);
    }

    /**
     * Mark an item as passed
     */
    markPassed(itemId: string, evidence?: string): boolean {
        const item = this.items.find(i => i.id === itemId);
        if (!item) {
            logWarn(`[Checklist] Item ${itemId} not found`);
            return false;
        }

        item.status = 'passed';
        item.evidence = evidence;
        item.checkedAt = new Date();

        logInfo(`[Checklist] ${itemId} PASSED`);
        return true;
    }

    /**
     * Mark an item as failed
     */
    markFailed(itemId: string, evidence?: string): boolean {
        const item = this.items.find(i => i.id === itemId);
        if (!item) {
            logWarn(`[Checklist] Item ${itemId} not found`);
            return false;
        }

        item.status = 'failed';
        item.evidence = evidence;
        item.checkedAt = new Date();

        logInfo(`[Checklist] ${itemId} FAILED: ${evidence || 'no details'}`);
        return true;
    }

    /**
     * Mark an item as skipped
     */
    markSkipped(itemId: string, reason?: string): boolean {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return false;

        item.status = 'skipped';
        item.evidence = reason;
        item.checkedAt = new Date();

        return true;
    }

    /**
     * Mark an item as not applicable
     */
    markNA(itemId: string, reason?: string): boolean {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return false;

        item.status = 'n/a';
        item.evidence = reason;
        item.checkedAt = new Date();

        return true;
    }

    /**
     * Get checklist items
     */
    getItems(): ChecklistItem[] {
        return [...this.items];
    }

    /**
     * Get items by category
     */
    getItemsByCategory(category: ChecklistCategory): ChecklistItem[] {
        return this.items.filter(i => i.category === category);
    }

    /**
     * Get pending items
     */
    getPendingItems(): ChecklistItem[] {
        return this.items.filter(i => i.status === 'pending');
    }

    /**
     * Get result summary
     */
    getResult(): ChecklistResult {
        const byStatus: Record<ChecklistStatus, number> = {
            'pending': 0,
            'passed': 0,
            'failed': 0,
            'skipped': 0,
            'n/a': 0
        };

        const byCategory: Record<ChecklistCategory, { passed: number; total: number }> = {
            'tests': { passed: 0, total: 0 },
            'lint': { passed: 0, total: 0 },
            'build': { passed: 0, total: 0 },
            'coverage': { passed: 0, total: 0 },
            'types': { passed: 0, total: 0 },
            'security': { passed: 0, total: 0 },
            'performance': { passed: 0, total: 0 },
            'accessibility': { passed: 0, total: 0 },
            'documentation': { passed: 0, total: 0 },
            'review': { passed: 0, total: 0 }
        };

        const failedRequired: ChecklistItem[] = [];

        for (const item of this.items) {
            byStatus[item.status]++;

            if (item.status !== 'n/a') {
                byCategory[item.category].total++;
                if (item.status === 'passed') {
                    byCategory[item.category].passed++;
                }
            }

            if (item.required && item.status === 'failed') {
                failedRequired.push(item);
            }
        }

        const applicableItems = this.items.filter(i => i.status !== 'n/a' && i.status !== 'skipped');
        const passedItems = applicableItems.filter(i => i.status === 'passed');
        const passPercent = applicableItems.length > 0
            ? Math.round((passedItems.length / applicableItems.length) * 100)
            : 100;

        const passed = failedRequired.length === 0 && byStatus.pending === 0;

        let summary: string;
        if (passed) {
            summary = `✅ All ${passedItems.length} checks passed`;
        } else if (failedRequired.length > 0) {
            summary = `❌ ${failedRequired.length} required check(s) failed: ${failedRequired.map(f => f.id).join(', ')}`;
        } else {
            summary = `⏳ ${byStatus.pending} check(s) pending`;
        }

        return {
            passed,
            passPercent,
            byStatus,
            byCategory,
            failedRequired,
            summary
        };
    }

    /**
     * Format checklist as text
     */
    format(): string {
        const lines = [`Verification Checklist for ${this.taskId}`, ''];

        const categories = [...new Set(this.items.map(i => i.category))];

        for (const category of categories) {
            lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)}`);

            for (const item of this.getItemsByCategory(category)) {
                const icon = this.getStatusIcon(item.status);
                const required = item.required ? ' (required)' : '';
                lines.push(`${icon} ${item.description}${required}`);
                if (item.evidence) {
                    lines.push(`   Evidence: ${item.evidence}`);
                }
            }
            lines.push('');
        }

        const result = this.getResult();
        lines.push('---');
        lines.push(result.summary);

        return lines.join('\n');
    }

    /**
     * Get status icon
     */
    private getStatusIcon(status: ChecklistStatus): string {
        switch (status) {
            case 'passed': return '✅';
            case 'failed': return '❌';
            case 'pending': return '⏳';
            case 'skipped': return '⏭️';
            case 'n/a': return '➖';
        }
    }
}

/**
 * Create a new verification checklist
 */
export function createChecklist(
    taskId: string,
    customItems?: Omit<ChecklistItem, 'status' | 'checkedAt'>[]
): VerificationChecklist {
    return new VerificationChecklist(taskId, customItems);
}
