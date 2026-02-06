/**
 * @file answer/prdContext.ts
 * @module AnswerTeam/PRDContext
 * @description PRD.md context extraction for Answer Team (MT-014.6)
 * 
 * Extracts relevant sections from PRD.md to inform answers.
 * Uses semantic search to find requirements related to the question.
 * 
 * **Simple explanation**: Like using Ctrl+F on a requirements document,
 * but smarter - we find the parts that are actually relevant to the
 * question, even if they don't contain the exact words.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../../logger';

// ============================================================================
// Types
// ============================================================================

export interface PRDSection {
    heading: string;
    content: string;
    level: number;          // Heading level (1-6)
    relevanceScore: number;
    startLine: number;
}

export interface PRDContextResult {
    sections: PRDSection[];
    tokenEstimate: number;
    prdFound: boolean;
}

// ============================================================================
// PRDContextExtractor Class
// ============================================================================

/**
 * Extracts relevant context from PRD.md
 * 
 * **Simple explanation**: The researcher that reads through the requirements
 * document to find information relevant to the question being asked.
 */
export class PRDContextExtractor {
    private prdPath: string;
    private cachedSections: PRDSection[] | null = null;
    private lastLoadTime: number = 0;
    private cacheDurationMs: number = 60000; // 1 minute cache

    constructor(workspacePath?: string) {
        this.prdPath = workspacePath
            ? path.join(workspacePath, 'PRD.md')
            : path.join(process.cwd(), 'PRD.md');
    }

    /**
     * Extract relevant context for a question
     * 
     * @param question The question to find context for
     * @param maxTokens Maximum tokens to include
     * @returns Relevant PRD sections
     */
    async extractContext(question: string, maxTokens: number = 1000): Promise<PRDContextResult> {
        logInfo(`[PRDContext] Extracting context for: ${question.substring(0, 50)}...`);

        // Load and parse PRD
        const sections = await this.loadSections();
        if (!sections || sections.length === 0) {
            return {
                sections: [],
                tokenEstimate: 0,
                prdFound: false
            };
        }

        // Extract keywords from question
        const keywords = this.extractKeywords(question);
        logInfo(`[PRDContext] Keywords: ${keywords.join(', ')}`);

        // Score sections by relevance
        const scoredSections = this.scoreSections(sections, keywords);

        // Filter to relevant sections only
        const relevantSections = scoredSections.filter(s => s.relevanceScore > 0);

        // Sort by relevance
        relevantSections.sort((a, b) => b.relevanceScore - a.relevanceScore);

        // Truncate to fit token limit
        const truncatedSections = this.truncateToTokenLimit(relevantSections, maxTokens);

        const tokenEstimate = truncatedSections.reduce(
            (sum, s) => sum + this.estimateTokens(s.heading + s.content),
            0
        );

        logInfo(`[PRDContext] Found ${truncatedSections.length} relevant sections (~${tokenEstimate} tokens)`);

        return {
            sections: truncatedSections,
            tokenEstimate,
            prdFound: true
        };
    }

    /**
     * Load and parse PRD.md with caching
     */
    private async loadSections(): Promise<PRDSection[] | null> {
        const now = Date.now();

        // Return cached if fresh
        if (this.cachedSections && (now - this.lastLoadTime) < this.cacheDurationMs) {
            return this.cachedSections;
        }

        try {
            if (!fs.existsSync(this.prdPath)) {
                logWarn(`[PRDContext] PRD file not found: ${this.prdPath}`);
                return null;
            }

            const content = fs.readFileSync(this.prdPath, 'utf-8');
            this.cachedSections = this.parseMarkdown(content);
            this.lastLoadTime = now;

            logInfo(`[PRDContext] PRD loaded: ${this.cachedSections.length} sections`);
            return this.cachedSections;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[PRDContext] Failed to load PRD: ${message}`);
            return null;
        }
    }

    /**
     * Parse markdown into sections by headings
     */
    private parseMarkdown(content: string): PRDSection[] {
        const sections: PRDSection[] = [];
        const lines = content.split('\n');

        let currentHeading = '';
        let currentLevel = 1;
        let currentContent: string[] = [];
        let currentStartLine = 1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

            if (headingMatch) {
                // Save previous section
                if (currentHeading || currentContent.length > 0) {
                    sections.push({
                        heading: currentHeading,
                        content: currentContent.join('\n').trim(),
                        level: currentLevel,
                        relevanceScore: 0,
                        startLine: currentStartLine
                    });
                }

                // Start new section
                currentLevel = headingMatch[1].length;
                currentHeading = headingMatch[2].trim();
                currentContent = [];
                currentStartLine = i + 1;
            } else {
                currentContent.push(line);
            }
        }

        // Save last section
        if (currentHeading || currentContent.length > 0) {
            sections.push({
                heading: currentHeading,
                content: currentContent.join('\n').trim(),
                level: currentLevel,
                relevanceScore: 0,
                startLine: currentStartLine
            });
        }

        return sections;
    }

    /**
     * Extract keywords from question
     */
    private extractKeywords(question: string): string[] {
        const stopWords = new Set([
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'how', 'why',
            'when', 'where', 'which', 'who', 'do', 'does', 'can', 'could', 'should',
            'would', 'to', 'in', 'on', 'at', 'for', 'of', 'and', 'or', 'but', 'if',
            'then', 'this', 'that', 'these', 'those', 'i', 'you', 'we', 'they', 'it',
            'my', 'your', 'our', 'their', 'its', 'be', 'been', 'being', 'have', 'has',
            'had', 'having', 'will', 'with', 'about', 'from', 'into'
        ]);

        return question
            .toLowerCase()
            .replace(/[^\w\s-]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.has(word))
            .slice(0, 10);
    }

    /**
     * Score sections by relevance to keywords
     */
    private scoreSections(sections: PRDSection[], keywords: string[]): PRDSection[] {
        return sections.map(section => {
            const combinedText = `${section.heading} ${section.content}`.toLowerCase();
            let score = 0;

            for (const keyword of keywords) {
                // Exact word match (higher score)
                const wordRegex = new RegExp(`\\b${keyword}\\b`, 'gi');
                const exactMatches = combinedText.match(wordRegex);
                if (exactMatches) {
                    score += exactMatches.length * 15;
                }

                // Partial match (lower score)
                else if (combinedText.includes(keyword)) {
                    score += 5;
                }

                // Heading match bonus
                if (section.heading.toLowerCase().includes(keyword)) {
                    score += 20;
                }
            }

            // Boost for shorter, focused sections
            if (section.content.length < 500 && score > 0) {
                score *= 1.2;
            }

            return {
                ...section,
                relevanceScore: Math.round(score)
            };
        });
    }

    /**
     * Truncate sections to fit token limit
     */
    private truncateToTokenLimit(sections: PRDSection[], maxTokens: number): PRDSection[] {
        const result: PRDSection[] = [];
        let currentTokens = 0;

        for (const section of sections) {
            const sectionTokens = this.estimateTokens(section.heading + section.content);

            if (currentTokens + sectionTokens <= maxTokens) {
                result.push(section);
                currentTokens += sectionTokens;
            } else if (result.length === 0) {
                // At least include one (truncated if needed)
                const truncatedContent = this.truncateText(
                    section.content,
                    maxTokens - this.estimateTokens(section.heading)
                );
                result.push({
                    ...section,
                    content: truncatedContent
                });
                break;
            } else {
                break;
            }
        }

        return result;
    }

    /**
     * Estimate token count
     */
    private estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Truncate text to fit token limit
     */
    private truncateText(text: string, maxTokens: number): string {
        const maxChars = maxTokens * 4;
        if (text.length <= maxChars) {
            return text;
        }
        return text.substring(0, maxChars - 3) + '...';
    }

    /**
     * Format sections as context string
     */
    formatAsContext(sections: PRDSection[]): string {
        return sections.map(section => {
            const heading = section.heading ? `## ${section.heading}\n` : '';
            return `${heading}${section.content}`;
        }).join('\n\n---\n\n');
    }

    /**
     * Clear cached sections
     */
    clearCache(): void {
        this.cachedSections = null;
        this.lastLoadTime = 0;
    }

    /**
     * Set PRD path
     */
    setPrdPath(prdPath: string): void {
        this.prdPath = prdPath;
        this.clearCache();
    }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createPRDContextExtractor(workspacePath?: string): PRDContextExtractor {
    return new PRDContextExtractor(workspacePath);
}
