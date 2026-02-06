/**
 * @file answer/planContext.ts
 * @module AnswerTeam/PlanContext
 * @description Plan.json context extraction for Answer Team (MT-014.5)
 * 
 * Extracts relevant sections from plan.json to inform answers.
 * Searches for sections related to the question being asked.
 * 
 * **Simple explanation**: Like looking up a textbook index to find
 * relevant pages for your homework question. We find the parts of
 * the plan that might help answer the question.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../../logger';

// ============================================================================
// Types
// ============================================================================

export interface PlanTask {
    id: string;
    title: string;
    description?: string;
    acceptanceCriteria?: string[];
    dependencies?: string[];
    status?: string;
}

export interface PlanSection {
    type: 'task' | 'milestone' | 'note';
    content: string;
    relevanceScore: number;
    source: string;
}

export interface PlanContextResult {
    sections: PlanSection[];
    tokenEstimate: number;
    planFound: boolean;
}

// ============================================================================
// PlanContextExtractor Class
// ============================================================================

/**
 * Extracts relevant context from plan.json
 * 
 * **Simple explanation**: The research assistant that reads through
 * the project plan to find relevant information for answering questions.
 */
export class PlanContextExtractor {
    private planPath: string;
    private cachedPlan: unknown | null = null;
    private lastLoadTime: number = 0;
    private cacheDurationMs: number = 60000; // 1 minute cache

    constructor(workspacePath?: string) {
        this.planPath = workspacePath
            ? path.join(workspacePath, 'plan.json')
            : path.join(process.cwd(), 'plan.json');
    }

    /**
     * Extract relevant context for a question
     * 
     * @param question The question to find context for
     * @param maxTokens Maximum tokens to include
     * @returns Relevant plan sections
     */
    async extractContext(question: string, maxTokens: number = 1000): Promise<PlanContextResult> {
        logInfo(`[PlanContext] Extracting context for: ${question.substring(0, 50)}...`);

        // Load plan
        const plan = await this.loadPlan();
        if (!plan) {
            return {
                sections: [],
                tokenEstimate: 0,
                planFound: false
            };
        }

        // Extract keywords from question
        const keywords = this.extractKeywords(question);
        logInfo(`[PlanContext] Keywords: ${keywords.join(', ')}`);

        // Find relevant sections
        const sections = this.findRelevantSections(plan, keywords);

        // Truncate to fit token limit
        const truncatedSections = this.truncateToTokenLimit(sections, maxTokens);

        const tokenEstimate = truncatedSections.reduce(
            (sum, s) => sum + this.estimateTokens(s.content),
            0
        );

        logInfo(`[PlanContext] Found ${truncatedSections.length} relevant sections (~${tokenEstimate} tokens)`);

        return {
            sections: truncatedSections,
            tokenEstimate,
            planFound: true
        };
    }

    /**
     * Load plan.json with caching
     */
    private async loadPlan(): Promise<unknown | null> {
        const now = Date.now();

        // Return cached if fresh
        if (this.cachedPlan && (now - this.lastLoadTime) < this.cacheDurationMs) {
            return this.cachedPlan;
        }

        try {
            if (!fs.existsSync(this.planPath)) {
                logWarn(`[PlanContext] Plan file not found: ${this.planPath}`);
                return null;
            }

            const content = fs.readFileSync(this.planPath, 'utf-8');
            this.cachedPlan = JSON.parse(content);
            this.lastLoadTime = now;

            logInfo('[PlanContext] Plan loaded successfully');
            return this.cachedPlan;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logError(`[PlanContext] Failed to load plan: ${message}`);
            return null;
        }
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
            .slice(0, 10); // Max 10 keywords
    }

    /**
     * Find sections relevant to keywords
     */
    private findRelevantSections(plan: unknown, keywords: string[]): PlanSection[] {
        const sections: PlanSection[] = [];

        // Handle different plan structures
        if (typeof plan === 'object' && plan !== null) {
            this.traversePlan(plan as Record<string, unknown>, keywords, sections, '');
        }

        // Sort by relevance
        sections.sort((a, b) => b.relevanceScore - a.relevanceScore);

        return sections;
    }

    /**
     * Recursively traverse plan structure
     */
    private traversePlan(
        obj: Record<string, unknown>,
        keywords: string[],
        sections: PlanSection[],
        path: string
    ): void {
        // Check for task-like objects
        if (this.isTaskLike(obj)) {
            const content = this.formatTask(obj);
            const score = this.scoreRelevance(content, keywords);

            if (score > 0) {
                sections.push({
                    type: 'task',
                    content,
                    relevanceScore: score,
                    source: path || 'root'
                });
            }
        }

        // Recurse into arrays and objects
        for (const [key, value] of Object.entries(obj)) {
            const newPath = path ? `${path}.${key}` : key;

            if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (typeof item === 'object' && item !== null) {
                        this.traversePlan(
                            item as Record<string, unknown>,
                            keywords,
                            sections,
                            `${newPath}[${index}]`
                        );
                    }
                });
            } else if (typeof value === 'object' && value !== null) {
                this.traversePlan(value as Record<string, unknown>, keywords, sections, newPath);
            }
        }
    }

    /**
     * Check if object looks like a task
     */
    private isTaskLike(obj: Record<string, unknown>): boolean {
        return (
            typeof obj.title === 'string' ||
            typeof obj.name === 'string' ||
            typeof obj.description === 'string' ||
            typeof obj.id === 'string'
        );
    }

    /**
     * Format a task object as readable text
     */
    private formatTask(obj: Record<string, unknown>): string {
        const parts: string[] = [];

        if (obj.id) parts.push(`ID: ${obj.id}`);
        if (obj.title) parts.push(`Title: ${obj.title}`);
        if (obj.name) parts.push(`Name: ${obj.name}`);
        if (obj.description) parts.push(`Description: ${obj.description}`);
        if (obj.status) parts.push(`Status: ${obj.status}`);

        if (Array.isArray(obj.acceptanceCriteria)) {
            parts.push(`Acceptance Criteria:\n${obj.acceptanceCriteria.map((ac: unknown) => `  - ${ac}`).join('\n')}`);
        }

        return parts.join('\n');
    }

    /**
     * Score relevance based on keyword matches
     */
    private scoreRelevance(content: string, keywords: string[]): number {
        const contentLower = content.toLowerCase();
        let score = 0;

        for (const keyword of keywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            const matches = contentLower.match(regex);
            if (matches) {
                score += matches.length * 10;
            } else if (contentLower.includes(keyword)) {
                score += 5; // Partial match
            }
        }

        return score;
    }

    /**
     * Truncate sections to fit token limit
     */
    private truncateToTokenLimit(sections: PlanSection[], maxTokens: number): PlanSection[] {
        const result: PlanSection[] = [];
        let currentTokens = 0;

        for (const section of sections) {
            const sectionTokens = this.estimateTokens(section.content);

            if (currentTokens + sectionTokens <= maxTokens) {
                result.push(section);
                currentTokens += sectionTokens;
            } else if (result.length === 0) {
                // At least include one (truncated if needed)
                const truncated = this.truncateText(section.content, maxTokens);
                result.push({
                    ...section,
                    content: truncated
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
     * Clear cached plan
     */
    clearCache(): void {
        this.cachedPlan = null;
        this.lastLoadTime = 0;
    }

    /**
     * Set plan path
     */
    setPlanPath(planPath: string): void {
        this.planPath = planPath;
        this.clearCache();
    }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createPlanContextExtractor(workspacePath?: string): PlanContextExtractor {
    return new PlanContextExtractor(workspacePath);
}
