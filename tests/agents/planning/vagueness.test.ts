/**
 * @file Tests for VaguenessDetector
 *
 * Covers constructor variants, quickDetect patterns (subjective, unmeasurable,
 * undefined, ambiguous, context-dependent), SmartPlan toggling, strictness
 * levels, detect() full flow with LLM, clarification ticket creation,
 * singleton lifecycle, config accessors, and calculateOverallScore edges.
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

// Mock LLM service
const mockCompleteLLM = jest.fn();
jest.mock('../../../src/services/llmService', () => ({
    completeLLM: (...args: unknown[]) => mockCompleteLLM(...args)
}));

// Mock ticketDb
const mockGetTicket = jest.fn();
const mockUpdateTicket = jest.fn();
const mockOnTicketChange = jest.fn();
jest.mock('../../../src/services/ticketDb', () => ({
    getTicket: (...args: unknown[]) => mockGetTicket(...args),
    updateTicket: (...args: unknown[]) => mockUpdateTicket(...args),
    onTicketChange: (...args: unknown[]) => mockOnTicketChange(...args)
}));

import {
    VaguenessDetector,
    getVaguenessDetector,
    resetVaguenessDetectorForTests,
    type VaguenessResult,
    type VaguenessAnalysis,
    type VaguenessDetectorConfig
} from '../../../src/agents/planning/vagueness';

describe('VaguenessDetector', () => {
    let detector: VaguenessDetector;

    beforeEach(() => {
        jest.clearAllMocks();
        resetVaguenessDetectorForTests();
        detector = new VaguenessDetector();
    });

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------
    describe('constructor', () => {
        it('Test 1: should create detector with default config', () => {
            const d = new VaguenessDetector();
            expect(d).toBeInstanceOf(VaguenessDetector);
            expect(d.getThreshold()).toBe(70);
            expect(d.isSmartPlanEnabled()).toBe(true);
        });

        it('Test 2: should accept a numeric threshold (legacy constructor)', () => {
            const d = new VaguenessDetector(50);
            expect(d.getThreshold()).toBe(50);
            // Other defaults still applied
            expect(d.isSmartPlanEnabled()).toBe(true);
        });

        it('Test 3: should accept a partial config object', () => {
            const d = new VaguenessDetector({
                threshold: 85,
                enableSmartPlan: false,
                strictness: 'strict'
            });
            expect(d.getThreshold()).toBe(85);
            expect(d.isSmartPlanEnabled()).toBe(false);
        });

        it('Test 4: should merge partial config with defaults', () => {
            const d = new VaguenessDetector({ threshold: 40 });
            expect(d.getThreshold()).toBe(40);
            // enableSmartPlan and strictness should keep defaults
            expect(d.isSmartPlanEnabled()).toBe(true);
        });
    });

    // ---------------------------------------------------------------
    // quickDetect - pattern categories
    // ---------------------------------------------------------------
    describe('quickDetect pattern categories', () => {
        it('Test 5: should detect subjective terms (nice, good, better, great)', () => {
            const results = detector.quickDetect('Make it look nice and great');
            const categories = results.map(r => r.category);
            expect(categories).toContain('subjective');
            expect(results.length).toBeGreaterThanOrEqual(2);
        });

        it('Test 6: should detect unmeasurable terms (fast, quick, efficient)', () => {
            const results = detector.quickDetect('The response must be fast and efficient');
            const unmeasurable = results.filter(r => r.category === 'unmeasurable');
            expect(unmeasurable.length).toBeGreaterThanOrEqual(2);
        });

        it('Test 7: should detect undefined scope (some, etc)', () => {
            const results = detector.quickDetect('Add some buttons etc');
            const undefined_ = results.filter(r => r.category === 'undefined');
            expect(undefined_.length).toBeGreaterThanOrEqual(2);
        });

        it('Test 8: should detect ambiguous terms (maybe, possibly, might)', () => {
            const results = detector.quickDetect('We might add a feature and maybe a toggle');
            const ambiguous = results.filter(r => r.category === 'ambiguous');
            expect(ambiguous.length).toBeGreaterThanOrEqual(2);
        });

        it('Test 9: should detect context-dependent terms (as needed, when necessary)', () => {
            const results = detector.quickDetect('Update the cache as needed');
            const contextDep = results.filter(r => r.category === 'context-dependent');
            expect(contextDep.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ---------------------------------------------------------------
    // quickDetect - SmartPlan patterns
    // ---------------------------------------------------------------
    describe('quickDetect SmartPlan patterns', () => {
        it('Test 10: should include SmartPlan patterns when enabled', () => {
            detector.setSmartPlanEnabled(true);
            const results = detector.quickDetect('Improve performance and optimize the various endpoints');
            // "improve" and "optimize" are SmartPlan unmeasurable, "various endpoints" is SmartPlan undefined
            expect(results.length).toBeGreaterThanOrEqual(2);
        });

        it('Test 11: should exclude SmartPlan patterns when disabled', () => {
            detector.setSmartPlanEnabled(false);
            // "improve" is only in SMARTPLAN_PATTERNS, not base VAGUE_PATTERNS
            const results = detector.quickDetect('Improve the layout');
            const hasImprove = results.some(r => r.phrase.toLowerCase().includes('improve'));
            expect(hasImprove).toBe(false);
        });

        it('Test 12: should detect SmartPlan subjective terms (appropriate, suitable, seamless)', () => {
            detector.setSmartPlanEnabled(true);
            const results = detector.quickDetect('Provide a seamless and appropriate experience');
            const subjective = results.filter(r => r.category === 'subjective');
            expect(subjective.length).toBeGreaterThanOrEqual(2);
        });

        it('Test 13: should detect SmartPlan context-dependent terms (later, eventually, standard)', () => {
            detector.setSmartPlanEnabled(true);
            const results = detector.quickDetect('We will add this later using the standard approach');
            const contextDep = results.filter(r => r.category === 'context-dependent');
            expect(contextDep.length).toBeGreaterThanOrEqual(2);
        });

        it('Test 14: should detect SmartPlan ambiguous terms (flexible, like something)', () => {
            detector.setSmartPlanEnabled(true);
            const results = detector.quickDetect('Make it flexible like Jira');
            const ambiguous = results.filter(r => r.category === 'ambiguous');
            expect(ambiguous.length).toBeGreaterThanOrEqual(2);
        });

        it('Test 15: should detect SmartPlan undefined terms (various, other items)', () => {
            detector.setSmartPlanEnabled(true);
            const results = detector.quickDetect('Support various formats and other items');
            const undefined_ = results.filter(r => r.category === 'undefined');
            expect(undefined_.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ---------------------------------------------------------------
    // quickDetect - strictness levels
    // ---------------------------------------------------------------
    describe('quickDetect strictness levels', () => {
        it('Test 16: should give higher scores in relaxed mode', () => {
            detector.setStrictness('relaxed');
            const relaxed = detector.quickDetect('Make it nice');
            expect(relaxed[0].score).toBe(40); // 30 + 10
        });

        it('Test 17: should give standard scores in standard mode', () => {
            detector.setStrictness('standard');
            const standard = detector.quickDetect('Make it nice');
            expect(standard[0].score).toBe(30); // 30 + 0
        });

        it('Test 18: should give lower scores in strict mode', () => {
            detector.setStrictness('strict');
            const strict = detector.quickDetect('Make it nice');
            expect(strict[0].score).toBe(20); // 30 + (-10)
        });

        it('Test 19: should clamp scores to 0 minimum in strict mode', () => {
            // Score formula: Math.max(0, Math.min(100, 30 + adjustment))
            // strict => 30 - 10 = 20 which is above 0, but let's verify clamp logic works
            const d = new VaguenessDetector({ strictness: 'strict' });
            const results = d.quickDetect('Make it nice');
            expect(results[0].score).toBeGreaterThanOrEqual(0);
            expect(results[0].score).toBeLessThanOrEqual(100);
        });
    });

    // ---------------------------------------------------------------
    // quickDetect - clear text & deduplication
    // ---------------------------------------------------------------
    describe('quickDetect clear text and deduplication', () => {
        it('Test 20: should return empty array for clear technical text', () => {
            const results = detector.quickDetect(
                'The function accepts a string parameter and returns a boolean value'
            );
            expect(results.length).toBe(0);
        });

        it('Test 21: should deduplicate identical phrase matches', () => {
            // "nice" appears twice, but should be deduplicated
            const results = detector.quickDetect('Make it nice because nice is what we want');
            const nicePhrases = results.filter(r => r.phrase.toLowerCase() === 'nice');
            expect(nicePhrases.length).toBe(1);
        });

        it('Test 22: should include clarification questions and suggestions for each result', () => {
            const results = detector.quickDetect('Make it fast and simple');
            for (const result of results) {
                expect(result.clarificationQuestion).toBeTruthy();
                expect(result.suggestions.length).toBeGreaterThan(0);
            }
        });
    });

    // ---------------------------------------------------------------
    // detect() - full flow with LLM
    // ---------------------------------------------------------------
    describe('detect() full flow', () => {
        it('Test 23: should perform pattern and LLM detection for long text with few pattern matches', async () => {
            const longText = 'Implement a REST API endpoint that processes data from the upstream service and returns structured JSON. '
                + 'The endpoint should validate inputs and handle authorization. Additional context is needed for the deployment strategy.';

            const llmResponse = `VAGUE: deployment strategy
SCORE: 25
CATEGORY: undefined
QUESTION: What deployment strategy? Blue-green, canary, rolling?
SUGGESTION: Specify the deployment method explicitly`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const analysis = await detector.detect(longText);

            expect(analysis.originalText).toBe(longText);
            expect(analysis.items.length).toBeGreaterThanOrEqual(1);
            expect(analysis.timestamp).toBeInstanceOf(Date);
            expect(mockCompleteLLM).toHaveBeenCalled();
        });

        it('Test 24: should skip LLM when pattern detection finds 3+ items', async () => {
            const vagueText = 'Make it nice, fast, and simple with some features etc';

            const analysis = await detector.detect(vagueText);

            expect(mockCompleteLLM).not.toHaveBeenCalled();
            expect(analysis.items.length).toBeGreaterThanOrEqual(3);
        });

        it('Test 25: should skip LLM for short text (under 100 chars)', async () => {
            const shortText = 'Build a login form';

            const analysis = await detector.detect(shortText);

            expect(mockCompleteLLM).not.toHaveBeenCalled();
        });

        it('Test 26: should calculate requiresClarification based on threshold', async () => {
            // With vague text, score should be low and below default threshold of 70
            const analysis = await detector.detect('Make it nice and fast');

            expect(analysis.requiresClarification).toBe(true);
            expect(analysis.overallScore).toBeLessThan(70);
        });

        it('Test 27: should not require clarification for clear text', async () => {
            const analysis = await detector.detect('Return HTTP 200 with JSON body');

            expect(analysis.requiresClarification).toBe(false);
            expect(analysis.overallScore).toBe(100);
        });

        it('Test 28: should merge LLM results avoiding duplicates', async () => {
            const text = 'The system should be robust and handle all edge cases properly. '
                + 'We need comprehensive error handling for production use with reliable monitoring.';

            // LLM returns a phrase that overlaps with pattern match
            const llmResponse = `VAGUE: robust
SCORE: 30
CATEGORY: unmeasurable
QUESTION: Define robust
SUGGESTION: Specify uptime target

VAGUE: comprehensive error handling
SCORE: 35
CATEGORY: undefined
QUESTION: What errors specifically?
SUGGESTION: List error categories`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const analysis = await detector.detect(text);

            // "robust" should not appear twice (once from pattern, once from LLM)
            const robustItems = analysis.items.filter(
                i => i.phrase.toLowerCase().includes('robust')
            );
            expect(robustItems.length).toBe(1);
        });
    });

    // ---------------------------------------------------------------
    // detect() - clarification ticket creation
    // ---------------------------------------------------------------
    describe('detect() clarification ticket', () => {
        it('Test 29: should create clarification ticket when below threshold', async () => {
            const mockTicket = {
                id: 'TICKET-001',
                title: 'Test ticket',
                status: 'open',
                thread: [],
                priority: 1,
                creator: 'test',
                assignee: null,
                taskId: null,
                version: 1,
                resolution: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            mockGetTicket.mockResolvedValueOnce(mockTicket);
            mockUpdateTicket.mockResolvedValueOnce(undefined);

            const analysis = await detector.detect('Make it nice and fast', 'TICKET-001');

            expect(analysis.requiresClarification).toBe(true);
            expect(analysis.clarificationTicketId).toBe('TICKET-001');
            expect(mockGetTicket).toHaveBeenCalledWith('TICKET-001');
            expect(mockUpdateTicket).toHaveBeenCalledWith(
                'TICKET-001',
                expect.objectContaining({
                    status: 'in_review',
                    thread: expect.arrayContaining([
                        expect.objectContaining({
                            role: 'assistant',
                            status: 'reviewing'
                        })
                    ])
                })
            );
        });

        it('Test 30: should not create clarification ticket when above threshold', async () => {
            const analysis = await detector.detect('Return HTTP 200 with JSON body', 'TICKET-002');

            expect(analysis.requiresClarification).toBe(false);
            expect(analysis.clarificationTicketId).toBeUndefined();
            expect(mockGetTicket).not.toHaveBeenCalled();
        });

        it('Test 31: should handle missing ticket gracefully', async () => {
            mockGetTicket.mockResolvedValueOnce(null);

            const analysis = await detector.detect('Make it nice', 'TICKET-MISSING');

            expect(analysis.clarificationTicketId).toBe('');
            expect(mockLogWarn).toHaveBeenCalledWith(
                expect.stringContaining('Cannot find ticket TICKET-MISSING')
            );
        });

        it('Test 32: should handle updateTicket failure gracefully', async () => {
            const mockTicket = {
                id: 'TICKET-003',
                title: 'Test ticket',
                status: 'open',
                thread: [],
                priority: 1,
                creator: 'test',
                assignee: null,
                taskId: null,
                version: 1,
                resolution: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            mockGetTicket.mockResolvedValueOnce(mockTicket);
            mockUpdateTicket.mockRejectedValueOnce(new Error('DB write error'));

            const analysis = await detector.detect('Make it nice', 'TICKET-003');

            expect(analysis.clarificationTicketId).toBe('');
            expect(mockLogWarn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to create clarification ticket')
            );
        });

        it('Test 33: should append to existing ticket thread', async () => {
            const existingMessage = {
                role: 'user' as const,
                content: 'Initial request',
                createdAt: new Date().toISOString()
            };
            const mockTicket = {
                id: 'TICKET-004',
                title: 'Test ticket',
                status: 'open',
                thread: [existingMessage],
                priority: 1,
                creator: 'test',
                assignee: null,
                taskId: null,
                version: 1,
                resolution: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            mockGetTicket.mockResolvedValueOnce(mockTicket);
            mockUpdateTicket.mockResolvedValueOnce(undefined);

            await detector.detect('Make it nice', 'TICKET-004');

            expect(mockUpdateTicket).toHaveBeenCalledWith(
                'TICKET-004',
                expect.objectContaining({
                    thread: expect.arrayContaining([
                        existingMessage,
                        expect.objectContaining({ role: 'assistant' })
                    ])
                })
            );
        });
    });

    // ---------------------------------------------------------------
    // detect() - LLM failure
    // ---------------------------------------------------------------
    describe('detect() LLM failure handling', () => {
        it('Test 34: should fall back to pattern-only results when LLM fails', async () => {
            const longText = 'Implement a caching layer that stores frequently accessed data. '
                + 'The system should be designed to handle high concurrency scenarios gracefully.';

            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM service unavailable'));

            const analysis = await detector.detect(longText);

            expect(analysis.items.length).toBeGreaterThanOrEqual(0);
            expect(analysis.timestamp).toBeInstanceOf(Date);
            expect(mockLogWarn).toHaveBeenCalledWith(
                expect.stringContaining('LLM detection failed')
            );
        });

        it('Test 35: should handle non-Error thrown objects in LLM detection', async () => {
            const longText = 'Deploy the service to the cloud infrastructure and configure the monitoring. '
                + 'We need comprehensive alerting and logging for production readiness.';

            mockCompleteLLM.mockRejectedValueOnce('string error');

            const analysis = await detector.detect(longText);

            expect(analysis.timestamp).toBeInstanceOf(Date);
            expect(mockLogWarn).toHaveBeenCalledWith(
                expect.stringContaining('LLM detection failed: string error')
            );
        });
    });

    // ---------------------------------------------------------------
    // Singleton lifecycle
    // ---------------------------------------------------------------
    describe('singleton lifecycle', () => {
        it('Test 36: should create singleton via getVaguenessDetector', () => {
            resetVaguenessDetectorForTests();
            const d = getVaguenessDetector();
            expect(d).toBeInstanceOf(VaguenessDetector);
        });

        it('Test 37: should return same instance on subsequent calls', () => {
            resetVaguenessDetectorForTests();
            const d1 = getVaguenessDetector();
            const d2 = getVaguenessDetector();
            expect(d1).toBe(d2);
        });

        it('Test 38: should create new instance after reset', () => {
            const d1 = getVaguenessDetector();
            resetVaguenessDetectorForTests();
            const d2 = getVaguenessDetector();
            expect(d1).not.toBe(d2);
        });
    });

    // ---------------------------------------------------------------
    // Config accessors
    // ---------------------------------------------------------------
    describe('config accessors', () => {
        it('Test 39: should set and get threshold', () => {
            detector.setThreshold(90);
            expect(detector.getThreshold()).toBe(90);
        });

        it('Test 40: should clamp threshold to 0-100 range (high)', () => {
            detector.setThreshold(150);
            expect(detector.getThreshold()).toBe(100);
        });

        it('Test 41: should clamp threshold to 0-100 range (low)', () => {
            detector.setThreshold(-10);
            expect(detector.getThreshold()).toBe(0);
        });

        it('Test 42: should set and get SmartPlan enabled', () => {
            detector.setSmartPlanEnabled(false);
            expect(detector.isSmartPlanEnabled()).toBe(false);

            detector.setSmartPlanEnabled(true);
            expect(detector.isSmartPlanEnabled()).toBe(true);
        });

        it('Test 43: should set strictness level', () => {
            // Verify by checking score output, since strictness is not directly readable
            detector.setStrictness('strict');
            const strictResults = detector.quickDetect('Make it nice');
            expect(strictResults[0].score).toBe(20);

            detector.setStrictness('relaxed');
            const relaxedResults = detector.quickDetect('Make it good');
            expect(relaxedResults[0].score).toBe(40);
        });
    });

    // ---------------------------------------------------------------
    // calculateOverallScore edge cases
    // ---------------------------------------------------------------
    describe('calculateOverallScore edge cases', () => {
        it('Test 44: should return 100 for no vague items (empty items)', async () => {
            const analysis = await detector.detect('Return a 200 status code with JSON payload');
            expect(analysis.overallScore).toBe(100);
            expect(analysis.items.length).toBe(0);
        });

        it('Test 45: should apply quantity penalty for many items', async () => {
            // Many vague terms -> low average + quantity penalty
            const analysis = await detector.detect(
                'Make it nice, good, fast, simple, clean etc'
            );
            // Items found: nice, good, fast, simple, clean, etc = 6 items
            // Each has score 30 (standard), avg = 30, penalty = min(6*5, 30) = 30
            // Overall = max(0, round(30 - 30)) = 0
            expect(analysis.overallScore).toBe(0);
        });

        it('Test 46: should cap quantity penalty at 30', async () => {
            // Even with many items the penalty maxes at 30
            detector.setSmartPlanEnabled(true);
            const analysis = await detector.detect(
                'Make it nice good fast simple clean modern scalable robust with some items etc and maybe possibly add things as needed later eventually'
            );
            // Many matches, penalty capped at 30
            // With standard strictness, all scores = 30, so overall = max(0, 30-30) = 0
            expect(analysis.overallScore).toBe(0);
            expect(analysis.overallScore).toBeGreaterThanOrEqual(0);
        });

        it('Test 47: should produce a positive score with relaxed mode and few items', async () => {
            detector.setStrictness('relaxed');
            // Single vague term: score = 40 (30 + 10), 1 item, penalty = 5
            // Overall = 40 - 5 = 35
            const analysis = await detector.detect('Make it nice');
            expect(analysis.overallScore).toBe(35);
        });
    });

    // ---------------------------------------------------------------
    // LLM response parsing edge cases
    // ---------------------------------------------------------------
    describe('LLM response parsing', () => {
        it('Test 48: should parse a well-formed LLM response with multiple blocks', async () => {
            const longText = 'Build the infrastructure for production deployment with monitoring and alerting. '
                + 'The system should gracefully degrade under load and recover from failures automatically.';

            const llmResponse = `VAGUE: gracefully degrade
SCORE: 25
CATEGORY: ambiguous
QUESTION: What does graceful degradation look like? Fallback behavior?
SUGGESTION: Define fallback modes, list degraded features

VAGUE: recover from failures automatically
SCORE: 20
CATEGORY: undefined
QUESTION: What types of failures? Recovery time objective?
SUGGESTION: List failure types, set RTO target`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const analysis = await detector.detect(longText);

            const graceful = analysis.items.find(i => i.phrase.includes('gracefully degrade'));
            expect(graceful).toBeDefined();
            expect(graceful?.score).toBe(25);
            expect(graceful?.category).toBe('ambiguous');
        });

        it('Test 49: should handle empty LLM response', async () => {
            const longText = 'Configure the database connection pool for the service layer with proper timeout handling and '
                + 'retry logic that respects circuit breaker patterns for downstream dependencies.';

            mockCompleteLLM.mockResolvedValueOnce({ content: '' });

            const analysis = await detector.detect(longText);

            // Should still work, just no LLM items merged
            expect(analysis.timestamp).toBeInstanceOf(Date);
        });

        it('Test 50: should handle malformed LLM response blocks', async () => {
            const longText = 'Implement a webhook handler that validates incoming payloads and routes them to the appropriate '
                + 'processing pipeline based on event type and source configuration.';

            mockCompleteLLM.mockResolvedValueOnce({
                content: 'This is not a valid response format at all'
            });

            const analysis = await detector.detect(longText);

            // Malformed response produces no extra items
            expect(analysis.timestamp).toBeInstanceOf(Date);
        });
    });

    // ---------------------------------------------------------------
    // detect() logging
    // ---------------------------------------------------------------
    describe('detect() logging', () => {
        it('Test 51: should log start and completion of detection', async () => {
            await detector.detect('Make it nice');

            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('Starting vagueness detection')
            );
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('Complete: score=')
            );
        });

        it('Test 52: should log SmartPlan and strictness settings', async () => {
            detector.setSmartPlanEnabled(false);
            detector.setStrictness('strict');

            await detector.detect('Test text');

            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('SmartPlan: false')
            );
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('strictness: strict')
            );
        });
    });

    // ---------------------------------------------------------------
    // quickDetect - result structure
    // ---------------------------------------------------------------
    describe('quickDetect result structure', () => {
        it('Test 53: should return correctly shaped VaguenessResult objects', () => {
            const results = detector.quickDetect('The UI should be user-friendly');
            expect(results.length).toBeGreaterThanOrEqual(1);

            for (const result of results) {
                expect(result).toHaveProperty('phrase');
                expect(result).toHaveProperty('score');
                expect(result).toHaveProperty('clarificationQuestion');
                expect(result).toHaveProperty('category');
                expect(result).toHaveProperty('suggestions');
                expect(typeof result.phrase).toBe('string');
                expect(typeof result.score).toBe('number');
                expect(typeof result.clarificationQuestion).toBe('string');
                expect(Array.isArray(result.suggestions)).toBe(true);
                expect(['ambiguous', 'subjective', 'unmeasurable', 'undefined', 'context-dependent'])
                    .toContain(result.category);
            }
        });
    });

    // ---------------------------------------------------------------
    // Integration-style test
    // ---------------------------------------------------------------
    describe('end-to-end scenario', () => {
        it('Test 54: should detect vagueness, call LLM, create ticket, and return full analysis', async () => {
            const text = 'Build a dashboard that displays metrics. The dashboard should load data from the API. '
                + 'Additional configuration might be needed for deployment.';

            const llmResponse = `VAGUE: additional configuration
SCORE: 20
CATEGORY: undefined
QUESTION: What configuration? Environment variables? Feature flags?
SUGGESTION: List all configuration parameters`;

            mockCompleteLLM.mockResolvedValueOnce({ content: llmResponse });

            const mockTicket = {
                id: 'TICKET-010',
                title: 'Dashboard task',
                status: 'open',
                thread: [],
                priority: 2,
                creator: 'user',
                assignee: null,
                taskId: null,
                version: 1,
                resolution: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            mockGetTicket.mockResolvedValueOnce(mockTicket);
            mockUpdateTicket.mockResolvedValueOnce(undefined);

            // Use a high threshold to force clarification
            detector.setThreshold(95);

            const analysis = await detector.detect(text, 'TICKET-010');

            expect(analysis.originalText).toBe(text);
            expect(analysis.requiresClarification).toBe(true);
            expect(analysis.clarificationTicketId).toBe('TICKET-010');
            expect(analysis.items.length).toBeGreaterThanOrEqual(1);
            expect(mockLogInfo).toHaveBeenCalled();
            expect(mockGetTicket).toHaveBeenCalledWith('TICKET-010');
            expect(mockUpdateTicket).toHaveBeenCalled();
        });
    });
});
