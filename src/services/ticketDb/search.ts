/**
 * Ticket Search Module
 *
 * Provides full-text search across ticket titles and descriptions.
 * Supports case-insensitive matching with relevance ranking.
 *
 * **Simple explanation**: Like a search engine but for tickets. Type in
 * keywords and get back the most relevant tickets, with matches in
 * the title ranked higher than matches in the description.
 *
 * @module ticketDb/search
 * @since MT-006.6
 */

import { logInfo } from '../../logger';

/**
 * Search result with relevance score
 */
export interface SearchResult<T> {
    /** The matched ticket */
    item: T;
    /** Relevance score (higher = more relevant) */
    score: number;
    /** Which fields matched */
    matchedFields: string[];
}

/**
 * Search options
 */
export interface SearchOptions {
    /** Maximum results to return (default: 50) */
    limit?: number;
    /** Minimum relevance score (default: 0) */
    minScore?: number;
    /** Fields to search in (default: ['title', 'description']) */
    searchFields?: string[];
    /** Whether to search case-sensitively (default: false) */
    caseSensitive?: boolean;
}

const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
    limit: 50,
    minScore: 0,
    searchFields: ['title', 'description'],
    caseSensitive: false,
};

/**
 * Search tickets by keyword in specified fields.
 *
 * **Simple explanation**: Goes through each ticket and looks for your
 * search term in the title and description. Tickets with the search
 * term in the title get a higher score than those with it only in
 * the description.
 *
 * @param tickets - Array of ticket objects to search
 * @param query - Search query string
 * @param options - Optional search configuration
 * @returns Sorted array of search results (most relevant first)
 *
 * @example
 * const results = searchTickets(allTickets, 'login bug');
 * // Returns tickets mentioning "login" or "bug" in title/description
 */
export function searchTickets<T extends Record<string, unknown>>(
    tickets: T[],
    query: string,
    options?: SearchOptions
): SearchResult<T>[] {
    const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };

    if (!query || query.trim().length === 0) {
        return [];
    }

    // Split query into search terms
    const terms = tokenizeQuery(query, opts.caseSensitive);

    if (terms.length === 0) {
        return [];
    }

    const results: SearchResult<T>[] = [];

    for (const ticket of tickets) {
        const { score, matchedFields } = scoreTicket(ticket, terms, opts);

        if (score > opts.minScore) {
            results.push({ item: ticket, score, matchedFields });
        }
    }

    // Sort by score descending, then by title alphabetically
    results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aTitle = String(a.item.title || '');
        const bTitle = String(b.item.title || '');
        return aTitle.localeCompare(bTitle);
    });

    // Apply limit
    if (opts.limit > 0 && results.length > opts.limit) {
        results.length = opts.limit;
    }

    logInfo(`Search for "${query}" returned ${results.length} result(s)`);
    return results;
}

/**
 * Build a SQL LIKE clause for searching tickets in SQLite.
 *
 * **Simple explanation**: Creates the SQL query parts needed to search
 * for tickets in the database, rather than searching in memory.
 *
 * @param query - Search query string
 * @param searchFields - Fields to search in
 * @returns SQL WHERE clause and parameters
 */
export function buildSearchSQL(
    query: string,
    searchFields: string[] = ['title', 'description']
): { whereClause: string; params: string[] } {
    const terms = query.trim().split(/\s+/).filter(t => t.length > 0);

    if (terms.length === 0) {
        return { whereClause: '1=1', params: [] };
    }

    const conditions: string[] = [];
    const params: string[] = [];

    for (const term of terms) {
        const fieldConditions = searchFields.map(field => `${field} LIKE ?`);
        conditions.push(`(${fieldConditions.join(' OR ')})`);
        // Add a parameter for each field check
        for (const _field of searchFields) {
            params.push(`%${term}%`);
        }
    }

    return {
        whereClause: conditions.join(' AND '),
        params,
    };
}

/**
 * Highlight matching terms in text.
 *
 * **Simple explanation**: Wraps search matches in markers so they
 * can be displayed differently (e.g., bolded in the UI).
 *
 * @param text - The text to highlight in
 * @param query - The search query
 * @param marker - Marker characters (default: '**')
 * @returns Text with matches highlighted
 */
export function highlightMatches(
    text: string,
    query: string,
    marker: string = '**'
): string {
    if (!text || !query) return text;

    const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
    let result = text;

    for (const term of terms) {
        const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
        result = result.replace(regex, `${marker}$1${marker}`);
    }

    return result;
}

// ─── Internal Helpers ────────────────────────────────────────────────────

/**
 * Tokenize a search query into individual terms.
 */
function tokenizeQuery(query: string, caseSensitive: boolean): string[] {
    const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
    if (!caseSensitive) {
        return terms.map(t => t.toLowerCase());
    }
    return terms;
}

/**
 * Score a ticket against search terms.
 */
function scoreTicket<T extends Record<string, unknown>>(
    ticket: T,
    terms: string[],
    opts: Required<SearchOptions>
): { score: number; matchedFields: string[] } {
    let score = 0;
    const matchedFields: Set<string> = new Set();

    // Field weights: title matches are worth more
    const fieldWeights: Record<string, number> = {
        title: 10,
        description: 3,
        resolution: 2,
        creator: 1,
        assignee: 1,
    };

    for (const field of opts.searchFields) {
        const value = ticket[field];
        if (typeof value !== 'string' || !value) continue;

        const fieldValue = opts.caseSensitive ? value : value.toLowerCase();
        const weight = fieldWeights[field] ?? 1;

        for (const term of terms) {
            // Count occurrences
            let index = 0;
            let count = 0;
            while ((index = fieldValue.indexOf(term, index)) !== -1) {
                count++;
                index += term.length;
            }

            if (count > 0) {
                score += count * weight;
                matchedFields.add(field);

                // Bonus for exact word match
                const wordRegex = new RegExp(`\\b${escapeRegex(term)}\\b`, opts.caseSensitive ? '' : 'i');
                if (wordRegex.test(value)) {
                    score += weight * 2;
                }
            }
        }
    }

    return { score, matchedFields: Array.from(matchedFields) };
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
