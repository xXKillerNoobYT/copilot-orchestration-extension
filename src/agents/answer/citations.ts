/**
 * Answer Citation System
 * 
 * **Simple explanation**: Tracks where answers come from (plan, PRD, design system)
 * so we can show evidence for claims and help users verify information.
 * 
 * @module agents/answer/citations
 */

import { logInfo, logWarn } from '../../logger';

/**
 * Source type for citations
 */
export type SourceType = 'plan' | 'prd' | 'design-system' | 'codebase' | 'external' | 'llm';

/**
 * A citation reference
 */
export interface Citation {
    /** Unique citation ID */
    id: string;
    /** Source type */
    sourceType: SourceType;
    /** Source location (file path, URL, etc.) */
    location: string;
    /** Specific reference (line number, section, etc.) */
    reference?: string;
    /** Quoted text */
    quote?: string;
    /** Confidence in the citation (0-100) */
    confidence: number;
    /** When the source was accessed */
    accessedAt: Date;
}

/**
 * Answer with citations
 */
export interface CitedAnswer {
    /** The answer text */
    answer: string;
    /** Citations supporting the answer */
    citations: Citation[];
    /** Overall confidence based on citations */
    overallConfidence: number;
    /** Whether answer is fully supported by citations */
    fullySupported: boolean;
}

/**
 * Citation manager for tracking answer sources
 */
export class CitationManager {
    private citations: Map<string, Citation[]> = new Map();
    private citationCounter = 0;

    /**
     * Create a new citation
     */
    createCitation(
        sourceType: SourceType,
        location: string,
        options: Partial<Omit<Citation, 'id' | 'sourceType' | 'location' | 'accessedAt'>> = {}
    ): Citation {
        const citation: Citation = {
            id: `cite-${++this.citationCounter}`,
            sourceType,
            location,
            reference: options.reference,
            quote: options.quote,
            confidence: options.confidence ?? 80,
            accessedAt: new Date()
        };

        logInfo(`[Citations] Created ${citation.id} from ${sourceType}: ${location}`);
        return citation;
    }

    /**
     * Create citation from plan.json
     */
    citePlan(section: string, quote?: string): Citation {
        return this.createCitation('plan', 'plan.json', {
            reference: section,
            quote,
            confidence: 95 // Plan is authoritative
        });
    }

    /**
     * Create citation from PRD
     */
    citePRD(section: string, quote?: string): Citation {
        return this.createCitation('prd', 'PRD.md', {
            reference: section,
            quote,
            confidence: 90 // PRD is authoritative
        });
    }

    /**
     * Create citation from design system
     */
    citeDesignSystem(component: string, property?: string): Citation {
        return this.createCitation('design-system', 'design-system.json', {
            reference: property ? `${component}.${property}` : component,
            confidence: 85
        });
    }

    /**
     * Create citation from codebase
     */
    citeCode(filePath: string, lineNumber?: number, quote?: string): Citation {
        return this.createCitation('codebase', filePath, {
            reference: lineNumber ? `line ${lineNumber}` : undefined,
            quote,
            confidence: 90 // Code is concrete evidence
        });
    }

    /**
     * Create citation from external source
     */
    citeExternal(url: string, title?: string): Citation {
        return this.createCitation('external', url, {
            reference: title,
            confidence: 70 // External sources less reliable
        });
    }

    /**
     * Create citation from LLM reasoning
     */
    citeLLM(reasoning: string): Citation {
        return this.createCitation('llm', 'llm-inference', {
            quote: reasoning,
            confidence: 60 // LLM-only citations are least reliable
        });
    }

    /**
     * Store citations for an answer
     */
    storeCitations(answerId: string, citations: Citation[]): void {
        this.citations.set(answerId, citations);
    }

    /**
     * Get citations for an answer
     */
    getCitations(answerId: string): Citation[] {
        return this.citations.get(answerId) || [];
    }

    /**
     * Build a cited answer
     */
    buildCitedAnswer(answer: string, citations: Citation[]): CitedAnswer {
        if (citations.length === 0) {
            return {
                answer,
                citations: [],
                overallConfidence: 50, // Low confidence without citations
                fullySupported: false
            };
        }

        // Calculate overall confidence (weighted average with bonus for multiple sources)
        const avgConfidence = citations.reduce((sum, c) => sum + c.confidence, 0) / citations.length;
        const sourceTypes = new Set(citations.map(c => c.sourceType));
        const diversityBonus = Math.min((sourceTypes.size - 1) * 5, 10); // Up to 10% bonus for diverse sources

        const overallConfidence = Math.min(avgConfidence + diversityBonus, 100);

        // Check if we have authoritative sources
        const hasAuthoritative = citations.some(c =>
            c.sourceType === 'plan' || c.sourceType === 'prd' || c.sourceType === 'codebase'
        );

        return {
            answer,
            citations,
            overallConfidence: Math.round(overallConfidence),
            fullySupported: hasAuthoritative && overallConfidence >= 80
        };
    }

    /**
     * Format citations for display
     */
    formatCitations(citations: Citation[]): string {
        if (citations.length === 0) {
            return '';
        }

        const lines = ['', '**Sources:**'];

        for (const citation of citations) {
            let line = `[${citation.id}] `;

            switch (citation.sourceType) {
                case 'plan':
                    line += `Plan: ${citation.reference || 'general'}`;
                    break;
                case 'prd':
                    line += `PRD: ${citation.reference || 'general'}`;
                    break;
                case 'design-system':
                    line += `Design System: ${citation.reference || 'general'}`;
                    break;
                case 'codebase':
                    line += `Code: ${citation.location}`;
                    if (citation.reference) line += ` (${citation.reference})`;
                    break;
                case 'external':
                    line += `External: ${citation.location}`;
                    break;
                case 'llm':
                    line += `LLM inference`;
                    break;
            }

            line += ` (${citation.confidence}% confidence)`;

            if (citation.quote) {
                line += `\n  > "${citation.quote.substring(0, 100)}${citation.quote.length > 100 ? '...' : ''}"`;
            }

            lines.push(line);
        }

        return lines.join('\n');
    }

    /**
     * Clear all citations (for tests)
     */
    clear(): void {
        this.citations.clear();
        this.citationCounter = 0;
    }
}

// Singleton instance
let instance: CitationManager | null = null;

/**
 * Get citation manager
 */
export function getCitationManager(): CitationManager {
    if (!instance) {
        instance = new CitationManager();
    }
    return instance;
}

/**
 * Reset for tests
 */
export function resetCitationManager(): void {
    instance = null;
}
