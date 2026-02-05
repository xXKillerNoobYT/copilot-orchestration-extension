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
 * Get quality gate diagnostics from .vscode/quality-diagnostics.json
 * 
 * **Simple explanation**: Like checking a report card for your code - shows TypeScript errors,
 * skipped tests, and files with low test coverage.
 * 
 * @param params Optional parameters (currently unused)
 * @returns GetErrorsResponse with diagnostics data or error information
 */
export async function handleGetErrors(params?: GetErrorsParams): Promise<GetErrorsResponse> {
    try {
        logInfo('[getErrors] Fetching quality diagnostics');

        // Path to diagnostics file
        const diagnosticsPath = path.join(process.cwd(), '.vscode', 'quality-diagnostics.json');

        // Check if file exists
        if (!fs.existsSync(diagnosticsPath)) {
            logWarn('[getErrors] Diagnostics file not found, returning empty diagnostics');
            return {
                success: true,
                diagnostics: {
                    typeScriptErrors: [],
                    skippedTests: [],
                    underCoverageFiles: [],
                    timestamp: new Date().toISOString(),
                    source: 'none'
                }
            };
        }

        // Read and parse the file
        const fileContent = fs.readFileSync(diagnosticsPath, 'utf-8');
        let diagnostics: QualityDiagnostics;

        try {
            diagnostics = JSON.parse(fileContent);
        } catch (parseError: unknown) {
            const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
            logError(`[getErrors] Failed to parse diagnostics file: ${errorMessage}`);
            return {
                success: false,
                diagnostics: null,
                error: {
                    code: 'INVALID_JSON',
                    message: `Failed to parse diagnostics file: ${errorMessage}`
                }
            };
        }

        // Validate structure
        if (!diagnostics.typeScriptErrors || !diagnostics.skippedTests || !diagnostics.underCoverageFiles) {
            logWarn('[getErrors] Diagnostics file has invalid structure');
            return {
                success: false,
                diagnostics: null,
                error: {
                    code: 'INVALID_STRUCTURE',
                    message: 'Diagnostics file missing required fields (typeScriptErrors, skippedTests, underCoverageFiles)'
                }
            };
        }

        logInfo(`[getErrors] Successfully loaded diagnostics: ${diagnostics.typeScriptErrors.length} TS errors, ${diagnostics.skippedTests.length} skipped tests, ${diagnostics.underCoverageFiles.length} under-coverage files`);

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
