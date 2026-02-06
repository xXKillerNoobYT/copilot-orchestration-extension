/**
 * @file verification/testRunner.ts
 * @module TestRunner
 * @description Runs automated tests and collects results (MT-015.4)
 * 
 * Executes npm test and parses the output to determine pass/fail status.
 * Can target specific test files or run the full suite.
 * 
 * **Simple explanation**: The test launcher. Runs `npm test` and tells you
 * how many tests passed, failed, and what the coverage looks like.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { logInfo, logError, logWarn } from '../../logger';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface TestRunnerConfig {
    command: string;           // Default: 'npm test'
    coverageThreshold: number; // Minimum coverage percentage
    timeoutMs: number;         // Test execution timeout
    cwd?: string;              // Working directory
}

export interface TestResult {
    passed: boolean;
    total: number;
    failed: number;
    skipped: number;
    duration: number;
    coverage?: CoverageResult;
    output: string;
    errorOutput?: string;
}

export interface CoverageResult {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
    meetsThreshold: boolean;
}

// ============================================================================
// TestRunner Class
// ============================================================================

/**
 * Executes automated tests and parses results.
 * 
 * **Simple explanation**: The test control room.
 * Launches tests, watches them run, and reports back with
 * detailed results including what failed and why.
 */
export class TestRunner extends EventEmitter {
    private config: TestRunnerConfig;
    private isRunning = false;
    private currentRun: AbortController | null = null;

    constructor(config: Partial<TestRunnerConfig> = {}) {
        super();
        this.config = {
            command: config.command ?? 'npm test',
            coverageThreshold: config.coverageThreshold ?? 80,
            timeoutMs: config.timeoutMs ?? 5 * 60 * 1000, // 5 minutes
            cwd: config.cwd
        };
    }

    /**
     * Run tests for the specified files
     * 
     * @param targetFiles - Specific files to test (optional)
     * @returns Test results
     */
    async runTests(targetFiles?: string[]): Promise<TestResult> {
        if (this.isRunning) {
            logWarn('[TestRunner] Tests already running, skipping');
            return {
                passed: false,
                total: 0,
                failed: 0,
                skipped: 0,
                duration: 0,
                output: 'Tests already running'
            };
        }

        this.isRunning = true;
        this.currentRun = new AbortController();
        const startTime = Date.now();

        try {
            const command = this.buildCommand(targetFiles);
            const cwd = this.config.cwd ?? this.getWorkspaceRoot();

            logInfo(`[TestRunner] Executing: ${command}`);
            this.emit('start', { command, cwd });

            const { stdout, stderr } = await execAsync(command, {
                cwd,
                timeout: this.config.timeoutMs,
                maxBuffer: 10 * 1024 * 1024 // 10MB
            });

            const duration = Date.now() - startTime;
            const result = this.parseTestOutput(stdout, stderr, duration);

            logInfo(`[TestRunner] Complete: ${result.total - result.failed}/${result.total} passed (${duration}ms)`);
            this.emit('complete', result);

            return result;

        } catch (error: unknown) {
            const duration = Date.now() - startTime;
            const msg = error instanceof Error ? error.message : String(error);

            // Test failures come through as errors in npm test
            if (this.isTestFailureError(error)) {
                const execError = error as { stdout?: string; stderr?: string };
                const result = this.parseTestOutput(
                    execError.stdout ?? '',
                    execError.stderr ?? msg,
                    duration
                );
                this.emit('complete', result);
                return result;
            }

            logError(`[TestRunner] Error: ${msg}`);
            this.emit('error', { error: msg });

            return {
                passed: false,
                total: 0,
                failed: 1,
                skipped: 0,
                duration,
                output: '',
                errorOutput: msg
            };
        } finally {
            this.isRunning = false;
            this.currentRun = null;
        }
    }

    /**
     * Build the test command
     */
    private buildCommand(targetFiles?: string[]): string {
        let command = this.config.command;

        // Add coverage flag if not present
        if (!command.includes('coverage')) {
            command = command.replace('npm test', 'npm run test:once -- --coverage');
        }

        // Add specific files if provided
        if (targetFiles && targetFiles.length > 0) {
            // Convert to Jest pattern
            const patterns = targetFiles
                .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
                .map(f => f.replace(/\\/g, '/'))
                .join('|');

            if (patterns) {
                command += ` --testPathPattern="${patterns}"`;
            }
        }

        return command;
    }

    /**
     * Get workspace root directory
     */
    private getWorkspaceRoot(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        return workspaceFolder?.uri.fsPath ?? process.cwd();
    }

    /**
     * Check if error is from test failures (expected) vs actual error
     */
    private isTestFailureError(error: unknown): boolean {
        if (error instanceof Error) {
            // npm test exits with code 1 on test failures
            const execError = error as { code?: number; stdout?: string };
            return execError.code === 1 && typeof execError.stdout === 'string';
        }
        return false;
    }

    /**
     * Parse test output to extract results
     */
    private parseTestOutput(stdout: string, stderr: string, duration: number): TestResult {
        // Default values
        let total = 0;
        let failed = 0;
        let skipped = 0;
        let coverage: CoverageResult | undefined;

        // Parse Jest output patterns
        const summaryMatch = stdout.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
        if (summaryMatch) {
            failed = parseInt(summaryMatch[1], 10);
            const passed = parseInt(summaryMatch[2], 10);
            total = parseInt(summaryMatch[3], 10);
        } else {
            // Try alternate pattern: "Tests:       X passed, Y total"
            const passedMatch = stdout.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
            if (passedMatch) {
                total = parseInt(passedMatch[2], 10);
                failed = 0;
            }
        }

        // Parse skipped tests
        const skippedMatch = stdout.match(/(\d+)\s+skipped/);
        if (skippedMatch) {
            skipped = parseInt(skippedMatch[1], 10);
        }

        // Parse coverage
        coverage = this.parseCoverage(stdout);

        return {
            passed: failed === 0 && total > 0,
            total,
            failed,
            skipped,
            duration,
            coverage,
            output: stdout,
            errorOutput: stderr || undefined
        };
    }

    /**
     * Parse coverage information from output
     */
    private parseCoverage(output: string): CoverageResult | undefined {
        // Look for Jest coverage summary
        const coverageMatch = output.match(/All files[^\n]*\n[^\n]*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/);

        if (coverageMatch) {
            const statements = parseFloat(coverageMatch[1]);
            const branches = parseFloat(coverageMatch[2]);
            const functions = parseFloat(coverageMatch[3]);
            const lines = parseFloat(coverageMatch[4]);

            return {
                statements,
                branches,
                functions,
                lines,
                meetsThreshold: lines >= this.config.coverageThreshold
            };
        }

        return undefined;
    }

    /**
     * Cancel running tests
     */
    cancel(): void {
        if (this.currentRun) {
            this.currentRun.abort();
            this.isRunning = false;
            this.emit('cancelled');
            logInfo('[TestRunner] Test run cancelled');
        }
    }

    /**
     * Check if tests are currently running
     */
    isTestRunning(): boolean {
        return this.isRunning;
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new TestRunner instance
 */
export function createTestRunner(config?: Partial<TestRunnerConfig>): TestRunner {
    return new TestRunner(config);
}
