/**
 * Problem Deduplication Service
 * 
 * Detects duplicate problems across tickets and consolidates them.
 * Instead of having dozens of identical tickets, this service:
 * 1. Identifies similar/duplicate problem tickets
 * 2. Bumps priority of the original/master ticket
 * 3. Links duplicate tickets to the master
 * 4. Optionally removes duplicates to keep queue clean
 */

import { logInfo, logWarn, logError } from '../logger';
import { listTickets, updateTicket, Ticket } from './ticketDb';

/**
 * Deduplication match result
 */
export interface DuplicateMatch {
    masterId: string;
    masterTitle: string;
    duplicateId: string;
    duplicateTitle: string;
    similarity: number;  // 0-100 score
    reason: string;      // Human-readable explanation
}

/**
 * Configuration for deduplication
 */
export interface DeduplicationConfig {
    /** Minimum similarity score to consider a duplicate (0-100, default: 70) */
    minSimilarityScore?: number;
    /** Whether to automatically remove duplicates (default: false) */
    autoRemoveDuplicates?: boolean;
    /** Whether to bump priority of master ticket (default: true) */
    bumpMasterPriority?: boolean;
    /** Maximum priority value (default: 1 = highest) */
    maxPriority?: number;
}

/**
 * Simple similarity score between two strings (Levenshtein-inspired)
 * 
 * **Simple explanation**: Compares two strings and returns a score 0-100
 * based on how many characters they have in common.
 * 100 = identical, 0 = completely different
 */
function calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // Exact match
    if (s1 === s2) {
        return 100;
    }

    // One is substring of other (high similarity)
    if (s1.includes(s2) || s2.includes(s1)) {
        return 85;
    }

    // Extract key words (remove common words like "update", "fix", "improve")
    const getKeywords = (str: string): Set<string> => {
        const common = new Set([
            'update', 'fix', 'improve', 'add', 'remove', 'the', 'a', 'an',
            'is', 'are', 'be', 'been', 'being', 'have', 'has', 'do', 'does',
            'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
            'can', 'code', 'file', 'issue', 'bug', 'problem', 'error'
        ]);
        return new Set(
            str
                .toLowerCase()
                .split(/[\s\-_]+/)
                .filter(word => word.length > 2 && !common.has(word))
        );
    };

    const kw1 = getKeywords(s1);
    const kw2 = getKeywords(s2);

    if (kw1.size === 0 || kw2.size === 0) {
        // Fallback to simple character matching
        return 40; // Low similarity if no meaningful keywords
    }

    // Calculate Jaccard similarity
    const intersection = new Set([...kw1].filter(x => kw2.has(x)));
    const union = new Set([...kw1, ...kw2]);

    const similarity = union.size === 0 ? 0 : (intersection.size / union.size) * 100;
    return Math.round(similarity);
}

/**
 * Find all potential duplicates for a given ticket
 * 
 * Compares a ticket against all other open tickets and returns
 * matches with similarity score above the threshold.
 */
export async function findDuplicates(
    ticket: Ticket,
    config: DeduplicationConfig = {}
): Promise<DuplicateMatch[]> {
    const minScore = config.minSimilarityScore ?? 70;

    try {
        const allTickets = await listTickets();
        const matches: DuplicateMatch[] = [];

        for (const other of allTickets) {
            // Don't compare ticket to itself
            if (other.id === ticket.id) {
                continue;
            }

            // Skip closed/removed tickets
            if (other.status === 'done' || other.status === 'removed' || other.status === 'resolved') {
                continue;
            }

            const score = calculateSimilarity(ticket.title, other.title);

            if (score >= minScore) {
                matches.push({
                    masterId: other.id,
                    masterTitle: other.title,
                    duplicateId: ticket.id,
                    duplicateTitle: ticket.title,
                    similarity: score,
                    reason: score === 100
                        ? 'Identical title'
                        : score >= 85
                            ? 'Nearly identical (substring match)'
                            : 'Similar problem (keyword overlap)'
                });
            }
        }

        // Sort by similarity (highest first)
        return matches.sort((a, b) => b.similarity - a.similarity);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`[Deduplication] Failed to find duplicates: ${message}`);
        return [];
    }
}

/**
 * Consolidate duplicate tickets by:
 * 1. Bumping master ticket priority
 * 2. Adding comment to master about duplicates
 * 3. Optionally closing/removing duplicate tickets
 * 
 * @param matches Duplicate matches returned from findDuplicates()
 * @param config Deduplication configuration
 * @returns Report of actions taken
 */
export async function consolidateDuplicates(
    matches: DuplicateMatch[],
    config: DeduplicationConfig = {}
): Promise<{
    consolidated: DuplicateMatch[];
    mastersPrioritized: string[];
    duplicatesRemoved: string[];
    errors: string[];
}> {
    const autoRemove = config.autoRemoveDuplicates ?? false;
    const bumpPriority = config.bumpMasterPriority ?? true;
    const maxPriority = config.maxPriority ?? 1;

    const mastersPrioritized: Set<string> = new Set();
    const duplicatesRemoved: Set<string> = new Set();
    const errors: string[] = [];
    const consolidated: DuplicateMatch[] = [];

    for (const match of matches) {
        try {
            // Step 1: Bump master ticket priority (if enabled)
            if (bumpPriority) {
                await updateTicket(match.masterId, {
                    priority: maxPriority
                });
                mastersPrioritized.add(match.masterId);
                logInfo(
                    `[Deduplication] Bumped priority of master ticket ${match.masterId} (${match.similarity}% match)`
                );
            }

            // Step 2: Remove duplicate (if enabled)
            if (autoRemove) {
                await updateTicket(match.duplicateId, {
                    status: 'removed'
                });
                duplicatesRemoved.add(match.duplicateId);
                logInfo(
                    `[Deduplication] Removed duplicate ticket ${match.duplicateId} → master ${match.masterId}`
                );
            } else {
                // Just mark as linked
                await updateTicket(match.duplicateId, {
                    linkedTo: match.masterId
                });
                logInfo(
                    `[Deduplication] Linked duplicate ${match.duplicateId} to master ${match.masterId}`
                );
            }

            consolidated.push(match);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            const errorMsg = `Failed to consolidate ${match.duplicateId}: ${message}`;
            logError(`[Deduplication] ${errorMsg}`);
            errors.push(errorMsg);
        }
    }

    if (consolidated.length > 0) {
        logInfo(
            `[Deduplication] Consolidated ${consolidated.length} duplicates ` +
            `(removed: ${duplicatesRemoved.size}, prioritized: ${mastersPrioritized.size})`
        );
    }

    return {
        consolidated,
        mastersPrioritized: Array.from(mastersPrioritized),
        duplicatesRemoved: Array.from(duplicatesRemoved),
        errors
    };
}

/**
 * Full deduplication workflow:
 * 1. Find duplicate tickets
 * 2. Consolidate them
 * 3. Return report
 * 
 * This is the main entry point for deduplication checking.
 */
export async function checkAndDeduplicateTicket(
    ticket: Ticket,
    config: DeduplicationConfig = {}
): Promise<{
    isDuplicate: boolean;
    matches: DuplicateMatch[];
    report: Awaited<ReturnType<typeof consolidateDuplicates>>;
}> {
    // Step 1: Find duplicates
    const matches = await findDuplicates(ticket, config);

    // Step 2: If duplicates found, consolidate them
    let report: Awaited<ReturnType<typeof consolidateDuplicates>> = {
        consolidated: [] as DuplicateMatch[],
        mastersPrioritized: [] as string[],
        duplicatesRemoved: [] as string[],
        errors: [] as string[]
    };

    if (matches.length > 0) {
        report = await consolidateDuplicates(matches, config);
        logInfo(
            `[Deduplication] Ticket ${ticket.id} identified as duplicate ` +
            `(${matches.length} matches found, ${report.consolidated.length} consolidated)`
        );
    }

    return {
        isDuplicate: matches.length > 0,
        matches,
        report
    };
}

/**
 * Generate a human-readable deduplication report
 */
export function generateDuplicationReport(
    results: {
        isDuplicate: boolean;
        matches: DuplicateMatch[];
        report: Awaited<ReturnType<typeof consolidateDuplicates>>;
    }
): string {
    if (!results.isDuplicate) {
        return 'No duplicates found for this ticket.';
    }

    let reportText = `Found ${results.matches.length} potential duplicate(s):\n\n`;

    for (const match of results.matches) {
        reportText += `• **${match.similarity}% match**: ${match.reason}\n`;
        reportText += `  Master: ${match.masterTitle} (#${match.masterId})\n`;
        reportText += `  Duplicate: ${match.duplicateTitle} (#${match.duplicateId})\n\n`;
    }

    reportText += `\nConsolidation Actions:\n`;
    reportText += `• Master tickets prioritized: ${results.report.mastersPrioritized.length}\n`;
    reportText += `• Duplicate tickets removed: ${results.report.duplicatesRemoved.length}\n`;

    if (results.report.errors.length > 0) {
        reportText += `• Errors: ${results.report.errors.length}\n`;
        for (const error of results.report.errors) {
            reportText += `  - ${error}\n`;
        }
    }

    return reportText;
}
