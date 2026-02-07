/**
 * Tests for Plan Error Handler (MT-033.31-35)
 * 
 * Tests for plan error handling, validation, recovery, and display.
 */

import {
    PlanErrorHandler,
    PlanError,
    PlanErrorCode,
    ErrorSeverity,
    ErrorLocation,
    ErrorSuggestion,
    ErrorRecovery,
    validatePlanWithErrors,
    renderErrorList,
    getErrorStyles,
    getErrorHandler,
    resetErrorHandler,
} from '../../src/planning/errorHandler';
import {
    CompletePlan,
    FeatureBlock,
    BlockLink,
    PriorityLevel,
    PlanMetadata,
    ProjectOverview,
    ConditionalLogic,
    UserStory,
    DeveloperStory,
    SuccessCriterion,
} from '../../src/planning/types';

// ============================================================================
// Test Utilities
// ============================================================================

function createTestPlan(overrides: Partial<CompletePlan> = {}): CompletePlan {
    const now = new Date();
    return {
        metadata: {
            id: 'plan-1',
            name: 'Test Plan',
            createdAt: now,
            updatedAt: now,
            version: 1,
            author: 'test',
        },
        overview: {
            name: 'Test Project',
            description: 'A test project',
            goals: ['Goal 1', 'Goal 2'],
        },
        featureBlocks: [],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: [],
        successCriteria: [],
        ...overrides,
    };
}

function createTestFeature(overrides: Partial<FeatureBlock> = {}): FeatureBlock {
    return {
        id: 'feature-1',
        name: 'Test Feature',
        description: 'Test description',
        purpose: 'Test purpose',
        acceptanceCriteria: ['AC-1'],
        technicalNotes: 'Some notes',
        priority: 'medium' as PriorityLevel,
        order: 1,
        ...overrides,
    };
}

function createTestLink(overrides: Partial<BlockLink> = {}): BlockLink {
    return {
        id: 'link-1',
        sourceBlockId: 'feature-1',
        targetBlockId: 'feature-2',
        dependencyType: 'requires',
        ...overrides,
    };
}

// ============================================================================
// PlanErrorHandler Class Tests
// ============================================================================

describe('PlanErrorHandler', () => {
    let handler: PlanErrorHandler;

    beforeEach(() => {
        handler = new PlanErrorHandler();
    });

    // ----------------------------------------
    // Error Reporting Tests
    // ----------------------------------------
    describe('reportError', () => {
        it('Test 1: should report an error with minimal options', () => {
            const error = handler.reportError('MISSING_REQUIRED_FIELD', 'Name is required');
            
            expect(error.id).toMatch(/^err_/);
            expect(error.code).toBe('MISSING_REQUIRED_FIELD');
            expect(error.message).toBe('Name is required');
            expect(error.severity).toBe('error');
            expect(error.timestamp).toBeDefined();
            expect(error.suggestions.length).toBeGreaterThan(0);
        });

        it('Test 2: should report an error with full options', () => {
            const location: ErrorLocation = {
                section: 'feature',
                itemId: 'feature-1',
                field: 'name',
                index: 0,
            };
            const suggestion: ErrorSuggestion = {
                label: 'Add name',
                action: 'manual',
                description: 'Navigate to feature and add a name',
                autoApply: false,
            };

            const error = handler.reportError('MISSING_REQUIRED_FIELD', 'Feature name required', {
                severity: 'warning',
                details: 'Feature at index 0 has no name',
                location,
                suggestions: [suggestion],
            });

            expect(error.severity).toBe('warning');
            expect(error.details).toBe('Feature at index 0 has no name');
            expect(error.location).toEqual(location);
            expect(error.suggestions).toEqual([suggestion]);
        });

        it('Test 3: should generate unique error IDs', () => {
            const error1 = handler.reportError('UNKNOWN_ERROR', 'Error 1');
            const error2 = handler.reportError('UNKNOWN_ERROR', 'Error 2');
            
            expect(error1.id).not.toBe(error2.id);
        });

        it('Test 4: should set autoFixAvailable for fixable error codes', () => {
            const fixableErrors: PlanErrorCode[] = [
                'DUPLICATE_ID',
                'NAME_TOO_LONG',
                'DESCRIPTION_TOO_LONG',
                'MISSING_CRITERIA',
                'ORPHAN_REFERENCE',
            ];

            for (const code of fixableErrors) {
                const error = handler.reportError(code, `Test ${code}`);
                expect(error.autoFixAvailable).toBe(true);
            }
        });

        it('Test 5: should set autoFixAvailable=false for non-fixable errors', () => {
            const nonFixableErrors: PlanErrorCode[] = [
                'MISSING_REQUIRED_FIELD',
                'CIRCULAR_DEPENDENCY',
                'EMPTY_PLAN',
                'SAVE_FAILED',
            ];

            for (const code of nonFixableErrors) {
                const error = handler.reportError(code, `Test ${code}`);
                expect(error.autoFixAvailable).toBe(false);
            }
        });
    });

    // ----------------------------------------
    // Error Clearing Tests
    // ----------------------------------------
    describe('clearError', () => {
        it('Test 6: should clear a specific error by ID', () => {
            const error = handler.reportError('UNKNOWN_ERROR', 'Test error');
            expect(handler.getErrors()).toHaveLength(1);
            
            handler.clearError(error.id);
            expect(handler.getErrors()).toHaveLength(0);
        });

        it('Test 7: should not throw when clearing non-existent error', () => {
            expect(() => handler.clearError('non-existent-id')).not.toThrow();
        });
    });

    describe('clearAllErrors', () => {
        it('Test 8: should clear all errors', () => {
            handler.reportError('UNKNOWN_ERROR', 'Error 1');
            handler.reportError('UNKNOWN_ERROR', 'Error 2');
            handler.reportError('UNKNOWN_ERROR', 'Error 3');
            expect(handler.getErrors()).toHaveLength(3);

            handler.clearAllErrors();
            expect(handler.getErrors()).toHaveLength(0);
        });

        it('Test 9: should work when no errors exist', () => {
            expect(() => handler.clearAllErrors()).not.toThrow();
            expect(handler.getErrors()).toHaveLength(0);
        });
    });

    // ----------------------------------------
    // Error Retrieval Tests
    // ----------------------------------------
    describe('getErrors', () => {
        it('Test 10: should return empty array when no errors', () => {
            expect(handler.getErrors()).toEqual([]);
        });

        it('Test 11: should return all reported errors', () => {
            handler.reportError('MISSING_REQUIRED_FIELD', 'Error 1');
            handler.reportError('DUPLICATE_ID', 'Error 2');
            
            const errors = handler.getErrors();
            expect(errors).toHaveLength(2);
            expect(errors[0].code).toBe('MISSING_REQUIRED_FIELD');
            expect(errors[1].code).toBe('DUPLICATE_ID');
        });
    });

    describe('getErrorsBySeverity', () => {
        it('Test 12: should filter errors by severity', () => {
            handler.reportError('MISSING_REQUIRED_FIELD', 'Error 1'); // default: error
            handler.reportError('NAME_TOO_LONG', 'Warning 1', { severity: 'warning' });
            handler.reportError('SAVE_FAILED', 'Error 2', { severity: 'error' });
            handler.reportError('UNKNOWN_ERROR', 'Info 1', { severity: 'info' });

            expect(handler.getErrorsBySeverity('error')).toHaveLength(2);
            expect(handler.getErrorsBySeverity('warning')).toHaveLength(1);
            expect(handler.getErrorsBySeverity('info')).toHaveLength(1);
        });

        it('Test 13: should return empty array when no errors of that severity', () => {
            handler.reportError('MISSING_REQUIRED_FIELD', 'Error', { severity: 'error' });
            expect(handler.getErrorsBySeverity('warning')).toHaveLength(0);
        });
    });

    describe('hasBlockingErrors', () => {
        it('Test 14: should return true when there are error-severity errors', () => {
            handler.reportError('MISSING_REQUIRED_FIELD', 'Blocking error');
            expect(handler.hasBlockingErrors()).toBe(true);
        });

        it('Test 15: should return false when only warnings', () => {
            handler.reportError('NAME_TOO_LONG', 'Warning', { severity: 'warning' });
            expect(handler.hasBlockingErrors()).toBe(false);
        });

        it('Test 16: should return false when no errors', () => {
            expect(handler.hasBlockingErrors()).toBe(false);
        });
    });

    // ----------------------------------------
    // Auto-Fix Tests
    // ----------------------------------------
    describe('attemptAutoFix', () => {
        it('Test 17: should return failure for non-existent error', () => {
            const plan = createTestPlan();
            const recovery = handler.attemptAutoFix('non-existent-id', plan);
            
            expect(recovery.success).toBe(false);
            expect(recovery.message).toBe('Error not found');
        });

        it('Test 18: should return failure for non-auto-fixable error', () => {
            const error = handler.reportError('CIRCULAR_DEPENDENCY', 'Cycle detected');
            const plan = createTestPlan();
            const recovery = handler.attemptAutoFix(error.id, plan);
            
            expect(recovery.success).toBe(false);
            expect(recovery.message).toBe('No auto-fix available for this error');
        });

        it('Test 19: should fix DUPLICATE_ID error on feature', () => {
            const feature = createTestFeature({ id: 'dup-id' });
            const plan = createTestPlan({ featureBlocks: [feature] });
            
            const error = handler.reportError('DUPLICATE_ID', 'Duplicate ID', {
                location: { section: 'feature', itemId: 'dup-id' }
            });
            
            const recovery = handler.attemptAutoFix(error.id, plan);
            
            expect(recovery.success).toBe(true);
            expect(recovery.changes).toBeDefined();
            expect(recovery.changes!.length).toBeGreaterThan(0);
            expect(plan.featureBlocks[0].id).not.toBe('dup-id');
        });

        it('Test 20: should fix NAME_TOO_LONG error', () => {
            const longName = 'A'.repeat(150);
            const feature = createTestFeature({ id: 'f1', name: longName });
            const plan = createTestPlan({ featureBlocks: [feature] });
            
            const error = handler.reportError('NAME_TOO_LONG', 'Name too long', {
                location: { section: 'feature', itemId: 'f1' }
            });
            
            const recovery = handler.attemptAutoFix(error.id, plan);
            
            expect(recovery.success).toBe(true);
            expect(plan.featureBlocks[0].name.length).toBeLessThanOrEqual(100);
        });

        it('Test 21: should fix MISSING_CRITERIA error', () => {
            const feature = createTestFeature({ id: 'f1', acceptanceCriteria: [] });
            const plan = createTestPlan({ featureBlocks: [feature] });
            
            const error = handler.reportError('MISSING_CRITERIA', 'No criteria', {
                location: { section: 'feature', itemId: 'f1' }
            });
            
            const recovery = handler.attemptAutoFix(error.id, plan);
            
            expect(recovery.success).toBe(true);
            expect(plan.featureBlocks[0].acceptanceCriteria.length).toBe(1);
            expect(plan.featureBlocks[0].acceptanceCriteria[0]).toContain('TODO');
        });

        it('Test 22: should fix ORPHAN_REFERENCE error by removing link', () => {
            const link = createTestLink({ id: 'orphan-link', sourceBlockId: 'non-existent' });
            const plan = createTestPlan({ blockLinks: [link] });
            
            const error = handler.reportError('ORPHAN_REFERENCE', 'Orphan reference', {
                location: { section: 'link', itemId: 'orphan-link' }
            });
            
            const recovery = handler.attemptAutoFix(error.id, plan);
            
            expect(recovery.success).toBe(true);
            expect(plan.blockLinks).toHaveLength(0);
        });

        it('Test 23: should clear error after successful fix', () => {
            const feature = createTestFeature({ id: 'f1', acceptanceCriteria: [] });
            const plan = createTestPlan({ featureBlocks: [feature] });
            
            const error = handler.reportError('MISSING_CRITERIA', 'No criteria', {
                location: { section: 'feature', itemId: 'f1' }
            });
            expect(handler.getErrors()).toHaveLength(1);
            
            handler.attemptAutoFix(error.id, plan);
            expect(handler.getErrors()).toHaveLength(0);
        });
    });

    describe('attemptAutoFixAll', () => {
        it('Test 24: should attempt to fix all auto-fixable errors', () => {
            const feature1 = createTestFeature({ id: 'f1', acceptanceCriteria: [] });
            const feature2 = createTestFeature({ id: 'f2', name: 'A'.repeat(150) });
            const plan = createTestPlan({ featureBlocks: [feature1, feature2] });
            
            handler.reportError('MISSING_CRITERIA', 'No criteria', {
                location: { section: 'feature', itemId: 'f1' }
            });
            handler.reportError('NAME_TOO_LONG', 'Name too long', {
                location: { section: 'feature', itemId: 'f2' }
            });
            
            const recoveries = handler.attemptAutoFixAll(plan);
            
            expect(recoveries).toHaveLength(2);
            expect(recoveries.every(r => r.success)).toBe(true);
        });

        it('Test 25: should return empty array when no auto-fixable errors', () => {
            handler.reportError('CIRCULAR_DEPENDENCY', 'Cycle', { severity: 'error' });
            const plan = createTestPlan();
            
            const recoveries = handler.attemptAutoFixAll(plan);
            expect(recoveries).toHaveLength(0);
        });
    });

    // ----------------------------------------
    // Listener Tests
    // ----------------------------------------
    describe('onErrorChange', () => {
        it('Test 26: should notify listeners when error is reported', () => {
            const listener = jest.fn();
            handler.onErrorChange(listener);
            
            handler.reportError('UNKNOWN_ERROR', 'Test');
            
            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ code: 'UNKNOWN_ERROR' })
            ]));
        });

        it('Test 27: should notify listeners when error is cleared', () => {
            const listener = jest.fn();
            const error = handler.reportError('UNKNOWN_ERROR', 'Test');
            handler.onErrorChange(listener);
            
            handler.clearError(error.id);
            
            expect(listener).toHaveBeenCalledWith([]);
        });

        it('Test 28: should allow unsubscribing', () => {
            const listener = jest.fn();
            const unsubscribe = handler.onErrorChange(listener);
            
            unsubscribe();
            handler.reportError('UNKNOWN_ERROR', 'Test');
            
            expect(listener).not.toHaveBeenCalled();
        });

        it('Test 29: should support multiple listeners', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            
            handler.onErrorChange(listener1);
            handler.onErrorChange(listener2);
            handler.reportError('UNKNOWN_ERROR', 'Test');
            
            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
        });
    });
});

// ============================================================================
// validatePlanWithErrors Tests
// ============================================================================

describe('validatePlanWithErrors', () => {
    let handler: PlanErrorHandler;

    beforeEach(() => {
        handler = new PlanErrorHandler();
    });

    it('Test 30: should report error for missing plan name', () => {
        const plan = createTestPlan({
            overview: { name: '', description: 'Test', goals: [] }
        });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        expect(errors.some(e => 
            e.code === 'MISSING_REQUIRED_FIELD' && 
            e.location?.field === 'name'
        )).toBe(true);
    });

    it('Test 31: should report error for no features', () => {
        const plan = createTestPlan({ featureBlocks: [] });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        expect(errors.some(e => e.code === 'NO_FEATURES')).toBe(true);
    });

    it('Test 32: should report error for duplicate feature IDs', () => {
        const plan = createTestPlan({
            featureBlocks: [
                createTestFeature({ id: 'same-id', name: 'Feature 1' }),
                createTestFeature({ id: 'same-id', name: 'Feature 2' }),
            ]
        });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        expect(errors.some(e => e.code === 'DUPLICATE_ID')).toBe(true);
    });

    it('Test 33: should report error for missing feature name', () => {
        const plan = createTestPlan({
            featureBlocks: [createTestFeature({ id: 'f1', name: '' })]
        });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        expect(errors.some(e => 
            e.code === 'MISSING_REQUIRED_FIELD' && 
            e.location?.section === 'feature'
        )).toBe(true);
    });

    it('Test 34: should report warning for feature name too long', () => {
        const plan = createTestPlan({
            featureBlocks: [createTestFeature({ id: 'f1', name: 'A'.repeat(150) })]
        });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        const longNameError = errors.find(e => e.code === 'NAME_TOO_LONG');
        expect(longNameError).toBeDefined();
        expect(longNameError!.severity).toBe('warning');
    });

    it('Test 35: should report warning for missing acceptance criteria', () => {
        const plan = createTestPlan({
            featureBlocks: [createTestFeature({ id: 'f1', acceptanceCriteria: [] })]
        });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        const criteriaError = errors.find(e => e.code === 'MISSING_CRITERIA');
        expect(criteriaError).toBeDefined();
        expect(criteriaError!.severity).toBe('warning');
    });

    it('Test 36: should report error for orphan link source', () => {
        const plan = createTestPlan({
            featureBlocks: [createTestFeature({ id: 'f1' })],
            blockLinks: [createTestLink({ sourceBlockId: 'non-existent', targetBlockId: 'f1' })]
        });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        expect(errors.some(e => 
            e.code === 'ORPHAN_REFERENCE' && 
            e.location?.field === 'sourceBlockId'
        )).toBe(true);
    });

    it('Test 37: should report error for orphan link target', () => {
        const plan = createTestPlan({
            featureBlocks: [createTestFeature({ id: 'f1' })],
            blockLinks: [createTestLink({ sourceBlockId: 'f1', targetBlockId: 'non-existent' })]
        });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        expect(errors.some(e => 
            e.code === 'ORPHAN_REFERENCE' && 
            e.location?.field === 'targetBlockId'
        )).toBe(true);
    });

    it('Test 38: should detect circular dependencies', () => {
        const plan = createTestPlan({
            featureBlocks: [
                createTestFeature({ id: 'f1' }),
                createTestFeature({ id: 'f2' }),
            ],
            blockLinks: [
                createTestLink({ id: 'l1', sourceBlockId: 'f1', targetBlockId: 'f2', dependencyType: 'requires' }),
                createTestLink({ id: 'l2', sourceBlockId: 'f2', targetBlockId: 'f1', dependencyType: 'requires' }),
            ]
        });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        expect(errors.some(e => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('Test 39: should clear previous errors before validation', () => {
        handler.reportError('UNKNOWN_ERROR', 'Pre-existing error');
        expect(handler.getErrors()).toHaveLength(1);
        
        const plan = createTestPlan({
            featureBlocks: [createTestFeature()]
        });
        validatePlanWithErrors(plan, handler);
        
        // Should not have the pre-existing UNKNOWN_ERROR
        expect(handler.getErrors().some(e => e.code === 'UNKNOWN_ERROR')).toBe(false);
    });

    it('Test 40: should return no errors for valid plan', () => {
        const plan = createTestPlan({
            overview: { name: 'Valid Plan', description: 'Test', goals: ['Goal'] },
            featureBlocks: [createTestFeature({ 
                id: 'f1', 
                name: 'Valid Feature',
                acceptanceCriteria: ['AC-1'] 
            })],
        });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        // May have warnings but no errors
        expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    });
});

// ============================================================================
// renderErrorList Tests
// ============================================================================

describe('renderErrorList', () => {
    it('Test 41: should render empty state when no errors', () => {
        const html = renderErrorList([]);
        
        expect(html).toContain('no-errors');
        expect(html).toContain('No issues found');
        expect(html).toContain('✓');
    });

    it('Test 42: should render error count summary', () => {
        const errors: PlanError[] = [
            {
                id: 'err-1',
                code: 'MISSING_REQUIRED_FIELD',
                severity: 'error',
                message: 'Test error',
                suggestions: [],
                autoFixAvailable: false,
                timestamp: new Date().toISOString(),
            },
            {
                id: 'err-2',
                code: 'NAME_TOO_LONG',
                severity: 'warning',
                message: 'Test warning',
                suggestions: [],
                autoFixAvailable: false,
                timestamp: new Date().toISOString(),
            },
        ];
        
        const html = renderErrorList(errors);
        
        expect(html).toContain('1 error(s)');
        expect(html).toContain('1 warning(s)');
    });

    it('Test 43: should render error message and code', () => {
        const errors: PlanError[] = [{
            id: 'err-1',
            code: 'DUPLICATE_ID',
            severity: 'error',
            message: 'Duplicate feature ID found',
            suggestions: [],
            autoFixAvailable: false,
            timestamp: new Date().toISOString(),
        }];
        
        const html = renderErrorList(errors);
        
        expect(html).toContain('Duplicate feature ID found');
        expect(html).toContain('DUPLICATE_ID');
    });

    it('Test 44: should render error details when present', () => {
        const errors: PlanError[] = [{
            id: 'err-1',
            code: 'CIRCULAR_DEPENDENCY',
            severity: 'error',
            message: 'Cycle detected',
            details: 'Found 3 cycles in dependency graph',
            suggestions: [],
            autoFixAvailable: false,
            timestamp: new Date().toISOString(),
        }];
        
        const html = renderErrorList(errors);
        
        expect(html).toContain('Found 3 cycles in dependency graph');
    });

    it('Test 45: should render error location when present', () => {
        const errors: PlanError[] = [{
            id: 'err-1',
            code: 'MISSING_REQUIRED_FIELD',
            severity: 'error',
            message: 'Field missing',
            location: { section: 'feature', field: 'name' },
            suggestions: [],
            autoFixAvailable: false,
            timestamp: new Date().toISOString(),
        }];
        
        const html = renderErrorList(errors);
        
        expect(html).toContain('feature');
        expect(html).toContain('name');
    });

    it('Test 46: should render fix-all button when auto-fix available', () => {
        const errors: PlanError[] = [{
            id: 'err-1',
            code: 'DUPLICATE_ID',
            severity: 'error',
            message: 'Duplicate ID',
            suggestions: [],
            autoFixAvailable: true,
            timestamp: new Date().toISOString(),
        }];
        
        const html = renderErrorList(errors);
        
        expect(html).toContain('Fix All Auto-fixable Issues');
        expect(html).toContain('fixAllErrors');
    });

    it('Test 47: should escape HTML in messages', () => {
        const errors: PlanError[] = [{
            id: 'err-1',
            code: 'UNKNOWN_ERROR',
            severity: 'error',
            message: '<script>alert("xss")</script>',
            suggestions: [],
            autoFixAvailable: false,
            timestamp: new Date().toISOString(),
        }];
        
        const html = renderErrorList(errors);
        
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('Test 48: should render appropriate icons by severity', () => {
        const errors: PlanError[] = [
            {
                id: 'err-1',
                code: 'MISSING_REQUIRED_FIELD',
                severity: 'error',
                message: 'Error',
                suggestions: [],
                autoFixAvailable: false,
                timestamp: new Date().toISOString(),
            },
            {
                id: 'err-2',
                code: 'NAME_TOO_LONG',
                severity: 'warning',
                message: 'Warning',
                suggestions: [],
                autoFixAvailable: false,
                timestamp: new Date().toISOString(),
            },
            {
                id: 'err-3',
                code: 'UNKNOWN_ERROR',
                severity: 'info',
                message: 'Info',
                suggestions: [],
                autoFixAvailable: false,
                timestamp: new Date().toISOString(),
            },
        ];
        
        const html = renderErrorList(errors);
        
        expect(html).toContain('❌');
        expect(html).toContain('⚠️');
        expect(html).toContain('ℹ️');
    });
});

// ============================================================================
// getErrorStyles Tests
// ============================================================================

describe('getErrorStyles', () => {
    it('Test 49: should return CSS string', () => {
        const styles = getErrorStyles();
        
        expect(typeof styles).toBe('string');
        expect(styles.length).toBeGreaterThan(0);
    });

    it('Test 50: should include error list styles', () => {
        const styles = getErrorStyles();
        
        expect(styles).toContain('.error-list');
        expect(styles).toContain('.error-item');
        expect(styles).toContain('.error-header');
    });

    it('Test 51: should include severity-based styling', () => {
        const styles = getErrorStyles();
        
        expect(styles).toContain('.error-item.error');
        expect(styles).toContain('.error-item.warning');
        expect(styles).toContain('.error-item.info');
    });

    it('Test 52: should include VS Code CSS variables', () => {
        const styles = getErrorStyles();
        
        expect(styles).toContain('var(--vscode-');
    });
});

// ============================================================================
// Singleton Tests
// ============================================================================

describe('Singleton Pattern', () => {
    afterEach(() => {
        resetErrorHandler();
    });

    it('Test 53: getErrorHandler should return singleton instance', () => {
        const handler1 = getErrorHandler();
        const handler2 = getErrorHandler();
        
        expect(handler1).toBe(handler2);
    });

    it('Test 54: resetErrorHandler should clear singleton', () => {
        const handler1 = getErrorHandler();
        handler1.reportError('UNKNOWN_ERROR', 'Test');
        
        resetErrorHandler();
        const handler2 = getErrorHandler();
        
        expect(handler2).not.toBe(handler1);
        expect(handler2.getErrors()).toHaveLength(0);
    });

    it('Test 55: singleton should persist errors across calls', () => {
        const handler1 = getErrorHandler();
        handler1.reportError('UNKNOWN_ERROR', 'Persistent error');
        
        const handler2 = getErrorHandler();
        expect(handler2.getErrors()).toHaveLength(1);
        expect(handler2.getErrors()[0].message).toBe('Persistent error');
    });
});

// ============================================================================
// Edge Cases and Error Boundaries
// ============================================================================

describe('Edge Cases', () => {
    let handler: PlanErrorHandler;

    beforeEach(() => {
        handler = new PlanErrorHandler();
    });

    it('Test 56: should handle plan with only whitespace name', () => {
        const plan = createTestPlan({
            overview: { name: '   ', description: 'Test', goals: [] }
        });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        expect(errors.some(e => e.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
    });

    it('Test 57: should handle very long circular dependency chain', () => {
        const features = Array.from({ length: 10 }, (_, i) => 
            createTestFeature({ id: `f${i}`, name: `Feature ${i}` })
        );
        const links = features.map((_, i) => 
            createTestLink({ 
                id: `l${i}`, 
                sourceBlockId: `f${i}`, 
                targetBlockId: `f${(i + 1) % 10}`,
                dependencyType: 'requires'
            })
        );
        
        const plan = createTestPlan({ featureBlocks: features, blockLinks: links });
        const errors = validatePlanWithErrors(plan, handler);
        
        expect(errors.some(e => e.code === 'CIRCULAR_DEPENDENCY')).toBe(true);
    });

    it('Test 58: should not detect cycle for non-requires dependencies', () => {
        const plan = createTestPlan({
            featureBlocks: [
                createTestFeature({ id: 'f1' }),
                createTestFeature({ id: 'f2' }),
            ],
            blockLinks: [
                createTestLink({ id: 'l1', sourceBlockId: 'f1', targetBlockId: 'f2', dependencyType: 'suggests' }),
                createTestLink({ id: 'l2', sourceBlockId: 'f2', targetBlockId: 'f1', dependencyType: 'suggests' }),
            ]
        });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        expect(errors.some(e => e.code === 'CIRCULAR_DEPENDENCY')).toBe(false);
    });

    it('Test 59: should handle description fix when description is very long', () => {
        const longDesc = 'A'.repeat(3000);
        const feature = createTestFeature({ id: 'f1', description: longDesc });
        const plan = createTestPlan({ featureBlocks: [feature] });
        
        const error = handler.reportError('DESCRIPTION_TOO_LONG', 'Description too long', {
            location: { section: 'feature', itemId: 'f1' }
        });
        
        const recovery = handler.attemptAutoFix(error.id, plan);
        
        expect(recovery.success).toBe(true);
        expect(plan.featureBlocks[0].description.length).toBeLessThanOrEqual(2000);
    });

    it('Test 60: should handle multiple errors on same feature', () => {
        const feature = createTestFeature({ 
            id: 'f1', 
            name: 'A'.repeat(150), 
            acceptanceCriteria: [] 
        });
        const plan = createTestPlan({ featureBlocks: [feature] });
        
        const errors = validatePlanWithErrors(plan, handler);
        
        const f1Errors = errors.filter(e => e.location?.itemId === 'f1');
        expect(f1Errors.length).toBeGreaterThanOrEqual(2);
    });
});
