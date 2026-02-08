/**
 * Error Detection System (MT-033.34)
 *
 * Detects and categorizes errors from coding agent results. Parses compiler
 * output, test output, lint output, and runtime logs to produce structured
 * error records with severity, category, location, and suggested fixes.
 *
 * **Simple explanation**: A triage nurse for code errors — examines everything
 * the coding agent produced, finds every problem, labels how bad each one is,
 * and points to where the fix should go.
 *
 * @module services/errorDetector
 */

import {
    FileChange,
    TestResult,
    TestFailure,
    HandbackPackage
} from './codingHandback';

// ============================================================================
// Types
// ============================================================================

/** Error category — what kind of problem */
export type ErrorCategory =
    | 'compile'
    | 'test_failure'
    | 'lint'
    | 'runtime'
    | 'logic'
    | 'performance'
    | 'style'
    | 'security'
    | 'dependency';

/** Severity level — how bad is it */
export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Whether the error is auto-fixable */
export type Fixability = 'auto_fixable' | 'agent_fixable' | 'human_required';

/**
 * A detected error with full context.
 *
 * **Simple explanation**: One specific problem found in the code, with
 * everything you need to understand and fix it.
 */
export interface DetectedError {
    /** Unique error ID */
    id: string;
    /** Error category */
    category: ErrorCategory;
    /** Severity */
    severity: ErrorSeverity;
    /** Whether this can be auto-fixed */
    fixability: Fixability;
    /** Short error title */
    title: string;
    /** Detailed error message */
    message: string;
    /** File where the error occurred */
    filePath?: string;
    /** Line number (1-based) */
    line?: number;
    /** Column number (1-based) */
    column?: number;
    /** Error code (e.g., TS2345, ESLint no-unused-vars) */
    code?: string;
    /** Suggested fix description */
    suggestedFix?: string;
    /** Source of the error (compiler, test runner, linter, etc.) */
    source: string;
    /** Raw error text */
    rawText: string;
    /** Timestamp of detection */
    detectedAt: string;
}

/**
 * Summary of all detected errors.
 *
 * **Simple explanation**: The triage report — how many errors of each type,
 * and the overall health verdict.
 */
export interface ErrorDetectionResult {
    /** All detected errors */
    errors: DetectedError[];
    /** Total count by category */
    countByCategory: Record<ErrorCategory, number>;
    /** Total count by severity */
    countBySeverity: Record<ErrorSeverity, number>;
    /** Count auto-fixable */
    autoFixableCount: number;
    /** Whether there are blocking errors */
    hasBlockingErrors: boolean;
    /** Summary text */
    summary: string;
    /** Timestamp of analysis */
    analyzedAt: string;
}

/**
 * Configuration for error detection.
 *
 * **Simple explanation**: Settings that control how errors are detected
 * and categorized — thresholds, patterns, and behavior.
 */
export interface ErrorDetectorConfig {
    /** Treat lint warnings as errors (default: false) */
    treatWarningsAsErrors: boolean;
    /** Performance threshold in ms (default: 5000) */
    performanceThresholdMs: number;
    /** Include style issues (default: true) */
    includeStyleIssues: boolean;
    /** Security patterns to scan for */
    securityPatterns: string[];
    /** Max errors before stopping (default: 100) */
    maxErrors: number;
}

/**
 * Default error detector configuration.
 *
 * **Simple explanation**: Standard settings — catch everything, be thorough.
 */
export const DEFAULT_ERROR_DETECTOR_CONFIG: ErrorDetectorConfig = {
    treatWarningsAsErrors: false,
    performanceThresholdMs: 5000,
    includeStyleIssues: true,
    securityPatterns: [
        'eval\\s*\\(',
        'innerHTML\\s*=',
        'document\\.write',
        'password.*=.*["\']',
        'api[_-]?key.*=.*["\']',
        'secret.*=.*["\']',
        'TODO.*security',
        'FIXME.*security'
    ],
    maxErrors: 100
};

// ============================================================================
// Error ID Generation
// ============================================================================

let errorCounter = 0;

/**
 * Generate a unique error ID.
 *
 * **Simple explanation**: Creates a sequential ID like "ERR-001" for tracking.
 */
export function generateErrorId(): string {
    errorCounter++;
    return `ERR-${String(errorCounter).padStart(3, '0')}`;
}

/**
 * Reset the error counter (for testing).
 */
export function resetErrorCounter(): void {
    errorCounter = 0;
}

// ============================================================================
// Severity Determination
// ============================================================================

/**
 * Determine severity based on error category and context.
 *
 * **Simple explanation**: "How bad is this?" — compile errors are critical
 * (code won't even run), style issues are low (cosmetic).
 */
export function determineSeverity(
    category: ErrorCategory,
    context?: { isBlocking?: boolean; affectsTests?: boolean }
): ErrorSeverity {
    // Compile errors are always critical (code won't build)
    if (category === 'compile') {
        return 'critical';
    }

    // Security is always high
    if (category === 'security') {
        return 'high';
    }

    // Runtime errors are high (app crashes)
    if (category === 'runtime') {
        return 'high';
    }

    // Test failures
    if (category === 'test_failure') {
        return context?.isBlocking ? 'critical' : 'high';
    }

    // Lint errors are medium by default
    if (category === 'lint') {
        return context?.affectsTests ? 'high' : 'medium';
    }

    // Performance issues
    if (category === 'performance') {
        return 'medium';
    }

    // Logic errors
    if (category === 'logic') {
        return 'high';
    }

    // Style and dependency are low
    if (category === 'style' || category === 'dependency') {
        return 'low';
    }

    return 'medium';
}

// ============================================================================
// Fixability Determination
// ============================================================================

/**
 * Determine whether an error can be auto-fixed.
 *
 * **Simple explanation**: "Can a computer fix this, or does a human need to
 * think about it?" Missing semicolons = auto-fix. Logic bugs = human.
 */
export function determineFixability(
    category: ErrorCategory,
    code?: string,
    message?: string
): Fixability {
    // Style issues are almost always auto-fixable
    if (category === 'style') {
        return 'auto_fixable';
    }

    // Lint errors — many are auto-fixable
    if (category === 'lint') {
        const autoFixableLintRules = [
            'semi', 'no-trailing-spaces', 'indent', 'quotes',
            'comma-dangle', 'eol-last', 'no-multiple-empty-lines',
            'no-unused-vars', 'prefer-const', 'no-extra-semi'
        ];
        if (code && autoFixableLintRules.some(rule => code.includes(rule))) {
            return 'auto_fixable';
        }
        return 'agent_fixable';
    }

    // Compile errors — some are auto-fixable (missing imports)
    if (category === 'compile') {
        const msg = (message || '').toLowerCase();
        if (msg.includes('cannot find module') || msg.includes('cannot find name')) {
            return 'agent_fixable';
        }
        if (msg.includes('expected')) {
            return 'auto_fixable'; // Missing syntax element
        }
        return 'agent_fixable';
    }

    // Dependency issues might be auto-fixable
    if (category === 'dependency') {
        return 'agent_fixable';
    }

    // Test failures, runtime, logic, security, performance → need an agent or human
    if (category === 'security') {
        return 'human_required';
    }

    if (category === 'logic' || category === 'runtime') {
        return 'agent_fixable';
    }

    if (category === 'test_failure') {
        return 'agent_fixable';
    }

    if (category === 'performance') {
        return 'agent_fixable';
    }

    return 'agent_fixable';
}

// ============================================================================
// Compile Error Parsing
// ============================================================================

/**
 * Parse TypeScript compiler output into structured errors.
 *
 * **Simple explanation**: Reads the compiler's error messages and turns
 * each one into a neat record with file, line, and what went wrong.
 */
export function parseCompileErrors(compilerOutput: string): DetectedError[] {
    const errors: DetectedError[] = [];
    // TypeScript error format: file.ts(line,col): error TS1234: message
    const tsPattern = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/gm;

    let match: RegExpExecArray | null;
    while ((match = tsPattern.exec(compilerOutput)) !== null) {
        const [rawText, filePath, lineStr, colStr, code, message] = match;
        errors.push({
            id: generateErrorId(),
            category: 'compile',
            severity: 'critical',
            fixability: determineFixability('compile', code, message),
            title: `Compile error ${code}`,
            message,
            filePath,
            line: parseInt(lineStr, 10),
            column: parseInt(colStr, 10),
            code,
            suggestedFix: suggestCompileFix(code, message),
            source: 'tsc',
            rawText,
            detectedAt: new Date().toISOString()
        });
    }

    // Also match simpler format: file.ts:line:col - error TS1234: message
    const simplePattern = /^(.+?):(\d+):(\d+)\s*-\s*error\s+(TS\d+):\s*(.+)$/gm;
    while ((match = simplePattern.exec(compilerOutput)) !== null) {
        const [rawText, filePath, lineStr, colStr, code, message] = match;
        errors.push({
            id: generateErrorId(),
            category: 'compile',
            severity: 'critical',
            fixability: determineFixability('compile', code, message),
            title: `Compile error ${code}`,
            message,
            filePath,
            line: parseInt(lineStr, 10),
            column: parseInt(colStr, 10),
            code,
            suggestedFix: suggestCompileFix(code, message),
            source: 'tsc',
            rawText,
            detectedAt: new Date().toISOString()
        });
    }

    return errors;
}

/**
 * Suggest a fix for a compile error based on error code.
 *
 * **Simple explanation**: Maps common TypeScript error codes to
 * plain-English fix suggestions.
 */
export function suggestCompileFix(code: string, message: string): string {
    const fixes: Record<string, string> = {
        'TS2304': 'Add missing import or declare the identifier',
        'TS2305': 'Check the import path — the export may have been renamed or removed',
        'TS2307': 'Install the missing module (npm install) or fix the import path',
        'TS2322': 'Fix the type mismatch — check the expected vs actual type',
        'TS2339': 'The property does not exist on this type — check spelling or add type assertion',
        'TS2345': 'Argument type mismatch — convert the argument to the correct type',
        'TS2531': 'Object is possibly null — add null check or use optional chaining',
        'TS2532': 'Object is possibly undefined — add undefined check or use optional chaining',
        'TS2554': 'Wrong number of arguments — check function signature',
        'TS2769': 'No overload matches — check argument types against all overloads',
        'TS7006': 'Add explicit type annotation to the parameter',
        'TS1005': 'Missing syntax element — check for missing brackets, semicolons, etc.',
        'TS1128': 'Declaration or statement expected — check for syntax errors',
        'TS6133': 'Remove unused declaration or prefix with underscore'
    };

    return fixes[code] || `Review error ${code}: ${message}`;
}

// ============================================================================
// Lint Error Parsing
// ============================================================================

/**
 * Parse ESLint output into structured errors.
 *
 * **Simple explanation**: Reads the linter's output and turns warnings
 * and errors into neat records.
 */
export function parseLintErrors(
    lintOutput: string,
    config: ErrorDetectorConfig
): DetectedError[] {
    const errors: DetectedError[] = [];

    // ESLint format: file.ts:line:col: warning/error message rule-name
    // Also: /path/file.ts
    //          1:5  error  message  rule-name
    const linePattern = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(\S+)\s*$/gm;
    let currentFile = '';

    const lines = lintOutput.split('\n');
    for (const line of lines) {
        // Check for file path line (no leading whitespace, ends with extension)
        const fileMatch = line.match(/^(\S+\.[a-z]{2,4})$/);
        if (fileMatch) {
            currentFile = fileMatch[1];
            continue;
        }

        const errorMatch = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(\S+)\s*$/);
        if (errorMatch) {
            const [, lineStr, colStr, level, message, rule] = errorMatch;
            if (level === 'warning' && !config.treatWarningsAsErrors) {
                // Skip warnings unless configured to treat as errors
                if (!config.includeStyleIssues) {
                    continue;
                }
            }

            const category: ErrorCategory = level === 'error' ? 'lint' : 'style';
            errors.push({
                id: generateErrorId(),
                category,
                severity: determineSeverity(category),
                fixability: determineFixability(category, rule, message),
                title: `${level === 'error' ? 'Lint error' : 'Style warning'}: ${rule}`,
                message,
                filePath: currentFile || undefined,
                line: parseInt(lineStr, 10),
                column: parseInt(colStr, 10),
                code: rule,
                suggestedFix: suggestLintFix(rule, message),
                source: 'eslint',
                rawText: line.trim(),
                detectedAt: new Date().toISOString()
            });
        }
    }

    return errors;
}

/**
 * Suggest a fix for a lint error based on rule name.
 *
 * **Simple explanation**: Maps common ESLint rules to fix suggestions.
 */
export function suggestLintFix(rule: string, message: string): string {
    const fixes: Record<string, string> = {
        'no-unused-vars': 'Remove the unused variable or prefix with _ to indicate intentional',
        'semi': 'Add or remove semicolons as configured',
        'no-console': 'Replace console.log with the project logger',
        'prefer-const': 'Change let to const since the variable is never reassigned',
        'eqeqeq': 'Use === instead of == for strict equality',
        'no-var': 'Replace var with let or const',
        'quotes': 'Change quote style to match project config',
        'indent': 'Fix indentation to match project config',
        'comma-dangle': 'Add or remove trailing comma as configured',
        'no-trailing-spaces': 'Remove trailing whitespace',
        'eol-last': 'Add newline at end of file',
        '@typescript-eslint/no-explicit-any': 'Replace any with a specific type',
        '@typescript-eslint/no-unused-vars': 'Remove the unused variable or prefix with _',
        'no-extra-semi': 'Remove extra semicolons'
    };

    return fixes[rule] || `Fix ${rule}: ${message}`;
}

// ============================================================================
// Test Failure Parsing
// ============================================================================

/**
 * Extract errors from test results.
 *
 * **Simple explanation**: Turns test failures into error records so they
 * can be tracked alongside compile and lint errors.
 */
export function parseTestFailures(testResults: TestResult[]): DetectedError[] {
    const errors: DetectedError[] = [];

    for (const suite of testResults) {
        for (const failure of suite.failures) {
            const location = extractLocationFromStack(failure.stackTrace);
            errors.push({
                id: generateErrorId(),
                category: 'test_failure',
                severity: 'high',
                fixability: 'agent_fixable',
                title: `Test failed: ${failure.testName}`,
                message: failure.message,
                filePath: location?.filePath || suite.suiteName,
                line: location?.line,
                column: location?.column,
                suggestedFix: `Fix test "${failure.testName}" in ${suite.suiteName}`,
                source: 'jest',
                rawText: `${failure.testName}: ${failure.message}`,
                detectedAt: new Date().toISOString()
            });
        }
    }

    return errors;
}

/**
 * Extract file location from a stack trace.
 *
 * **Simple explanation**: Reads a stack trace and pulls out the file name
 * and line number where the error happened.
 */
export function extractLocationFromStack(
    stackTrace?: string
): { filePath: string; line: number; column?: number } | null {
    if (!stackTrace) {
        return null;
    }

    // Match common stack trace formats:
    // at Object.<anonymous> (/path/file.ts:10:5)
    // at /path/file.ts:10:5
    const match = stackTrace.match(/at\s+(?:.+?\s+)?(?:\()?(.+?):(\d+)(?::(\d+))?\)?/);
    if (match) {
        return {
            filePath: match[1],
            line: parseInt(match[2], 10),
            column: match[3] ? parseInt(match[3], 10) : undefined
        };
    }

    return null;
}

// ============================================================================
// Security Scanning
// ============================================================================

/**
 * Scan file changes for security issues.
 *
 * **Simple explanation**: Looks through the code for dangerous patterns
 * like hardcoded passwords, eval(), or innerHTML.
 */
export function scanForSecurityIssues(
    fileChanges: FileChange[],
    config: ErrorDetectorConfig
): DetectedError[] {
    const errors: DetectedError[] = [];

    for (const change of fileChanges) {
        if (!change.content) {
            continue;
        }

        const lines = change.content.split('\n');
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];

            for (const pattern of config.securityPatterns) {
                const regex = new RegExp(pattern, 'i');
                const match = line.match(regex);
                if (match) {
                    errors.push({
                        id: generateErrorId(),
                        category: 'security',
                        severity: 'high',
                        fixability: 'human_required',
                        title: `Security concern: ${pattern.replace(/\\s\*/g, ' ').replace(/\\\(/g, '(')}`,
                        message: `Potentially unsafe pattern found: "${match[0].trim()}"`,
                        filePath: change.filePath,
                        line: lineIdx + 1,
                        suggestedFix: 'Review for security implications — avoid hardcoded secrets, eval(), and innerHTML',
                        source: 'security-scan',
                        rawText: line.trim(),
                        detectedAt: new Date().toISOString()
                    });
                }
            }
        }
    }

    return errors;
}

// ============================================================================
// Performance Issue Detection
// ============================================================================

/**
 * Detect performance issues from test results and file content.
 *
 * **Simple explanation**: Checks if any tests are suspiciously slow
 * or if code has known performance anti-patterns.
 */
export function detectPerformanceIssues(
    testResults: TestResult[],
    fileChanges: FileChange[],
    config: ErrorDetectorConfig
): DetectedError[] {
    const errors: DetectedError[] = [];

    // Slow test suites
    for (const suite of testResults) {
        if (suite.durationMs > config.performanceThresholdMs) {
            errors.push({
                id: generateErrorId(),
                category: 'performance',
                severity: 'medium',
                fixability: 'agent_fixable',
                title: `Slow test suite: ${suite.suiteName}`,
                message: `Test suite took ${suite.durationMs}ms (threshold: ${config.performanceThresholdMs}ms)`,
                filePath: suite.suiteName,
                suggestedFix: 'Optimize test setup, use mocks for expensive operations, or split into smaller suites',
                source: 'performance-check',
                rawText: `${suite.suiteName}: ${suite.durationMs}ms`,
                detectedAt: new Date().toISOString()
            });
        }
    }

    // Code anti-patterns
    const perfPatterns = [
        { pattern: /\.forEach\s*\(\s*async/, label: 'async forEach (likely should be Promise.all)' },
        { pattern: /for\s*\(.*\)\s*\{[^}]*await\s/, label: 'sequential await in loop (consider Promise.all)' },
        { pattern: /JSON\.parse\(JSON\.stringify/, label: 'JSON deep clone (consider structuredClone or lodash)' }
    ];

    for (const change of fileChanges) {
        if (!change.content) {
            continue;
        }
        const lines = change.content.split('\n');
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            for (const { pattern, label } of perfPatterns) {
                if (pattern.test(lines[lineIdx])) {
                    errors.push({
                        id: generateErrorId(),
                        category: 'performance',
                        severity: 'low',
                        fixability: 'agent_fixable',
                        title: `Performance concern: ${label}`,
                        message: `Found potential performance anti-pattern: ${label}`,
                        filePath: change.filePath,
                        line: lineIdx + 1,
                        suggestedFix: `Review and optimize: ${label}`,
                        source: 'performance-scan',
                        rawText: lines[lineIdx].trim(),
                        detectedAt: new Date().toISOString()
                    });
                }
            }
        }
    }

    return errors;
}

// ============================================================================
// Logic Error Detection
// ============================================================================

/**
 * Detect potential logic errors from code patterns.
 *
 * **Simple explanation**: Looks for code that compiles but is
 * probably wrong — like comparing an object to a string, or
 * catching errors and silently ignoring them.
 */
export function detectLogicIssues(fileChanges: FileChange[]): DetectedError[] {
    const errors: DetectedError[] = [];

    const logicPatterns = [
        { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/, label: 'Empty catch block — errors are silently swallowed' },
        { pattern: /if\s*\(\s*\w+\s*=\s*[^=]/, label: 'Assignment in if condition (likely should be ==)' },
        { pattern: /===?\s*NaN/, label: 'Comparison with NaN (use Number.isNaN instead)' },
        { pattern: /typeof\s+\w+\s*===?\s*['"]undefined['"].*\?\?/, label: 'Redundant nullish coalescing with typeof check' }
    ];

    for (const change of fileChanges) {
        if (!change.content) {
            continue;
        }
        const lines = change.content.split('\n');
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            for (const { pattern, label } of logicPatterns) {
                if (pattern.test(lines[lineIdx])) {
                    errors.push({
                        id: generateErrorId(),
                        category: 'logic',
                        severity: 'high',
                        fixability: 'agent_fixable',
                        title: `Possible logic error: ${label}`,
                        message: label,
                        filePath: change.filePath,
                        line: lineIdx + 1,
                        suggestedFix: `Review: ${label}`,
                        source: 'logic-scan',
                        rawText: lines[lineIdx].trim(),
                        detectedAt: new Date().toISOString()
                    });
                }
            }
        }
    }

    return errors;
}

// ============================================================================
// Full Error Detection
// ============================================================================

/**
 * Run all error detection checks on a handback package.
 *
 * **Simple explanation**: The full triage — scans compiler output, test
 * results, lint output, file contents for security/performance/logic
 * issues, and produces a comprehensive error report.
 *
 * @param handback - The handback package from the coding agent
 * @param compilerOutput - Raw compiler output (optional)
 * @param lintOutput - Raw lint output (optional)
 * @param config - Optional configuration overrides
 * @returns Complete ErrorDetectionResult
 */
export function detectErrors(
    handback: HandbackPackage,
    compilerOutput?: string,
    lintOutput?: string,
    config?: Partial<ErrorDetectorConfig>
): ErrorDetectionResult {
    const cfg: ErrorDetectorConfig = { ...DEFAULT_ERROR_DETECTOR_CONFIG, ...config };
    resetErrorCounter();

    const allErrors: DetectedError[] = [];

    // 1. Parse compile errors
    if (compilerOutput) {
        allErrors.push(...parseCompileErrors(compilerOutput));
    }

    // 2. Parse lint errors
    if (lintOutput) {
        allErrors.push(...parseLintErrors(lintOutput, cfg));
    }

    // 3. Extract test failures
    allErrors.push(...parseTestFailures(handback.testResults));

    // 4. Security scan
    allErrors.push(...scanForSecurityIssues(handback.fileChanges, cfg));

    // 5. Performance check
    allErrors.push(...detectPerformanceIssues(handback.testResults, handback.fileChanges, cfg));

    // 6. Logic scan
    allErrors.push(...detectLogicIssues(handback.fileChanges));

    // Limit errors
    const limited = allErrors.slice(0, cfg.maxErrors);

    // Build counts
    const countByCategory = buildCategoryCount(limited);
    const countBySeverity = buildSeverityCount(limited);
    const autoFixableCount = limited.filter(e => e.fixability === 'auto_fixable').length;
    const hasBlockingErrors = limited.some(e => e.severity === 'critical');

    const summary = generateDetectionSummary(limited, countByCategory, countBySeverity, autoFixableCount, hasBlockingErrors);

    return {
        errors: limited,
        countByCategory,
        countBySeverity,
        autoFixableCount,
        hasBlockingErrors,
        summary,
        analyzedAt: new Date().toISOString()
    };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build count by category.
 */
export function buildCategoryCount(errors: DetectedError[]): Record<ErrorCategory, number> {
    const counts: Record<ErrorCategory, number> = {
        compile: 0,
        test_failure: 0,
        lint: 0,
        runtime: 0,
        logic: 0,
        performance: 0,
        style: 0,
        security: 0,
        dependency: 0
    };

    for (const error of errors) {
        counts[error.category]++;
    }

    return counts;
}

/**
 * Build count by severity.
 */
export function buildSeverityCount(errors: DetectedError[]): Record<ErrorSeverity, number> {
    const counts: Record<ErrorSeverity, number> = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
    };

    for (const error of errors) {
        counts[error.severity]++;
    }

    return counts;
}

/**
 * Generate a human-readable detection summary.
 */
export function generateDetectionSummary(
    errors: DetectedError[],
    byCategory: Record<ErrorCategory, number>,
    bySeverity: Record<ErrorSeverity, number>,
    autoFixable: number,
    hasBlocking: boolean
): string {
    if (errors.length === 0) {
        return 'No errors detected — clean build';
    }

    const parts: string[] = [];
    parts.push(`${errors.length} error(s) detected`);

    if (bySeverity.critical > 0) {
        parts.push(`${bySeverity.critical} critical`);
    }
    if (bySeverity.high > 0) {
        parts.push(`${bySeverity.high} high`);
    }

    // Top categories
    const topCategories = Object.entries(byCategory)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat, count]) => `${count} ${cat.replace('_', ' ')}`)
        .join(', ');
    if (topCategories) {
        parts.push(topCategories);
    }

    if (autoFixable > 0) {
        parts.push(`${autoFixable} auto-fixable`);
    }

    if (hasBlocking) {
        parts.push('⛔ BLOCKING');
    }

    return parts.join(' — ');
}

/**
 * Filter errors by category.
 *
 * **Simple explanation**: Get only compile errors, or only lint errors, etc.
 */
export function filterByCategory(errors: DetectedError[], category: ErrorCategory): DetectedError[] {
    return errors.filter(e => e.category === category);
}

/**
 * Filter errors by severity.
 *
 * **Simple explanation**: Get only critical errors, or only high-severity errors, etc.
 */
export function filterBySeverity(errors: DetectedError[], severity: ErrorSeverity): DetectedError[] {
    return errors.filter(e => e.severity === severity);
}

/**
 * Get only auto-fixable errors.
 *
 * **Simple explanation**: Filter down to errors that the system can fix automatically.
 */
export function getAutoFixableErrors(errors: DetectedError[]): DetectedError[] {
    return errors.filter(e => e.fixability === 'auto_fixable');
}

/**
 * Get a compact error report for agent consumption.
 *
 * **Simple explanation**: Creates a concise text summary suitable for
 * including in prompts or handoff packages.
 */
export function getCompactReport(result: ErrorDetectionResult): string {
    if (result.errors.length === 0) {
        return 'No errors detected.';
    }

    const lines: string[] = [];
    lines.push(`## Error Report (${result.errors.length} issues)`);
    lines.push('');

    // Group by severity
    for (const sev of ['critical', 'high', 'medium', 'low'] as ErrorSeverity[]) {
        const sevErrors = result.errors.filter(e => e.severity === sev);
        if (sevErrors.length === 0) {
            continue;
        }

        const icon = sev === 'critical' ? '🔴' : sev === 'high' ? '🟠' : sev === 'medium' ? '🟡' : '🟢';
        lines.push(`### ${icon} ${sev.toUpperCase()} (${sevErrors.length})`);

        for (const err of sevErrors) {
            const loc = err.filePath ? `${err.filePath}${err.line ? `:${err.line}` : ''}` : 'unknown';
            lines.push(`- **${err.title}** at ${loc}`);
            lines.push(`  ${err.message}`);
            if (err.suggestedFix) {
                lines.push(`  Fix: ${err.suggestedFix}`);
            }
        }
        lines.push('');
    }

    return lines.join('\n');
}
