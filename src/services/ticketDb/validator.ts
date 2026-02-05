/**
 * Ticket Schema Validator
 *
 * Validates ticket data before insertion or update operations.
 * Ensures data integrity by checking field types, constraints, and enums.
 *
 * **Simple explanation**: Like a bouncer at a club who checks that
 * everyone meets the requirements before letting them in. Checks things
 * like "Is the title short enough?" and "Is the status a valid option?"
 *
 * @module ticketDb/validator
 * @since MT-005.6
 */

import { logWarn } from '../../logger';

/**
 * Valid ticket statuses
 */
export const VALID_STATUSES = [
    'open',
    'in-progress',
    'done',
    'blocked',
    'pending',
    'in_review',
    'resolved',
    'rejected',
    'escalated',
] as const;

export type TicketStatus = typeof VALID_STATUSES[number];

/**
 * Valid ticket types
 */
export const VALID_TYPES = [
    'ai_to_human',
    'human_to_ai',
    'answer_agent',
] as const;

export type TicketType = typeof VALID_TYPES[number];

/**
 * Validation constraints for ticket fields
 */
export const TICKET_CONSTRAINTS = {
    /** Maximum length for ticket title */
    TITLE_MAX_LENGTH: 200,
    /** Maximum length for ticket description */
    DESCRIPTION_MAX_LENGTH: 800,
    /** Minimum priority value */
    PRIORITY_MIN: 1,
    /** Maximum priority value */
    PRIORITY_MAX: 5,
    /** Minimum version value */
    VERSION_MIN: 1,
    /** Maximum length for resolution text */
    RESOLUTION_MAX_LENGTH: 2000,
    /** Maximum length for a thread message */
    THREAD_MESSAGE_MAX_LENGTH: 1200,
    /** Minimum stage gate value */
    STAGE_GATE_MIN: 1,
    /** Maximum stage gate value */
    STAGE_GATE_MAX: 7,
    /** Minimum atomic estimate in minutes */
    ESTIMATE_MIN_MINUTES: 15,
    /** Maximum atomic estimate in minutes */
    ESTIMATE_MAX_MINUTES: 60,
} as const;

/**
 * A single validation issue found during validation
 */
export interface ValidationIssue {
    /** The field that has the issue */
    field: string;
    /** Description of what's wrong */
    message: string;
    /** The value that was provided (for debugging) */
    received?: unknown;
    /** What was expected */
    expected?: string;
}

/**
 * Result of validating ticket data
 */
export interface ValidationResult {
    /** Whether the data passed all validation checks */
    valid: boolean;
    /** List of issues found (empty if valid) */
    issues: ValidationIssue[];
}

/**
 * Validate ticket data for creation.
 *
 * **Simple explanation**: Checks all the fields of a new ticket to make
 * sure everything is filled in correctly before saving it.
 *
 * @param data - The ticket data to validate (without auto-generated fields)
 * @returns Validation result with any issues found
 *
 * @example
 * const result = validateTicketCreate({ title: '', status: 'open' });
 * // result.valid === false
 * // result.issues[0].message === "Title is required and cannot be empty"
 */
export function validateTicketCreate(data: Record<string, unknown>): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Required fields
    validateRequiredString(data, 'title', issues);
    validateRequiredString(data, 'status', issues);

    // Title length
    if (typeof data.title === 'string' && data.title.trim().length > 0) {
        validateMaxLength(data.title, 'title', TICKET_CONSTRAINTS.TITLE_MAX_LENGTH, issues);
    }

    // Status enum
    if (typeof data.status === 'string') {
        validateEnum(data.status, 'status', VALID_STATUSES as unknown as string[], issues);
    }

    // Optional field validations
    if (data.description !== undefined && data.description !== null) {
        validateStringType(data.description, 'description', issues);
        if (typeof data.description === 'string') {
            validateMaxLength(data.description, 'description', TICKET_CONSTRAINTS.DESCRIPTION_MAX_LENGTH, issues);
        }
    }

    if (data.type !== undefined && data.type !== null) {
        validateEnum(data.type as string, 'type', VALID_TYPES as unknown as string[], issues);
    }

    if (data.priority !== undefined && data.priority !== null) {
        validateNumberRange(
            data.priority,
            'priority',
            TICKET_CONSTRAINTS.PRIORITY_MIN,
            TICKET_CONSTRAINTS.PRIORITY_MAX,
            issues
        );
    }

    if (data.version !== undefined && data.version !== null) {
        validateNumberMin(data.version, 'version', TICKET_CONSTRAINTS.VERSION_MIN, issues);
    }

    if (data.resolution !== undefined && data.resolution !== null) {
        validateStringType(data.resolution, 'resolution', issues);
        if (typeof data.resolution === 'string') {
            validateMaxLength(data.resolution, 'resolution', TICKET_CONSTRAINTS.RESOLUTION_MAX_LENGTH, issues);
        }
    }

    if (data.creator !== undefined && data.creator !== null) {
        validateStringType(data.creator, 'creator', issues);
    }

    if (data.assignee !== undefined && data.assignee !== null) {
        validateStringType(data.assignee, 'assignee', issues);
    }

    // Thread validation
    if (data.thread !== undefined && data.thread !== null) {
        validateThread(data.thread, issues);
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}

/**
 * Validate ticket data for updates (partial data).
 *
 * **Simple explanation**: When updating a ticket, not all fields are
 * required - but the ones that are provided must still be valid.
 *
 * @param updates - The partial ticket data to validate
 * @returns Validation result with any issues found
 */
export function validateTicketUpdate(updates: Record<string, unknown>): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Don't allow updating immutable fields
    if ('id' in updates) {
        issues.push({
            field: 'id',
            message: 'Cannot modify ticket ID after creation',
        });
    }
    if ('createdAt' in updates) {
        issues.push({
            field: 'createdAt',
            message: 'Cannot modify creation timestamp',
        });
    }

    // Validate provided fields
    if (updates.title !== undefined) {
        if (typeof updates.title !== 'string' || updates.title.trim().length === 0) {
            issues.push({
                field: 'title',
                message: 'Title must be a non-empty string',
                received: updates.title,
            });
        } else {
            validateMaxLength(updates.title, 'title', TICKET_CONSTRAINTS.TITLE_MAX_LENGTH, issues);
        }
    }

    if (updates.status !== undefined) {
        validateEnum(updates.status as string, 'status', VALID_STATUSES as unknown as string[], issues);
    }

    if (updates.description !== undefined && updates.description !== null) {
        validateStringType(updates.description, 'description', issues);
        if (typeof updates.description === 'string') {
            validateMaxLength(updates.description, 'description', TICKET_CONSTRAINTS.DESCRIPTION_MAX_LENGTH, issues);
        }
    }

    if (updates.type !== undefined && updates.type !== null) {
        validateEnum(updates.type as string, 'type', VALID_TYPES as unknown as string[], issues);
    }

    if (updates.priority !== undefined && updates.priority !== null) {
        validateNumberRange(
            updates.priority,
            'priority',
            TICKET_CONSTRAINTS.PRIORITY_MIN,
            TICKET_CONSTRAINTS.PRIORITY_MAX,
            issues
        );
    }

    if (updates.version !== undefined && updates.version !== null) {
        validateNumberMin(updates.version, 'version', TICKET_CONSTRAINTS.VERSION_MIN, issues);
    }

    if (updates.resolution !== undefined && updates.resolution !== null) {
        validateStringType(updates.resolution, 'resolution', issues);
        if (typeof updates.resolution === 'string') {
            validateMaxLength(updates.resolution, 'resolution', TICKET_CONSTRAINTS.RESOLUTION_MAX_LENGTH, issues);
        }
    }

    if (updates.thread !== undefined && updates.thread !== null) {
        validateThread(updates.thread, issues);
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}

/**
 * Validate a thread message object.
 *
 * @param message - The thread message to validate
 * @returns Validation result
 */
export function validateThreadMessage(message: Record<string, unknown>): ValidationResult {
    const issues: ValidationIssue[] = [];

    validateRequiredString(message, 'role', issues);
    validateRequiredString(message, 'content', issues);

    if (typeof message.role === 'string') {
        const validRoles = ['user', 'assistant', 'system'];
        validateEnum(message.role, 'role', validRoles, issues);
    }

    if (typeof message.content === 'string') {
        validateMaxLength(message.content, 'content', TICKET_CONSTRAINTS.THREAD_MESSAGE_MAX_LENGTH, issues);
    }

    if (message.status !== undefined && message.status !== null) {
        const validStatuses = ['reviewing', 'planning', 'needs-approval', 'blocked'];
        validateEnum(message.status as string, 'status', validStatuses, issues);
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}

/**
 * Format validation issues into a human-readable error message.
 *
 * **Simple explanation**: Takes the list of problems and turns them into
 * a nice error message that tells you exactly what went wrong.
 *
 * @param issues - Array of validation issues
 * @returns Formatted error string
 *
 * @example
 * formatValidationErrors([{ field: 'title', message: 'Too long' }]);
 * // "Validation failed: title: Too long"
 */
export function formatValidationErrors(issues: ValidationIssue[]): string {
    if (issues.length === 0) {
        return 'No validation errors';
    }

    const details = issues.map(i => `${i.field}: ${i.message}`).join('; ');
    return `Validation failed: ${details}`;
}

/**
 * Validate and throw if invalid (convenience function).
 *
 * **Simple explanation**: Validates the data and throws an error if
 * anything is wrong. Use this when you want to stop immediately on
 * bad data rather than collecting errors.
 *
 * @param data - The data to validate
 * @param mode - 'create' or 'update'
 * @throws Error if validation fails
 */
export function validateOrThrow(
    data: Record<string, unknown>,
    mode: 'create' | 'update'
): void {
    const result = mode === 'create'
        ? validateTicketCreate(data)
        : validateTicketUpdate(data);

    if (!result.valid) {
        const message = formatValidationErrors(result.issues);
        logWarn(`Ticket validation failed (${mode}): ${message}`);
        throw new Error(message);
    }
}

// ─── Internal Validation Helpers ─────────────────────────────────────────

/**
 * Validate that a required string field is present and non-empty.
 */
function validateRequiredString(
    data: Record<string, unknown>,
    field: string,
    issues: ValidationIssue[]
): void {
    if (data[field] === undefined || data[field] === null) {
        issues.push({
            field,
            message: `${capitalizeFirst(field)} is required`,
            received: data[field],
        });
    } else if (typeof data[field] !== 'string') {
        issues.push({
            field,
            message: `${capitalizeFirst(field)} must be a string`,
            received: data[field],
            expected: 'string',
        });
    } else if ((data[field] as string).trim().length === 0) {
        issues.push({
            field,
            message: `${capitalizeFirst(field)} is required and cannot be empty`,
            received: data[field],
        });
    }
}

/**
 * Validate that a value is a string type.
 */
function validateStringType(
    value: unknown,
    field: string,
    issues: ValidationIssue[]
): void {
    if (typeof value !== 'string') {
        issues.push({
            field,
            message: `${capitalizeFirst(field)} must be a string`,
            received: value,
            expected: 'string',
        });
    }
}

/**
 * Validate that a string doesn't exceed max length.
 */
function validateMaxLength(
    value: string,
    field: string,
    maxLength: number,
    issues: ValidationIssue[]
): void {
    if (value.length > maxLength) {
        issues.push({
            field,
            message: `${capitalizeFirst(field)} exceeds maximum length of ${maxLength} characters (got ${value.length})`,
            received: value.length,
            expected: `<= ${maxLength} characters`,
        });
    }
}

/**
 * Validate that a value is one of the allowed enum values.
 */
function validateEnum(
    value: string,
    field: string,
    allowedValues: string[],
    issues: ValidationIssue[]
): void {
    if (!allowedValues.includes(value)) {
        issues.push({
            field,
            message: `Invalid ${field}: must be one of [${allowedValues.join(', ')}]`,
            received: value,
            expected: allowedValues.join(' | '),
        });
    }
}

/**
 * Validate that a number is within a range.
 */
function validateNumberRange(
    value: unknown,
    field: string,
    min: number,
    max: number,
    issues: ValidationIssue[]
): void {
    if (typeof value !== 'number' || isNaN(value)) {
        issues.push({
            field,
            message: `${capitalizeFirst(field)} must be a number`,
            received: value,
            expected: `number between ${min} and ${max}`,
        });
    } else if (value < min || value > max) {
        issues.push({
            field,
            message: `${capitalizeFirst(field)} must be between ${min} and ${max}`,
            received: value,
            expected: `${min}-${max}`,
        });
    }
}

/**
 * Validate that a number meets a minimum value.
 */
function validateNumberMin(
    value: unknown,
    field: string,
    min: number,
    issues: ValidationIssue[]
): void {
    if (typeof value !== 'number' || isNaN(value)) {
        issues.push({
            field,
            message: `${capitalizeFirst(field)} must be a number`,
            received: value,
            expected: `number >= ${min}`,
        });
    } else if (value < min) {
        issues.push({
            field,
            message: `${capitalizeFirst(field)} must be at least ${min}`,
            received: value,
            expected: `>= ${min}`,
        });
    }
}

/**
 * Validate the thread array structure.
 */
function validateThread(
    value: unknown,
    issues: ValidationIssue[]
): void {
    if (!Array.isArray(value)) {
        issues.push({
            field: 'thread',
            message: 'Thread must be an array',
            received: typeof value,
            expected: 'array',
        });
        return;
    }

    for (let i = 0; i < value.length; i++) {
        const msg = value[i];
        if (typeof msg !== 'object' || msg === null) {
            issues.push({
                field: `thread[${i}]`,
                message: `Thread message at index ${i} must be an object`,
                received: typeof msg,
            });
            continue;
        }

        const msgResult = validateThreadMessage(msg as Record<string, unknown>);
        for (const issue of msgResult.issues) {
            issues.push({
                ...issue,
                field: `thread[${i}].${issue.field}`,
            });
        }
    }
}

/**
 * Capitalize the first letter of a string.
 */
function capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
