/**
 * @file context/tokenCounter.ts
 * @module TokenCounter
 * @description Token counting and estimation (MT-017.2)
 * 
 * Estimates token counts for text using heuristics.
 * Uses the ~4 characters per token rule for English text.
 * 
 * **Simple explanation**: Measures how "big" text is for AI.
 * AI models have limits on how much they can read at once,
 * so we need to count the "tokens" (word-pieces) to stay within limits.
 */

// ============================================================================
// Types
// ============================================================================

export interface TokenCounterConfig {
    charsPerToken: number;       // Average characters per token
    codeMultiplier: number;      // Multiplier for code (more tokens per char)
}

// ============================================================================
// TokenCounter Class
// ============================================================================

/**
 * Estimates token counts for text strings.
 * 
 * **Simple explanation**: A text measuring tape for AI.
 * Different content types (code, prose, etc.) have different token densities,
 * so we adjust our estimates accordingly.
 */
export class TokenCounter {
    private config: TokenCounterConfig;

    constructor(config: Partial<TokenCounterConfig> = {}) {
        this.config = {
            charsPerToken: config.charsPerToken ?? 4,
            codeMultiplier: config.codeMultiplier ?? 1.2
        };
    }

    /**
     * Count tokens in a string
     */
    count(text: string): number {
        if (!text) return 0;

        // Detect if content is code-like
        const isCode = this.detectCode(text);
        const multiplier = isCode ? this.config.codeMultiplier : 1;

        // Base estimate: 4 chars per token for English
        const baseCount = Math.ceil(text.length / this.config.charsPerToken);

        // Adjust for whitespace (newlines, extra spaces cost tokens)
        const whitespaceCount = (text.match(/\n/g) || []).length;
        const whitespaceTokens = Math.ceil(whitespaceCount * 0.5);

        return Math.ceil((baseCount + whitespaceTokens) * multiplier);
    }

    /**
     * Count tokens for multiple strings
     */
    countMany(texts: string[]): number {
        return texts.reduce((sum, t) => sum + this.count(t), 0);
    }

    /**
     * Check if text would fit within limit
     */
    fitsWithin(text: string, limit: number): boolean {
        return this.count(text) <= limit;
    }

    /**
     * Get the maximum text length that fits within token limit
     */
    getMaxLength(tokenLimit: number): number {
        return tokenLimit * this.config.charsPerToken;
    }

    /**
     * Truncate text to fit within token limit
     */
    truncateToFit(text: string, tokenLimit: number): string {
        if (this.count(text) <= tokenLimit) return text;

        const maxLength = this.getMaxLength(tokenLimit);
        const truncated = text.substring(0, maxLength);

        // Try to cut at word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.8) {
            return truncated.substring(0, lastSpace) + '...';
        }

        return truncated + '...';
    }

    /**
     * Detect if text is code-like
     */
    private detectCode(text: string): boolean {
        const codeIndicators = [
            /^\s*import\s+/m,           // Import statements
            /^\s*export\s+/m,           // Export statements
            /^\s*function\s+\w+/m,      // Function declarations
            /^\s*const\s+\w+\s*=/m,     // Const declarations
            /^\s*let\s+\w+\s*=/m,       // Let declarations
            /^\s*class\s+\w+/m,         // Class declarations
            /\{\s*$/m,                  // Opening braces
            /^\s*\}/m,                  // Closing braces
            /=>/,                       // Arrow functions
            /\/\/.*/,                   // Single-line comments
            /\/\*[\s\S]*?\*\//,         // Multi-line comments
        ];

        const matches = codeIndicators.filter(re => re.test(text)).length;
        return matches >= 2; // At least 2 indicators = likely code
    }
}

// ============================================================================
// Factory and Utility Functions
// ============================================================================

/**
 * Create a new TokenCounter instance
 */
export function createTokenCounter(config?: Partial<TokenCounterConfig>): TokenCounter {
    return new TokenCounter(config);
}

/**
 * Quick token estimate for a string
 */
export function estimateTokens(text: string): number {
    return createTokenCounter().count(text);
}

/**
 * Check if text fits within token limit
 */
export function fitsWithinLimit(text: string, limit: number): boolean {
    return estimateTokens(text) <= limit;
}
