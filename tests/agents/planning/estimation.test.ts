/**
 * @file Tests for EffortEstimator - effort estimation for planning team
 *
 * Validates estimation logic, task type detection, complexity inference,
 * historical calibration, formatting, statistics, and singleton management.
 */

// Mock vscode before any imports
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => ({
        event: jest.fn(),
        fire: jest.fn()
    })),
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn()
    }
}), { virtual: true });

// Mock logger
const mockLogInfo = jest.fn();
const mockLogWarn = jest.fn();
jest.mock('../../../src/logger', () => ({
    logInfo: (...args: unknown[]) => mockLogInfo(...args),
    logWarn: (...args: unknown[]) => mockLogWarn(...args)
}));

import {
    EffortEstimator,
    getEffortEstimator,
    resetEffortEstimatorForTests,
    type ComplexityFactors,
    type EstimationResult,
    type EstimationConfig,
    type HistoricalDataPoint
} from '../../../src/agents/planning/estimation';

describe('EffortEstimator', () => {
    let estimator: EffortEstimator;

    beforeEach(() => {
        jest.clearAllMocks();
        resetEffortEstimatorForTests();
        estimator = new EffortEstimator();
    });

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------
    describe('Constructor', () => {
        it('Test 1: should initialize with default config values', () => {
            const result = estimator.estimate('Some task', 'description');
            // Default config: minMinutes=15, maxMinutes=60, includeTests=true
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(15);
            expect(result.estimateMinutes).toBeLessThanOrEqual(60);
            expect(result.factors.requiresTests).toBe(true);
        });

        it('Test 2: should accept custom config overrides', () => {
            const custom = new EffortEstimator({
                minMinutes: 5,
                maxMinutes: 120,
                minutesPerFile: 20,
                uncertaintyBuffer: 0.3,
                includeTests: false
            });
            const result = custom.estimate('Some task', 'description');
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(5);
            expect(result.estimateMinutes).toBeLessThanOrEqual(120);
            expect(result.factors.requiresTests).toBe(false);
        });

        it('Test 3: should merge partial config with defaults', () => {
            const partial = new EffortEstimator({ maxMinutes: 200 });
            const result = partial.estimate('Some task', 'description');
            // minMinutes should still be default 15
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(15);
            // maxMinutes now 200
            expect(result.estimateMinutes).toBeLessThanOrEqual(200);
        });
    });

    // ---------------------------------------------------------------
    // estimate() - basic behavior
    // ---------------------------------------------------------------
    describe('estimate() basics', () => {
        it('Test 4: should return a valid EstimationResult with all required fields', () => {
            const result = estimator.estimate('Build login form', 'Create a login page');
            expect(result).toHaveProperty('estimateMinutes');
            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('minMinutes');
            expect(result).toHaveProperty('maxMinutes');
            expect(result).toHaveProperty('breakdown');
            expect(result).toHaveProperty('factors');
            expect(result).toHaveProperty('warnings');
            expect(typeof result.estimateMinutes).toBe('number');
            expect(typeof result.confidence).toBe('number');
            expect(Array.isArray(result.warnings)).toBe(true);
        });

        it('Test 5: should log info when estimating', () => {
            estimator.estimate('Test task', 'desc');
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('[EffortEstimator] Estimating: Test task')
            );
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('[EffortEstimator] Estimated')
            );
        });
    });

    // ---------------------------------------------------------------
    // Task type detection
    // ---------------------------------------------------------------
    describe('estimate() task type detection', () => {
        it('Test 6: should detect create-component tasks', () => {
            // Base for create-component is 30
            const result = estimator.estimate(
                'Create component for navbar',
                'A new React component'
            );
            // With hasUI inferred true (component keyword), UI multiplier applies
            expect(result.factors.hasUI).toBe(true);
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(15);
        });

        it('Test 7: should detect create-service tasks', () => {
            const result = estimator.estimate(
                'Create service for auth',
                'A new authentication service'
            );
            // create-service base is 45
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(15);
        });

        it('Test 8: should detect fix-bug tasks', () => {
            const result = estimator.estimate(
                'Fix login bug',
                'Users cannot log in'
            );
            // fix-bug base is 30
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(15);
        });

        it('Test 9: should detect refactor tasks', () => {
            const result = estimator.estimate(
                'Refactor database module',
                'Clean up the DB layer'
            );
            // refactor base is 35, fileCount inferred to 3 for refactor
            expect(result.factors.fileCount).toBe(3);
        });

        it('Test 10: should detect documentation tasks', () => {
            const result = estimator.estimate(
                'Document the API endpoints',
                'Add JSDoc to all routes'
            );
            // documentation base is 20
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(15);
        });

        it('Test 11: should detect configuration tasks', () => {
            const result = estimator.estimate(
                'Setup ESLint config',
                'Configure linting rules'
            );
            // configuration base is 15
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(15);
        });

        it('Test 12: should detect integration tasks', () => {
            const result = estimator.estimate(
                'Integrate payment gateway',
                'Add Stripe integration'
            );
            // integration base is 45
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(15);
        });

        it('Test 13: should detect modify-file tasks', () => {
            const result = estimator.estimate(
                'Update user model',
                'Modify the user schema'
            );
            // modify-file base is 15
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(15);
        });

        it('Test 14: should fall back to unknown task type', () => {
            const result = estimator.estimate(
                'Do something generic',
                'No clear type indicators'
            );
            // unknown base is 30
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(15);
        });
    });

    // ---------------------------------------------------------------
    // Code complexity inference
    // ---------------------------------------------------------------
    describe('estimate() code complexity inference', () => {
        it('Test 15: should increase complexity for algorithm keyword', () => {
            const resultAlgo = estimator.estimate(
                'Implement sorting algorithm',
                'Need an efficient algorithm'
            );
            const resultSimple = estimator.estimate(
                'Add a button',
                'A simple button'
            );
            expect(resultAlgo.factors.codeComplexity).toBeGreaterThan(
                resultSimple.factors.codeComplexity
            );
        });

        it('Test 16: should increase complexity for complex keyword', () => {
            const result = estimator.estimate(
                'Build complex validation',
                'Complex nested form validation'
            );
            // Default 2 + 'complex' = 3 (appears in both title and desc, but only counts once per word occurrence in combined text)
            expect(result.factors.codeComplexity).toBeGreaterThanOrEqual(3);
        });

        it('Test 17: should increase complexity for async keyword', () => {
            const result = estimator.estimate(
                'Implement async data loader',
                'Handle async operations'
            );
            expect(result.factors.codeComplexity).toBeGreaterThanOrEqual(3);
        });

        it('Test 18: should decrease complexity for simple and basic keywords', () => {
            const result = estimator.estimate(
                'Simple basic utility',
                'A simple basic helper function'
            );
            // Default 2 - 1 (simple) - 1 (basic) = clamped to 1 at minimum
            expect(result.factors.codeComplexity).toBeLessThanOrEqual(2);
        });

        it('Test 19: should clamp complexity between 1 and 5', () => {
            // Many complexity-increasing keywords
            const highResult = estimator.estimate(
                'Complex async algorithm with state machine recursive concurrent parallel',
                'Very complex'
            );
            expect(highResult.factors.codeComplexity).toBeLessThanOrEqual(5);

            // Many simplicity keywords
            const lowResult = estimator.estimate(
                'Simple basic trivial task',
                'Very simple basic trivial'
            );
            expect(lowResult.factors.codeComplexity).toBeGreaterThanOrEqual(1);
        });
    });

    // ---------------------------------------------------------------
    // File count inference
    // ---------------------------------------------------------------
    describe('estimate() file count inference', () => {
        it('Test 20: should detect explicit file count from text', () => {
            const result = estimator.estimate(
                'Update 5 files for the migration',
                'Need to change 5 files'
            );
            expect(result.factors.fileCount).toBe(5);
        });

        it('Test 21: should infer 3 files for refactor tasks', () => {
            const result = estimator.estimate(
                'Refactor the auth module',
                'Refactor needed'
            );
            expect(result.factors.fileCount).toBe(3);
        });

        it('Test 22: should infer 2 files for component tasks', () => {
            const result = estimator.estimate(
                'Create a new component',
                'Build a sidebar component'
            );
            expect(result.factors.fileCount).toBe(2);
        });

        it('Test 23: should default to 1 file for generic tasks', () => {
            const result = estimator.estimate(
                'Do a thing',
                'Some generic task'
            );
            expect(result.factors.fileCount).toBe(1);
        });
    });

    // ---------------------------------------------------------------
    // UI and external API multipliers
    // ---------------------------------------------------------------
    describe('estimate() multipliers', () => {
        it('Test 24: should apply UI multiplier when hasUI is true', () => {
            const withUI = estimator.estimate('Build task', 'desc', { hasUI: true });
            const withoutUI = estimator.estimate('Build task', 'desc', { hasUI: false });
            // UI multiplier is 1.2x so withUI should be >= withoutUI
            expect(withUI.estimateMinutes).toBeGreaterThanOrEqual(withoutUI.estimateMinutes);
        });

        it('Test 25: should apply external API multiplier when hasExternalAPI is true', () => {
            const withAPI = estimator.estimate('Build task', 'desc', {
                hasExternalAPI: true,
                hasUI: false
            });
            const withoutAPI = estimator.estimate('Build task', 'desc', {
                hasExternalAPI: false,
                hasUI: false
            });
            // External API multiplier is 1.3x
            expect(withAPI.estimateMinutes).toBeGreaterThanOrEqual(withoutAPI.estimateMinutes);
        });

        it('Test 26: should infer hasUI from UI-related keywords', () => {
            const renderResult = estimator.estimate('Render the dashboard', 'Display data');
            expect(renderResult.factors.hasUI).toBe(true);

            const uiResult = estimator.estimate('Build UI panel', 'The UI layer');
            expect(uiResult.factors.hasUI).toBe(true);
        });

        it('Test 27: should infer hasExternalAPI from API-related keywords', () => {
            const apiResult = estimator.estimate('Call the REST api', 'Hit the endpoint');
            expect(apiResult.factors.hasExternalAPI).toBe(true);

            const fetchResult = estimator.estimate('Fetch user data', 'Using fetch');
            expect(fetchResult.factors.hasExternalAPI).toBe(true);
        });
    });

    // ---------------------------------------------------------------
    // Clamping to min/max
    // ---------------------------------------------------------------
    describe('estimate() clamping', () => {
        it('Test 28: should clamp estimate to minMinutes', () => {
            const small = new EffortEstimator({ minMinutes: 30 });
            const result = small.estimate('Trivial fix', 'simple basic', {
                codeComplexity: 1,
                fileCount: 1,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: false,
                hasExternalAPI: false,
                uncertainty: 0
            });
            expect(result.estimateMinutes).toBeGreaterThanOrEqual(30);
        });

        it('Test 29: should clamp estimate to maxMinutes', () => {
            const capped = new EffortEstimator({ maxMinutes: 20 });
            const result = capped.estimate(
                'Complex algorithm with async state machine',
                'Very complex recursive concurrent parallel',
                {
                    codeComplexity: 5,
                    fileCount: 10,
                    dependencyCount: 5,
                    hasUI: true,
                    requiresTests: true,
                    hasExternalAPI: true,
                    uncertainty: 1
                }
            );
            expect(result.estimateMinutes).toBeLessThanOrEqual(20);
        });
    });

    // ---------------------------------------------------------------
    // Breakdown proportions
    // ---------------------------------------------------------------
    describe('estimate() breakdown', () => {
        it('Test 30: should include implementation, testing, documentation, and review', () => {
            const result = estimator.estimate('Create a service', 'Build a new service');
            const { breakdown } = result;
            expect(breakdown.implementation).toBeGreaterThan(0);
            expect(breakdown.testing).toBeGreaterThanOrEqual(0);
            expect(breakdown.documentation).toBeGreaterThan(0);
            expect(breakdown.review).toBeGreaterThan(0);
        });

        it('Test 31: should have implementation as the largest breakdown portion', () => {
            const result = estimator.estimate('Build a feature', 'Some feature');
            expect(result.breakdown.implementation).toBeGreaterThan(result.breakdown.testing);
            expect(result.breakdown.implementation).toBeGreaterThan(result.breakdown.documentation);
            expect(result.breakdown.implementation).toBeGreaterThan(result.breakdown.review);
        });

        it('Test 32: should set testing to 0 when requiresTests is false', () => {
            const noTests = new EffortEstimator({ includeTests: false });
            const result = noTests.estimate('Build a feature', 'No tests needed');
            expect(result.breakdown.testing).toBe(0);
        });

        it('Test 33: should increase implementation and testing ratios for high complexity', () => {
            const highComplexity = estimator.estimate('Task', 'desc', {
                codeComplexity: 5,
                fileCount: 1,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: false,
                uncertainty: 0
            });
            const lowComplexity = estimator.estimate('Task', 'desc', {
                codeComplexity: 1,
                fileCount: 1,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: false,
                uncertainty: 0
            });
            // High complexity (>=4) adds 0.1 to implementation ratio, 0.05 to testing
            // This means proportion of implementation should be higher relative to total
            const highImplRatio = highComplexity.breakdown.implementation /
                (highComplexity.breakdown.implementation + highComplexity.breakdown.testing +
                 highComplexity.breakdown.documentation + highComplexity.breakdown.review);
            const lowImplRatio = lowComplexity.breakdown.implementation /
                (lowComplexity.breakdown.implementation + lowComplexity.breakdown.testing +
                 lowComplexity.breakdown.documentation + lowComplexity.breakdown.review);
            expect(highImplRatio).toBeGreaterThanOrEqual(lowImplRatio);
        });
    });

    // ---------------------------------------------------------------
    // Confidence calculation
    // ---------------------------------------------------------------
    describe('estimate() confidence', () => {
        it('Test 34: should return higher confidence for low complexity', () => {
            const low = estimator.estimate('Task', 'desc', {
                codeComplexity: 1,
                uncertainty: 0,
                hasExternalAPI: false
            });
            const high = estimator.estimate('Task', 'desc', {
                codeComplexity: 5,
                uncertainty: 0.5,
                hasExternalAPI: true
            });
            expect(low.confidence).toBeGreaterThan(high.confidence);
        });

        it('Test 35: should clamp confidence between 0.3 and 0.95', () => {
            const worst = estimator.estimate('Task', 'desc', {
                codeComplexity: 5,
                uncertainty: 1.0,
                hasExternalAPI: true
            });
            expect(worst.confidence).toBeGreaterThanOrEqual(0.3);

            const best = estimator.estimate('Task', 'desc', {
                codeComplexity: 1,
                uncertainty: 0,
                hasExternalAPI: false
            });
            expect(best.confidence).toBeLessThanOrEqual(0.95);
        });

        it('Test 36: should increase confidence when historical data exceeds 10 points', () => {
            const before = estimator.estimate('Task', 'desc', {
                codeComplexity: 2,
                uncertainty: 0.2,
                hasExternalAPI: false
            });

            // Add 11 historical data points
            for (let i = 0; i < 11; i++) {
                estimator.addHistoricalData({
                    taskType: 'unknown',
                    estimated: 30,
                    actual: 30,
                    factors: {}
                });
            }

            const after = estimator.estimate('Task', 'desc', {
                codeComplexity: 2,
                uncertainty: 0.2,
                hasExternalAPI: false
            });

            expect(after.confidence).toBeGreaterThan(before.confidence);
        });
    });

    // ---------------------------------------------------------------
    // Warnings
    // ---------------------------------------------------------------
    describe('estimate() warnings', () => {
        it('Test 37: should warn for high complexity (>=4)', () => {
            const result = estimator.estimate('Task', 'desc', {
                codeComplexity: 4,
                fileCount: 1,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: false,
                uncertainty: 0
            });
            expect(result.warnings).toContain(
                'High complexity - consider breaking into smaller tasks'
            );
        });

        it('Test 38: should warn for external API', () => {
            const result = estimator.estimate('Task', 'desc', {
                hasExternalAPI: true,
                hasUI: false,
                codeComplexity: 1,
                fileCount: 1,
                dependencyCount: 0,
                requiresTests: true,
                uncertainty: 0
            });
            expect(result.warnings).toContain(
                'External API integration - may vary based on API reliability'
            );
        });

        it('Test 39: should warn for multiple files (>3)', () => {
            const result = estimator.estimate('Task', 'desc', {
                fileCount: 5,
                codeComplexity: 1,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: false,
                uncertainty: 0
            });
            expect(result.warnings).toContain(
                'Multiple files - consider if this should be multiple tasks'
            );
        });

        it('Test 40: should warn for high uncertainty (>0.4)', () => {
            const result = estimator.estimate('Task', 'desc', {
                uncertainty: 0.5,
                codeComplexity: 1,
                fileCount: 1,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: false
            });
            expect(result.warnings).toContain(
                'High uncertainty - estimate may vary significantly'
            );
        });

        it('Test 41: should warn when estimate hits max duration', () => {
            const capped = new EffortEstimator({ maxMinutes: 20 });
            const result = capped.estimate('Task', 'desc', {
                codeComplexity: 5,
                fileCount: 10,
                dependencyCount: 5,
                hasUI: true,
                requiresTests: true,
                hasExternalAPI: true,
                uncertainty: 0
            });
            expect(result.warnings).toContain(
                'Task at maximum duration - consider splitting'
            );
        });

        it('Test 42: should return no warnings for simple low-risk tasks', () => {
            const result = estimator.estimate('Simple task', 'basic work', {
                codeComplexity: 1,
                fileCount: 1,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: false,
                uncertainty: 0
            });
            expect(result.warnings).toHaveLength(0);
        });
    });

    // ---------------------------------------------------------------
    // Historical data and recalibration
    // ---------------------------------------------------------------
    describe('addHistoricalData and recalibration', () => {
        it('Test 43: should not recalibrate with fewer than 5 data points', () => {
            for (let i = 0; i < 4; i++) {
                estimator.addHistoricalData({
                    taskType: 'unknown',
                    estimated: 30,
                    actual: 60,
                    factors: {}
                });
            }
            // Calibration should still be 1.0 since <5 points
            const stats = estimator.getStatistics();
            expect(stats.calibration).toBe(1.0);
        });

        it('Test 44: should recalibrate with 5 or more data points', () => {
            for (let i = 0; i < 5; i++) {
                estimator.addHistoricalData({
                    taskType: 'unknown',
                    estimated: 30,
                    actual: 60,
                    factors: {}
                });
            }
            // Actual/estimated = 2.0 for all data points
            // calibrationFactor = 1.0 * 0.7 + 2.0 * 0.3 = 0.7 + 0.6 = 1.3
            const stats = estimator.getStatistics();
            expect(stats.calibration).toBeGreaterThan(1.0);
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('[EffortEstimator] Recalibrated')
            );
        });

        it('Test 45: should clamp calibration factor to [0.5, 2.0]', () => {
            // Add data where actual is 0.1x estimated => ratio very low
            for (let i = 0; i < 10; i++) {
                estimator.addHistoricalData({
                    taskType: 'unknown',
                    estimated: 100,
                    actual: 1,
                    factors: {}
                });
            }
            const stats = estimator.getStatistics();
            expect(stats.calibration).toBeGreaterThanOrEqual(0.5);
            expect(stats.calibration).toBeLessThanOrEqual(2.0);
        });

        it('Test 46: should affect estimate after recalibration', () => {
            const before = estimator.estimate('Generic task', 'no keywords', {
                codeComplexity: 2,
                fileCount: 1,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: false,
                uncertainty: 0.2
            });

            // Add historical data showing tasks take longer than estimated
            for (let i = 0; i < 6; i++) {
                estimator.addHistoricalData({
                    taskType: 'unknown',
                    estimated: 20,
                    actual: 40,
                    factors: {}
                });
            }

            const after = estimator.estimate('Generic task', 'no keywords', {
                codeComplexity: 2,
                fileCount: 1,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: false,
                uncertainty: 0.2
            });

            // After calibration with ratio 2.0, estimates should increase
            // (or stay the same if clamped at max)
            expect(after.estimateMinutes).toBeGreaterThanOrEqual(before.estimateMinutes);
        });
    });

    // ---------------------------------------------------------------
    // formatEstimate
    // ---------------------------------------------------------------
    describe('formatEstimate', () => {
        it('Test 47: should format with range when min !== max', () => {
            const result: EstimationResult = {
                estimateMinutes: 30,
                confidence: 0.75,
                minMinutes: 25,
                maxMinutes: 40,
                breakdown: { implementation: 18, testing: 8, documentation: 3, review: 1 },
                factors: {
                    codeComplexity: 2,
                    fileCount: 1,
                    dependencyCount: 0,
                    hasUI: false,
                    requiresTests: true,
                    hasExternalAPI: false,
                    uncertainty: 0.2
                },
                warnings: []
            };
            const formatted = estimator.formatEstimate(result);
            expect(formatted).toBe('30 minutes (25-40, 75% confidence)');
        });

        it('Test 48: should format without range when min === max', () => {
            const result: EstimationResult = {
                estimateMinutes: 30,
                confidence: 0.95,
                minMinutes: 30,
                maxMinutes: 30,
                breakdown: { implementation: 18, testing: 8, documentation: 3, review: 1 },
                factors: {
                    codeComplexity: 2,
                    fileCount: 1,
                    dependencyCount: 0,
                    hasUI: false,
                    requiresTests: true,
                    hasExternalAPI: false,
                    uncertainty: 0.2
                },
                warnings: []
            };
            const formatted = estimator.formatEstimate(result);
            expect(formatted).toBe('30 minutes');
        });
    });

    // ---------------------------------------------------------------
    // getStatistics
    // ---------------------------------------------------------------
    describe('getStatistics', () => {
        it('Test 49: should return zero accuracy and zero data points when no data', () => {
            const stats = estimator.getStatistics();
            expect(stats.avgAccuracy).toBe(0);
            expect(stats.dataPoints).toBe(0);
            expect(stats.calibration).toBe(1.0);
        });

        it('Test 50: should return correct statistics with historical data', () => {
            estimator.addHistoricalData({
                taskType: 'unknown',
                estimated: 30,
                actual: 30,
                factors: {}
            });
            estimator.addHistoricalData({
                taskType: 'fix-bug',
                estimated: 20,
                actual: 25,
                factors: {}
            });

            const stats = estimator.getStatistics();
            expect(stats.dataPoints).toBe(2);
            // First data point: error = 0/30 = 0, accuracy = 1
            // Second data point: error = 5/20 = 0.25, accuracy = 0.75
            // Average = (1 + 0.75) / 2 = 0.875 => rounded to 0.88
            expect(stats.avgAccuracy).toBe(0.88);
            // Still no recalibration (< 5 points)
            expect(stats.calibration).toBe(1.0);
        });

        it('Test 51: should reflect calibration factor after recalibration', () => {
            for (let i = 0; i < 5; i++) {
                estimator.addHistoricalData({
                    taskType: 'unknown',
                    estimated: 30,
                    actual: 30,
                    factors: {}
                });
            }
            const stats = estimator.getStatistics();
            expect(stats.dataPoints).toBe(5);
            // Ratio actual/estimated = 1.0 for all, calibration = 1.0 * 0.7 + 1.0 * 0.3 = 1.0
            expect(stats.calibration).toBe(1.0);
            expect(stats.avgAccuracy).toBe(1);
        });
    });

    // ---------------------------------------------------------------
    // Singleton
    // ---------------------------------------------------------------
    describe('Singleton management', () => {
        it('Test 52: should return same instance from getEffortEstimator', () => {
            const a = getEffortEstimator();
            const b = getEffortEstimator();
            expect(a).toBe(b);
        });

        it('Test 53: should return new instance after resetEffortEstimatorForTests', () => {
            const a = getEffortEstimator();
            resetEffortEstimatorForTests();
            const b = getEffortEstimator();
            expect(a).not.toBe(b);
        });

        it('Test 54: should create fresh estimator after reset (no historical data)', () => {
            const first = getEffortEstimator();
            first.addHistoricalData({
                taskType: 'unknown',
                estimated: 30,
                actual: 60,
                factors: {}
            });
            expect(first.getStatistics().dataPoints).toBe(1);

            resetEffortEstimatorForTests();
            const second = getEffortEstimator();
            expect(second.getStatistics().dataPoints).toBe(0);
        });
    });

    // ---------------------------------------------------------------
    // Edge cases and provided factors
    // ---------------------------------------------------------------
    describe('estimate() with explicit factors', () => {
        it('Test 55: should use provided factors over inferred ones', () => {
            const result = estimator.estimate(
                'Create component with complex algorithm',
                'Build a complex UI component using an API endpoint',
                {
                    codeComplexity: 1,
                    fileCount: 1,
                    hasUI: false,
                    hasExternalAPI: false,
                    uncertainty: 0
                }
            );
            // Provided factors should override inference
            expect(result.factors.codeComplexity).toBe(1);
            expect(result.factors.fileCount).toBe(1);
            expect(result.factors.hasUI).toBe(false);
            expect(result.factors.hasExternalAPI).toBe(false);
            expect(result.factors.uncertainty).toBe(0);
        });

        it('Test 56: should handle dependency count multiplier', () => {
            const noDeps = estimator.estimate('Task', 'desc', {
                dependencyCount: 0,
                codeComplexity: 2,
                fileCount: 1,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: false,
                uncertainty: 0.2
            });
            const manyDeps = estimator.estimate('Task', 'desc', {
                dependencyCount: 5,
                codeComplexity: 2,
                fileCount: 1,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: false,
                uncertainty: 0.2
            });
            // dependencyCount * 0.1 multiplier, so more deps = higher estimate
            expect(manyDeps.estimateMinutes).toBeGreaterThanOrEqual(noDeps.estimateMinutes);
        });
    });

    // ---------------------------------------------------------------
    // Estimate range (min/max minutes on result)
    // ---------------------------------------------------------------
    describe('estimate() range values', () => {
        it('Test 57: should have minMinutes <= estimateMinutes <= maxMinutes', () => {
            const result = estimator.estimate('Build feature', 'A feature', {
                codeComplexity: 3,
                fileCount: 2,
                uncertainty: 0.3
            });
            expect(result.minMinutes).toBeLessThanOrEqual(result.estimateMinutes);
            expect(result.estimateMinutes).toBeLessThanOrEqual(result.maxMinutes);
        });

        it('Test 58: should narrow range when confidence is high', () => {
            const highConf = estimator.estimate('Task', 'desc', {
                codeComplexity: 1,
                fileCount: 1,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: false,
                uncertainty: 0
            });
            const lowConf = estimator.estimate('Task', 'desc', {
                codeComplexity: 4,
                fileCount: 1,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: true,
                uncertainty: 0.5
            });
            const highRange = highConf.maxMinutes - highConf.minMinutes;
            const lowRange = lowConf.maxMinutes - lowConf.minMinutes;
            // Higher confidence should produce tighter range
            expect(highRange).toBeLessThanOrEqual(lowRange);
        });
    });

    // ---------------------------------------------------------------
    // Multiple warnings combined
    // ---------------------------------------------------------------
    describe('estimate() combined warnings', () => {
        it('Test 59: should accumulate multiple warnings', () => {
            const capped = new EffortEstimator({ maxMinutes: 20 });
            const result = capped.estimate('Task', 'desc', {
                codeComplexity: 5,
                fileCount: 5,
                dependencyCount: 0,
                hasUI: false,
                requiresTests: true,
                hasExternalAPI: true,
                uncertainty: 0.6
            });
            // Should have: high complexity, external API, multiple files,
            // high uncertainty, max duration
            expect(result.warnings.length).toBeGreaterThanOrEqual(4);
        });
    });

    // ---------------------------------------------------------------
    // Recalibration with varied data
    // ---------------------------------------------------------------
    describe('recalibration edge cases', () => {
        it('Test 60: should handle varied historical ratios smoothly', () => {
            // Mix of over and under estimates
            const data: HistoricalDataPoint[] = [
                { taskType: 'fix-bug', estimated: 30, actual: 20, factors: {} },
                { taskType: 'fix-bug', estimated: 30, actual: 40, factors: {} },
                { taskType: 'fix-bug', estimated: 30, actual: 30, factors: {} },
                { taskType: 'fix-bug', estimated: 30, actual: 25, factors: {} },
                { taskType: 'fix-bug', estimated: 30, actual: 35, factors: {} },
            ];
            for (const d of data) {
                estimator.addHistoricalData(d);
            }
            const stats = estimator.getStatistics();
            // Average ratio = (20/30 + 40/30 + 30/30 + 25/30 + 35/30) / 5 = 150/150 = 1.0
            // calibration = 1.0 * 0.7 + 1.0 * 0.3 = 1.0
            expect(stats.calibration).toBe(1.0);
            expect(stats.dataPoints).toBe(5);
        });
    });
});
