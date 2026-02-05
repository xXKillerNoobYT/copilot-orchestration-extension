/**
 * Ticket Reply Module
 *
 * Manages conversation threads on tickets, allowing agents and humans
 * to exchange messages within a ticket context.
 *
 * **Simple explanation**: Like a comment section on a ticket. Agents and
 * humans can add replies, and the whole conversation is stored in order.
 * Each reply gets a unique ID and timestamp.
 *
 * @module ticketDb/reply
 * @since MT-006.11
 */

import { logInfo, logWarn } from '../../logger';

/**
 * A single reply in a ticket thread
 */
export interface ThreadReply {
    /** Unique reply identifier */
    replyId: string;
    /** Who sent this reply */
    role: 'user' | 'assistant' | 'system';
    /** The reply content */
    content: string;
    /** When this reply was created */
    createdAt: string;
    /** Optional status tag for the reply */
    status?: 'reviewing' | 'planning' | 'needs-approval' | 'blocked';
    /** Who authored this specific reply (agent name or user) */
    author?: string;
}

/**
 * Options for adding a reply
 */
export interface AddReplyOptions {
    /** The role of the reply sender */
    role: 'user' | 'assistant' | 'system';
    /** The reply content (max 1200 chars) */
    content: string;
    /** Optional author name */
    author?: string;
    /** Optional status tag */
    status?: 'reviewing' | 'planning' | 'needs-approval' | 'blocked';
}

/**
 * Result of adding a reply
 */
export interface AddReplyResult {
    /** Whether the reply was added successfully */
    success: boolean;
    /** The created reply (if successful) */
    reply?: ThreadReply;
    /** Error message (if failed) */
    error?: string;
    /** Updated thread array */
    updatedThread?: ThreadReply[];
}

/**
 * Maximum length for reply content
 */
export const MAX_REPLY_LENGTH = 1200;

/**
 * Valid roles for replies
 */
export const VALID_ROLES = ['user', 'assistant', 'system'] as const;

/**
 * Valid status tags for replies
 */
export const VALID_REPLY_STATUSES = ['reviewing', 'planning', 'needs-approval', 'blocked'] as const;

/**
 * Create a new reply for a ticket thread.
 *
 * **Simple explanation**: Creates a new message to add to the ticket's
 * conversation. Validates the content and generates a unique ID.
 *
 * @param options - Reply options (role, content, author)
 * @param existingThread - Current thread array (or null)
 * @returns Result with the new reply and updated thread
 *
 * @example
 * const result = createReply(
 *   { role: 'assistant', content: 'Working on it', author: 'PlanningAgent' },
 *   existingThread
 * );
 */
export function createReply(
    options: AddReplyOptions,
    existingThread: ThreadReply[] | null | undefined
): AddReplyResult {
    // Validate role
    if (!VALID_ROLES.includes(options.role)) {
        return {
            success: false,
            error: `Invalid role: '${options.role}'. Must be one of: ${VALID_ROLES.join(', ')}`,
        };
    }

    // Validate content
    if (!options.content || options.content.trim().length === 0) {
        return {
            success: false,
            error: 'Reply content is required and cannot be empty',
        };
    }

    if (options.content.length > MAX_REPLY_LENGTH) {
        return {
            success: false,
            error: `Reply content exceeds maximum length of ${MAX_REPLY_LENGTH} characters (got ${options.content.length})`,
        };
    }

    // Validate status if provided
    if (options.status && !VALID_REPLY_STATUSES.includes(options.status)) {
        return {
            success: false,
            error: `Invalid reply status: '${options.status}'. Must be one of: ${VALID_REPLY_STATUSES.join(', ')}`,
        };
    }

    // Generate reply ID
    const replyId = generateReplyId(existingThread);

    const reply: ThreadReply = {
        replyId,
        role: options.role,
        content: options.content,
        createdAt: new Date().toISOString(),
        ...(options.author && { author: options.author }),
        ...(options.status && { status: options.status }),
    };

    // Append to thread
    const updatedThread = [...(existingThread || []), reply];

    logInfo(`Reply ${replyId} added (${options.role}${options.author ? ` / ${options.author}` : ''})`);

    return {
        success: true,
        reply,
        updatedThread,
    };
}

/**
 * Parse a thread JSON string into typed reply array.
 *
 * **Simple explanation**: Takes the raw JSON text from the database
 * and converts it into a proper array of reply objects.
 *
 * @param threadJson - JSON string from the database
 * @returns Parsed array of thread replies
 */
export function parseThread(threadJson: string | null | undefined): ThreadReply[] {
    if (!threadJson) {
        return [];
    }

    try {
        const parsed = JSON.parse(threadJson);
        if (!Array.isArray(parsed)) {
            logWarn('Thread JSON is not an array');
            return [];
        }
        return parsed;
    } catch {
        logWarn('Failed to parse thread JSON');
        return [];
    }
}

/**
 * Serialize a thread array to JSON for storage.
 *
 * @param thread - Array of thread replies
 * @returns JSON string for database storage
 */
export function serializeThread(thread: ThreadReply[]): string {
    return JSON.stringify(thread);
}

/**
 * Get the reply count for a thread.
 *
 * @param thread - Thread array or JSON string
 * @returns Number of replies
 */
export function getReplyCount(thread: ThreadReply[] | string | null | undefined): number {
    if (!thread) return 0;
    if (typeof thread === 'string') {
        return parseThread(thread).length;
    }
    return thread.length;
}

/**
 * Get the latest reply from a thread.
 *
 * @param thread - Thread array
 * @returns Latest reply or null if empty
 */
export function getLatestReply(thread: ThreadReply[] | null | undefined): ThreadReply | null {
    if (!thread || thread.length === 0) return null;
    return thread[thread.length - 1];
}

/**
 * Get replies by a specific role.
 *
 * @param thread - Thread array
 * @param role - Role to filter by
 * @returns Filtered replies
 */
export function getRepliesByRole(
    thread: ThreadReply[],
    role: 'user' | 'assistant' | 'system'
): ThreadReply[] {
    return thread.filter(r => r.role === role);
}

// ─── Internal Helpers ────────────────────────────────────────────────────

/**
 * Generate a unique reply ID.
 *
 * Format: RPL-{sequence} where sequence starts at 1 per thread.
 */
function generateReplyId(existingThread: ThreadReply[] | null | undefined): string {
    const count = existingThread ? existingThread.length : 0;
    return `RPL-${String(count + 1).padStart(3, '0')}`;
}
