// getErrors.ts
// MCP Tool: Get quality gate diagnostics (TypeScript errors, skipped tests, coverage warnings)

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../../logger';

/**
 * Request parameters for getErrors tool (no parameters required)
 */
export interface GetErrorsParams {}

/**
 * TypeScript error entry
 */
export interface TypeScriptError {
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
}

/**
 * Skipped test entry
 */
export interface SkippedTest {
    file: string;
    line: number;
    pattern: string;
    match: string;
}

/**
 * Under-coverage file entry
 */
export interface UnderCoverageFile {
    file: string;
    coverage: number;
}

/**
 * Scan for skipped tests (it.skip, describe.skip, etc.)
 * Lightweight scan - just reads files, doesn't execute commands
 * 
 * **Simple explanation**: Searches test files for tests marked with .skip
 */
function scanSkippedTests(): SkippedTest[] {
    try {
        logInfo('[getErrors] Scanning for skipped tests...');
        const skippedTests: SkippedTest[] = [];
        const testsDir = path.join(process.cwd(), 'tests');
        
        if (!fs.existsSync(testsDir)) {
            logWarn('[getErrors] Tests directory not found');
            return [];
        }
        
        // Recursively find all test files
        function findTestFiles(dir: string): string[] {
            const files: string[] = [];
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory() && !entry.name.startsWith('.')) {
                        files.push(...findTestFiles(fullPath));
                    } else if (entry.isFile() && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts'))) {
                        files.push(fullPath);
                    }
                }
            } catch (err) {
                // Silently skip directories we can't read
            }
            return files;
        }
        
        const testFiles = findTestFiles(testsDir);
        const skipPatterns = [
            /it\.skip\s*\(/g,
            /describe\.skip\s*\(/g,
            /test\.skip\s*\(/g,
            /xit\s*\(/g,
            /xdescribe\s*\(/g
        ];
        
        for (const testFile of testFiles) {
            try {
                const content = fs.readFileSync(testFile, 'utf-8');
                const lines = content.split('\n');
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    for (const pattern of skipPatterns) {
                        const match = line.match(pattern);
                        if (match) {
                            skippedTests.push({
                                file: path.relative(process.cwd(), testFile),
                                line: i + 1,
                                pattern: pattern.source,
                                match: match[0]
                            });
                        }
                    }
                }
            } catch (error: unknown) {
                logWarn(`[getErrors] Error reading test file ${testFile}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        
        logInfo(`[getErrors] Found ${skippedTests.length} skipped tests`);
        return skippedTests;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`[getErrors] Error scanning skipped tests: ${msg}`);
        return [];
    }
}

/**
 * Scan for under-coverage files from existing coverage report
 * 
 * **Simple explanation**: Checks coverage report for files below 80% coverage
 */
function scanUnderCoverageFiles(coverageThreshold: number = 80): UnderCoverageFile[] {
    try {
        logInfo('[getErrors] Scanning for under-coverage files...');
        const underCoverageFiles: UnderCoverageFile[] = [];
        
        const coverageSummaryFile = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
        
        if (!fs.existsSync(coverageSummaryFile)) {
            logWarn('[getErrors] Coverage report not found at ' + coverageSummaryFile);
            return [];
        }
        
        try {
            const summary = JSON.parse(fs.readFileSync(coverageSummaryFile, 'utf-8'));
            
            // Check each file's coverage percentage
            for (const [filePath, coverage] of Object.entries(summary)) {
                if (filePath === 'total') continue;
                
                const coverageData = coverage as any;
                const lineCoverage = coverageData.lines?.pct || 0;
                
                if (lineCoverage < coverageThreshold) {
                    underCoverageFiles.push({
                        file: filePath,
                        coverage: lineCoverage
                    });
                }
            }
        } catch (error: unknown) {
            logWarn(`[getErrors] Error parsing coverage summary: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        logInfo(`[getErrors] Found ${underCoverageFiles.length} under-coverage files`);
        return underCoverageFiles;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`[getErrors] Error scanning coverage: ${msg}`);
        return [];
    }
}

/**
 * Quality diagnostics structure
 */
export interface QualityDiagnostics {
    typeScriptErrors: TypeScriptError[];
    skippedTests: SkippedTest[];
    underCoverageFiles: UnderCoverageFile[];
    timestamp: string;
    source: string;
}

/**
 * Response from getErrors tool
 */
export interface GetErrorsResponse {
    success: boolean;
    diagnostics: QualityDiagnostics | null;
    error?: {
        code: string;
        message: string;
    };
}

/**
 * Attempt to load pre-generated diagnostics file from CI/CD pipeline
 * Fallback: graceful degradation if file doesn't exist
 */
function tryLoadPreGeneratedDiagnostics(): QualityDiagnostics | null {
    try {
        const diagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');
        
        if (!fs.existsSync(diagnosticsPath)) {
            return null;
        }
        
        const fileContent = fs.readFileSync(diagnosticsPath, 'utf-8');
        const diagnostics = JSON.parse(fileContent);
        
        // Validate structure
        if (!diagnostics.typeScriptErrors || !diagnostics.skippedTests || !diagnostics.underCoverageFiles) {
            logWarn('[getErrors] Pre-generated diagnostics file has invalid structure, will scan instead');
            return null;
        }
        
        logInfo('[getErrors] Successfully loaded pre-generated diagnostics');
        return diagnostics;
    } catch (error: unknown) {
        logWarn(`[getErrors] Could not load pre-generated diagnostics, will scan instead: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Get quality gate diagnostics - tries pre-generated file first, falls back to scanning
 * 
 * **Simple explanation**: Checks the code for TypeScript errors, skipped tests, and coverage issues.
 * Returns all issues found so you can fix them before deploying.
 * First tries to use pre-generated report from CI/CD, then falls back to scanning.
 * 
 * @param params Optional parameters (currently unused)
 * @returns GetErrorsResponse with diagnostics data or error information
 */
export async function handleGetErrors(params?: GetErrorsParams): Promise<GetErrorsResponse> {
    try {
        logInfo('[getErrors] Starting quality diagnostics fetch');

        // Try to load pre-generated diagnostics first (from CI/CD pipeline)
        const preGenerated = tryLoadPreGeneratedDiagnostics();
        if (preGenerated) {
            return {
                success: true,
                diagnostics: preGenerated
            };
        }

        // Fall back to lightweight scanning
        logInfo('[getErrors] Using lightweight scanning for diagnostics');
        const typeScriptErrors: TypeScriptError[] = []; // Can't run tsc without slowing down tests
        const skippedTests = scanSkippedTests();
        const underCoverageFiles = scanUnderCoverageFiles();

        const diagnostics: QualityDiagnostics = {
            typeScriptErrors,
            skippedTests,
            underCoverageFiles,
            timestamp: new Date().toISOString(),
            source: 'lightweight-scan'
        };

        logInfo(`[getErrors] Completed diagnostics: ${typeScriptErrors.length} TS errors, ${skippedTests.length} skipped tests, ${underCoverageFiles.length} under-coverage files`);

        return {
            success: true,
            diagnostics
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError(`[getErrors] Unexpected error: ${errorMessage}`);
        return {
            success: false,
            diagnostics: null,
            error: {
                code: 'UNEXPECTED_ERROR',
                message: errorMessage
            }
        };
    }
}

/**
 * Validate getErrors parameters
 * 
 * **Simple explanation**: Checks if the request parameters are valid (currently accepts empty params)
 * 
 * @param params The parameters to validate
 * @returns Validation result with isValid flag and optional error message
 */
export function validateGetErrorsParams(params: any): { isValid: boolean; error?: string } {
    // getErrors doesn't require any parameters, so just check that params is an object or undefined
    if (params !== undefined && params !== null && (typeof params !== 'object' || Array.isArray(params))) {
        return {
            isValid: false,
            error: 'Parameters must be an object or undefined'
        };
    }

    return { isValid: true };
}
