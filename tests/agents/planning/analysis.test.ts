/**
 * RequirementAnalyzer Test Suite
 *
 * Tests the RequirementAnalyzer class which parses user requirements
 * into structured features, constraints, dependencies, and unclear items
 * using LLM-powered analysis with deterministic fallbacks.
 *
 * @module tests/agents/planning/analysis
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest } from '@jest/globals';

// Define mock types
type MockedLLMResponse = {
    content: string;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

// Mock dependencies before imports - using closure pattern with proper types
const mockCompleteLLM = jest.fn<(...args: any[]) => Promise<MockedLLMResponse>>();
const mockLogInfo = jest.fn();
const mockLogWarn = jest.fn();

jest.mock('../../../src/services/llmService', () => ({
    completeLLM: (...args: any[]) => mockCompleteLLM(...args)
}));

jest.mock('../../../src/logger', () => ({
    logInfo: (...args: any[]) => mockLogInfo(...args),
    logWarn: (...args: any[]) => mockLogWarn(...args)
}));

// Import after mocks
import {
    RequirementAnalyzer,
    getRequirementAnalyzer,
    resetRequirementAnalyzerForTests
} from '../../../src/agents/planning/analysis';
import type { AnalysisResult } from '../../../src/agents/planning/analysis';

describe('RequirementAnalyzer Test Suite', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetRequirementAnalyzerForTests();
    });

    afterEach(() => {
        jest.useRealTimers();
        resetRequirementAnalyzerForTests();
    });

    // =========================================================================
    // Constructor & Singleton Tests
    // =========================================================================
    describe('Constructor & Singleton', () => {
        it('Test 1: should create an instance via constructor', () => {
            const analyzer = new RequirementAnalyzer();
            expect(analyzer).toBeDefined();
            expect(analyzer).toBeInstanceOf(RequirementAnalyzer);
        });

        it('Test 2: should return the same singleton instance from getRequirementAnalyzer', () => {
            const instance1 = getRequirementAnalyzer();
            const instance2 = getRequirementAnalyzer();
            expect(instance1).toBe(instance2);
        });

        it('Test 3: should return a new instance after resetRequirementAnalyzerForTests', () => {
            const instance1 = getRequirementAnalyzer();
            resetRequirementAnalyzerForTests();
            const instance2 = getRequirementAnalyzer();
            expect(instance1).not.toBe(instance2);
        });
    });

    // =========================================================================
    // analyze() - LLM Response Parsing
    // =========================================================================
    describe('analyze() - Parsing', () => {
        it('Test 4: should parse a well-formatted LLM response with all sections', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- User authentication with OAuth2
- Dashboard view with analytics charts

CONSTRAINTS:
- [technical] Must support PostgreSQL 14+
- [business] Launch before Q3 2025

DEPENDENCIES:
- React 18 (external: no)
- Auth0 SDK (external: yes)

UNCLEAR:
- "performant" → What specific latency targets are required?`,
                usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Build a performant dashboard with auth');

            expect(result.features).toHaveLength(2);
            expect(result.constraints).toHaveLength(2);
            expect(result.dependencies).toHaveLength(2);
            expect(result.unclearItems).toHaveLength(1);
            expect(result.rawAnalysis).toContain('FEATURES:');
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('Test 5: should parse features with correct IDs (F001, F002, F003)', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Login page
- Registration form
- Password reset flow

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:`,
                usage: { prompt_tokens: 20, completion_tokens: 40, total_tokens: 60 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Build auth system');

            expect(result.features).toHaveLength(3);
            expect(result.features[0].id).toBe('F001');
            expect(result.features[1].id).toBe('F002');
            expect(result.features[2].id).toBe('F003');
        });

        it('Test 6: should set sourceText on each feature to the original requirement', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- API endpoint for data retrieval

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = new RequirementAnalyzer();
            const requirement = 'Create a REST API for fetching user data';
            const result = await analyzer.analyze(requirement);

            expect(result.features[0].sourceText).toBe(requirement);
        });

        it('Test 7: should detect UI-related features and set isUI to true', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Dashboard display with charts
- Backend API for data processing

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Build a dashboard with backend API');

            expect(result.features[0].isUI).toBe(true);   // "display" is a UI keyword
            expect(result.features[1].isUI).toBe(false);   // no UI keyword
        });

        it('Test 8: should parse constraints with correct types', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Core system

CONSTRAINTS:
- [technical] Must use TypeScript
- [business] Budget limited to $10K
- [time] Deliver by March 2025
- [resource] Team of 3 developers

DEPENDENCIES:

UNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 30, total_tokens: 40 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Build a system within constraints');

            expect(result.constraints).toHaveLength(4);
            expect(result.constraints[0].type).toBe('technical');
            expect(result.constraints[0].description).toBe('Must use TypeScript');
            expect(result.constraints[1].type).toBe('business');
            expect(result.constraints[2].type).toBe('time');
            expect(result.constraints[3].type).toBe('resource');
        });

        it('Test 9: should default constraint type to technical when not recognized', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Feature

CONSTRAINTS:
- No specific type tag on this constraint

DEPENDENCIES:

UNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Some requirement');

            expect(result.constraints).toHaveLength(1);
            expect(result.constraints[0].type).toBe('technical');
            expect(result.constraints[0].description).toBe('No specific type tag on this constraint');
        });

        it('Test 10: should parse dependencies with external flag', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Integration feature

CONSTRAINTS:

DEPENDENCIES:
- Express.js (external: yes)
- Internal auth module (external: no)

UNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Build integration with Express');

            expect(result.dependencies).toHaveLength(2);
            expect(result.dependencies[0].name).toBe('Express.js');
            expect(result.dependencies[0].isExternal).toBe(true);
            expect(result.dependencies[1].name).toBe('Internal auth module');
            expect(result.dependencies[1].isExternal).toBe(false);
        });

        it('Test 11: should default isExternal to false when dependency format is unrecognized', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Feature

CONSTRAINTS:

DEPENDENCIES:
- Some library without external marker

UNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Some requirement');

            expect(result.dependencies).toHaveLength(1);
            expect(result.dependencies[0].name).toBe('Some library without external marker');
            expect(result.dependencies[0].isExternal).toBe(false);
        });

        it('Test 12: should parse unclear items with phrase and clarification question', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Feature

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:
- "scalable" → What scale is expected? Number of users, requests per second?
- "modern look" → What design framework or visual style is preferred?`,
                usage: { prompt_tokens: 10, completion_tokens: 30, total_tokens: 40 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Build a scalable app with modern look');

            expect(result.unclearItems).toHaveLength(2);
            expect(result.unclearItems[0].phrase).toBe('"scalable"');
            expect(result.unclearItems[0].clarificationQuestion).toBe(
                'What scale is expected? Number of users, requests per second?'
            );
            expect(result.unclearItems[0].severity).toBe(50);
            expect(result.unclearItems[1].phrase).toBe('"modern look"');
        });

        it('Test 13: should skip unclear lines that do not match the arrow format', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Feature

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:
- This line has no arrow separator
- "valid" → This one is valid`,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Some requirement');

            // Only the line with the arrow should be parsed
            expect(result.unclearItems).toHaveLength(1);
            expect(result.unclearItems[0].phrase).toBe('"valid"');
        });
    });

    // =========================================================================
    // analyze() - Context Parameter
    // =========================================================================
    describe('analyze() - Context', () => {
        it('Test 14: should include context in the LLM prompt when provided', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Feature from context

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:`,
                usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 }
            });

            const analyzer = new RequirementAnalyzer();
            await analyzer.analyze('Build a feature', 'This is an e-commerce project using React');

            // Verify completeLLM was called with a prompt that includes the context
            expect(mockCompleteLLM).toHaveBeenCalledTimes(1);
            const callArgs = mockCompleteLLM.mock.calls[0];
            const prompt = callArgs[0] as string;
            expect(prompt).toContain('Additional Context:');
            expect(prompt).toContain('This is an e-commerce project using React');
        });

        it('Test 15: should not include Additional Context section when context is undefined', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Feature

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
            });

            const analyzer = new RequirementAnalyzer();
            await analyzer.analyze('Build a feature');

            const callArgs = mockCompleteLLM.mock.calls[0];
            const prompt = callArgs[0] as string;
            expect(prompt).not.toContain('Additional Context:');
        });
    });

    // =========================================================================
    // analyze() - Clarity Score Calculation
    // =========================================================================
    describe('analyze() - Clarity Score', () => {
        it('Test 16: should calculate clarity score as 100 when there are no unclear items', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Well-defined feature

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Specific requirement with clear scope');

            expect(result.clarityScore).toBe(100);
        });

        it('Test 17: should reduce clarity score by 15 per unclear item', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Feature

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:
- "fast" → How fast?
- "scalable" → What scale?
- "modern" → What design?`,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Build a fast, scalable, modern app');

            // 3 unclear items: 100 - (3 * 15) = 55
            expect(result.clarityScore).toBe(55);
        });

        it('Test 18: should clamp clarity score to 0 when many unclear items exist', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Feature

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:
- "nice" → What is nice?
- "good" → What is good?
- "fast" → How fast?
- "clean" → What is clean?
- "modern" → What is modern?
- "easy" → What is easy?
- "robust" → What is robust?`,
                usage: { prompt_tokens: 10, completion_tokens: 30, total_tokens: 40 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Make it nice, good, fast, clean, modern, easy, and robust');

            // 7 unclear items: 100 - (7 * 15) = -5, clamped to 0
            expect(result.clarityScore).toBe(0);
        });
    });

    // =========================================================================
    // analyze() - Error Handling
    // =========================================================================
    describe('analyze() - Error Handling', () => {
        it('Test 19: should return empty result with clarityScore 0 when LLM throws an Error', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('Connection timeout'));

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Build something');

            expect(result.features).toHaveLength(0);
            expect(result.constraints).toHaveLength(0);
            expect(result.dependencies).toHaveLength(0);
            expect(result.unclearItems).toHaveLength(1);
            expect(result.unclearItems[0].phrase).toBe('entire requirement');
            expect(result.unclearItems[0].clarificationQuestion).toContain('more details');
            expect(result.unclearItems[0].severity).toBe(100);
            expect(result.clarityScore).toBe(0);
            expect(result.rawAnalysis).toBe('');
            expect(result.timestamp).toBeInstanceOf(Date);
        });

        it('Test 20: should return empty result when LLM rejects with a non-Error value', async () => {
            mockCompleteLLM.mockRejectedValueOnce('string error');

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Build something');

            expect(result.features).toHaveLength(0);
            expect(result.clarityScore).toBe(0);
        });

        it('Test 21: should log a warning when LLM fails', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('LLM offline'));

            const analyzer = new RequirementAnalyzer();
            await analyzer.analyze('Test requirement');

            expect(mockLogWarn).toHaveBeenCalledWith(
                expect.stringContaining('LLM analysis failed: LLM offline')
            );
        });

        it('Test 22: should handle empty LLM response gracefully', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: '',
                usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Some requirement');

            // Empty response produces no features, no constraints, etc.
            expect(result.features).toHaveLength(0);
            expect(result.constraints).toHaveLength(0);
            expect(result.dependencies).toHaveLength(0);
            expect(result.unclearItems).toHaveLength(0);
            expect(result.clarityScore).toBe(100);
        });

        it('Test 23: should handle response with no section headers', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: 'This is just plain text with no structured sections at all.',
                usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Some requirement');

            expect(result.features).toHaveLength(0);
            expect(result.constraints).toHaveLength(0);
            expect(result.dependencies).toHaveLength(0);
            expect(result.unclearItems).toHaveLength(0);
        });
    });

    // =========================================================================
    // analyze() - Logging
    // =========================================================================
    describe('analyze() - Logging', () => {
        it('Test 24: should log info at the start and end of analysis', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Feature A
- Feature B

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:
- "vague" → Clarify please`,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = new RequirementAnalyzer();
            await analyzer.analyze('Build features A and B with vague parts');

            expect(mockLogInfo).toHaveBeenCalledWith('[RequirementAnalyzer] Starting analysis');
            expect(mockLogInfo).toHaveBeenCalledWith(
                expect.stringContaining('Analysis complete: 2 features, 1 unclear items')
            );
        });
    });

    // =========================================================================
    // analyze() - LLM Call Verification
    // =========================================================================
    describe('analyze() - LLM Call', () => {
        it('Test 25: should pass systemPrompt and temperature 0.3 to completeLLM', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:\n- Feature\n\nCONSTRAINTS:\n\nDEPENDENCIES:\n\nUNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
            });

            const analyzer = new RequirementAnalyzer();
            await analyzer.analyze('Build a feature');

            expect(mockCompleteLLM).toHaveBeenCalledTimes(1);
            const options = mockCompleteLLM.mock.calls[0][1] as any;
            expect(options.systemPrompt).toContain('requirements analyst');
            expect(options.temperature).toBe(0.3);
        });
    });

    // =========================================================================
    // quickClarityCheck() Tests
    // =========================================================================
    describe('quickClarityCheck()', () => {
        it('Test 26: should return true for "make it nice"', () => {
            const analyzer = new RequirementAnalyzer();
            expect(analyzer.quickClarityCheck('make it nice')).toBe(true);
        });

        it('Test 27: should return true for "user-friendly" and "user friendly"', () => {
            const analyzer = new RequirementAnalyzer();
            expect(analyzer.quickClarityCheck('Create a user-friendly interface')).toBe(true);
            expect(analyzer.quickClarityCheck('Make it user friendly')).toBe(true);
        });

        it('Test 28: should return true for vague speed terms: fast, efficient, quick', () => {
            const analyzer = new RequirementAnalyzer();
            expect(analyzer.quickClarityCheck('The system should be fast')).toBe(true);
            expect(analyzer.quickClarityCheck('Make the queries efficient')).toBe(true);
            expect(analyzer.quickClarityCheck('We need quick responses')).toBe(true);
        });

        it('Test 29: should return true for vague simplicity terms: simple, easy, clean', () => {
            const analyzer = new RequirementAnalyzer();
            expect(analyzer.quickClarityCheck('Keep it simple')).toBe(true);
            expect(analyzer.quickClarityCheck('Make it easy to use')).toBe(true);
            expect(analyzer.quickClarityCheck('Clean architecture please')).toBe(true);
        });

        it('Test 30: should return true for "modern" and "intuitive"', () => {
            const analyzer = new RequirementAnalyzer();
            expect(analyzer.quickClarityCheck('Use a modern design')).toBe(true);
            expect(analyzer.quickClarityCheck('Build an intuitive workflow')).toBe(true);
        });

        it('Test 31: should return true for "scalable" and "robust"', () => {
            const analyzer = new RequirementAnalyzer();
            expect(analyzer.quickClarityCheck('Must be scalable to millions')).toBe(true);
            expect(analyzer.quickClarityCheck('Build a robust error handling system')).toBe(true);
        });

        it('Test 32: should return false for clear, specific requirements', () => {
            const analyzer = new RequirementAnalyzer();
            expect(analyzer.quickClarityCheck('Add a POST /api/users endpoint that returns 201')).toBe(false);
            expect(analyzer.quickClarityCheck('Create a button with id="submit" that calls saveForm()')).toBe(false);
            expect(analyzer.quickClarityCheck('Implement JWT token validation with 1-hour expiry')).toBe(false);
        });

        it('Test 33: should return true for "make it good" and "make it better"', () => {
            const analyzer = new RequirementAnalyzer();
            expect(analyzer.quickClarityCheck('make it good')).toBe(true);
            expect(analyzer.quickClarityCheck('make it better')).toBe(true);
        });

        it('Test 34: should be case-insensitive for vague pattern detection', () => {
            const analyzer = new RequirementAnalyzer();
            expect(analyzer.quickClarityCheck('Make it FAST')).toBe(true);
            expect(analyzer.quickClarityCheck('SIMPLE design')).toBe(true);
            expect(analyzer.quickClarityCheck('Modern UI')).toBe(true);
            expect(analyzer.quickClarityCheck('SCALABLE architecture')).toBe(true);
        });
    });

    // =========================================================================
    // isUIRelated Detection Tests
    // =========================================================================
    describe('isUIRelated detection (via analyze)', () => {
        it('Test 35: should detect various UI keywords as UI-related features', async () => {
            const uiDescriptions = [
                'Build the main UI layout',
                'Create a user interface for settings',
                'Add a submit button to the form',
                'Design the registration form',
                'Build the landing page',
                'Create the dashboard screen',
                'Display user profile data',
                'Build a tree view for files',
                'Add a reusable component library',
                'Show confirmation modal dialog',
                'Add a settings sidebar panel',
                'Build the grid layout system',
                'Apply consistent style to headers',
                'Write CSS for responsive design',
                'Update the HTML template',
                'Build the frontend navigation',
                'Add visual indicators for status',
                'Render the chart component',
                'Create a webview panel for preview'
            ];

            // Build a FEATURES section with all UI descriptions
            const featuresText = uiDescriptions.map(d => `- ${d}`).join('\n');
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:\n${featuresText}\n\nCONSTRAINTS:\n\nDEPENDENCIES:\n\nUNCLEAR:`,
                usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Build various UI components');

            // Every feature should be detected as UI-related
            for (let i = 0; i < result.features.length; i++) {
                expect(result.features[i].isUI).toBe(true);
            }
        });

        it('Test 36: should not flag non-UI features as UI-related', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Database migration script
- API rate limiting middleware
- Background job scheduler
- Authentication token rotation

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Build backend services');

            for (const feature of result.features) {
                expect(feature.isUI).toBe(false);
            }
        });
    });

    // =========================================================================
    // Edge Cases
    // =========================================================================
    describe('Edge Cases', () => {
        it('Test 37: should handle lines that are not prefixed with "- " inside sections', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Valid feature
This line has no dash prefix
  Also no dash prefix here
- Another valid feature

CONSTRAINTS:

DEPENDENCIES:

UNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Some requirement');

            // Only lines starting with "- " should be parsed as features
            expect(result.features).toHaveLength(2);
            expect(result.features[0].description).toBe('Valid feature');
            expect(result.features[1].description).toBe('Another valid feature');
        });

        it('Test 38: should handle response with only FEATURES section', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:
- Only features here
- And another one`,
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Simple requirement');

            expect(result.features).toHaveLength(2);
            expect(result.constraints).toHaveLength(0);
            expect(result.dependencies).toHaveLength(0);
            expect(result.unclearItems).toHaveLength(0);
            expect(result.clarityScore).toBe(100);
        });

        it('Test 39: should preserve rawAnalysis from LLM response', async () => {
            const rawContent = `FEATURES:
- Feature X

CONSTRAINTS:
- [technical] Must use TypeScript

DEPENDENCIES:

UNCLEAR:`;
            mockCompleteLLM.mockResolvedValueOnce({
                content: rawContent,
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            });

            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Requirement');

            expect(result.rawAnalysis).toBe(rawContent);
        });

        it('Test 40: should set timestamp to current date on analysis', async () => {
            mockCompleteLLM.mockResolvedValueOnce({
                content: `FEATURES:\n- Feature\n\nCONSTRAINTS:\n\nDEPENDENCIES:\n\nUNCLEAR:`,
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
            });

            const before = new Date();
            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Requirement');
            const after = new Date();

            expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
        });

        it('Test 41: should set timestamp on empty result when LLM fails', async () => {
            mockCompleteLLM.mockRejectedValueOnce(new Error('fail'));

            const before = new Date();
            const analyzer = new RequirementAnalyzer();
            const result = await analyzer.analyze('Requirement');
            const after = new Date();

            expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
        });
    });
});
