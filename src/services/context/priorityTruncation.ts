/**
 * @file context/priorityTruncation.ts
 * @module PriorityTruncation
 * @description Priority-based content truncation (MT-017.3)
 * 
 * Removes lowest-priority content first when context exceeds token limits.
 * Preserves critical and high-priority content as long as possible.
 * 
 * **Simple explanation**: Like making a pizza fit in a box that's too small.
 * We remove toppings in order of importance - first the optional extras,
 * then the less important stuff, but we keep the cheese and sauce.
 */

import { logInfo, logWarn } from '../../logger';

// ============================================================================
// Types
// ============================================================================

export type ContentPriority = 'critical' | 'high' | 'normal' | 'low' | 'optional';

export interface TruncatableContent {
    id: string;
    content: string;
    tokens: number;
    priority: ContentPriority;
}

export interface TruncatorConfig {
    maxTokens: number;
    preserveMinimum: number;     // Minimum content per section
}

// Priority order (lower = more important)
const PRIORITY_ORDER: Record<ContentPriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
    optional: 4
};

// ============================================================================
// PriorityTruncator Class
// ============================================================================

/**
 * Truncates content based on priority to fit within token limits.
 * 
 * **Simple explanation**: The content bouncer.
 * When there's too much to fit, it kicks out the least important
 * content first until everything fits within the limit.
 */
export class PriorityTruncator {
    private config: TruncatorConfig;

    constructor(config: Partial<TruncatorConfig> = {}) {
        this.config = {
            maxTokens: config.maxTokens ?? 8192,
            preserveMinimum: config.preserveMinimum ?? 100
        };
    }

    /**
     * Truncate content to fit within token limit
     * Returns content sorted by priority, with low-priority items removed
     */
    truncate(content: TruncatableContent[], maxTokens?: number): TruncatableContent[] {
        const limit = maxTokens ?? this.config.maxTokens;

        // Sort by priority (most important first)
        const sorted = [...content].sort((a, b) =>
            PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
        );

        const result: TruncatableContent[] = [];
        let totalTokens = 0;

        for (const item of sorted) {
            if (totalTokens + item.tokens <= limit) {
                result.push(item);
                totalTokens += item.tokens;
            } else if (item.priority === 'critical') {
                // Critical content always included
                result.push(item);
                totalTokens += item.tokens;
                logWarn(`[PriorityTruncator] Including critical content even though over limit`);
            } else {
                // Try to include partial content for high priority
                if (item.priority === 'high' && limit - totalTokens >= this.config.preserveMinimum) {
                    const truncatedContent = this.truncateContent(item, limit - totalTokens);
                    if (truncatedContent) {
                        result.push(truncatedContent);
                        totalTokens += truncatedContent.tokens;
                    }
                }
                // Otherwise skip this content
                logInfo(`[PriorityTruncator] Skipping ${item.id} (priority: ${item.priority}, tokens: ${item.tokens})`);
            }
        }

        return result;
    }

    /**
     * Truncate a single content item to fit within token budget
     */
    private truncateContent(item: TruncatableContent, availableTokens: number): TruncatableContent | null {
        if (availableTokens < this.config.preserveMinimum) {
            return null;
        }

        // Calculate approximate character limit
        const charLimit = Math.floor(availableTokens * 4); // ~4 chars per token

        if (charLimit >= item.content.length) {
            return item;
        }

        // Truncate content
        const truncatedContent = item.content.substring(0, charLimit - 20) + '\n... [truncated]';

        return {
            ...item,
            content: truncatedContent,
            tokens: availableTokens
        };
    }

    /**
     * Calculate how much would be removed
     */
    calculateRemoval(content: TruncatableContent[], maxTokens?: number): {
        kept: number;
        removed: number;
        removedItems: string[];
    } {
        const limit = maxTokens ?? this.config.maxTokens;
        const result = this.truncate(content, limit);

        const keptIds = new Set(result.map(r => r.id));
        const removed = content.filter(c => !keptIds.has(c.id));

        return {
            kept: result.reduce((sum, r) => sum + r.tokens, 0),
            removed: removed.reduce((sum, r) => sum + r.tokens, 0),
            removedItems: removed.map(r => r.id)
        };
    }

    /**
     * Check if content fits within limit
     */
    fitsWithinLimit(content: TruncatableContent[], maxTokens?: number): boolean {
        const limit = maxTokens ?? this.config.maxTokens;
        const total = content.reduce((sum, c) => sum + c.tokens, 0);
        return total <= limit;
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PriorityTruncator instance
 */
export function createPriorityTruncator(config?: Partial<TruncatorConfig>): PriorityTruncator {
    return new PriorityTruncator(config);
}

/**
 * Quick priority comparison
 */
export function comparePriority(a: ContentPriority, b: ContentPriority): number {
    return PRIORITY_ORDER[a] - PRIORITY_ORDER[b];
}

/**
 * Check if priority is higher than or equal to threshold
 */
export function meetsMinimumPriority(priority: ContentPriority, minimum: ContentPriority): boolean {
    return PRIORITY_ORDER[priority] <= PRIORITY_ORDER[minimum];
}
