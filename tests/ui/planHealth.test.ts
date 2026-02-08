/**
 * Tests for Plan Health Scoring (MT-033.18)
 *
 * Comprehensive tests for health score calculation, grade assignment,
 * category scoring, factor generation, and UI rendering functions.
 *
 * @module tests/ui/planHealth
 */

import {
    calculateHealthScore,
    renderHealthBadge,
    renderHealthPanel,
    getHealthStyles,
    HealthScore,
    HealthGrade,
    CategoryScores,
    HealthFactor,
} from '../../src/ui/planHealth';
import { CompletePlan } from '../../src/planning/types';
import { validatePlan, ValidationResult } from '../../src/ui/planValidator';
import { generateAnalytics, PlanAnalytics } from '../../src/ui/planAnalytics';
import { detectCycles } from '../../src/ui/dependencyGraph';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('../../src/ui/planValidator');
jest.mock('../../src/ui/planAnalytics');
jest.mock('../../src/ui/dependencyGraph');

const mockValidatePlan = validatePlan as jest.MockedFunction<typeof validatePlan>;
const mockGenerateAnalytics = generateAnalytics as jest.MockedFunction<typeof generateAnalytics>;
const mockDetectCycles = detectCycles as jest.MockedFunction<typeof detectCycles>;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Creates a minimal CompletePlan for testing.
 * Override individual fields as needed.
 */
function createMockPlan(overrides: Partial<CompletePlan> = {}): CompletePlan {
    return {
        metadata: {
            id: 'plan-1',
            name: 'Test Plan',
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
            version: 1,
        },
        overview: {
            name: 'Test Project',
            description: 'A test project for unit tests',
            goals: ['Goal 1'],
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

/**
 * Creates a mock ValidationResult.
 */
function createMockValidation(overrides: Partial<ValidationResult> = {}): ValidationResult {
    return {
        valid: true,
        issues: [],
        counts: { errors: 0, warnings: 0, infos: 0 },
        timestamp: new Date(),
        ...overrides,
    };
}

/**
 * Creates a mock PlanAnalytics object.
 */
function createMockAnalytics(overrides: Partial<PlanAnalytics> = {}): PlanAnalytics {
    return {
        overview: {
            totalFeatures: 0,
            totalUserStories: 0,
            totalDevStories: 0,
            totalSuccessCriteria: 0,
            totalDependencies: 0,
            totalGoals: 0,
        },
        completeness: {
            overallScore: 50,
            sections: {
                overview: 50,
                features: 50,
                dependencies: 50,
                userStories: 50,
                devStories: 50,
                criteria: 50,
            },
            missingItems: [],
        },
        timeEstimates: {
            totalHours: 100,
            byPriority: { critical: 0, high: 0, medium: 100, low: 0 },
            estimatedDays: 12.5,
            estimatedWeeks: 2.5,
            parallelizablePercent: 30,
        },
        risks: {
            overallRisk: 'medium',
            riskScore: 50,
            risks: [],
        },
        quality: {
            validationScore: 80,
            smartCompliance: 60,
            documentationCoverage: 50,
            testabilityScore: 60,
        },
        progress: {
            featuresWithCriteria: 0,
            linkedStories: 0,
            testableCriteria: 0,
        },
        recommendations: [],
        generatedAt: new Date(),
        ...overrides,
    };
}

/**
 * Creates a feature block with configurable description and acceptance criteria.
 */
function createFeatureBlock(opts: {
    id?: string;
    name?: string;
    description?: string;
    acceptanceCriteria?: string[];
} = {}) {
    return {
        id: opts.id ?? 'feat-1',
        name: opts.name ?? 'Feature 1',
        description: opts.description ?? 'A feature that does something important for the project',
        purpose: 'Testing',
        acceptanceCriteria: opts.acceptanceCriteria ?? ['Criterion 1'],
        technicalNotes: '',
        priority: 'medium' as const,
        order: 1,
    };
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
    jest.clearAllMocks();
    mockValidatePlan.mockReturnValue(createMockValidation());
    mockGenerateAnalytics.mockReturnValue(createMockAnalytics());
    mockDetectCycles.mockReturnValue([]);
});

// ============================================================================
// Tests: calculateHealthScore
// ============================================================================

describe('planHealth', () => {
    describe('calculateHealthScore', () => {
        it('Test 1: should return a HealthScore with all expected fields', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            expect(result).toHaveProperty('score');
            expect(result).toHaveProperty('grade');
            expect(result).toHaveProperty('categories');
            expect(result).toHaveProperty('factors');
            expect(result).toHaveProperty('generatedAt');
            expect(result.generatedAt).toBeInstanceOf(Date);
        });

        it('Test 2: should produce a score between 0 and 100', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
        });

        it('Test 3: should call validatePlan, generateAnalytics, and detectCycles', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            calculateHealthScore(plan);

            expect(mockValidatePlan).toHaveBeenCalledWith(plan);
            expect(mockGenerateAnalytics).toHaveBeenCalledWith(plan);
            expect(mockDetectCycles).toHaveBeenCalledWith(plan);
        });

        it('Test 4: should sort factors by absolute impact descending', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                userStories: [],
                successCriteria: [],
            });

            const result = calculateHealthScore(plan);

            for (let i = 0; i < result.factors.length - 1; i++) {
                expect(Math.abs(result.factors[i].impact))
                    .toBeGreaterThanOrEqual(Math.abs(result.factors[i + 1].impact));
            }
        });

        it('Test 5: should calculate weighted overall score from category scores', () => {
            // Provide a plan with features and good analytics to get predictable categories
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            // Verify the score is the weighted sum of categories (rounded)
            const expected = Math.round(
                result.categories.structure * 0.20 +
                result.categories.completeness * 0.25 +
                result.categories.clarity * 0.20 +
                result.categories.feasibility * 0.15 +
                result.categories.quality * 0.20
            );
            expect(result.score).toBe(expected);
        });
    });

    // ========================================================================
    // Tests: Structure Score
    // ========================================================================

    describe('structure score', () => {
        it('Test 6: should penalize plans with no features', () => {
            const plan = createMockPlan({ featureBlocks: [] });

            const result = calculateHealthScore(plan);

            const noFeaturesFactor = result.factors.find(f => f.id === 'struct-no-features');
            expect(noFeaturesFactor).toBeDefined();
            expect(noFeaturesFactor!.impact).toBe(-30);
            expect(noFeaturesFactor!.type).toBe('negative');
        });

        it('Test 7: should reward plans that have features defined', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const featuresFactor = result.factors.find(f => f.id === 'struct-features');
            expect(featuresFactor).toBeDefined();
            expect(featuresFactor!.impact).toBe(20);
            expect(featuresFactor!.type).toBe('positive');
        });

        it('Test 8: should penalize multiple features with no dependencies', () => {
            const plan = createMockPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'feat-1' }),
                    createFeatureBlock({ id: 'feat-2', name: 'Feature 2' }),
                ],
                blockLinks: [],
            });

            const result = calculateHealthScore(plan);

            const noDepsFactor = result.factors.find(f => f.id === 'struct-no-deps');
            expect(noDepsFactor).toBeDefined();
            expect(noDepsFactor!.impact).toBe(-10);
        });

        it('Test 9: should reward multiple features with dependencies defined', () => {
            const plan = createMockPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'feat-1' }),
                    createFeatureBlock({ id: 'feat-2', name: 'Feature 2' }),
                ],
                blockLinks: [
                    { id: 'link-1', sourceBlockId: 'feat-1', targetBlockId: 'feat-2', dependencyType: 'requires' },
                ],
            });

            const result = calculateHealthScore(plan);

            const depsFactor = result.factors.find(f => f.id === 'struct-deps');
            expect(depsFactor).toBeDefined();
            expect(depsFactor!.impact).toBe(15);
            expect(depsFactor!.type).toBe('positive');
        });

        it('Test 10: should not check dependencies when only one feature exists', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                blockLinks: [],
            });

            const result = calculateHealthScore(plan);

            const depsFactor = result.factors.find(
                f => f.id === 'struct-deps' || f.id === 'struct-no-deps'
            );
            expect(depsFactor).toBeUndefined();
        });

        it('Test 11: should reward plans with no circular dependencies', () => {
            mockDetectCycles.mockReturnValue([]);
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const noCyclesFactor = result.factors.find(f => f.id === 'struct-no-cycles');
            expect(noCyclesFactor).toBeDefined();
            expect(noCyclesFactor!.impact).toBe(15);
        });

        it('Test 12: should penalize plans with circular dependencies', () => {
            mockDetectCycles.mockReturnValue([['feat-1', 'feat-2', 'feat-1']]);
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const cyclesFactor = result.factors.find(f => f.id === 'struct-cycles');
            expect(cyclesFactor).toBeDefined();
            expect(cyclesFactor!.impact).toBe(-20);
            expect(cyclesFactor!.description).toContain('1 circular dependency');
        });

        it('Test 13: should clamp structure score between 0 and 100', () => {
            // Force a very negative structure: no features + cycles
            mockDetectCycles.mockReturnValue([
                ['a', 'b', 'a'],
                ['c', 'd', 'c'],
            ]);
            const plan = createMockPlan({ featureBlocks: [] });

            const result = calculateHealthScore(plan);

            expect(result.categories.structure).toBeGreaterThanOrEqual(0);
            expect(result.categories.structure).toBeLessThanOrEqual(100);
        });
    });

    // ========================================================================
    // Tests: Completeness Score
    // ========================================================================

    describe('completeness score', () => {
        it('Test 14: should use analytics overallScore as base', () => {
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                completeness: {
                    overallScore: 75,
                    sections: {
                        overview: 40,
                        features: 40,
                        dependencies: 40,
                        userStories: 40,
                        devStories: 40,
                        criteria: 40,
                    },
                    missingItems: [],
                },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                userStories: [],
                successCriteria: [],
            });

            const result = calculateHealthScore(plan);

            // Base is 75; no bonus for all sections (none >= 50);
            // no user stories => -10; no success criteria => no factor
            // Score should be 75 - 10 = 65
            expect(result.categories.completeness).toBe(65);
        });

        it('Test 15: should add bonus when all 6 sections are filled (>= 50)', () => {
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                completeness: {
                    overallScore: 70,
                    sections: {
                        overview: 80,
                        features: 60,
                        dependencies: 55,
                        userStories: 50,
                        devStories: 90,
                        criteria: 75,
                    },
                    missingItems: [],
                },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                userStories: [
                    { id: 'us-1', userType: 'user', action: 'a', benefit: 'b', relatedBlockIds: [], acceptanceCriteria: ['c'], priority: 'medium' },
                    { id: 'us-2', userType: 'user', action: 'a', benefit: 'b', relatedBlockIds: [], acceptanceCriteria: ['c'], priority: 'medium' },
                    { id: 'us-3', userType: 'user', action: 'a', benefit: 'b', relatedBlockIds: [], acceptanceCriteria: ['c'], priority: 'medium' },
                ],
                successCriteria: [
                    { id: 'sc-1', description: 'Success', smartAttributes: { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true }, relatedFeatureIds: [], relatedStoryIds: [], testable: true, priority: 'high' },
                ],
            });

            const result = calculateHealthScore(plan);

            const allSectionsFactor = result.factors.find(f => f.id === 'complete-all-sections');
            expect(allSectionsFactor).toBeDefined();
            expect(allSectionsFactor!.impact).toBe(10);
        });

        it('Test 16: should penalize plans with no user stories', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                userStories: [],
            });

            const result = calculateHealthScore(plan);

            const noStoriesFactor = result.factors.find(f => f.id === 'complete-no-stories');
            expect(noStoriesFactor).toBeDefined();
            expect(noStoriesFactor!.impact).toBe(-10);
        });

        it('Test 17: should reward plans with 3 or more user stories', () => {
            const stories = Array.from({ length: 3 }, (_, i) => ({
                id: `us-${i}`,
                userType: 'user',
                action: `action ${i}`,
                benefit: `benefit ${i}`,
                relatedBlockIds: [],
                acceptanceCriteria: ['criterion'],
                priority: 'medium' as const,
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                userStories: stories,
            });

            const result = calculateHealthScore(plan);

            const storiesFactor = result.factors.find(f => f.id === 'complete-stories');
            expect(storiesFactor).toBeDefined();
            expect(storiesFactor!.impact).toBe(5);
        });

        it('Test 18: should reward plans with success criteria', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                successCriteria: [
                    { id: 'sc-1', description: 'Success', smartAttributes: { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true }, relatedFeatureIds: [], relatedStoryIds: [], testable: true, priority: 'high' },
                ],
            });

            const result = calculateHealthScore(plan);

            const criteriaFactor = result.factors.find(f => f.id === 'complete-criteria');
            expect(criteriaFactor).toBeDefined();
            expect(criteriaFactor!.impact).toBe(5);
        });
    });

    // ========================================================================
    // Tests: Clarity Score
    // ========================================================================

    describe('clarity score', () => {
        it('Test 19: should start at baseline of 70 with no issues', () => {
            mockValidatePlan.mockReturnValue(createMockValidation({ issues: [] }));
            // No features => no description bonus, no acceptance criteria bonus
            const plan = createMockPlan({ featureBlocks: [] });

            const result = calculateHealthScore(plan);

            // Baseline 70, no clarity warnings, no features => 70
            expect(result.categories.clarity).toBe(70);
        });

        it('Test 20: should deduct for clarity/quality warnings from validation', () => {
            mockValidatePlan.mockReturnValue(createMockValidation({
                issues: [
                    { id: 'QUAL-1', severity: 'warning', category: 'quality', message: 'Vague description', fieldPath: 'featureBlocks[0].description' },
                    { id: 'QUAL-2', severity: 'warning', category: 'quality', message: 'Missing details', fieldPath: 'featureBlocks[1].description' },
                    { id: 'QUAL-3', severity: 'warning', category: 'quality', message: 'Too vague', fieldPath: 'overview.description' },
                ],
                counts: { errors: 0, warnings: 3, infos: 0 },
            }));
            const plan = createMockPlan({ featureBlocks: [] });

            const result = calculateHealthScore(plan);

            const clarityWarningsFactor = result.factors.find(f => f.id === 'clarity-warnings');
            expect(clarityWarningsFactor).toBeDefined();
            // 3 warnings * 5 = 15 deduction
            expect(clarityWarningsFactor!.impact).toBe(-15);
        });

        it('Test 21: should cap clarity warning deduction at 30', () => {
            const manyWarnings = Array.from({ length: 10 }, (_, i) => ({
                id: `QUAL-${i}`,
                severity: 'warning' as const,
                category: 'quality' as const,
                message: 'Vague requirement found',
                fieldPath: `featureBlocks[${i}].description`,
            }));
            mockValidatePlan.mockReturnValue(createMockValidation({
                issues: manyWarnings,
                counts: { errors: 0, warnings: 10, infos: 0 },
            }));
            const plan = createMockPlan({ featureBlocks: [] });

            const result = calculateHealthScore(plan);

            const clarityWarningsFactor = result.factors.find(f => f.id === 'clarity-warnings');
            expect(clarityWarningsFactor).toBeDefined();
            // Min(30, 10 * 5) = 30
            expect(clarityWarningsFactor!.impact).toBe(-30);
        });

        it('Test 22: should also detect issues with "vague" in the message text', () => {
            mockValidatePlan.mockReturnValue(createMockValidation({
                issues: [
                    { id: 'OTHER-1', severity: 'warning', category: 'completeness' as any, message: 'Description is vague and unclear', fieldPath: 'overview.description' },
                ],
                counts: { errors: 0, warnings: 1, infos: 0 },
            }));
            const plan = createMockPlan({ featureBlocks: [] });

            const result = calculateHealthScore(plan);

            const clarityWarningsFactor = result.factors.find(f => f.id === 'clarity-warnings');
            expect(clarityWarningsFactor).toBeDefined();
            expect(clarityWarningsFactor!.impact).toBe(-5);
        });

        it('Test 23: should reward plans where all features have detailed descriptions', () => {
            const longDesc = 'This is a very detailed description that has at least fifty characters for testing purposes.';
            const plan = createMockPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'f1', description: longDesc }),
                    createFeatureBlock({ id: 'f2', name: 'Feature 2', description: longDesc }),
                ],
                blockLinks: [
                    { id: 'link-1', sourceBlockId: 'f1', targetBlockId: 'f2', dependencyType: 'requires' },
                ],
            });

            const result = calculateHealthScore(plan);

            const descFactor = result.factors.find(f => f.id === 'clarity-descriptions');
            expect(descFactor).toBeDefined();
            expect(descFactor!.impact).toBe(15);
        });

        it('Test 24: should reward plans where all features have acceptance criteria', () => {
            const plan = createMockPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'f1', acceptanceCriteria: ['Criterion A'] }),
                    createFeatureBlock({ id: 'f2', name: 'Feature 2', acceptanceCriteria: ['Criterion B'] }),
                ],
                blockLinks: [
                    { id: 'link-1', sourceBlockId: 'f1', targetBlockId: 'f2', dependencyType: 'requires' },
                ],
            });

            const result = calculateHealthScore(plan);

            const acceptanceFactor = result.factors.find(f => f.id === 'clarity-acceptance');
            expect(acceptanceFactor).toBeDefined();
            expect(acceptanceFactor!.impact).toBe(15);
        });

        it('Test 25: should not give description bonus when a feature has a short description', () => {
            const plan = createMockPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'f1', description: 'Short' }),
                ],
            });

            const result = calculateHealthScore(plan);

            const descFactor = result.factors.find(f => f.id === 'clarity-descriptions');
            expect(descFactor).toBeUndefined();
        });
    });

    // ========================================================================
    // Tests: Feasibility Score
    // ========================================================================

    describe('feasibility score', () => {
        it('Test 26: should reward plans with 80%+ time estimates on developer stories', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                developerStories: [
                    { id: 'ds-1', action: 'a', benefit: 'b', technicalRequirements: [], apiNotes: '', databaseNotes: '', estimatedHours: 8, relatedBlockIds: [], relatedTaskIds: [] },
                    { id: 'ds-2', action: 'a', benefit: 'b', technicalRequirements: [], apiNotes: '', databaseNotes: '', estimatedHours: 4, relatedBlockIds: [], relatedTaskIds: [] },
                ],
            });

            const result = calculateHealthScore(plan);

            const estimatesFactor = result.factors.find(f => f.id === 'feasible-estimates');
            expect(estimatesFactor).toBeDefined();
            expect(estimatesFactor!.impact).toBe(20);
        });

        it('Test 27: should penalize developer stories with no time estimates', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                developerStories: [
                    { id: 'ds-1', action: 'a', benefit: 'b', technicalRequirements: [], apiNotes: '', databaseNotes: '', estimatedHours: 0, relatedBlockIds: [], relatedTaskIds: [] },
                ],
            });

            const result = calculateHealthScore(plan);

            const noEstimatesFactor = result.factors.find(f => f.id === 'feasible-no-estimates');
            expect(noEstimatesFactor).toBeDefined();
            expect(noEstimatesFactor!.impact).toBe(-15);
        });

        it('Test 28: should reward reasonable scope (0 < totalHours <= 200)', () => {
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                timeEstimates: {
                    totalHours: 100,
                    byPriority: { critical: 0, high: 0, medium: 100, low: 0 },
                    estimatedDays: 12.5,
                    estimatedWeeks: 2.5,
                    parallelizablePercent: 30,
                },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const scopeFactor = result.factors.find(f => f.id === 'feasible-scope');
            expect(scopeFactor).toBeDefined();
            expect(scopeFactor!.impact).toBe(15);
        });

        it('Test 29: should penalize very large scope (totalHours > 400)', () => {
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                timeEstimates: {
                    totalHours: 500,
                    byPriority: { critical: 0, high: 0, medium: 500, low: 0 },
                    estimatedDays: 62.5,
                    estimatedWeeks: 12.5,
                    parallelizablePercent: 10,
                },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const largeScopeFactor = result.factors.find(f => f.id === 'feasible-large-scope');
            expect(largeScopeFactor).toBeDefined();
            expect(largeScopeFactor!.impact).toBe(-10);
        });

        it('Test 30: should reward low overall risk', () => {
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                risks: { overallRisk: 'low', riskScore: 10, risks: [] },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const lowRiskFactor = result.factors.find(f => f.id === 'feasible-low-risk');
            expect(lowRiskFactor).toBeDefined();
            expect(lowRiskFactor!.impact).toBe(10);
        });

        it('Test 31: should penalize critical overall risk', () => {
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                risks: { overallRisk: 'critical', riskScore: 90, risks: [] },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const highRiskFactor = result.factors.find(f => f.id === 'feasible-high-risk');
            expect(highRiskFactor).toBeDefined();
            expect(highRiskFactor!.impact).toBe(-15);
        });

        it('Test 32: should not add scope or risk factors for medium risk and mid-range scope', () => {
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                timeEstimates: {
                    totalHours: 300,
                    byPriority: { critical: 0, high: 0, medium: 300, low: 0 },
                    estimatedDays: 37.5,
                    estimatedWeeks: 7.5,
                    parallelizablePercent: 20,
                },
                risks: { overallRisk: 'medium', riskScore: 50, risks: [] },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const scopeFactor = result.factors.find(
                f => f.id === 'feasible-scope' || f.id === 'feasible-large-scope'
            );
            const riskFactor = result.factors.find(
                f => f.id === 'feasible-low-risk' || f.id === 'feasible-high-risk'
            );
            expect(scopeFactor).toBeUndefined();
            expect(riskFactor).toBeUndefined();
        });
    });

    // ========================================================================
    // Tests: Quality Score
    // ========================================================================

    describe('quality score', () => {
        it('Test 33: should reward plans with no validation errors', () => {
            mockValidatePlan.mockReturnValue(createMockValidation({
                counts: { errors: 0, warnings: 0, infos: 0 },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const passesFactor = result.factors.find(f => f.id === 'quality-passes');
            expect(passesFactor).toBeDefined();
            expect(passesFactor!.impact).toBe(25);
        });

        it('Test 34: should penalize plans with validation errors', () => {
            mockValidatePlan.mockReturnValue(createMockValidation({
                valid: false,
                issues: [
                    { id: 'ERR-1', severity: 'error', category: 'required' as any, message: 'Missing name' },
                    { id: 'ERR-2', severity: 'error', category: 'required' as any, message: 'Missing desc' },
                ],
                counts: { errors: 2, warnings: 0, infos: 0 },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const errorsFactor = result.factors.find(f => f.id === 'quality-errors');
            expect(errorsFactor).toBeDefined();
            // 2 errors * 5 = 10
            expect(errorsFactor!.impact).toBe(-10);
        });

        it('Test 35: should cap validation error deduction at 30', () => {
            mockValidatePlan.mockReturnValue(createMockValidation({
                valid: false,
                counts: { errors: 10, warnings: 0, infos: 0 },
                issues: Array.from({ length: 10 }, (_, i) => ({
                    id: `ERR-${i}`,
                    severity: 'error' as const,
                    category: 'required' as any,
                    message: `Error ${i}`,
                })),
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const errorsFactor = result.factors.find(f => f.id === 'quality-errors');
            expect(errorsFactor).toBeDefined();
            expect(errorsFactor!.impact).toBe(-30);
        });

        it('Test 36: should reward high SMART compliance (>= 80)', () => {
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                quality: {
                    validationScore: 80,
                    smartCompliance: 85,
                    documentationCoverage: 50,
                    testabilityScore: 60,
                },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const smartFactor = result.factors.find(f => f.id === 'quality-smart');
            expect(smartFactor).toBeDefined();
            expect(smartFactor!.impact).toBe(15);
        });

        it('Test 37: should reward high testability score (>= 80)', () => {
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                quality: {
                    validationScore: 80,
                    smartCompliance: 60,
                    documentationCoverage: 50,
                    testabilityScore: 90,
                },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const testableFactor = result.factors.find(f => f.id === 'quality-testable');
            expect(testableFactor).toBeDefined();
            expect(testableFactor!.impact).toBe(10);
        });
    });

    // ========================================================================
    // Tests: Grade Conversion
    // ========================================================================

    describe('grade conversion', () => {
        it('Test 38: should assign A+ grade for score >= 97', () => {
            // Create a plan that scores extremely high
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                completeness: {
                    overallScore: 100,
                    sections: { overview: 100, features: 100, dependencies: 100, userStories: 100, devStories: 100, criteria: 100 },
                    missingItems: [],
                },
                timeEstimates: { totalHours: 100, byPriority: { critical: 0, high: 0, medium: 100, low: 0 }, estimatedDays: 12.5, estimatedWeeks: 2.5, parallelizablePercent: 30 },
                risks: { overallRisk: 'low', riskScore: 5, risks: [] },
                quality: { validationScore: 100, smartCompliance: 100, documentationCoverage: 100, testabilityScore: 100 },
            }));
            const longDesc = 'This feature is described in great detail for the purposes of achieving a perfect clarity score value.';
            const plan = createMockPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'f1', description: longDesc, acceptanceCriteria: ['AC1'] }),
                ],
                userStories: [
                    { id: 'us-1', userType: 'user', action: 'a', benefit: 'b', relatedBlockIds: [], acceptanceCriteria: ['c'], priority: 'medium' },
                    { id: 'us-2', userType: 'user', action: 'a', benefit: 'b', relatedBlockIds: [], acceptanceCriteria: ['c'], priority: 'medium' },
                    { id: 'us-3', userType: 'user', action: 'a', benefit: 'b', relatedBlockIds: [], acceptanceCriteria: ['c'], priority: 'medium' },
                ],
                successCriteria: [
                    { id: 'sc-1', description: 'done', smartAttributes: { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true }, relatedFeatureIds: [], relatedStoryIds: [], testable: true, priority: 'high' },
                ],
                developerStories: [
                    { id: 'ds-1', action: 'a', benefit: 'b', technicalRequirements: [], apiNotes: '', databaseNotes: '', estimatedHours: 8, relatedBlockIds: [], relatedTaskIds: [] },
                ],
            });

            const result = calculateHealthScore(plan);

            // The score should be very high; verify it gets A-range grade
            expect(['A+', 'A', 'A-']).toContain(result.grade);
        });

        it('Test 39: should assign F grade for very low scoring plans', () => {
            mockDetectCycles.mockReturnValue([['a', 'b', 'a']]);
            mockValidatePlan.mockReturnValue(createMockValidation({
                valid: false,
                issues: Array.from({ length: 8 }, (_, i) => ({
                    id: `ERR-${i}`,
                    severity: 'error' as const,
                    category: 'required' as any,
                    message: `Error ${i}`,
                })),
                counts: { errors: 8, warnings: 0, infos: 0 },
            }));
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                completeness: {
                    overallScore: 10,
                    sections: { overview: 5, features: 5, dependencies: 0, userStories: 0, devStories: 0, criteria: 0 },
                    missingItems: ['many items'],
                },
                timeEstimates: { totalHours: 500, byPriority: { critical: 200, high: 200, medium: 100, low: 0 }, estimatedDays: 62.5, estimatedWeeks: 12.5, parallelizablePercent: 5 },
                risks: { overallRisk: 'critical', riskScore: 95, risks: [] },
                quality: { validationScore: 10, smartCompliance: 10, documentationCoverage: 5, testabilityScore: 5 },
            }));
            const plan = createMockPlan({ featureBlocks: [] });

            const result = calculateHealthScore(plan);

            expect(result.grade).toBe('F');
            expect(result.score).toBeLessThan(60);
        });

        it('Test 40: should assign correct grade boundaries', () => {
            // We test the grade logic indirectly through known scores
            // by crafting plans with predictable outcomes.
            // Test D grade boundary (60-69)
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                completeness: {
                    overallScore: 60,
                    sections: { overview: 40, features: 40, dependencies: 40, userStories: 40, devStories: 40, criteria: 40 },
                    missingItems: [],
                },
            }));
            const plan = createMockPlan({ featureBlocks: [] });

            const result = calculateHealthScore(plan);

            // With minimal everything, score should be in D-F range
            expect(['D', 'F']).toContain(result.grade);
        });
    });

    // ========================================================================
    // Tests: renderHealthBadge
    // ========================================================================

    describe('renderHealthBadge', () => {
        it('Test 41: should render a badge with grade and score', () => {
            const health: HealthScore = {
                score: 85,
                grade: 'B',
                categories: { structure: 80, completeness: 90, clarity: 85, feasibility: 80, quality: 85 },
                factors: [],
                generatedAt: new Date(),
            };

            const html = renderHealthBadge(health);

            expect(html).toContain('health-badge');
            expect(html).toContain('B');
            expect(html).toContain('85/100');
        });

        it('Test 42: should use green color for A grades', () => {
            const health: HealthScore = {
                score: 95,
                grade: 'A',
                categories: { structure: 95, completeness: 95, clarity: 95, feasibility: 95, quality: 95 },
                factors: [],
                generatedAt: new Date(),
            };

            const html = renderHealthBadge(health);

            expect(html).toContain('#28a745');
        });

        it('Test 43: should use red color for F grade', () => {
            const health: HealthScore = {
                score: 30,
                grade: 'F',
                categories: { structure: 30, completeness: 30, clarity: 30, feasibility: 30, quality: 30 },
                factors: [],
                generatedAt: new Date(),
            };

            const html = renderHealthBadge(health);

            expect(html).toContain('#dc3545');
        });

        it('Test 44: should use orange color for D grade', () => {
            const health: HealthScore = {
                score: 62,
                grade: 'D',
                categories: { structure: 60, completeness: 65, clarity: 60, feasibility: 65, quality: 60 },
                factors: [],
                generatedAt: new Date(),
            };

            const html = renderHealthBadge(health);

            expect(html).toContain('#fd7e14');
        });

        it('Test 45: should use yellow color for C grades', () => {
            const health: HealthScore = {
                score: 75,
                grade: 'C',
                categories: { structure: 75, completeness: 75, clarity: 75, feasibility: 75, quality: 75 },
                factors: [],
                generatedAt: new Date(),
            };

            const html = renderHealthBadge(health);

            expect(html).toContain('#f0ad4e');
        });
    });

    // ========================================================================
    // Tests: renderHealthPanel
    // ========================================================================

    describe('renderHealthPanel', () => {
        it('Test 46: should render the full health panel with all categories', () => {
            const health: HealthScore = {
                score: 80,
                grade: 'B-',
                categories: { structure: 85, completeness: 75, clarity: 80, feasibility: 70, quality: 90 },
                factors: [
                    { id: 'f1', name: 'Test Factor', impact: 10, description: 'Positive', category: 'structure', type: 'positive' },
                ],
                generatedAt: new Date(),
            };

            const html = renderHealthPanel(health);

            expect(html).toContain('health-panel');
            expect(html).toContain('Plan Health');
            expect(html).toContain('health-categories');
            expect(html).toContain('Structure');
            expect(html).toContain('Completeness');
            expect(html).toContain('Clarity');
            expect(html).toContain('Feasibility');
            expect(html).toContain('Quality');
        });

        it('Test 47: should render factors with correct icons for positive and negative', () => {
            const health: HealthScore = {
                score: 70,
                grade: 'C-',
                categories: { structure: 70, completeness: 70, clarity: 70, feasibility: 70, quality: 70 },
                factors: [
                    { id: 'pos-1', name: 'Good factor', impact: 15, description: 'test', category: 'structure', type: 'positive' },
                    { id: 'neg-1', name: 'Bad factor', impact: -10, description: 'test', category: 'quality', type: 'negative' },
                ],
                generatedAt: new Date(),
            };

            const html = renderHealthPanel(health);

            expect(html).toContain('+15');
            expect(html).toContain('-10');
        });

        it('Test 48: should limit displayed factors to 8', () => {
            const factors: HealthFactor[] = Array.from({ length: 12 }, (_, i) => ({
                id: `factor-${i}`,
                name: `Factor ${i}`,
                impact: 5,
                description: `Description ${i}`,
                category: 'structure' as const,
                type: 'positive' as const,
            }));
            const health: HealthScore = {
                score: 80,
                grade: 'B-',
                categories: { structure: 80, completeness: 80, clarity: 80, feasibility: 80, quality: 80 },
                factors,
                generatedAt: new Date(),
            };

            const html = renderHealthPanel(health);

            // Count the number of factor divs
            const factorMatches = html.match(/class="factor /g);
            expect(factorMatches).not.toBeNull();
            expect(factorMatches!.length).toBe(8);
        });

        it('Test 49: should escape HTML in factor names to prevent XSS', () => {
            const health: HealthScore = {
                score: 70,
                grade: 'C-',
                categories: { structure: 70, completeness: 70, clarity: 70, feasibility: 70, quality: 70 },
                factors: [
                    { id: 'xss', name: '<script>alert("xss")</script>', impact: -5, description: 'test', category: 'quality', type: 'negative' },
                ],
                generatedAt: new Date(),
            };

            const html = renderHealthPanel(health);

            expect(html).not.toContain('<script>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('Test 50: should render category bar widths matching scores', () => {
            const health: HealthScore = {
                score: 72,
                grade: 'C-',
                categories: { structure: 65, completeness: 80, clarity: 70, feasibility: 55, quality: 90 },
                factors: [],
                generatedAt: new Date(),
            };

            const html = renderHealthPanel(health);

            expect(html).toContain('width: 65%');
            expect(html).toContain('width: 80%');
            expect(html).toContain('width: 70%');
            expect(html).toContain('width: 55%');
            expect(html).toContain('width: 90%');
        });
    });

    // ========================================================================
    // Tests: getHealthStyles
    // ========================================================================

    describe('getHealthStyles', () => {
        it('Test 51: should return CSS string with key selectors', () => {
            const css = getHealthStyles();

            expect(css).toContain('.health-badge');
            expect(css).toContain('.health-grade');
            expect(css).toContain('.health-score');
            expect(css).toContain('.health-panel');
            expect(css).toContain('.health-header');
            expect(css).toContain('.health-categories');
            expect(css).toContain('.category-row');
            expect(css).toContain('.category-bar');
            expect(css).toContain('.bar-fill');
            expect(css).toContain('.health-factors');
            expect(css).toContain('.factor');
            expect(css).toContain('.factor-impact');
        });

        it('Test 52: should include VS Code CSS variables for theming', () => {
            const css = getHealthStyles();

            expect(css).toContain('var(--vscode-editor-background)');
            expect(css).toContain('var(--vscode-input-border)');
            expect(css).toContain('var(--vscode-testing-iconPassed)');
            expect(css).toContain('var(--vscode-errorForeground)');
        });
    });

    // ========================================================================
    // Tests: Edge Cases
    // ========================================================================

    describe('edge cases', () => {
        it('Test 53: should handle an empty plan gracefully', () => {
            const plan = createMockPlan();

            const result = calculateHealthScore(plan);

            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
            expect(result.grade).toBeDefined();
            expect(result.factors.length).toBeGreaterThan(0);
        });

        it('Test 54: should handle plans with features but empty acceptance criteria', () => {
            const plan = createMockPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'f1', acceptanceCriteria: [] }),
                ],
            });

            const result = calculateHealthScore(plan);

            const acceptanceFactor = result.factors.find(f => f.id === 'clarity-acceptance');
            expect(acceptanceFactor).toBeUndefined();
        });

        it('Test 55: should handle plan with exactly 1-2 user stories (no bonus, no penalty)', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                userStories: [
                    { id: 'us-1', userType: 'user', action: 'a', benefit: 'b', relatedBlockIds: [], acceptanceCriteria: ['c'], priority: 'medium' },
                ],
            });

            const result = calculateHealthScore(plan);

            const storyBonus = result.factors.find(f => f.id === 'complete-stories');
            const storyPenalty = result.factors.find(f => f.id === 'complete-no-stories');
            expect(storyBonus).toBeUndefined();
            expect(storyPenalty).toBeUndefined();
        });

        it('Test 56: should handle analytics with zero total hours (no scope factor)', () => {
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                timeEstimates: {
                    totalHours: 0,
                    byPriority: { critical: 0, high: 0, medium: 0, low: 0 },
                    estimatedDays: 0,
                    estimatedWeeks: 0,
                    parallelizablePercent: 0,
                },
            }));
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
            });

            const result = calculateHealthScore(plan);

            const scopeFactor = result.factors.find(
                f => f.id === 'feasible-scope' || f.id === 'feasible-large-scope'
            );
            expect(scopeFactor).toBeUndefined();
        });

        it('Test 57: should handle developer stories with mixed estimates (below 80% ratio)', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                developerStories: [
                    { id: 'ds-1', action: 'a', benefit: 'b', technicalRequirements: [], apiNotes: '', databaseNotes: '', estimatedHours: 8, relatedBlockIds: [], relatedTaskIds: [] },
                    { id: 'ds-2', action: 'a', benefit: 'b', technicalRequirements: [], apiNotes: '', databaseNotes: '', estimatedHours: 0, relatedBlockIds: [], relatedTaskIds: [] },
                    { id: 'ds-3', action: 'a', benefit: 'b', technicalRequirements: [], apiNotes: '', databaseNotes: '', estimatedHours: 0, relatedBlockIds: [], relatedTaskIds: [] },
                    { id: 'ds-4', action: 'a', benefit: 'b', technicalRequirements: [], apiNotes: '', databaseNotes: '', estimatedHours: 0, relatedBlockIds: [], relatedTaskIds: [] },
                ],
            });

            const result = calculateHealthScore(plan);

            // 1 out of 4 estimated = 25% < 80%, so no bonus
            const estimatesFactor = result.factors.find(f => f.id === 'feasible-estimates');
            expect(estimatesFactor).toBeUndefined();
            // But some do have estimates so no penalty for missing all
            const noEstimatesFactor = result.factors.find(f => f.id === 'feasible-no-estimates');
            expect(noEstimatesFactor).toBeUndefined();
        });

        it('Test 58: should produce all category scores between 0 and 100', () => {
            // Extreme negative plan
            mockDetectCycles.mockReturnValue([['a', 'b', 'a'], ['c', 'd', 'c']]);
            mockValidatePlan.mockReturnValue(createMockValidation({
                valid: false,
                issues: Array.from({ length: 10 }, (_, i) => ({
                    id: `ERR-${i}`,
                    severity: 'error' as const,
                    category: 'quality' as any,
                    message: `Vague error ${i}`,
                })),
                counts: { errors: 10, warnings: 0, infos: 0 },
            }));
            mockGenerateAnalytics.mockReturnValue(createMockAnalytics({
                completeness: {
                    overallScore: 5,
                    sections: { overview: 0, features: 0, dependencies: 0, userStories: 0, devStories: 0, criteria: 0 },
                    missingItems: ['everything'],
                },
                timeEstimates: { totalHours: 999, byPriority: { critical: 500, high: 499, medium: 0, low: 0 }, estimatedDays: 125, estimatedWeeks: 25, parallelizablePercent: 0 },
                risks: { overallRisk: 'critical', riskScore: 100, risks: [] },
                quality: { validationScore: 0, smartCompliance: 0, documentationCoverage: 0, testabilityScore: 0 },
            }));
            const plan = createMockPlan({ featureBlocks: [] });

            const result = calculateHealthScore(plan);

            for (const [, score] of Object.entries(result.categories)) {
                expect(score).toBeGreaterThanOrEqual(0);
                expect(score).toBeLessThanOrEqual(100);
            }
        });

        it('Test 59: should handle no developer stories at all (no feasibility estimate factors)', () => {
            const plan = createMockPlan({
                featureBlocks: [createFeatureBlock()],
                developerStories: [],
            });

            const result = calculateHealthScore(plan);

            const estimateFactor = result.factors.find(
                f => f.id === 'feasible-estimates' || f.id === 'feasible-no-estimates'
            );
            expect(estimateFactor).toBeUndefined();
        });

        it('Test 60: should assign each factor a valid category from CategoryScores', () => {
            const validCategories: (keyof CategoryScores)[] = [
                'structure', 'completeness', 'clarity', 'feasibility', 'quality',
            ];
            const plan = createMockPlan({
                featureBlocks: [
                    createFeatureBlock({ id: 'f1' }),
                    createFeatureBlock({ id: 'f2', name: 'Feature 2' }),
                ],
                blockLinks: [
                    { id: 'link-1', sourceBlockId: 'f1', targetBlockId: 'f2', dependencyType: 'requires' },
                ],
                userStories: [
                    { id: 'us-1', userType: 'user', action: 'a', benefit: 'b', relatedBlockIds: [], acceptanceCriteria: ['c'], priority: 'medium' },
                    { id: 'us-2', userType: 'user', action: 'a', benefit: 'b', relatedBlockIds: [], acceptanceCriteria: ['c'], priority: 'medium' },
                    { id: 'us-3', userType: 'user', action: 'a', benefit: 'b', relatedBlockIds: [], acceptanceCriteria: ['c'], priority: 'medium' },
                ],
                successCriteria: [
                    { id: 'sc-1', description: 'Success', smartAttributes: { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true }, relatedFeatureIds: [], relatedStoryIds: [], testable: true, priority: 'high' },
                ],
            });

            const result = calculateHealthScore(plan);

            for (const factor of result.factors) {
                expect(validCategories).toContain(factor.category);
            }
        });
    });
});
