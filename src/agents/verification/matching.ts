/**
 * @file verification/matching.ts
 * @module AcceptanceCriteriaMatcher
 * @description Matches implementation against acceptance criteria (MT-015.3)
 * 
 * Uses semantic analysis to determine if code changes satisfy defined
 * acceptance criteria from the task specification.
 * 
 * **Simple explanation**: A checklist checker. Takes the "Definition of Done"
 * and checks if the code actually meets each requirement.
 */

import { logInfo, logWarn } from '../../logger';

// ============================================================================
// Types
// ============================================================================

export interface MatcherConfig {
    threshold: number;          // Minimum score to consider matched (0-1)
    partialMatchMultiplier: number;  // Weight for partial matches
}

export interface CriteriaMatch {
    criterion: string;
    matched: boolean;
    confidence: number;
    evidence: string[];
    partialMatch?: string;  // What was partially found
}

export interface MatchResult {
    matched: string[];
    unmatched: string[];
    score: number;          // Overall score (0-1)
    details: CriteriaMatch[];
}

// ============================================================================
// AcceptanceCriteriaMatcher Class
// ============================================================================

/**
 * Matches code changes against acceptance criteria.
 * 
 * **Simple explanation**: The quality checklist verifier.
 * For each acceptance criterion, it searches the code to find evidence
 * that the criterion has been met.
 */
export class AcceptanceCriteriaMatcher {
    private config: MatcherConfig;

    constructor(config: Partial<MatcherConfig> = {}) {
        this.config = {
            threshold: config.threshold ?? 0.85,
            partialMatchMultiplier: config.partialMatchMultiplier ?? 0.5
        };
    }

    /**
     * Match criteria against implementation files
     * 
     * @param criteria - List of acceptance criteria strings
     * @param files - List of modified file paths
     * @returns Match results with scores
     */
    async matchCriteria(criteria: string[], files: string[]): Promise<MatchResult> {
        const details: CriteriaMatch[] = [];
        const matched: string[] = [];
        const unmatched: string[] = [];

        for (const criterion of criteria) {
            const match = await this.evaluateCriterion(criterion, files);
            details.push(match);

            if (match.matched) {
                matched.push(criterion);
            } else {
                unmatched.push(criterion);
            }
        }

        const score = criteria.length > 0
            ? matched.length / criteria.length
            : 1.0;

        logInfo(`[Matcher] Matched ${matched.length}/${criteria.length} criteria (score: ${score.toFixed(2)})`);

        return { matched, unmatched, score, details };
    }

    /**
     * Evaluate a single criterion against files
     */
    private async evaluateCriterion(criterion: string, files: string[]): Promise<CriteriaMatch> {
        // Extract keywords from criterion
        const keywords = this.extractKeywords(criterion);
        const evidence: string[] = [];
        let confidence = 0;

        // Check each file for evidence
        for (const file of files) {
            const fileEvidence = await this.searchFileForEvidence(file, keywords);
            evidence.push(...fileEvidence);
        }

        // Calculate confidence based on evidence found
        if (evidence.length > 0) {
            // More evidence = higher confidence
            confidence = Math.min(1.0, evidence.length * 0.2);

            // Boost confidence if key patterns match
            if (this.containsStrongEvidence(criterion, evidence)) {
                confidence = Math.min(1.0, confidence + 0.3);
            }
        }

        const matched = confidence >= this.config.threshold;

        return {
            criterion,
            matched,
            confidence,
            evidence: evidence.slice(0, 5),  // Limit to 5 pieces of evidence
            partialMatch: !matched && evidence.length > 0
                ? `Found ${evidence.length} partial matches`
                : undefined
        };
    }

    /**
     * Extract searchable keywords from a criterion
     */
    private extractKeywords(criterion: string): string[] {
        // Remove common words and extract meaningful terms
        const stopWords = new Set([
            'the', 'a', 'an', 'is', 'are', 'should', 'must', 'shall', 'will',
            'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
            'and', 'or', 'but', 'if', 'when', 'then', 'of', 'to', 'for', 'with',
            'in', 'on', 'at', 'by', 'from', 'as'
        ]);

        return criterion
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.has(word));
    }

    /**
     * Search a file for evidence of criteria being met
     * 
     * Note: In production, this would read the actual file.
     * For now, returns simulated evidence based on filename.
     */
    private async searchFileForEvidence(filePath: string, keywords: string[]): Promise<string[]> {
        const evidence: string[] = [];
        const fileName = filePath.toLowerCase();

        // Check if filename contains keywords
        for (const keyword of keywords) {
            if (fileName.includes(keyword)) {
                evidence.push(`File ${filePath} matches keyword "${keyword}"`);
            }
        }

        // Check for test files (indicates tests written)
        if (fileName.includes('.test.') || fileName.includes('.spec.')) {
            evidence.push(`Test file found: ${filePath}`);
        }

        // Check for specific patterns
        if (fileName.includes('index.')) {
            evidence.push(`Module entry point: ${filePath}`);
        }

        return evidence;
    }

    /**
     * Check for strong evidence that criterion is met
     */
    private containsStrongEvidence(criterion: string, evidence: string[]): boolean {
        const criterionLower = criterion.toLowerCase();

        // Check for test-related criteria
        if (criterionLower.includes('test') && evidence.some(e => e.includes('test'))) {
            return true;
        }

        // Check for implementation criteria
        if (criterionLower.includes('implement') && evidence.some(e => e.includes('entry point'))) {
            return true;
        }

        // Check for file-based criteria
        if (criterionLower.includes('file') && evidence.length > 0) {
            return true;
        }

        return false;
    }

    /**
     * Generate a summary of unmatched criteria
     */
    generateUnmatchedSummary(result: MatchResult): string {
        if (result.unmatched.length === 0) {
            return 'All acceptance criteria matched!';
        }

        const lines = [
            `${result.unmatched.length} criteria not met:`,
            ''
        ];

        for (const detail of result.details.filter(d => !d.matched)) {
            lines.push(`❌ ${detail.criterion}`);
            if (detail.partialMatch) {
                lines.push(`   ⚠️  ${detail.partialMatch}`);
            }
        }

        return lines.join('\n');
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new AcceptanceCriteriaMatcher instance
 */
export function createMatcher(config?: Partial<MatcherConfig>): AcceptanceCriteriaMatcher {
    return new AcceptanceCriteriaMatcher(config);
}
