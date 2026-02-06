/**
 * Test Output Parsers
 * 
 * MT-015.5: Parsers for different test framework outputs.
 * Supports Jest (existing) and Mocha formats.
 * 
 * **Simple explanation**: Different test tools speak different languages.
 * This module translates Jest, Mocha, and other test outputs into
 * a common format we can understand and act on.
 * 
 * @module agents/verification/testParsers
 */

import { logInfo, logWarn, logError } from '../../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Test result status
 */
export enum TestStatus {
    PASSED = 'passed',
    FAILED = 'failed',
    SKIPPED = 'skipped',
    PENDING = 'pending',
    TODO = 'todo'
}

/**
 * Individual test case result
 */
export interface TestCaseResult {
    /** Test name/description */
    name: string;
    /** Full test path (suite > subsuite > test) */
    fullName: string;
    /** Test status */
    status: TestStatus;
    /** Duration in milliseconds */
    durationMs?: number;
    /** Error message if failed */
    errorMessage?: string;
    /** Stack trace if failed */
    stackTrace?: string;
    /** File where test is defined */
    filePath?: string;
    /** Line number if known */
    lineNumber?: number;
}

/**
 * Test suite result (group of tests)
 */
export interface TestSuiteResult {
    /** Suite name */
    name: string;
    /** File path */
    filePath?: string;
    /** Individual test results */
    tests: TestCaseResult[];
    /** Nested suites */
    suites: TestSuiteResult[];
    /** Total duration */
    durationMs?: number;
}

/**
 * Complete test run result
 */
export interface TestRunResult {
    /** Test framework detected */
    framework: 'jest' | 'mocha' | 'vitest' | 'unknown';
    /** Overall success */
    success: boolean;
    /** Summary counts */
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        pending: number;
    };
    /** Total duration in milliseconds */
    durationMs: number;
    /** Test suites */
    suites: TestSuiteResult[];
    /** Flat list of all failures */
    failures: TestCaseResult[];
    /** Coverage percentage if available */
    coveragePercent?: number;
    /** Raw output */
    rawOutput: string;
}

/**
 * Parser interface
 */
export interface TestOutputParser {
    /** Parser name */
    name: string;
    /** Check if output matches this parser */
    canParse(output: string): boolean;
    /** Parse the output */
    parse(output: string): TestRunResult;
}

// ============================================================================
// Jest Parser
// ============================================================================

/**
 * Parser for Jest test output
 */
export class JestParser implements TestOutputParser {
    public name = 'jest';

    public canParse(output: string): boolean {
        return output.includes('PASS ') ||
            output.includes('FAIL ') ||
            output.includes('Test Suites:') ||
            output.includes('jest');
    }

    public parse(output: string): TestRunResult {
        const result: TestRunResult = {
            framework: 'jest',
            success: false,
            summary: { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 },
            durationMs: 0,
            suites: [],
            failures: [],
            rawOutput: output
        };

        // Parse summary line: "Tests: X failed, Y passed, Z total"
        const testsMatch = output.match(/Tests:\s*(\d+)\s*failed?,?\s*(\d+)\s*passed?,?\s*(\d+)\s*total/i);
        if (testsMatch) {
            result.summary.failed = parseInt(testsMatch[1], 10);
            result.summary.passed = parseInt(testsMatch[2], 10);
            result.summary.total = parseInt(testsMatch[3], 10);
        }

        // Alternative: "Tests: Y passed, Z total" (no failures)
        const testsPassedMatch = output.match(/Tests:\s*(\d+)\s*passed?,?\s*(\d+)\s*total/i);
        if (testsPassedMatch && !testsMatch) {
            result.summary.passed = parseInt(testsPassedMatch[1], 10);
            result.summary.total = parseInt(testsPassedMatch[2], 10);
        }

        // Parse skipped
        const skippedMatch = output.match(/(\d+)\s*skipped/i);
        if (skippedMatch) {
            result.summary.skipped = parseInt(skippedMatch[1], 10);
        }

        // Parse duration: "Time: X.XXs"
        const timeMatch = output.match(/Time:\s*([\d.]+)\s*s/i);
        if (timeMatch) {
            result.durationMs = parseFloat(timeMatch[1]) * 1000;
        }

        // Parse coverage
        const coverageMatch = output.match(/All files\s*\|\s*([\d.]+)/);
        if (coverageMatch) {
            result.coveragePercent = parseFloat(coverageMatch[1]);
        }

        // Parse individual failures
        const failureBlocks = output.split(/● /);
        for (const block of failureBlocks.slice(1)) {
            const lines = block.split('\n');
            if (lines.length > 0) {
                const testName = lines[0].trim();
                const errorMessage = lines.slice(1).join('\n').trim();

                // Extract file path from stack trace
                const fileMatch = errorMessage.match(/at\s+.*\((.*?):(\d+):\d+\)/);

                result.failures.push({
                    name: testName.split(' › ').pop() || testName,
                    fullName: testName,
                    status: TestStatus.FAILED,
                    errorMessage: this.extractAssertion(errorMessage),
                    stackTrace: errorMessage,
                    filePath: fileMatch?.[1],
                    lineNumber: fileMatch ? parseInt(fileMatch[2], 10) : undefined
                });
            }
        }

        result.success = result.summary.failed === 0;
        logInfo(`[JestParser] Parsed: ${result.summary.passed}/${result.summary.total} passed`);
        return result;
    }

    private extractAssertion(text: string): string {
        // Extract the expect assertion line
        const expectMatch = text.match(/expect\(.*\)\..*|Expected:.*|Received:.*/);
        return expectMatch?.[0] || text.slice(0, 200);
    }
}

// ============================================================================
// Mocha Parser
// ============================================================================

/**
 * Parser for Mocha test output
 */
export class MochaParser implements TestOutputParser {
    public name = 'mocha';

    public canParse(output: string): boolean {
        return output.includes('passing') && output.includes('failing') ||
            output.includes('✓') && output.includes('✗') ||
            output.match(/\d+\s+passing/i) !== null;
    }

    public parse(output: string): TestRunResult {
        const result: TestRunResult = {
            framework: 'mocha',
            success: false,
            summary: { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 },
            durationMs: 0,
            suites: [],
            failures: [],
            rawOutput: output
        };

        // Parse summary: "X passing (Ys)", "Y failing", "Z pending"
        const passingMatch = output.match(/(\d+)\s+passing\s*\(?([\d.]+)?(m?s)?\)?/i);
        if (passingMatch) {
            result.summary.passed = parseInt(passingMatch[1], 10);
            if (passingMatch[2]) {
                const time = parseFloat(passingMatch[2]);
                result.durationMs = passingMatch[3] === 'ms' ? time : time * 1000;
            }
        }

        const failingMatch = output.match(/(\d+)\s+failing/i);
        if (failingMatch) {
            result.summary.failed = parseInt(failingMatch[1], 10);
        }

        const pendingMatch = output.match(/(\d+)\s+pending/i);
        if (pendingMatch) {
            result.summary.pending = parseInt(pendingMatch[1], 10);
        }

        // Calculate total
        result.summary.total = result.summary.passed + result.summary.failed +
            result.summary.pending + result.summary.skipped;

        // Parse individual test results (✓ and ✗ markers)
        const lines = output.split('\n');
        let currentSuite: TestSuiteResult | null = null;

        for (const line of lines) {
            // Suite header (indented text without markers)
            const suiteMatch = line.match(/^\s{2,4}(\S.*)$/);
            if (suiteMatch && !line.includes('✓') && !line.includes('✗') && !line.includes('- ')) {
                currentSuite = {
                    name: suiteMatch[1].trim(),
                    tests: [],
                    suites: []
                };
                result.suites.push(currentSuite);
            }

            // Passing test: "    ✓ test name (Xms)"
            const passMatch = line.match(/^\s+[✓✔]\s+(.*?)(?:\s*\((\d+)ms\))?$/);
            if (passMatch) {
                const test: TestCaseResult = {
                    name: passMatch[1].trim(),
                    fullName: currentSuite ? `${currentSuite.name} > ${passMatch[1].trim()}` : passMatch[1].trim(),
                    status: TestStatus.PASSED,
                    durationMs: passMatch[2] ? parseInt(passMatch[2], 10) : undefined
                };
                if (currentSuite) {
                    currentSuite.tests.push(test);
                }
            }

            // Failing test: "    ✗ test name" or "    X) test name"
            const failMatch = line.match(/^\s+(?:[✗✘]|(\d+)\))\s+(.*)$/);
            if (failMatch) {
                const test: TestCaseResult = {
                    name: failMatch[2].trim(),
                    fullName: currentSuite ? `${currentSuite.name} > ${failMatch[2].trim()}` : failMatch[2].trim(),
                    status: TestStatus.FAILED
                };
                if (currentSuite) {
                    currentSuite.tests.push(test);
                }
                result.failures.push(test);
            }

            // Pending test: "    - test name"
            const pendingTestMatch = line.match(/^\s+-\s+(.*)$/);
            if (pendingTestMatch) {
                const test: TestCaseResult = {
                    name: pendingTestMatch[1].trim(),
                    fullName: currentSuite ? `${currentSuite.name} > ${pendingTestMatch[1].trim()}` : pendingTestMatch[1].trim(),
                    status: TestStatus.PENDING
                };
                if (currentSuite) {
                    currentSuite.tests.push(test);
                }
            }
        }

        // Parse error details for failures
        this.parseErrorDetails(output, result.failures);

        result.success = result.summary.failed === 0;
        logInfo(`[MochaParser] Parsed: ${result.summary.passed}/${result.summary.total} passed`);
        return result;
    }

    private parseErrorDetails(output: string, failures: TestCaseResult[]): void {
        // Look for numbered error blocks: "1) Test name:\n     Error message"
        const errorBlocks = output.match(/\d+\)\s+.*?:\n[\s\S]*?(?=\n\n|\n\d+\)|$)/g);

        if (errorBlocks) {
            for (const block of errorBlocks) {
                const titleMatch = block.match(/\d+\)\s+(.*?):/);
                if (titleMatch) {
                    const testName = titleMatch[1].trim();
                    const failure = failures.find(f => f.name === testName || f.fullName.includes(testName));
                    if (failure) {
                        failure.errorMessage = block.replace(/\d+\)\s+.*?:\n/, '').trim();

                        // Extract stack trace location
                        const locationMatch = block.match(/at\s+.*?\((.*?):(\d+):\d+\)/);
                        if (locationMatch) {
                            failure.filePath = locationMatch[1];
                            failure.lineNumber = parseInt(locationMatch[2], 10);
                        }
                    }
                }
            }
        }
    }
}

// ============================================================================
// Vitest Parser
// ============================================================================

/**
 * Parser for Vitest output (similar to Jest but with some differences)
 */
export class VitestParser implements TestOutputParser {
    public name = 'vitest';

    public canParse(output: string): boolean {
        return output.includes('VITEST') ||
            output.includes('vitest') ||
            output.includes('⎯⎯⎯⎯⎯');
    }

    public parse(output: string): TestRunResult {
        // Vitest is very similar to Jest, delegate with framework override
        const jestParser = new JestParser();
        const result = jestParser.parse(output);
        result.framework = 'vitest';
        return result;
    }
}

// ============================================================================
// Parser Registry
// ============================================================================

/**
 * Registry of all available parsers
 */
const parsers: TestOutputParser[] = [
    new JestParser(),
    new MochaParser(),
    new VitestParser()
];

/**
 * Auto-detect and parse test output
 */
export function parseTestOutput(output: string): TestRunResult {
    // Try each parser in order
    for (const parser of parsers) {
        if (parser.canParse(output)) {
            logInfo(`[TestParsers] Using ${parser.name} parser`);
            return parser.parse(output);
        }
    }

    // Unknown format
    logWarn('[TestParsers] Could not detect test framework, returning raw result');
    return {
        framework: 'unknown',
        success: !output.toLowerCase().includes('fail'),
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 },
        durationMs: 0,
        suites: [],
        failures: [],
        rawOutput: output
    };
}

/**
 * Get a specific parser by name
 */
export function getParser(name: string): TestOutputParser | null {
    return parsers.find(p => p.name === name) || null;
}

/**
 * Register a custom parser
 */
export function registerParser(parser: TestOutputParser): void {
    parsers.unshift(parser); // Add to front for priority
    logInfo(`[TestParsers] Registered custom parser: ${parser.name}`);
}

/**
 * Format test results for display
 */
export function formatTestResults(result: TestRunResult): string {
    const lines: string[] = [];

    lines.push(`Test Results (${result.framework})`);
    lines.push('─'.repeat(40));
    lines.push(`Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push(`Total: ${result.summary.total} tests`);
    lines.push(`  ✅ Passed: ${result.summary.passed}`);
    lines.push(`  ❌ Failed: ${result.summary.failed}`);

    if (result.summary.skipped > 0) {
        lines.push(`  ⏭️  Skipped: ${result.summary.skipped}`);
    }
    if (result.summary.pending > 0) {
        lines.push(`  ⏳ Pending: ${result.summary.pending}`);
    }

    lines.push(`Duration: ${(result.durationMs / 1000).toFixed(2)}s`);

    if (result.coveragePercent !== undefined) {
        lines.push(`Coverage: ${result.coveragePercent.toFixed(1)}%`);
    }

    if (result.failures.length > 0) {
        lines.push('');
        lines.push('Failures:');
        for (const failure of result.failures) {
            lines.push(`  • ${failure.fullName}`);
            if (failure.errorMessage) {
                lines.push(`    ${failure.errorMessage.slice(0, 100)}...`);
            }
        }
    }

    return lines.join('\n');
}
