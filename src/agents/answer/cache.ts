/**
 * Answer Caching for Answer Team
 * 
 * **Simple explanation**: Caches answers to common questions so we don't
 * have to ask the LLM the same thing twice. Uses semantic similarity
 * to find cached answers even when questions are worded differently.
 * 
 * @module agents/answer/cache
 */

import { logInfo, logWarn, logError } from '../../logger';

/**
 * Cached answer entry
 */
export interface CachedAnswer {
    /** Original question */
    question: string;
    /** Normalized question for matching */
    normalizedQuestion: string;
    /** The answer */
    answer: string;
    /** Confidence score of the answer */
    confidence: number;
    /** Timestamp when cached */
    timestamp: number;
    /** Expiry timestamp (TTL) */
    expiresAt: number;
    /** Number of times this answer was hit */
    hitCount: number;
    /** Question source (what context generated it) */
    context?: string;
}

/**
 * Cache hit result
 */
export interface CacheHitResult {
    /** Whether we found a cache hit */
    hit: boolean;
    /** Cached answer if found */
    answer?: CachedAnswer;
    /** Similarity score to cached question */
    similarity?: number;
}

/**
 * Cache configuration
 */
export interface AnswerCacheConfig {
    /** TTL in milliseconds (default 24 hours) */
    ttlMs: number;
    /** Maximum number of cached answers */
    maxEntries: number;
    /** Similarity threshold for cache hits (0-1) */
    similarityThreshold: number;
    /** Minimum confidence for caching */
    minConfidenceToCache: number;
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: AnswerCacheConfig = {
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
    maxEntries: 1000,
    similarityThreshold: 0.85,
    minConfidenceToCache: 80
};

/**
 * Answer Cache Service
 * 
 * **Simple explanation**: Stores and retrieves cached answers using
 * text similarity matching. If someone asks "What color for buttons?"
 * and we cached "Primary button color?", we can match them.
 */
export class AnswerCache {
    private cache: Map<string, CachedAnswer> = new Map();
    private config: AnswerCacheConfig;

    constructor(config: Partial<AnswerCacheConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Look up a cached answer for a question
     */
    public lookup(question: string): CacheHitResult {
        const normalized = this.normalizeQuestion(question);

        // First try exact match
        const exactMatch = this.cache.get(normalized);
        if (exactMatch && !this.isExpired(exactMatch)) {
            exactMatch.hitCount++;
            logInfo(`[AnswerCache] Exact hit for: "${question.substring(0, 50)}..."`);
            return { hit: true, answer: exactMatch, similarity: 1.0 };
        }

        // Try fuzzy match
        let bestMatch: CachedAnswer | undefined;
        let bestSimilarity = 0;

        for (const cached of this.cache.values()) {
            if (this.isExpired(cached)) {
                continue;
            }

            const similarity = this.calculateSimilarity(normalized, cached.normalizedQuestion);
            if (similarity > bestSimilarity && similarity >= this.config.similarityThreshold) {
                bestSimilarity = similarity;
                bestMatch = cached;
            }
        }

        if (bestMatch) {
            bestMatch.hitCount++;
            logInfo(`[AnswerCache] Fuzzy hit (${(bestSimilarity * 100).toFixed(1)}%) for: "${question.substring(0, 50)}..."`);
            return { hit: true, answer: bestMatch, similarity: bestSimilarity };
        }

        return { hit: false };
    }

    /**
     * Cache an answer
     */
    public store(question: string, answer: string, confidence: number, context?: string): void {
        // Don't cache low confidence answers
        if (confidence < this.config.minConfidenceToCache) {
            logInfo(`[AnswerCache] Skipping cache for low confidence answer (${confidence}%)`);
            return;
        }

        const normalized = this.normalizeQuestion(question);
        const now = Date.now();

        const entry: CachedAnswer = {
            question,
            normalizedQuestion: normalized,
            answer,
            confidence,
            timestamp: now,
            expiresAt: now + this.config.ttlMs,
            hitCount: 0,
            context
        };

        // Check if we need to evict
        if (this.cache.size >= this.config.maxEntries) {
            this.evictLRU();
        }

        this.cache.set(normalized, entry);
        logInfo(`[AnswerCache] Cached answer for: "${question.substring(0, 50)}..." (confidence: ${confidence}%)`);
    }

    /**
     * Normalize a question for matching
     */
    private normalizeQuestion(question: string): string {
        return question
            .toLowerCase()
            .trim()
            // Remove punctuation except spaces
            .replace(/[^\w\s]/g, '')
            // Collapse multiple spaces
            .replace(/\s+/g, ' ')
            // Remove common stop words
            .replace(/\b(the|a|an|is|are|was|were|what|how|why|when|where|which|who|do|does|did|can|could|would|should)\b/g, '')
            .trim();
    }

    /**
     * Calculate similarity between two normalized questions
     * Uses Jaccard similarity on word sets plus word order bonus
     */
    private calculateSimilarity(q1: string, q2: string): number {
        const words1 = new Set(q1.split(' ').filter(w => w.length > 2));
        const words2 = new Set(q2.split(' ').filter(w => w.length > 2));

        if (words1.size === 0 || words2.size === 0) {
            return 0;
        }

        // Jaccard similarity
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);
        const jaccard = intersection.size / union.size;

        // Word order similarity (using longest common subsequence)
        const arr1 = q1.split(' ');
        const arr2 = q2.split(' ');
        const lcs = this.longestCommonSubsequence(arr1, arr2);
        const orderSimilarity = (2 * lcs) / (arr1.length + arr2.length);

        // Weighted average
        return 0.7 * jaccard + 0.3 * orderSimilarity;
    }

    /**
     * Calculate longest common subsequence length
     */
    private longestCommonSubsequence(arr1: string[], arr2: string[]): number {
        const m = arr1.length;
        const n = arr2.length;
        const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (arr1[i - 1] === arr2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        return dp[m][n];
    }

    /**
     * Check if a cached entry is expired
     */
    private isExpired(entry: CachedAnswer): boolean {
        return Date.now() > entry.expiresAt;
    }

    /**
     * Evict least recently used entries
     */
    private evictLRU(): void {
        // Convert to array and sort by hitCount (least first), then by age
        const entries = Array.from(this.cache.entries())
            .sort((a, b) => {
                // First by hitCount
                if (a[1].hitCount !== b[1].hitCount) {
                    return a[1].hitCount - b[1].hitCount;
                }
                // Then by age (oldest first)
                return a[1].timestamp - b[1].timestamp;
            });

        // Remove bottom 10% or at least 1
        const toRemove = Math.max(1, Math.floor(entries.length * 0.1));
        for (let i = 0; i < toRemove; i++) {
            this.cache.delete(entries[i][0]);
        }

        logInfo(`[AnswerCache] Evicted ${toRemove} entries`);
    }

    /**
     * Get cache statistics
     */
    public getStats(): { size: number; hitRate: number; avgConfidence: number } {
        const entries = Array.from(this.cache.values()).filter(e => !this.isExpired(e));

        const totalHits = entries.reduce((sum, e) => sum + e.hitCount, 0);
        const avgConfidence = entries.length > 0
            ? entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length
            : 0;

        return {
            size: entries.length,
            hitRate: entries.length > 0 ? totalHits / entries.length : 0,
            avgConfidence
        };
    }

    /**
     * Clear expired entries
     */
    public cleanExpired(): number {
        let removed = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (this.isExpired(entry)) {
                this.cache.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            logInfo(`[AnswerCache] Cleaned ${removed} expired entries`);
        }
        return removed;
    }

    /**
     * Clear all cache entries
     */
    public clear(): void {
        this.cache.clear();
        logInfo('[AnswerCache] Cache cleared');
    }

    /**
     * Get cache size
     */
    public get size(): number {
        return this.cache.size;
    }
}

// Singleton instance
let cacheInstance: AnswerCache | null = null;

/**
 * Get the singleton AnswerCache instance
 */
export function getAnswerCache(): AnswerCache {
    if (!cacheInstance) {
        cacheInstance = new AnswerCache();
    }
    return cacheInstance;
}

/**
 * Reset the cache (for testing)
 */
export function resetAnswerCacheForTests(): void {
    cacheInstance = null;
}
