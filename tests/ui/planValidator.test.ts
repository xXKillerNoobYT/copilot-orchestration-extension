/**
 * Tests for Plan Validator (MT-033.13)
 *
 * Unit tests for the real-time validation engine that checks plans for issues
 * like missing fields, circular dependencies, vague requirements, and untestable
 * criteria. Covers all validation categories: required, format, length, dependency,
 * completeness, quality, consistency, smart, and duplicate.
 */

import {
    VALIDATION_RULES,
    validatePlan,
    validatePage,
    renderValidationPanel,
    getValidationPanelStyles,
    ValidationSeverity,
    ValidationIssue,
    ValidationCategory,
    ValidationResult,
} from '../../src/ui/planValidator';
import { CompletePlan, FeatureBlock, UserStory, DeveloperStory, SuccessCriterion, BlockLink } from '../../src/planning/types';
import { PLAN_CONSTRAINTS } from '../../src/planning/schema';

// Mock detectCycles from dependencyGraph
const mockDetectCycles = jest.fn<string[][], [CompletePlan]>();
jest.mock('../../src/ui/dependencyGraph', () => ({
    detectCycles: (plan: any) => mockDetectCycles(plan),
}));

// Mock planning/schema to provide PLAN_CONSTRAINTS
jest.mock('../../src/planning/schema', () => ({
    PLAN_CONSTRAINTS: {
        PROJECT_NAME_MIN: 3,
        PROJECT_NAME_MAX: 100,
        DESCRIPTION_MAX: 500,
        GOAL_MAX: 200,
        FEATURE_NAME_MAX: 100,
        FEATURE_DESC_MAX: 500,
        SUCCESS_CRITERIA_MAX: 1000,
        MIN_FEATURES: 1,
        MIN_USER_STORIES: 1,
        MIN_SUCCESS_CRITERIA: 1,
        MAX_GOALS: 10,
        MAX_FEATURES: 50,
        MAX_USER_STORIES: 100,
        MAX_DEV_STORIES: 100,
        MAX_SUCCESS_CRITERIA: 50,
    },
}));

// ============================================================================
// Helpers
// ============================================================================

function createFeatureBlock(overrides: Partial<FeatureBlock> = {}): FeatureBlock {
    return {
        id: `feature-${Math.random().toString(36).substr(2, 9)}`,
        name: 'Test Feature',
        description: 'A sufficiently long feature description for quality checks',
        purpose: 'Testing',
        acceptanceCriteria: ['Criterion 1'],
        technicalNotes: '',
        priority: 'medium',
        order: 0,
        ...overrides,
    };
}

function createUserStory(overrides: Partial<UserStory> = {}): UserStory {
    return {
        id: `story-${Math.random().toString(36).substr(2, 9)}`,
        userType: 'developer',
        action: 'perform an action',
        benefit: 'get some benefit',
        relatedBlockIds: [],
        acceptanceCriteria: [],
        priority: 'medium',
        ...overrides,
    };
}

function createDeveloperStory(overrides: Partial<DeveloperStory> = {}): DeveloperStory {
    return {
        id: `devstory-${Math.random().toString(36).substr(2, 9)}`,
        action: 'implement feature',
        benefit: 'improve performance',
        technicalRequirements: [],
        apiNotes: '',
        databaseNotes: '',
        estimatedHours: 4,
        relatedBlockIds: [],
        relatedTaskIds: [],
        ...overrides,
    };
}

function createSuccessCriterion(overrides: Partial<SuccessCriterion> = {}): SuccessCriterion {
    return {
        id: `criterion-${Math.random().toString(36).substr(2, 9)}`,
        description: 'Load time under 2 seconds',
        smartAttributes: {
            specific: true,
            measurable: true,
            achievable: true,
            relevant: true,
            timeBound: true,
        },
        relatedFeatureIds: [],
        relatedStoryIds: [],
        testable: true,
        priority: 'high',
        ...overrides,
    };
}

function createBlockLink(overrides: Partial<BlockLink> = {}): BlockLink {
    return {
        id: `link-${Math.random().toString(36).substr(2, 9)}`,
        sourceBlockId: 'source-id',
        targetBlockId: 'target-id',
        dependencyType: 'requires',
        ...overrides,
    };
}

function createValidPlan(overrides: Partial<CompletePlan> = {}): CompletePlan {
    const feature = createFeatureBlock({ id: 'feature-1' });
    return {
        metadata: {
            id: 'plan-1',
            name: 'Test Plan',
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
        },
        overview: {
            name: 'Test Project',
            description: 'A complete project for testing the validator',
            goals: ['Build a functional app'],
        },
        featureBlocks: [feature],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [createUserStory()],
        developerStories: [createDeveloperStory()],
        successCriteria: [createSuccessCriterion()],
        ...overrides,
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('Plan Validator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDetectCycles.mockReturnValue([]);
    });

    // =========================================================================
    // REQUIRED FIELDS VALIDATION
    // =========================================================================

    describe('Required Fields Validation', () => {
        it('Test 1: should detect missing project name', () => {
            const plan = createValidPlan({
                overview: { name: '', description: 'desc', goals: [] },
            });
            const issues = VALIDATION_RULES.validateProjectName(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('REQ-001');
            expect(issues[0].severity).toBe('error');
            expect(issues[0].category).toBe('required');
            expect(issues[0].fieldPath).toBe('overview.name');
        });

        it('Test 2: should pass when project name is present', () => {
            const plan = createValidPlan();
            const issues = VALIDATION_RULES.validateProjectName(plan);
            expect(issues).toHaveLength(0);
        });

        it('Test 3: should detect whitespace-only project name', () => {
            const plan = createValidPlan({
                overview: { name: '   ', description: '', goals: [] },
            });
            const issues = VALIDATION_RULES.validateProjectName(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('REQ-001');
        });

        it('Test 4: should detect missing feature names', () => {
            const plan = createValidPlan({
                featureBlocks: [
                    createFeatureBlock({ name: '' }),
                    createFeatureBlock({ name: 'Valid Feature' }),
                    createFeatureBlock({ name: '  ' }),
                ],
            });
            const issues = VALIDATION_RULES.validateFeatureNames(plan);
            expect(issues).toHaveLength(2);
            expect(issues[0].id).toBe('REQ-005-0');
            expect(issues[1].id).toBe('REQ-005-2');
        });

        it('Test 5: should detect missing user story fields', () => {
            const plan = createValidPlan({
                userStories: [
                    createUserStory({ userType: '', action: '', benefit: '' }),
                ],
            });
            const issues = VALIDATION_RULES.validateUserStoryFields(plan);
            expect(issues).toHaveLength(3);
            expect(issues[0].id).toContain('REQ-008');
            expect(issues[0].category).toBe('required');
            expect(issues[1].id).toContain('REQ-008');
            expect(issues[2].id).toContain('REQ-008');
        });

        it('Test 6: should detect missing developer story action', () => {
            const plan = createValidPlan({
                developerStories: [createDeveloperStory({ action: '', estimatedHours: 0 })],
            });
            const issues = VALIDATION_RULES.validateDeveloperStoryFields(plan);
            expect(issues).toHaveLength(2);
            expect(issues[0].severity).toBe('error');
            expect(issues[0].category).toBe('required');
            expect(issues[1].severity).toBe('warning');
        });

        it('Test 7: should detect missing success criteria description', () => {
            const plan = createValidPlan({
                successCriteria: [createSuccessCriterion({ description: '' })],
            });
            const issues = VALIDATION_RULES.validateSuccessCriteriaDescription(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toContain('REQ-010');
            expect(issues[0].severity).toBe('error');
        });
    });

    // =========================================================================
    // LENGTH VALIDATION
    // =========================================================================

    describe('Length Validation', () => {
        it('Test 8: should detect project name too short', () => {
            const plan = createValidPlan({
                overview: { name: 'AB', description: '', goals: [] },
            });
            const issues = VALIDATION_RULES.validateProjectNameLength(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('REQ-002');
            expect(issues[0].severity).toBe('error');
            expect(issues[0].category).toBe('length');
        });

        it('Test 9: should detect project name too long', () => {
            const longName = 'A'.repeat(PLAN_CONSTRAINTS.PROJECT_NAME_MAX + 1);
            const plan = createValidPlan({
                overview: { name: longName, description: '', goals: [] },
            });
            const issues = VALIDATION_RULES.validateProjectNameLength(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('REQ-003');
            expect(issues[0].autoFixable).toBe(true);
            expect(issues[0].autoFixAction).toBe('truncateProjectName');
        });

        it('Test 10: should not flag empty project name for length (handled by required rule)', () => {
            const plan = createValidPlan({
                overview: { name: '', description: '', goals: [] },
            });
            const issues = VALIDATION_RULES.validateProjectNameLength(plan);
            expect(issues).toHaveLength(0);
        });

        it('Test 11: should pass project name at exact minimum length', () => {
            const plan = createValidPlan({
                overview: { name: 'ABC', description: '', goals: [] },
            });
            const issues = VALIDATION_RULES.validateProjectNameLength(plan);
            expect(issues).toHaveLength(0);
        });

        it('Test 12: should pass project name at exact maximum length', () => {
            const exactMax = 'A'.repeat(PLAN_CONSTRAINTS.PROJECT_NAME_MAX);
            const plan = createValidPlan({
                overview: { name: exactMax, description: '', goals: [] },
            });
            const issues = VALIDATION_RULES.validateProjectNameLength(plan);
            expect(issues).toHaveLength(0);
        });
    });

    // =========================================================================
    // SIZE LIMITS VALIDATION
    // =========================================================================

    describe('Size Limits Validation', () => {
        it('Test 13: should detect too many features', () => {
            const features = Array.from({ length: 51 }, (_, i) =>
                createFeatureBlock({ id: `f-${i}`, name: `Feature ${i}` })
            );
            const plan = createValidPlan({ featureBlocks: features });
            const issues = VALIDATION_RULES.validateMaxFeatures(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('SIZE-001');
            expect(issues[0].severity).toBe('error');
            expect(issues[0].category).toBe('length');
        });

        it('Test 14: should detect too many user stories', () => {
            const stories = Array.from({ length: 101 }, (_, i) =>
                createUserStory({ id: `s-${i}` })
            );
            const plan = createValidPlan({ userStories: stories });
            const issues = VALIDATION_RULES.validateMaxUserStories(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('SIZE-002');
            expect(issues[0].severity).toBe('warning');
        });

        it('Test 15: should detect too many goals', () => {
            const goals = Array.from({ length: 11 }, (_, i) => `Goal ${i}`);
            const plan = createValidPlan({
                overview: { name: 'Test', description: '', goals },
            });
            const issues = VALIDATION_RULES.validateMaxGoals(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('SIZE-003');
        });

        it('Test 16: should pass with features at exact max limit', () => {
            const features = Array.from({ length: 50 }, (_, i) =>
                createFeatureBlock({ id: `f-${i}`, name: `Feature ${i}` })
            );
            const plan = createValidPlan({ featureBlocks: features });
            const issues = VALIDATION_RULES.validateMaxFeatures(plan);
            expect(issues).toHaveLength(0);
        });
    });

    // =========================================================================
    // COMPLETENESS VALIDATION
    // =========================================================================

    describe('Completeness Validation', () => {
        it('Test 17: should warn when no feature blocks exist', () => {
            const plan = createValidPlan({ featureBlocks: [] });
            const issues = VALIDATION_RULES.validateMinimumFeatures(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('REQ-004');
            expect(issues[0].severity).toBe('error');
        });

        it('Test 18: should warn when no user stories exist', () => {
            const plan = createValidPlan({ userStories: [] });
            const issues = VALIDATION_RULES.validateMinimumUserStories(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('REQ-006');
            expect(issues[0].severity).toBe('warning');
            expect(issues[0].category).toBe('completeness');
        });

        it('Test 19: should warn when no success criteria exist', () => {
            const plan = createValidPlan({ successCriteria: [] });
            const issues = VALIDATION_RULES.validateMinimumSuccessCriteria(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('REQ-007');
        });

        it('Test 20: should warn about features missing acceptance criteria', () => {
            const plan = createValidPlan({
                featureBlocks: [createFeatureBlock({ acceptanceCriteria: [] })],
            });
            const issues = VALIDATION_RULES.validateAcceptanceCriteria(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].category).toBe('completeness');
            expect(issues[0].severity).toBe('warning');
        });
    });

    // =========================================================================
    // DEPENDENCY VALIDATION
    // =========================================================================

    describe('Dependency Validation', () => {
        it('Test 21: should detect circular dependencies from detectCycles', () => {
            const f1 = createFeatureBlock({ id: 'fb-1', name: 'Auth' });
            const f2 = createFeatureBlock({ id: 'fb-2', name: 'Login' });
            const plan = createValidPlan({
                featureBlocks: [f1, f2],
            });
            mockDetectCycles.mockReturnValue([['fb-1', 'fb-2']]);

            const issues = VALIDATION_RULES.validateNoCircularDependencies(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('DEP-001-0');
            expect(issues[0].severity).toBe('error');
            expect(issues[0].category).toBe('dependency');
            expect(issues[0].message).toContain('Auth');
            expect(issues[0].message).toContain('Login');
        });

        it('Test 22: should detect self-referencing links', () => {
            const plan = createValidPlan({
                blockLinks: [
                    createBlockLink({ sourceBlockId: 'same-id', targetBlockId: 'same-id' }),
                ],
            });
            const issues = VALIDATION_RULES.validateNoSelfLinks(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('DEP-003-0');
            expect(issues[0].autoFixable).toBe(true);
            expect(issues[0].autoFixAction).toBe('removeSelfLink');
        });

        it('Test 23: should detect duplicate links', () => {
            const plan = createValidPlan({
                blockLinks: [
                    createBlockLink({ sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
                    createBlockLink({ sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
                ],
            });
            const issues = VALIDATION_RULES.validateNoDuplicateLinks(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('DEP-004-1');
            expect(issues[0].category).toBe('duplicate');
            expect(issues[0].autoFixable).toBe(true);
        });

        it('Test 24: should allow same source/target with different dependency types', () => {
            const plan = createValidPlan({
                blockLinks: [
                    createBlockLink({ sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'requires' }),
                    createBlockLink({ sourceBlockId: 'a', targetBlockId: 'b', dependencyType: 'suggests' }),
                ],
            });
            const issues = VALIDATION_RULES.validateNoDuplicateLinks(plan);
            expect(issues).toHaveLength(0);
        });

        it('Test 25: should detect invalid block link references', () => {
            const feature = createFeatureBlock({ id: 'valid-id' });
            const plan = createValidPlan({
                featureBlocks: [feature],
                blockLinks: [
                    createBlockLink({ sourceBlockId: 'invalid-source', targetBlockId: 'valid-id' }),
                    createBlockLink({ sourceBlockId: 'valid-id', targetBlockId: 'invalid-target' }),
                ],
            });
            const issues = VALIDATION_RULES.validateBlockLinkReferences(plan);
            expect(issues).toHaveLength(2);
            expect(issues[0].id).toContain('DEP-002');
            expect(issues[0].category).toBe('consistency');
            expect(issues[0].autoFixable).toBe(true);
            expect(issues[1].id).toContain('DEP-002');
        });

        it('Test 26: should detect orphaned features when multiple features exist', () => {
            const f1 = createFeatureBlock({ id: 'f-1', name: 'Feature 1' });
            const f2 = createFeatureBlock({ id: 'f-2', name: 'Feature 2' });
            const f3 = createFeatureBlock({ id: 'f-3', name: 'Feature 3' });
            const plan = createValidPlan({
                featureBlocks: [f1, f2, f3],
                blockLinks: [
                    createBlockLink({ sourceBlockId: 'f-1', targetBlockId: 'f-2' }),
                ],
            });
            const issues = VALIDATION_RULES.validateOrphanedFeatures(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].message).toContain('Feature 3');
            expect(issues[0].severity).toBe('info');
            expect(issues[0].category).toBe('completeness');
        });

        it('Test 27: should not flag orphaned features when only one feature exists', () => {
            const plan = createValidPlan({
                featureBlocks: [createFeatureBlock({ id: 'f-1' })],
                blockLinks: [],
            });
            const issues = VALIDATION_RULES.validateOrphanedFeatures(plan);
            expect(issues).toHaveLength(0);
        });
    });

    // =========================================================================
    // QUALITY VALIDATION
    // =========================================================================

    describe('Quality Validation', () => {
        it('Test 28: should detect vague language in description', () => {
            const plan = createValidPlan({
                overview: {
                    name: 'Test',
                    description: 'This project does stuff and things',
                    goals: [],
                },
            });
            const issues = VALIDATION_RULES.validateDescriptionQuality(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('QUAL-001');
            expect(issues[0].severity).toBe('warning');
            expect(issues[0].category).toBe('quality');
        });

        it('Test 29: should not flag quality when description has no vague words', () => {
            const plan = createValidPlan({
                overview: {
                    name: 'Test',
                    description: 'A REST API for user authentication using JWT tokens',
                    goals: [],
                },
            });
            const issues = VALIDATION_RULES.validateDescriptionQuality(plan);
            expect(issues).toHaveLength(0);
        });

        it('Test 30: should detect short feature descriptions', () => {
            const plan = createValidPlan({
                featureBlocks: [createFeatureBlock({ description: 'Too short' })],
            });
            const issues = VALIDATION_RULES.validateFeatureDescriptionLength(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toContain('QUAL-002');
            expect(issues[0].severity).toBe('warning');
            expect(issues[0].category).toBe('quality');
        });

        it('Test 31: should detect unmeasurable goals with vague words', () => {
            const plan = createValidPlan({
                overview: {
                    name: 'Test',
                    description: '',
                    goals: ['Improve the user experience'],
                },
            });
            const issues = VALIDATION_RULES.validateGoalMeasurability(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toContain('QUAL-004');
            expect(issues[0].category).toBe('quality');
        });

        it('Test 32: should not flag goals with vague words but also numbers', () => {
            const plan = createValidPlan({
                overview: {
                    name: 'Test',
                    description: '',
                    goals: ['Improve load time by 50%'],
                },
            });
            const issues = VALIDATION_RULES.validateGoalMeasurability(plan);
            expect(issues).toHaveLength(0);
        });

        it('Test 33: should detect multi-action user stories', () => {
            const plan = createValidPlan({
                userStories: [
                    createUserStory({ action: 'log in and view dashboard' }),
                ],
            });
            const issues = VALIDATION_RULES.validateUserStoryGranularity(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toContain('QUAL-005');
            expect(issues[0].severity).toBe('info');
            expect(issues[0].category).toBe('quality');
        });

        it('Test 34: should detect "also" conjunction in user stories', () => {
            const plan = createValidPlan({
                userStories: [
                    createUserStory({ action: 'create account and also set preferences' }),
                ],
            });
            const issues = VALIDATION_RULES.validateUserStoryGranularity(plan);
            expect(issues).toHaveLength(1);
        });

        it('Test 35: should not flag single-action user stories', () => {
            const plan = createValidPlan({
                userStories: [createUserStory({ action: 'view my dashboard' })],
            });
            const issues = VALIDATION_RULES.validateUserStoryGranularity(plan);
            expect(issues).toHaveLength(0);
        });
    });

    // =========================================================================
    // SMART CRITERIA VALIDATION
    // =========================================================================

    describe('SMART Criteria Validation', () => {
        it('Test 36: should detect missing SMART attributes (3+ missing = warning)', () => {
            const plan = createValidPlan({
                successCriteria: [
                    createSuccessCriterion({
                        smartAttributes: {
                            specific: false,
                            measurable: false,
                            achievable: false,
                            relevant: true,
                            timeBound: true,
                        },
                    }),
                ],
            });
            const issues = VALIDATION_RULES.validateSMARTCriteria(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toContain('SMART-001');
            expect(issues[0].severity).toBe('warning');
            expect(issues[0].category).toBe('smart');
            expect(issues[0].message).toContain('Specific');
            expect(issues[0].message).toContain('Measurable');
            expect(issues[0].message).toContain('Achievable');
        });

        it('Test 37: should report info severity when fewer than 3 SMART attributes missing', () => {
            const plan = createValidPlan({
                successCriteria: [
                    createSuccessCriterion({
                        smartAttributes: {
                            specific: true,
                            measurable: true,
                            achievable: true,
                            relevant: false,
                            timeBound: false,
                        },
                    }),
                ],
            });
            const issues = VALIDATION_RULES.validateSMARTCriteria(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].severity).toBe('info');
            expect(issues[0].message).toContain('Relevant');
            expect(issues[0].message).toContain('Time-bound');
        });

        it('Test 38: should pass when all SMART attributes are set', () => {
            const plan = createValidPlan({
                successCriteria: [createSuccessCriterion()],
            });
            const issues = VALIDATION_RULES.validateSMARTCriteria(plan);
            expect(issues).toHaveLength(0);
        });

        it('Test 39: should detect untestable success criteria', () => {
            const plan = createValidPlan({
                successCriteria: [createSuccessCriterion({ testable: false })],
            });
            const issues = VALIDATION_RULES.validateTestability(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toContain('SMART-002');
            expect(issues[0].severity).toBe('warning');
            expect(issues[0].category).toBe('smart');
        });

        it('Test 40: should pass testable success criteria', () => {
            const plan = createValidPlan({
                successCriteria: [createSuccessCriterion({ testable: true })],
            });
            const issues = VALIDATION_RULES.validateTestability(plan);
            expect(issues).toHaveLength(0);
        });
    });

    // =========================================================================
    // DUPLICATE VALIDATION
    // =========================================================================

    describe('Duplicate Validation', () => {
        it('Test 41: should detect duplicate feature names (case-insensitive)', () => {
            const plan = createValidPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'f1', name: 'Authentication' }),
                    createFeatureBlock({ id: 'f2', name: 'authentication' }),
                ],
            });
            const issues = VALIDATION_RULES.validateNoDuplicateFeatureNames(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toContain('DUP-001');
            expect(issues[0].category).toBe('duplicate');
            expect(issues[0].message).toContain('authentication');
            expect(issues[0].message).toContain('2 times');
        });

        it('Test 42: should not flag unique feature names', () => {
            const plan = createValidPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'f1', name: 'Authentication' }),
                    createFeatureBlock({ id: 'f2', name: 'Dashboard' }),
                ],
            });
            const issues = VALIDATION_RULES.validateNoDuplicateFeatureNames(plan);
            expect(issues).toHaveLength(0);
        });

        it('Test 43: should detect duplicate goals', () => {
            const plan = createValidPlan({
                overview: {
                    name: 'Test',
                    description: '',
                    goals: ['Build login system', 'Build login system'],
                },
            });
            const issues = VALIDATION_RULES.validateNoDuplicateGoals(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].id).toContain('DUP-002');
            expect(issues[0].category).toBe('duplicate');
            expect(issues[0].autoFixable).toBe(true);
            expect(issues[0].autoFixAction).toBe('removeDuplicateGoal');
        });

        it('Test 44: should detect case-insensitive duplicate goals', () => {
            const plan = createValidPlan({
                overview: {
                    name: 'Test',
                    description: '',
                    goals: ['Improve Performance', 'improve performance'],
                },
            });
            const issues = VALIDATION_RULES.validateNoDuplicateGoals(plan);
            expect(issues).toHaveLength(1);
        });
    });

    // =========================================================================
    // validatePlan (Integration)
    // =========================================================================

    describe('validatePlan', () => {
        it('Test 45: should return valid=true for a fully valid plan', () => {
            const plan = createValidPlan();
            const result = validatePlan(plan);
            expect(result.valid).toBe(true);
            expect(result.counts.errors).toBe(0);
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('Test 46: should return valid=false when errors exist', () => {
            const plan = createValidPlan({
                overview: { name: '', description: '', goals: [] },
                featureBlocks: [],
            });
            const result = validatePlan(plan);
            expect(result.valid).toBe(false);
            expect(result.counts.errors).toBeGreaterThan(0);
        });

        it('Test 47: should return valid=true even with warnings but no errors', () => {
            const plan = createValidPlan({
                userStories: [],
                successCriteria: [],
            });
            const result = validatePlan(plan);
            // No errors from missing user stories/criteria (those are warnings)
            // but featureBlocks and name are present so no errors
            expect(result.valid).toBe(true);
            expect(result.counts.warnings).toBeGreaterThan(0);
        });

        it('Test 48: should aggregate issues from all validation rules', () => {
            const plan = createValidPlan({
                overview: { name: '', description: 'stuff everywhere', goals: [] },
                featureBlocks: [],
                userStories: [],
                successCriteria: [],
            });
            const result = validatePlan(plan);
            // Should have multiple issues from different rules
            expect(result.issues.length).toBeGreaterThan(2);
            const categories = new Set(result.issues.map(i => i.category));
            expect(categories.size).toBeGreaterThan(1);
        });

        it('Test 49: should correctly count errors, warnings, and infos', () => {
            const f1 = createFeatureBlock({ id: 'f-1', name: 'Feature 1' });
            const f2 = createFeatureBlock({ id: 'f-2', name: 'Feature 2' });
            const f3 = createFeatureBlock({ id: 'f-3', name: 'Orphan' });
            const plan = createValidPlan({
                featureBlocks: [f1, f2, f3],
                blockLinks: [
                    createBlockLink({ sourceBlockId: 'f-1', targetBlockId: 'f-2' }),
                ],
                userStories: [],
                successCriteria: [],
            });
            const result = validatePlan(plan);
            expect(result.counts.errors).toBe(
                result.issues.filter(i => i.severity === 'error').length
            );
            expect(result.counts.warnings).toBe(
                result.issues.filter(i => i.severity === 'warning').length
            );
            expect(result.counts.infos).toBe(
                result.issues.filter(i => i.severity === 'info').length
            );
        });

        it('Test 50: should continue validation even if a rule throws an error', () => {
            // Spy on console.error to suppress noise
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const plan = createValidPlan();

            // Temporarily add a broken rule
            const originalRule = VALIDATION_RULES.validateProjectName;
            VALIDATION_RULES.validateProjectName = () => { throw new Error('boom'); };

            const result = validatePlan(plan);
            // Should still return a result (other rules still ran)
            expect(result).toBeDefined();
            expect(result.timestamp).toBeInstanceOf(Date);

            // Restore
            VALIDATION_RULES.validateProjectName = originalRule;
            consoleSpy.mockRestore();
        });
    });

    // =========================================================================
    // validatePage
    // =========================================================================

    describe('validatePage', () => {
        it('Test 51: should validate only page 1 rules for page 1', () => {
            const plan = createValidPlan({
                overview: { name: '', description: '', goals: [] },
                featureBlocks: [],
            });
            const result = validatePage(plan, 1);
            // Page 1 checks project name rules and goals
            const issueIds = result.issues.map(i => i.id);
            expect(issueIds.some(id => id.startsWith('REQ-001') || id.startsWith('REQ-002') || id.startsWith('REQ-003'))).toBe(true);
            // Should NOT include feature-level issues since that is page 2
            expect(issueIds.some(id => id.startsWith('REQ-004'))).toBe(false);
        });

        it('Test 52: should validate page 2 rules for features', () => {
            const plan = createValidPlan({ featureBlocks: [] });
            const result = validatePage(plan, 2);
            const issueIds = result.issues.map(i => i.id);
            expect(issueIds).toContain('REQ-004');
        });

        it('Test 53: should run all rules for page 7 (review page)', () => {
            const plan = createValidPlan({
                overview: { name: '', description: '', goals: [] },
                featureBlocks: [],
            });
            const resultPage7 = validatePage(plan, 7);
            const resultFull = validatePlan(plan);
            // Page 7 delegates to validatePlan so issue counts should match
            expect(resultPage7.issues.length).toBe(resultFull.issues.length);
        });

        it('Test 54: should return valid result for unknown page number', () => {
            const plan = createValidPlan();
            const result = validatePage(plan, 99);
            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it('Test 55: should validate dependency rules on page 3', () => {
            const plan = createValidPlan({
                blockLinks: [
                    createBlockLink({ sourceBlockId: 'self', targetBlockId: 'self' }),
                ],
            });
            const result = validatePage(plan, 3);
            expect(result.issues.some(i => i.category === 'dependency')).toBe(true);
        });

        it('Test 56: should validate SMART criteria on page 6', () => {
            const plan = createValidPlan({
                successCriteria: [
                    createSuccessCriterion({
                        testable: false,
                        smartAttributes: {
                            specific: false,
                            measurable: false,
                            achievable: false,
                            relevant: false,
                            timeBound: false,
                        },
                    }),
                ],
            });
            const result = validatePage(plan, 6);
            expect(result.issues.some(i => i.category === 'smart')).toBe(true);
        });
    });

    // =========================================================================
    // renderValidationPanel
    // =========================================================================

    describe('renderValidationPanel', () => {
        it('Test 57: should render success message when no issues', () => {
            const result: ValidationResult = {
                valid: true,
                issues: [],
                counts: { errors: 0, warnings: 0, infos: 0 },
                timestamp: new Date(),
            };
            const html = renderValidationPanel(result);
            expect(html).toContain('validation-success');
            expect(html).toContain('All checks passed');
        });

        it('Test 58: should render error issues with error styling', () => {
            const result: ValidationResult = {
                valid: false,
                issues: [{
                    id: 'ERR-1',
                    severity: 'error',
                    category: 'required',
                    message: 'Missing field',
                    fieldPath: 'overview.name',
                    suggestion: 'Add it',
                }],
                counts: { errors: 1, warnings: 0, infos: 0 },
                timestamp: new Date(),
            };
            const html = renderValidationPanel(result);
            expect(html).toContain('1 errors');
            expect(html).toContain('Missing field');
            expect(html).toContain('Add it');
        });

        it('Test 59: should render auto-fix buttons for fixable issues', () => {
            const result: ValidationResult = {
                valid: false,
                issues: [{
                    id: 'FIX-1',
                    severity: 'error',
                    category: 'length',
                    message: 'Too long',
                    autoFixable: true,
                    autoFixAction: 'truncate',
                }],
                counts: { errors: 1, warnings: 0, infos: 0 },
                timestamp: new Date(),
            };
            const html = renderValidationPanel(result);
            expect(html).toContain('btn-fix');
            expect(html).toContain("autoFix('FIX-1', 'truncate')");
        });

        it('Test 60: should escape HTML in messages', () => {
            const result: ValidationResult = {
                valid: false,
                issues: [{
                    id: 'XSS-1',
                    severity: 'warning',
                    category: 'quality',
                    message: '<script>alert("xss")</script>',
                }],
                counts: { errors: 0, warnings: 1, infos: 0 },
                timestamp: new Date(),
            };
            const html = renderValidationPanel(result);
            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('Test 61: should render all severity types in the summary', () => {
            const result: ValidationResult = {
                valid: false,
                issues: [
                    { id: '1', severity: 'error', category: 'required', message: 'err' },
                    { id: '2', severity: 'warning', category: 'quality', message: 'warn' },
                    { id: '3', severity: 'info', category: 'completeness', message: 'info' },
                ],
                counts: { errors: 1, warnings: 1, infos: 1 },
                timestamp: new Date(),
            };
            const html = renderValidationPanel(result);
            expect(html).toContain('1 errors');
            expect(html).toContain('1 warnings');
            expect(html).toContain('1 suggestions');
        });
    });

    // =========================================================================
    // getValidationPanelStyles
    // =========================================================================

    describe('getValidationPanelStyles', () => {
        it('Test 62: should return CSS string with validation panel styles', () => {
            const css = getValidationPanelStyles();
            expect(css).toContain('.validation-panel');
            expect(css).toContain('.validation-success');
            expect(css).toContain('.validation-issue');
            expect(css).toContain('.count.error');
            expect(css).toContain('.count.warning');
            expect(css).toContain('.count.info');
            expect(css).toContain('.btn-fix');
        });
    });

    // =========================================================================
    // EDGE CASES
    // =========================================================================

    describe('Edge Cases', () => {
        it('Test 63: should handle plan with all empty arrays', () => {
            const plan = createValidPlan({
                featureBlocks: [],
                blockLinks: [],
                conditionalLogic: [],
                userStories: [],
                developerStories: [],
                successCriteria: [],
            });
            const result = validatePlan(plan);
            // Should not throw, should produce issues for missing required items
            expect(result).toBeDefined();
            expect(result.issues.length).toBeGreaterThan(0);
        });

        it('Test 64: should handle multiple circular dependency cycles', () => {
            const plan = createValidPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'a', name: 'A' }),
                    createFeatureBlock({ id: 'b', name: 'B' }),
                    createFeatureBlock({ id: 'c', name: 'C' }),
                    createFeatureBlock({ id: 'd', name: 'D' }),
                ],
            });
            mockDetectCycles.mockReturnValue([
                ['a', 'b'],
                ['c', 'd'],
            ]);

            const issues = VALIDATION_RULES.validateNoCircularDependencies(plan);
            expect(issues).toHaveLength(2);
            expect(issues[0].id).toBe('DEP-001-0');
            expect(issues[1].id).toBe('DEP-001-1');
        });

        it('Test 65: should handle unknown feature IDs in cycles gracefully', () => {
            const plan = createValidPlan({
                featureBlocks: [createFeatureBlock({ id: 'known', name: 'Known' })],
            });
            mockDetectCycles.mockReturnValue([['known', 'unknown-id']]);

            const issues = VALIDATION_RULES.validateNoCircularDependencies(plan);
            expect(issues).toHaveLength(1);
            // Unknown ID should be used as-is when feature not found
            expect(issues[0].message).toContain('Known');
            expect(issues[0].message).toContain('unknown-id');
        });

        it('Test 66: should handle description with multiple vague phrases (only one issue)', () => {
            const plan = createValidPlan({
                overview: {
                    name: 'Test',
                    description: 'This has stuff and things and misc and etc',
                    goals: [],
                },
            });
            const issues = VALIDATION_RULES.validateDescriptionQuality(plan);
            // Should break after first match
            expect(issues).toHaveLength(1);
        });

        it('Test 67: should handle feature description exactly at 20 characters', () => {
            const plan = createValidPlan({
                featureBlocks: [createFeatureBlock({ description: '12345678901234567890' })],
            });
            const issues = VALIDATION_RULES.validateFeatureDescriptionLength(plan);
            expect(issues).toHaveLength(0);
        });

        it('Test 68: should handle undefined description in feature gracefully', () => {
            const plan = createValidPlan({
                featureBlocks: [createFeatureBlock({ description: undefined as any })],
            });
            const issues = VALIDATION_RULES.validateFeatureDescriptionLength(plan);
            expect(issues).toHaveLength(1);
        });

        it('Test 69: should handle developer story with zero estimated hours as warning', () => {
            const plan = createValidPlan({
                developerStories: [createDeveloperStory({ estimatedHours: 0 })],
            });
            const issues = VALIDATION_RULES.validateDeveloperStoryFields(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].severity).toBe('warning');
            expect(issues[0].fieldPath).toContain('estimatedHours');
        });

        it('Test 70: should handle developer story with negative estimated hours as warning', () => {
            const plan = createValidPlan({
                developerStories: [createDeveloperStory({ estimatedHours: -5 })],
            });
            const issues = VALIDATION_RULES.validateDeveloperStoryFields(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].severity).toBe('warning');
        });

        it('Test 71: should handle goals without vague words as passing', () => {
            const plan = createValidPlan({
                overview: {
                    name: 'Test',
                    description: '',
                    goals: ['Implement user authentication', 'Deploy to production'],
                },
            });
            const issues = VALIDATION_RULES.validateGoalMeasurability(plan);
            expect(issues).toHaveLength(0);
        });

        it('Test 72: should handle all SMART attributes missing with warning severity', () => {
            const plan = createValidPlan({
                successCriteria: [
                    createSuccessCriterion({
                        smartAttributes: {
                            specific: false,
                            measurable: false,
                            achievable: false,
                            relevant: false,
                            timeBound: false,
                        },
                    }),
                ],
            });
            const issues = VALIDATION_RULES.validateSMARTCriteria(plan);
            expect(issues).toHaveLength(1);
            expect(issues[0].severity).toBe('warning');
            expect(issues[0].message).toContain('Specific');
            expect(issues[0].message).toContain('Measurable');
            expect(issues[0].message).toContain('Achievable');
            expect(issues[0].message).toContain('Relevant');
            expect(issues[0].message).toContain('Time-bound');
        });

        it('Test 73: should handle empty blockLinks without errors in orphan check', () => {
            const plan = createValidPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'f1' }),
                    createFeatureBlock({ id: 'f2' }),
                ],
                blockLinks: [],
            });
            const issues = VALIDATION_RULES.validateOrphanedFeatures(plan);
            // Both features are orphaned
            expect(issues).toHaveLength(2);
        });

        it('Test 74: should handle whitespace-only user story fields', () => {
            const plan = createValidPlan({
                userStories: [
                    createUserStory({ userType: '  ', action: '   ', benefit: '\t' }),
                ],
            });
            const issues = VALIDATION_RULES.validateUserStoryFields(plan);
            expect(issues).toHaveLength(3);
        });
    });

    // =========================================================================
    // VALIDATION_RULES object structure
    // =========================================================================

    describe('VALIDATION_RULES structure', () => {
        it('Test 75: should export all expected rule functions', () => {
            const expectedRules = [
                'validateProjectName',
                'validateProjectNameLength',
                'validateMinimumFeatures',
                'validateFeatureNames',
                'validateMinimumUserStories',
                'validateMinimumSuccessCriteria',
                'validateUserStoryFields',
                'validateDeveloperStoryFields',
                'validateSuccessCriteriaDescription',
                'validateNoCircularDependencies',
                'validateBlockLinkReferences',
                'validateNoSelfLinks',
                'validateNoDuplicateLinks',
                'validateOrphanedFeatures',
                'validateDescriptionQuality',
                'validateFeatureDescriptionLength',
                'validateAcceptanceCriteria',
                'validateGoalMeasurability',
                'validateUserStoryGranularity',
                'validateSMARTCriteria',
                'validateTestability',
                'validateNoDuplicateFeatureNames',
                'validateNoDuplicateGoals',
                'validateMaxFeatures',
                'validateMaxUserStories',
                'validateMaxGoals',
            ];

            for (const ruleName of expectedRules) {
                expect(VALIDATION_RULES).toHaveProperty(ruleName);
                expect(typeof VALIDATION_RULES[ruleName]).toBe('function');
            }
        });

        it('Test 76: should have each rule return an array', () => {
            const plan = createValidPlan();
            for (const [name, ruleFn] of Object.entries(VALIDATION_RULES)) {
                const result = ruleFn(plan);
                expect(Array.isArray(result)).toBe(true);
            }
        });
    });
});
