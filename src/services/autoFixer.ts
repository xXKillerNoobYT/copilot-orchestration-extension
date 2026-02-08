/**
 * Auto-Fix Workflow (MT-033.35)
 *
 * Handles automatic fixing of simple, deterministic errors detected by
 * the error detection system. For errors that can't be auto-fixed safely
 * (confidence < 90%), creates a fix ticket for a coding agent or human.
 *
 * **Simple explanation**: Like spell-check for code — fixes obvious
 * mistakes automatically (missing semicolons, wrong quotes, unused vars).
 * For anything harder, creates a work ticket with full context so a
 * specialist can fix it properly.
 *
 * Design philosophy (from project NOTE): Rather than having this extension
 * itself fix complex code, the approach is to create fix tickets with context
 * for human or specialist agent review. Only deterministic, high-confidence
 * fixes are applied automatically.
 *
 * @module services/autoFixer
 */

import {
    DetectedError,
    ErrorDetectionResult,
    ErrorCategory,
    Fixability,
    getAutoFixableErrors
} from './errorDetector';

// ============================================================================
// Types
// ============================================================================

/** Result of attempting an auto-fix */
export type FixOutcome = 'applied' | 'skipped' | 'failed' | 'ticket_created';

/**
 * A single auto-fix attempt and its result.
 *
 * **Simple explanation**: "I tried to fix this error — here's what happened."
 */
export interface FixAttempt {
    /** The error that was fixed */
    errorId: string;
    /** What kind of fix was attempted */
    fixType: FixType;
    /** Outcome of the fix */
    outcome: FixOutcome;
    /** File that was modified */
    filePath?: string;
    /** The fix description */
    description: string;
    /** The change applied (before → after) */
    change?: {
        before: string;
        after: string;
        line: number;
    };
    /** Confidence level of the fix (0-100) */
    confidence: number;
    /** Why the fix was skipped (if skipped) */
    skipReason?: string;
    /** Timestamp of the fix attempt */
    timestamp: string;
}

/** Types of auto-fixes available */
export type FixType =
    | 'add_semicolon'
    | 'remove_trailing_spaces'
    | 'fix_quotes'
    | 'fix_indentation'
    | 'remove_unused_var'
    | 'add_trailing_comma'
    | 'add_newline_eof'
    | 'remove_extra_semicolons'
    | 'prefer_const'
    | 'generic_lint_fix'
    | 'create_fix_ticket';

/**
 * A fix ticket for errors that can't be auto-fixed.
 *
 * **Simple explanation**: A work order — "Please fix this, here's all the
 * context you need."
 */
export interface FixTicket {
    /** Unique ticket ID */
    id: string;
    /** The original error */
    error: DetectedError;
    /** Why auto-fix couldn't handle it */
    reason: string;
    /** All context for fixing */
    context: string;
    /** Suggested approach */
    suggestedApproach: string;
    /** Urgency derived from error severity */
    urgency: 'immediate' | 'normal' | 'low';
    /** Created timestamp */
    createdAt: string;
}

/**
 * Complete result of an auto-fix session.
 *
 * **Simple explanation**: Summary of the entire fix session — what was
 * fixed, what was skipped, and what needs manual attention.
 */
export interface AutoFixResult {
    /** All fix attempts */
    attempts: FixAttempt[];
    /** Tickets created for unfixable errors */
    tickets: FixTicket[];
    /** Count of successful fixes */
    appliedCount: number;
    /** Count of skipped attempts */
    skippedCount: number;
    /** Count of failed attempts */
    failedCount: number;
    /** Count of tickets created */
    ticketCount: number;
    /** Modified file contents (filePath → new content) */
    modifiedFiles: Map<string, string>;
    /** Summary text */
    summary: string;
    /** Whether tests should be re-run after fixes */
    requiresRetest: boolean;
    /** Timestamp */
    completedAt: string;
}

/**
 * Configuration for the auto-fixer.
 *
 * **Simple explanation**: Settings that control how aggressively the
 * auto-fixer acts — minimum confidence to fix, max fixes per file, etc.
 */
export interface AutoFixerConfig {
    /** Minimum confidence to apply an auto-fix (default: 90) */
    minConfidence: number;
    /** Run tests after fixing (default: true) */
    runTestsAfterFix: boolean;
    /** Max fixes per file (default: 20) */
    maxFixesPerFile: number;
    /** Create tickets for unfixable errors (default: true) */
    createTicketsForUnfixable: boolean;
    /** Fix types to skip */
    skipFixTypes: FixType[];
    /** Dry run — don't actually modify files (default: false) */
    dryRun: boolean;
}

/**
 * Default auto-fixer configuration.
 *
 * **Simple explanation**: Conservative defaults — high confidence required,
 * always test after fixing.
 */
export const DEFAULT_AUTO_FIXER_CONFIG: AutoFixerConfig = {
    minConfidence: 90,
    runTestsAfterFix: true,
    maxFixesPerFile: 20,
    createTicketsForUnfixable: true,
    skipFixTypes: [],
    dryRun: false
};

// ============================================================================
// Ticket ID Generation
// ============================================================================

let ticketCounter = 0;

/**
 * Generate a unique fix ticket ID.
 *
 * **Simple explanation**: Creates IDs like "FIX-001" for tracking.
 */
export function generateFixTicketId(): string {
    ticketCounter++;
    return `FIX-${String(ticketCounter).padStart(3, '0')}`;
}

/**
 * Reset the ticket counter (for testing).
 */
export function resetTicketCounter(): void {
    ticketCounter = 0;
}

// ============================================================================
// Fix Type Determination
// ============================================================================

/**
 * Determine what kind of fix to apply for an error.
 *
 * **Simple explanation**: "What tool do I use to fix this?" — maps error
 * codes/categories to specific fix actions.
 */
export function determineFixType(error: DetectedError): FixType {
    // Lint/style based on code
    if (error.code) {
        const codeToFix: Record<string, FixType> = {
            'semi': 'add_semicolon',
            'no-trailing-spaces': 'remove_trailing_spaces',
            'quotes': 'fix_quotes',
            'indent': 'fix_indentation',
            'no-unused-vars': 'remove_unused_var',
            '@typescript-eslint/no-unused-vars': 'remove_unused_var',
            'comma-dangle': 'add_trailing_comma',
            'eol-last': 'add_newline_eof',
            'no-extra-semi': 'remove_extra_semicolons',
            'prefer-const': 'prefer_const',
            'no-multiple-empty-lines': 'remove_trailing_spaces'
        };

        if (codeToFix[error.code]) {
            return codeToFix[error.code];
        }
    }

    // Style category → generic lint fix
    if (error.category === 'style' || error.category === 'lint') {
        return 'generic_lint_fix';
    }

    // Everything else → create a ticket
    return 'create_fix_ticket';
}

// ============================================================================
// Fix Confidence
// ============================================================================

/**
 * Calculate confidence for an auto-fix.
 *
 * **Simple explanation**: "How sure am I that this fix is correct?"
 * Simple formatting fixes = 99%. Complex logic changes = 50%.
 */
export function calculateFixConfidence(fixType: FixType, error: DetectedError): number {
    const confidenceMap: Record<FixType, number> = {
        'add_semicolon': 99,
        'remove_trailing_spaces': 99,
        'fix_quotes': 95,
        'fix_indentation': 90,
        'remove_unused_var': 85,
        'add_trailing_comma': 95,
        'add_newline_eof': 99,
        'remove_extra_semicolons': 99,
        'prefer_const': 90,
        'generic_lint_fix': 70,
        'create_fix_ticket': 0
    };

    return confidenceMap[fixType] ?? 50;
}

// ============================================================================
// Individual Fix Implementations
// ============================================================================

/**
 * Apply a fix to file content at a specific line.
 *
 * **Simple explanation**: Actually modifies the code to fix the error.
 * Returns the fixed line and the original for comparison.
 */
export function applyLineFix(
    content: string,
    line: number,
    fixType: FixType
): { fixed: string; before: string; after: string } | null {
    const lines = content.split('\n');
    if (line < 1 || line > lines.length) {
        return null;
    }

    const idx = line - 1;
    const originalLine = lines[idx];
    let fixedLine = originalLine;

    switch (fixType) {
        case 'add_semicolon':
            if (!originalLine.trimEnd().endsWith(';') && !originalLine.trimEnd().endsWith('{') &&
                !originalLine.trimEnd().endsWith('}') && !originalLine.trimEnd().endsWith(',') &&
                originalLine.trim().length > 0) {
                fixedLine = originalLine.trimEnd() + ';';
            }
            break;

        case 'remove_trailing_spaces':
            fixedLine = originalLine.replace(/\s+$/, '');
            break;

        case 'fix_quotes':
            // Convert double quotes to single quotes (default convention)
            fixedLine = originalLine.replace(/"([^"\\]*)"/g, "'$1'");
            break;

        case 'remove_extra_semicolons':
            fixedLine = originalLine.replace(/;{2,}/g, ';');
            break;

        case 'prefer_const':
            fixedLine = originalLine.replace(/\blet\b/, 'const');
            break;

        case 'remove_unused_var':
            // Prefix with underscore instead of removing
            fixedLine = originalLine.replace(
                /\b(const|let|var)\s+(\w+)/,
                (match, decl, name) => `${decl} _${name}`
            );
            break;

        case 'add_trailing_comma':
            if (!originalLine.trimEnd().endsWith(',') && !originalLine.trimEnd().endsWith('{') &&
                !originalLine.trimEnd().endsWith('[') && originalLine.trim().length > 0) {
                fixedLine = originalLine.trimEnd() + ',';
            }
            break;

        default:
            return null; // Can't apply
    }

    if (fixedLine === originalLine) {
        return null; // No change
    }

    lines[idx] = fixedLine;
    return {
        fixed: lines.join('\n'),
        before: originalLine,
        after: fixedLine
    };
}

/**
 * Apply end-of-file newline fix.
 *
 * **Simple explanation**: Adds a newline at the end of the file if missing.
 */
export function applyEofNewline(content: string): { fixed: string; changed: boolean } {
    if (content.length > 0 && !content.endsWith('\n')) {
        return { fixed: content + '\n', changed: true };
    }
    return { fixed: content, changed: false };
}

// ============================================================================
// Fix Ticket Creation
// ============================================================================

/**
 * Create a fix ticket for an error that can't be auto-fixed.
 *
 * **Simple explanation**: Creates a detailed work order with all context
 * so a coding agent or human can fix it properly.
 */
export function createFixTicket(error: DetectedError): FixTicket {
    const urgencyMap: Record<string, 'immediate' | 'normal' | 'low'> = {
        'critical': 'immediate',
        'high': 'immediate',
        'medium': 'normal',
        'low': 'low'
    };

    const context = [
        `Error: ${error.title}`,
        `Category: ${error.category}`,
        `Severity: ${error.severity}`,
        `Message: ${error.message}`,
        error.filePath ? `File: ${error.filePath}` : '',
        error.line ? `Line: ${error.line}` : '',
        error.code ? `Code: ${error.code}` : '',
        `Source: ${error.source}`,
        error.rawText ? `Raw: ${error.rawText}` : ''
    ].filter(Boolean).join('\n');

    return {
        id: generateFixTicketId(),
        error,
        reason: error.fixability === 'human_required'
            ? 'Requires human judgment — potential security or architectural concern'
            : 'Too complex for auto-fix — requires agent analysis',
        context,
        suggestedApproach: error.suggestedFix || 'Review the error and apply appropriate fix',
        urgency: urgencyMap[error.severity] || 'normal',
        createdAt: new Date().toISOString()
    };
}

// ============================================================================
// Auto-Fix Pipeline
// ============================================================================

/**
 * Run the auto-fix pipeline on detected errors.
 *
 * **Simple explanation**: Goes through all detected errors, fixes what
 * it can with high confidence, creates tickets for the rest.
 *
 * @param detectionResult - The error detection result
 * @param fileContents - Map of filePath → file content (for applying fixes)
 * @param config - Optional configuration overrides
 * @returns Complete AutoFixResult
 */
export function runAutoFix(
    detectionResult: ErrorDetectionResult,
    fileContents: Map<string, string>,
    config?: Partial<AutoFixerConfig>
): AutoFixResult {
    const cfg: AutoFixerConfig = { ...DEFAULT_AUTO_FIXER_CONFIG, ...config };
    resetTicketCounter();

    const attempts: FixAttempt[] = [];
    const tickets: FixTicket[] = [];
    const modifiedFiles = new Map<string, string>();
    const fixCountPerFile = new Map<string, number>();

    // Copy original contents to working set
    for (const [path, content] of fileContents.entries()) {
        modifiedFiles.set(path, content);
    }

    for (const error of detectionResult.errors) {
        const fixType = determineFixType(error);

        // Skip if fix type is in skip list
        if (cfg.skipFixTypes.includes(fixType)) {
            attempts.push({
                errorId: error.id,
                fixType,
                outcome: 'skipped',
                description: `Skipped: ${fixType} is in skip list`,
                confidence: 0,
                skipReason: 'Fix type in skip list',
                timestamp: new Date().toISOString()
            });
            continue;
        }

        // If it's a ticket-type fix, create a ticket
        if (fixType === 'create_fix_ticket') {
            if (cfg.createTicketsForUnfixable) {
                tickets.push(createFixTicket(error));
                attempts.push({
                    errorId: error.id,
                    fixType,
                    outcome: 'ticket_created',
                    description: `Created fix ticket for: ${error.title}`,
                    confidence: 0,
                    timestamp: new Date().toISOString()
                });
            }
            continue;
        }

        // Check confidence
        const confidence = calculateFixConfidence(fixType, error);
        if (confidence < cfg.minConfidence) {
            // Confidence too low — create ticket instead
            if (cfg.createTicketsForUnfixable) {
                tickets.push(createFixTicket(error));
            }
            attempts.push({
                errorId: error.id,
                fixType,
                outcome: 'skipped',
                filePath: error.filePath,
                description: `Confidence ${confidence}% below threshold ${cfg.minConfidence}%`,
                confidence,
                skipReason: `Confidence ${confidence}% < ${cfg.minConfidence}%`,
                timestamp: new Date().toISOString()
            });
            continue;
        }

        // Check max fixes per file
        if (error.filePath) {
            const currentCount = fixCountPerFile.get(error.filePath) || 0;
            if (currentCount >= cfg.maxFixesPerFile) {
                attempts.push({
                    errorId: error.id,
                    fixType,
                    outcome: 'skipped',
                    filePath: error.filePath,
                    description: `Max fixes per file (${cfg.maxFixesPerFile}) reached`,
                    confidence,
                    skipReason: 'Max fixes per file reached',
                    timestamp: new Date().toISOString()
                });
                continue;
            }
        }

        // Try to apply the fix
        if (cfg.dryRun) {
            attempts.push({
                errorId: error.id,
                fixType,
                outcome: 'applied',
                filePath: error.filePath,
                description: `[DRY RUN] Would apply ${fixType}`,
                confidence,
                timestamp: new Date().toISOString()
            });
            continue;
        }

        // Apply the fix
        const attempt = applyFix(error, fixType, confidence, modifiedFiles);
        attempts.push(attempt);

        if (attempt.outcome === 'applied' && error.filePath) {
            fixCountPerFile.set(error.filePath, (fixCountPerFile.get(error.filePath) || 0) + 1);
        }
    }

    const appliedCount = attempts.filter(a => a.outcome === 'applied').length;
    const skippedCount = attempts.filter(a => a.outcome === 'skipped').length;
    const failedCount = attempts.filter(a => a.outcome === 'failed').length;
    const ticketCount = tickets.length;

    return {
        attempts,
        tickets,
        appliedCount,
        skippedCount,
        failedCount,
        ticketCount,
        modifiedFiles,
        summary: generateAutoFixSummary(appliedCount, skippedCount, failedCount, ticketCount),
        requiresRetest: appliedCount > 0 && cfg.runTestsAfterFix,
        completedAt: new Date().toISOString()
    };
}

// ============================================================================
// Fix Application
// ============================================================================

/**
 * Apply a single fix to file contents.
 */
function applyFix(
    error: DetectedError,
    fixType: FixType,
    confidence: number,
    modifiedFiles: Map<string, string>
): FixAttempt {
    const filePath = error.filePath;
    if (!filePath || !modifiedFiles.has(filePath)) {
        return {
            errorId: error.id,
            fixType,
            outcome: 'failed',
            filePath,
            description: `File not available: ${filePath || 'unknown'}`,
            confidence,
            timestamp: new Date().toISOString()
        };
    }

    const content = modifiedFiles.get(filePath)!;

    // Handle EOF newline separately
    if (fixType === 'add_newline_eof') {
        const { fixed, changed } = applyEofNewline(content);
        if (changed) {
            modifiedFiles.set(filePath, fixed);
            return {
                errorId: error.id,
                fixType,
                outcome: 'applied',
                filePath,
                description: 'Added newline at end of file',
                confidence,
                timestamp: new Date().toISOString()
            };
        }
        return {
            errorId: error.id,
            fixType,
            outcome: 'skipped',
            filePath,
            description: 'File already has trailing newline',
            confidence,
            skipReason: 'No change needed',
            timestamp: new Date().toISOString()
        };
    }

    // Line-based fix
    if (!error.line) {
        return {
            errorId: error.id,
            fixType,
            outcome: 'failed',
            filePath,
            description: `No line number for fix type ${fixType}`,
            confidence,
            timestamp: new Date().toISOString()
        };
    }

    const result = applyLineFix(content, error.line, fixType);
    if (!result) {
        return {
            errorId: error.id,
            fixType,
            outcome: 'failed',
            filePath,
            description: `Could not apply ${fixType} at line ${error.line}`,
            confidence,
            timestamp: new Date().toISOString()
        };
    }

    modifiedFiles.set(filePath, result.fixed);
    return {
        errorId: error.id,
        fixType,
        outcome: 'applied',
        filePath,
        description: `Applied ${fixType} at line ${error.line}`,
        change: {
            before: result.before,
            after: result.after,
            line: error.line
        },
        confidence,
        timestamp: new Date().toISOString()
    };
}

// ============================================================================
// Summary
// ============================================================================

/**
 * Generate a human-readable summary of the auto-fix session.
 *
 * **Simple explanation**: "Fixed 5 issues, skipped 2, created 3 tickets."
 */
export function generateAutoFixSummary(
    applied: number,
    skipped: number,
    failed: number,
    tickets: number
): string {
    const parts: string[] = [];

    if (applied > 0) {
        parts.push(`${applied} fixed`);
    }
    if (skipped > 0) {
        parts.push(`${skipped} skipped`);
    }
    if (failed > 0) {
        parts.push(`${failed} failed`);
    }
    if (tickets > 0) {
        parts.push(`${tickets} ticket(s) created`);
    }

    if (parts.length === 0) {
        return 'No fixes attempted';
    }

    return parts.join(', ');
}

/**
 * Get a compact report of the auto-fix session.
 *
 * **Simple explanation**: Creates a text summary suitable for including
 * in agent context or user notifications.
 */
export function getAutoFixReport(result: AutoFixResult): string {
    const lines: string[] = [];
    lines.push(`## Auto-Fix Report`);
    lines.push('');
    lines.push(`**Summary**: ${result.summary}`);
    lines.push(`**Requires Retest**: ${result.requiresRetest ? 'Yes' : 'No'}`);
    lines.push('');

    if (result.attempts.filter(a => a.outcome === 'applied').length > 0) {
        lines.push('### Applied Fixes');
        for (const attempt of result.attempts.filter(a => a.outcome === 'applied')) {
            lines.push(`- ✅ ${attempt.description}${attempt.filePath ? ` (${attempt.filePath})` : ''}`);
        }
        lines.push('');
    }

    if (result.tickets.length > 0) {
        lines.push('### Fix Tickets Created');
        for (const ticket of result.tickets) {
            lines.push(`- 📋 **${ticket.id}**: ${ticket.error.title} [${ticket.urgency}]`);
            lines.push(`  ${ticket.suggestedApproach}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}
