/**
 * Answer Validation System
 * 
 * **Simple explanation**: Validates answers before sending them back.
 * Checks for consistency with plan, proper format, and accuracy.
 * 
 * @module agents/answer/validation
 */

import { logInfo, logWarn, logError } from '../../logger';
import { CitedAnswer, Citation } from './citations';

/**
 * Validation result
 */
export interface ValidationResult {
    /** Whether the answer passed validation */
    valid: boolean;
    /** Validation score (0-100) */
    score: number;
    /** Issues found */
    issues: ValidationIssue[];
    /** Suggestions for improvement */
    suggestions: string[];
}

/**
 * A validation issue
 */
export interface ValidationIssue {
    /** Issue severity */
    severity: 'error' | 'warning' | 'info';
    /** Issue code */
    code: string;
    /** Human-readable message */
    message: string;
    /** Location in answer (if applicable) */
    location?: string;
}

/**
 * Validation configuration
 */
export interface ValidationConfig {
    /** Minimum required confidence */
    minConfidence: number;
    /** Require citations */
    requireCitations: boolean;
    /** Minimum citations required */
    minCitations: number;
    /** Check for contradictions with plan */
    checkPlanConsistency: boolean;
    /** Maximum answer length */
    maxLength: number;
    /** Check for hallucination patterns */
    checkHallucinations: boolean;
}

const DEFAULT_CONFIG: ValidationConfig = {
    minConfidence: 60,
    requireCitations: false,
    minCitations: 0,
    checkPlanConsistency: true,
    maxLength: 10000,
    checkHallucinations: true
};

/**
 * Known hallucination patterns (phrases that often indicate made-up content)
 */
const HALLUCINATION_PATTERNS = [
    /according to (popular belief|common knowledge|many experts)/i,
    /it is (widely|commonly|generally) (known|believed|accepted)/i,
    /studies (have shown|suggest|indicate) that/i, // Without citation
    /research (proves|shows|indicates)/i, // Without citation
    /\d{4}(?![-/])/i, // Years without context might be made up
];

/**
 * Validate an answer
 */
export function validateAnswer(
    answer: string,
    citations: Citation[] = [],
    config: Partial<ValidationConfig> = {}
): ValidationResult {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const issues: ValidationIssue[] = [];
    const suggestions: string[] = [];
    let score = 100;

    logInfo(`[Validation] Validating answer (${answer.length} chars, ${citations.length} citations)`);

    // Check basic requirements
    if (!answer || answer.trim().length === 0) {
        issues.push({
            severity: 'error',
            code: 'EMPTY_ANSWER',
            message: 'Answer cannot be empty'
        });
        score = 0;
    }

    // Check length
    if (answer.length > cfg.maxLength) {
        issues.push({
            severity: 'warning',
            code: 'TOO_LONG',
            message: `Answer exceeds maximum length (${answer.length} > ${cfg.maxLength})`
        });
        suggestions.push('Consider breaking the answer into smaller parts');
        score -= 10;
    }

    // Check citations
    if (cfg.requireCitations && citations.length === 0) {
        issues.push({
            severity: 'error',
            code: 'NO_CITATIONS',
            message: 'Answer requires at least one citation'
        });
        score -= 30;
    } else if (citations.length < cfg.minCitations) {
        issues.push({
            severity: 'warning',
            code: 'FEW_CITATIONS',
            message: `Answer has fewer citations than recommended (${citations.length} < ${cfg.minCitations})`
        });
        suggestions.push('Add more citations to support the answer');
        score -= 15;
    }

    // Check confidence from citations
    const avgConfidence = citations.length > 0
        ? citations.reduce((sum, c) => sum + c.confidence, 0) / citations.length
        : 50;

    if (avgConfidence < cfg.minConfidence) {
        issues.push({
            severity: 'warning',
            code: 'LOW_CONFIDENCE',
            message: `Citation confidence (${Math.round(avgConfidence)}%) is below threshold (${cfg.minConfidence}%)`
        });
        suggestions.push('Find more authoritative sources to improve confidence');
        score -= 20;
    }

    // Check for hallucination patterns
    if (cfg.checkHallucinations) {
        const hallucinationIssues = checkHallucinations(answer, citations);
        issues.push(...hallucinationIssues);
        score -= hallucinationIssues.length * 10;
    }

    // Check for unsupported claims
    const unsupportedClaims = checkUnsupportedClaims(answer, citations);
    issues.push(...unsupportedClaims);
    score -= unsupportedClaims.length * 5;

    // Normalize score
    score = Math.max(0, Math.min(100, score));

    // Determine validity
    const hasErrors = issues.some(i => i.severity === 'error');
    const valid = !hasErrors && score >= 50;

    logInfo(`[Validation] Score: ${score}, Valid: ${valid}, Issues: ${issues.length}`);

    return {
        valid,
        score,
        issues,
        suggestions
    };
}

/**
 * Check for hallucination patterns
 */
function checkHallucinations(answer: string, citations: Citation[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const pattern of HALLUCINATION_PATTERNS) {
        const match = answer.match(pattern);
        if (match) {
            // Check if this claim is supported by a citation
            const supported = citations.some(c => {
                if (!c.quote) return false;
                // Check if citation quote contains similar content
                return c.quote.toLowerCase().includes(match[0].toLowerCase().substring(0, 20));
            });

            if (!supported) {
                issues.push({
                    severity: 'warning',
                    code: 'POTENTIAL_HALLUCINATION',
                    message: `Phrase "${match[0]}" may indicate unsupported claim`,
                    location: match.index?.toString()
                });
            }
        }
    }

    return issues;
}

/**
 * Check for unsupported claims (very basic heuristic)
 */
function checkUnsupportedClaims(answer: string, citations: Citation[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Look for definitive statements without citations
    const definitivePatterns = [
        /the (only|best|correct) way/i,
        /you must (always|never)/i,
        /this is (the|a) requirement/i,
        /cannot be changed/i,
    ];

    for (const pattern of definitivePatterns) {
        const match = answer.match(pattern);
        if (match) {
            // Check if we have any authoritative citation
            const hasAuthoritative = citations.some(c =>
                c.sourceType === 'plan' || c.sourceType === 'prd' || c.confidence >= 90
            );

            if (!hasAuthoritative) {
                issues.push({
                    severity: 'info',
                    code: 'UNSUPPORTED_CLAIM',
                    message: `Definitive statement "${match[0]}" may need authoritative citation`,
                    location: match.index?.toString()
                });
            }
        }
    }

    return issues;
}

/**
 * Validate a cited answer
 */
export function validateCitedAnswer(
    citedAnswer: CitedAnswer,
    config: Partial<ValidationConfig> = {}
): ValidationResult {
    const result = validateAnswer(citedAnswer.answer, citedAnswer.citations, config);

    // Additional check for cited answers
    if (!citedAnswer.fullySupported && citedAnswer.overallConfidence < 70) {
        result.issues.push({
            severity: 'warning',
            code: 'NOT_FULLY_SUPPORTED',
            message: 'Answer is not fully supported by authoritative sources'
        });
        result.suggestions.push('Consider finding more authoritative sources');
        result.score = Math.max(0, result.score - 10);
    }

    return result;
}

/**
 * Quick validation for simple answers
 */
export function quickValidate(answer: string): boolean {
    if (!answer || answer.trim().length === 0) return false;
    if (answer.length > 20000) return false;

    // Check for obvious error patterns
    if (answer.includes('[ERROR]') || answer.includes('undefined')) return false;

    return true;
}
