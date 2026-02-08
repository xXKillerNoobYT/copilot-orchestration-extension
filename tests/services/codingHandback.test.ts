/**
 * Tests for Coding Agent Handback Workflow (MT-033.33)
 *
 * Validates handback package creation, validation checks, scope compliance,
 * acceptance criteria matching, and overall orchestrator review.
 */

import {
    // Types
    ConfidenceLevel,
    HandbackStatus,
    CheckResult,
    FileChange,
    TestResult,
    TestFailure,
    DiscoveredIssue,
    HandbackPackage,
    ValidationCheck,
    ScopeViolation,
    ValidationResult,
    HandbackConfig,

    // Constants
    DEFAULT_HANDBACK_CONFIG,

    // Functions
    generateHandbackId,
    createHandbackPackage,
    determineHandbackStatus,
    validateTestResults,
    validateAcceptanceCriteria,
    validateScope,
    validateCoverage,
    validateTimeSpent,
    validateConfidence,
    validateHandback,
    determineSuggestedStatus,
    generateValidationSummary,
    serializeHandback,
    deserializeHandback
} from '../../src/services/codingHandback';

import {
    HandoffPackage
} from '../../src/services/codingHandoff';

import {
    AtomicTask,
    MasterTicket,
    TaskPriority,
    AgentTeam,
    TaskStatus
} from '../../src/generators/taskBreakdown';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTask(overrides?: Partial<AtomicTask>): AtomicTask {
    return {
        id: 'MT-1.1',
        parentId: 'MT-1',
        featureId: 'feat-1',
        title: 'Build login form',
        description: 'Create login',
        priority: 'P1' as TaskPriority,
        estimatedMinutes: 30,
        dependsOn: [],
        acceptanceCriteria: ['Form renders correctly', 'Validation works'],
        files: ['src/ui/loginForm.ts'],
        isUI: true,
        assignedTeam: 'coding' as AgentTeam,
        status: 'in_progress' as TaskStatus,
        developerStoryId: null,
        relatedUserStoryIds: [],
        ...overrides
    };
}

function makeParentTicket(): MasterTicket {
    return {
        id: 'MT-1',
        featureId: 'feat-1',
        title: 'Auth',
        description: '',
        priority: 'P1' as TaskPriority,
        acceptanceCriteria: [],
        technicalNotes: '',
        childTaskIds: ['MT-1.1'],
        dependsOn: [],
        estimatedMinutes: 60,
        assignedTeam: 'coding' as AgentTeam
    };
}

function makeHandoffPackage(overrides?: Partial<HandoffPackage>): HandoffPackage {
    return {
        id: 'HO-MT-1.1-20240101',
        createdAt: '2024-01-01T00:00:00Z',
        urgency: 'normal',
        task: makeTask(),
        parentTicket: makeParentTicket(),
        taskType: 'build',
        summary: 'Build login form',
        detailedDescription: 'Create login',
        acceptanceCriteria: ['Form renders correctly', 'Validation works'],
        definitionOfDone: ['All tests pass'],
        fileReferences: [
            { path: 'src/ui/loginForm.ts', action: 'create', description: 'Create form' },
            { path: 'tests/ui/loginForm.test.ts', action: 'create', description: 'Create tests' }
        ],
        codePatterns: [],
        testSpecifications: [],
        constraints: [],
        completedDependencies: [],
        inProgressSiblings: [],
        technicalNotes: '',
        ...overrides
    } as HandoffPackage;
}

function makeTestResult(overrides?: Partial<TestResult>): TestResult {
    return {
        suiteName: 'loginForm.test.ts',
        totalTests: 10,
        passed: 10,
        failed: 0,
        skipped: 0,
        failures: [],
        durationMs: 500,
        ...overrides
    };
}

function makeFileChange(overrides?: Partial<FileChange>): FileChange {
    return {
        filePath: 'src/ui/loginForm.ts',
        changeType: 'created',
        content: 'export function login() {}',
        linesAdded: 10,
        linesRemoved: 0,
        ...overrides
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('CodingHandback', () => {

    // ── Handback ID ──────────────────────────────────────────────────

    describe('generateHandbackId', () => {

        it('Test 1: should include task ID and HB prefix', () => {
            const id = generateHandbackId('MT-1.1');
            expect(id).toContain('HB-MT-1.1-');
        });

        it('Test 2: should include timestamp', () => {
            const id = generateHandbackId('MT-1.1');
            expect(id.length).toBeGreaterThan('HB-MT-1.1-'.length);
        });
    });

    // ── Status Determination ─────────────────────────────────────────

    describe('determineHandbackStatus', () => {

        it('Test 3: should return blocked when blockers present', () => {
            const issues: DiscoveredIssue[] = [
                { type: 'blocker', title: 'Missing API', description: 'API not available', affectedFiles: [], severity: 1 }
            ];
            expect(determineHandbackStatus([makeFileChange()], [makeTestResult()], issues, 'high')).toBe('blocked');
        });

        it('Test 4: should return failed when no file changes', () => {
            expect(determineHandbackStatus([], [makeTestResult()], [], 'high')).toBe('failed');
        });

        it('Test 5: should return success when tests pass and confidence >= medium', () => {
            expect(determineHandbackStatus([makeFileChange()], [makeTestResult()], [], 'high')).toBe('success');
            expect(determineHandbackStatus([makeFileChange()], [makeTestResult()], [], 'medium')).toBe('success');
        });

        it('Test 6: should return partial when tests fail', () => {
            const failedTest = makeTestResult({ failed: 2, passed: 8 });
            expect(determineHandbackStatus([makeFileChange()], [failedTest], [], 'high')).toBe('partial');
        });

        it('Test 7: should return partial when confidence is low', () => {
            expect(determineHandbackStatus([makeFileChange()], [makeTestResult()], [], 'low')).toBe('partial');
        });
    });

    // ── Package Creation ─────────────────────────────────────────────

    describe('createHandbackPackage', () => {

        it('Test 8: should create a complete handback package', () => {
            const pkg = createHandbackPackage(
                'HO-MT-1.1-123',
                'MT-1.1',
                'coding-agent-1',
                [makeFileChange()],
                [makeTestResult()],
                [],
                25,
                30,
                'high',
                'Implemented login form'
            );

            expect(pkg.id).toContain('HB-MT-1.1-');
            expect(pkg.handoffId).toBe('HO-MT-1.1-123');
            expect(pkg.taskId).toBe('MT-1.1');
            expect(pkg.agentId).toBe('coding-agent-1');
            expect(pkg.status).toBe('success');
            expect(pkg.summary).toBe('Implemented login form');
        });

        it('Test 9: should auto-determine status from results', () => {
            const pkg = createHandbackPackage(
                'HO-1', 'MT-1.1', 'agent-1',
                [], // no changes
                [makeTestResult()],
                [],
                30, 30, 'high',
                'Nothing done'
            );

            expect(pkg.status).toBe('failed');
        });
    });

    // ── Test Results Validation ──────────────────────────────────────

    describe('validateTestResults', () => {

        it('Test 10: should pass when all tests pass', () => {
            const result = validateTestResults([makeTestResult()]);
            expect(result.result).toBe('pass');
            expect(result.details).toContain('10/10');
        });

        it('Test 11: should fail when any test fails', () => {
            const result = validateTestResults([
                makeTestResult({ failed: 3, passed: 7, totalTests: 10 })
            ]);
            expect(result.result).toBe('fail');
            expect(result.details).toContain('3');
        });

        it('Test 12: should skip when no test results', () => {
            const result = validateTestResults([]);
            expect(result.result).toBe('skip');
        });

        it('Test 13: should aggregate multiple test suites', () => {
            const result = validateTestResults([
                makeTestResult({ totalTests: 5, passed: 5, failed: 0 }),
                makeTestResult({ totalTests: 8, passed: 8, failed: 0 })
            ]);
            expect(result.result).toBe('pass');
            expect(result.details).toContain('13/13');
        });
    });

    // ── Acceptance Criteria Validation ───────────────────────────────

    describe('validateAcceptanceCriteria', () => {

        it('Test 14: should pass when criteria keywords match', () => {
            const handoff = makeHandoffPackage({
                acceptanceCriteria: ['Form renders correctly']
            });
            const handback: HandbackPackage = {
                id: 'HB-1', handoffId: 'HO-1', taskId: 'MT-1.1', agentId: 'a',
                submittedAt: '', fileChanges: [makeFileChange({ filePath: 'src/ui/form.ts' })],
                testResults: [], issues: [], timeSpentMinutes: 30,
                originalEstimateMinutes: 30, confidence: 'high', status: 'success',
                summary: 'Built form that renders correctly with validation'
            };

            const result = validateAcceptanceCriteria(handoff, handback);
            expect(result.result).not.toBe('fail');
        });

        it('Test 15: should skip when no criteria defined', () => {
            const handoff = makeHandoffPackage({ acceptanceCriteria: [] });
            const handback: HandbackPackage = {
                id: 'HB-1', handoffId: 'HO-1', taskId: 'MT-1.1', agentId: 'a',
                submittedAt: '', fileChanges: [], testResults: [], issues: [],
                timeSpentMinutes: 0, originalEstimateMinutes: 0,
                confidence: 'high', status: 'success', summary: ''
            };

            const result = validateAcceptanceCriteria(handoff, handback);
            expect(result.result).toBe('skip');
        });
    });

    // ── Scope Validation ─────────────────────────────────────────────

    describe('validateScope', () => {

        it('Test 16: should pass when all changes within scope', () => {
            const handoff = makeHandoffPackage();
            const handback: HandbackPackage = {
                id: 'HB-1', handoffId: 'HO-1', taskId: 'MT-1.1', agentId: 'a',
                submittedAt: '', fileChanges: [
                    makeFileChange({ filePath: 'src/ui/loginForm.ts' }),
                    makeFileChange({ filePath: 'tests/ui/loginForm.test.ts' })
                ],
                testResults: [], issues: [], timeSpentMinutes: 30,
                originalEstimateMinutes: 30, confidence: 'high', status: 'success',
                summary: ''
            };

            const { check, violations } = validateScope(handoff, handback, DEFAULT_HANDBACK_CONFIG);
            expect(check.result).toBe('pass');
            expect(violations).toHaveLength(0);
        });

        it('Test 17: should fail for out-of-scope changes', () => {
            const handoff = makeHandoffPackage();
            const handback: HandbackPackage = {
                id: 'HB-1', handoffId: 'HO-1', taskId: 'MT-1.1', agentId: 'a',
                submittedAt: '', fileChanges: [
                    makeFileChange({ filePath: 'src/ui/loginForm.ts' }),
                    makeFileChange({ filePath: 'tests/ui/loginForm.test.ts' }),
                    makeFileChange({ filePath: 'src/extension.ts' }) // Out of scope!
                ],
                testResults: [], issues: [], timeSpentMinutes: 30,
                originalEstimateMinutes: 30, confidence: 'high', status: 'success',
                summary: ''
            };

            const { check, violations } = validateScope(handoff, handback, DEFAULT_HANDBACK_CONFIG);
            expect(check.result).toBe('fail');
            expect(violations.some(v => v.filePath === 'src/extension.ts')).toBe(true);
        });

        it('Test 18: should warn instead of fail when allowOutOfScopeChanges is true', () => {
            const handoff = makeHandoffPackage();
            const handback: HandbackPackage = {
                id: 'HB-1', handoffId: 'HO-1', taskId: 'MT-1.1', agentId: 'a',
                submittedAt: '', fileChanges: [
                    makeFileChange({ filePath: 'src/ui/loginForm.ts' }),
                    makeFileChange({ filePath: 'tests/ui/loginForm.test.ts' }),
                    makeFileChange({ filePath: 'src/rogue.ts' })
                ],
                testResults: [], issues: [], timeSpentMinutes: 30,
                originalEstimateMinutes: 30, confidence: 'high', status: 'success',
                summary: ''
            };

            const { check } = validateScope(handoff, handback, { ...DEFAULT_HANDBACK_CONFIG, allowOutOfScopeChanges: true });
            expect(check.result).toBe('warning');
        });

        it('Test 19: should flag missing expected files', () => {
            const handoff = makeHandoffPackage();
            const handback: HandbackPackage = {
                id: 'HB-1', handoffId: 'HO-1', taskId: 'MT-1.1', agentId: 'a',
                submittedAt: '',
                fileChanges: [makeFileChange({ filePath: 'src/ui/loginForm.ts' })], // Missing test file
                testResults: [], issues: [], timeSpentMinutes: 30,
                originalEstimateMinutes: 30, confidence: 'high', status: 'success',
                summary: ''
            };

            const { violations } = validateScope(handoff, handback, DEFAULT_HANDBACK_CONFIG);
            expect(violations.some(v => v.type === 'missing_file')).toBe(true);
        });
    });

    // ── Coverage Validation ──────────────────────────────────────────

    describe('validateCoverage', () => {

        it('Test 20: should pass when coverage meets threshold', () => {
            const result = validateCoverage(
                [makeTestResult({ coveragePercent: 90 })],
                DEFAULT_HANDBACK_CONFIG
            );
            expect(result.result).toBe('pass');
        });

        it('Test 21: should fail when coverage below threshold', () => {
            const result = validateCoverage(
                [makeTestResult({ coveragePercent: 50 })],
                DEFAULT_HANDBACK_CONFIG
            );
            expect(result.result).toBe('fail');
        });

        it('Test 22: should skip when no coverage data', () => {
            const result = validateCoverage(
                [makeTestResult()], // No coveragePercent
                DEFAULT_HANDBACK_CONFIG
            );
            expect(result.result).toBe('skip');
        });

        it('Test 23: should average coverage across suites', () => {
            const result = validateCoverage(
                [
                    makeTestResult({ coveragePercent: 100 }),
                    makeTestResult({ coveragePercent: 60 })
                ],
                DEFAULT_HANDBACK_CONFIG // min 80
            );
            // Average = 80, should pass (exactly meets threshold)
            expect(result.result).toBe('pass');
        });
    });

    // ── Time Budget Validation ───────────────────────────────────────

    describe('validateTimeSpent', () => {

        it('Test 24: should pass when under budget', () => {
            const handback = { timeSpentMinutes: 20, originalEstimateMinutes: 30 } as HandbackPackage;
            const result = validateTimeSpent(handback, DEFAULT_HANDBACK_CONFIG);
            expect(result.result).toBe('pass');
        });

        it('Test 25: should warn for acceptable overrun', () => {
            const handback = { timeSpentMinutes: 40, originalEstimateMinutes: 30 } as HandbackPackage;
            const result = validateTimeSpent(handback, DEFAULT_HANDBACK_CONFIG); // max 50%
            expect(result.result).toBe('warning');
        });

        it('Test 26: should fail for excessive overrun', () => {
            const handback = { timeSpentMinutes: 100, originalEstimateMinutes: 30 } as HandbackPackage;
            const result = validateTimeSpent(handback, DEFAULT_HANDBACK_CONFIG);
            expect(result.result).toBe('fail');
        });

        it('Test 27: should skip when no estimate', () => {
            const handback = { timeSpentMinutes: 30, originalEstimateMinutes: 0 } as HandbackPackage;
            const result = validateTimeSpent(handback, DEFAULT_HANDBACK_CONFIG);
            expect(result.result).toBe('skip');
        });
    });

    // ── Confidence Validation ────────────────────────────────────────

    describe('validateConfidence', () => {

        it('Test 28: should pass for high confidence', () => {
            const handback = { confidence: 'high' } as HandbackPackage;
            const result = validateConfidence(handback, DEFAULT_HANDBACK_CONFIG);
            expect(result.result).toBe('pass');
        });

        it('Test 29: should pass for medium when medium is min', () => {
            const handback = { confidence: 'medium' } as HandbackPackage;
            const result = validateConfidence(handback, DEFAULT_HANDBACK_CONFIG);
            expect(result.result).toBe('pass');
        });

        it('Test 30: should warn for low confidence when medium is min', () => {
            const handback = { confidence: 'low' } as HandbackPackage;
            const result = validateConfidence(handback, DEFAULT_HANDBACK_CONFIG);
            expect(result.result).toBe('warning');
        });
    });

    // ── Full Validation ──────────────────────────────────────────────

    describe('validateHandback', () => {

        it('Test 31: should accept valid handback', () => {
            const handoff = makeHandoffPackage();
            const handback: HandbackPackage = {
                id: 'HB-1', handoffId: 'HO-1', taskId: 'MT-1.1', agentId: 'a',
                submittedAt: '',
                fileChanges: [
                    makeFileChange({ filePath: 'src/ui/loginForm.ts' }),
                    makeFileChange({ filePath: 'tests/ui/loginForm.test.ts' })
                ],
                testResults: [makeTestResult({ coveragePercent: 90 })],
                issues: [],
                timeSpentMinutes: 25, originalEstimateMinutes: 30,
                confidence: 'high', status: 'success',
                summary: 'Built login form with validation that renders correctly'
            };

            const result = validateHandback(handoff, handback);
            expect(result.accepted).toBe(true);
            expect(result.suggestedStatus).toBe('done');
        });

        it('Test 32: should reject when tests fail', () => {
            const handoff = makeHandoffPackage();
            const handback: HandbackPackage = {
                id: 'HB-1', handoffId: 'HO-1', taskId: 'MT-1.1', agentId: 'a',
                submittedAt: '',
                fileChanges: [
                    makeFileChange({ filePath: 'src/ui/loginForm.ts' }),
                    makeFileChange({ filePath: 'tests/ui/loginForm.test.ts' })
                ],
                testResults: [makeTestResult({ failed: 3, passed: 7, totalTests: 10 })],
                issues: [],
                timeSpentMinutes: 30, originalEstimateMinutes: 30,
                confidence: 'high', status: 'partial',
                summary: 'Partial implementation'
            };

            const result = validateHandback(handoff, handback);
            expect(result.accepted).toBe(false);
            expect(result.suggestedStatus).toBe('in_progress');
        });

        it('Test 33: should include all check types', () => {
            const handoff = makeHandoffPackage();
            const handback: HandbackPackage = {
                id: 'HB-1', handoffId: 'HO-1', taskId: 'MT-1.1', agentId: 'a',
                submittedAt: '',
                fileChanges: [
                    makeFileChange({ filePath: 'src/ui/loginForm.ts' }),
                    makeFileChange({ filePath: 'tests/ui/loginForm.test.ts' })
                ],
                testResults: [makeTestResult()],
                issues: [],
                timeSpentMinutes: 30, originalEstimateMinutes: 30,
                confidence: 'high', status: 'success',
                summary: ''
            };

            const result = validateHandback(handoff, handback);
            const checkNames = result.checks.map(c => c.name);
            expect(checkNames).toContain('Tests Pass');
            expect(checkNames).toContain('Acceptance Criteria');
            expect(checkNames).toContain('Scope Compliance');
            expect(checkNames).toContain('Test Coverage');
            expect(checkNames).toContain('Time Budget');
            expect(checkNames).toContain('Confidence Level');
        });

        it('Test 34: should respect config overrides', () => {
            const handoff = makeHandoffPackage();
            const handback: HandbackPackage = {
                id: 'HB-1', handoffId: 'HO-1', taskId: 'MT-1.1', agentId: 'a',
                submittedAt: '',
                fileChanges: [
                    makeFileChange({ filePath: 'src/ui/loginForm.ts' }),
                    makeFileChange({ filePath: 'tests/ui/loginForm.test.ts' }),
                    makeFileChange({ filePath: 'src/rogue.ts' }) // Out of scope
                ],
                testResults: [makeTestResult()],
                issues: [],
                timeSpentMinutes: 30, originalEstimateMinutes: 30,
                confidence: 'high', status: 'success',
                summary: 'Done with renders and validation'
            };

            // Should fail with default config (out of scope)
            const strict = validateHandback(handoff, handback);
            expect(strict.accepted).toBe(false);

            // Should accept with lenient config
            const lenient = validateHandback(handoff, handback, { allowOutOfScopeChanges: true });
            expect(lenient.accepted).toBe(true);
        });
    });

    // ── Suggested Status ─────────────────────────────────────────────

    describe('determineSuggestedStatus', () => {

        it('Test 35: should suggest done for accepted', () => {
            const handback = { status: 'success' } as HandbackPackage;
            expect(determineSuggestedStatus(true, handback, [])).toBe('done');
        });

        it('Test 36: should suggest blocked for blocked handback', () => {
            const handback = { status: 'blocked' } as HandbackPackage;
            expect(determineSuggestedStatus(false, handback, [])).toBe('blocked');
        });

        it('Test 37: should suggest in_progress when tests failed', () => {
            const handback = { status: 'partial' } as HandbackPackage;
            const failed: ValidationCheck[] = [{ name: 'Tests Pass', result: 'fail', details: '' }];
            expect(determineSuggestedStatus(false, handback, failed)).toBe('in_progress');
        });

        it('Test 38: should suggest verification for other failures', () => {
            const handback = { status: 'partial' } as HandbackPackage;
            const failed: ValidationCheck[] = [{ name: 'Scope Compliance', result: 'fail', details: '' }];
            expect(determineSuggestedStatus(false, handback, failed)).toBe('verification');
        });
    });

    // ── Summary Generation ───────────────────────────────────────────

    describe('generateValidationSummary', () => {

        it('Test 39: should include accept/reject and counts', () => {
            const checks: ValidationCheck[] = [
                { name: 'A', result: 'pass', details: '' },
                { name: 'B', result: 'fail', details: '' },
                { name: 'C', result: 'warning', details: '' }
            ];

            const summary = generateValidationSummary(false, checks, []);
            expect(summary).toContain('REJECTED');
            expect(summary).toContain('1 passed');
            expect(summary).toContain('1 failed');
            expect(summary).toContain('1 warnings');
        });

        it('Test 40: should include scope violations', () => {
            const violations: ScopeViolation[] = [
                { type: 'out_of_scope_file', filePath: 'rogue.ts', reason: 'Not in handoff' }
            ];

            const summary = generateValidationSummary(false, [], violations);
            expect(summary).toContain('1 scope violation');
        });
    });

    // ── Serialization ────────────────────────────────────────────────

    describe('serializeHandback / deserializeHandback', () => {

        it('Test 41: should round-trip a handback package', () => {
            const pkg = createHandbackPackage(
                'HO-1', 'MT-1.1', 'agent-1',
                [makeFileChange()],
                [makeTestResult()],
                [],
                25, 30, 'high',
                'Done'
            );

            const json = serializeHandback(pkg);
            const restored = deserializeHandback(json);
            expect(restored.id).toBe(pkg.id);
            expect(restored.taskId).toBe('MT-1.1');
            expect(restored.status).toBe('success');
        });

        it('Test 42: should throw on invalid JSON', () => {
            expect(() => deserializeHandback('not json')).toThrow('Failed to deserialize');
        });
    });

    // ── Default Config ───────────────────────────────────────────────

    describe('DEFAULT_HANDBACK_CONFIG', () => {

        it('Test 43: should have sensible defaults', () => {
            expect(DEFAULT_HANDBACK_CONFIG.requireAllTestsPass).toBe(true);
            expect(DEFAULT_HANDBACK_CONFIG.requireAllCriteriaMet).toBe(true);
            expect(DEFAULT_HANDBACK_CONFIG.allowOutOfScopeChanges).toBe(false);
            expect(DEFAULT_HANDBACK_CONFIG.minAutoAcceptConfidence).toBe('medium');
            expect(DEFAULT_HANDBACK_CONFIG.maxTimeOverrunPercent).toBe(50);
            expect(DEFAULT_HANDBACK_CONFIG.minTestCoverage).toBe(80);
        });
    });
});
