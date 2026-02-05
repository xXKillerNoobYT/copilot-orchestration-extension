/**
 * State Conflict Error Handlers
 *
 * Provides helper functions for handling state conflicts and resource locking.
 * Includes resolution steps to help callers recover from concurrent access issues.
 *
 * **Simple explanation**: When two things try to change the same data at the
 * same time, or when something is locked by another operation, these functions
 * create errors that explain what's happening and how to fix it.
 *
 * @module stateErrors
 * @since MT-002.4
 */

import { ErrorCode } from './errorCodes';

/**
 * Base interface for state errors
 */
export interface StateError {
    code: ErrorCode;
    message: string;
    resourceId?: string;
    currentState?: string;
    requestedState?: string;
    resolutionSteps?: string[];
}

/**
 * Create an error when a task is already in progress.
 *
 * **Simple explanation**: Like trying to microwave something when someone
 * else is already using the microwave - you have to wait your turn.
 *
 * @param taskId - The ID of the task that's already running
 * @param operation - The operation that was attempted
 * @returns StateError object with resolution steps
 *
 * @example
 * const error = createTaskInProgressError('TICKET-123', 'verify');
 * // Error: Task TICKET-123 is already in progress
 */
export function createTaskInProgressError(
    taskId: string,
    operation: string
): StateError {
    return {
        code: ErrorCode.INVALID_STATE,
        message: `Cannot ${operation}: task '${taskId}' is already in progress`,
        resourceId: taskId,
        currentState: 'in-progress',
        resolutionSteps: [
            `Wait for task '${taskId}' to complete`,
            'Check the task queue for current status',
            'If stuck, manually mark the task as blocked',
        ],
    };
}

/**
 * Throw an error when a task is already in progress.
 *
 * @param taskId - The ID of the task
 * @param operation - The operation that was attempted
 * @throws Error with standardized message
 */
export function throwTaskInProgress(taskId: string, operation: string): never {
    const error = createTaskInProgressError(taskId, operation);
    throw new Error(`[${error.code}] ${error.message}`);
}

/**
 * Create an error for an invalid state transition.
 *
 * **Simple explanation**: Like trying to "complete" a task that's already
 * marked as "blocked" - the transition doesn't make sense.
 *
 * @param resourceId - The ID of the resource
 * @param fromState - Current state of the resource
 * @param toState - The requested new state
 * @param allowedTransitions - Valid states that can be transitioned to
 * @returns StateError object with resolution steps
 */
export function createInvalidTransitionError(
    resourceId: string,
    fromState: string,
    toState: string,
    allowedTransitions: string[]
): StateError {
    return {
        code: ErrorCode.INVALID_STATE,
        message: `Invalid state transition for '${resourceId}': cannot go from '${fromState}' to '${toState}'`,
        resourceId,
        currentState: fromState,
        requestedState: toState,
        resolutionSteps: [
            `Current state is '${fromState}'`,
            `Allowed transitions: ${allowedTransitions.join(', ')}`,
            `Request one of the allowed states instead of '${toState}'`,
        ],
    };
}

/**
 * Throw an error for an invalid state transition.
 *
 * @param resourceId - The ID of the resource
 * @param fromState - Current state
 * @param toState - Requested state
 * @param allowedTransitions - Valid states
 * @throws Error with standardized message
 */
export function throwInvalidTransition(
    resourceId: string,
    fromState: string,
    toState: string,
    allowedTransitions: string[]
): never {
    const error = createInvalidTransitionError(resourceId, fromState, toState, allowedTransitions);
    throw new Error(`[${error.code}] ${error.message}`);
}

/**
 * Create an error when a resource is locked by another operation.
 *
 * **Simple explanation**: Like a bathroom with an "occupied" sign - someone
 * else is using it and you have to wait.
 *
 * @param resourceId - The ID of the locked resource
 * @param lockedBy - Description of what's holding the lock
 * @returns StateError object with resolution steps
 */
export function createResourceLockedError(
    resourceId: string,
    lockedBy?: string
): StateError {
    return {
        code: ErrorCode.INVALID_STATE,
        message: `Resource '${resourceId}' is locked${lockedBy ? ` by ${lockedBy}` : ''}`,
        resourceId,
        currentState: 'locked',
        resolutionSteps: [
            `Wait for the lock on '${resourceId}' to be released`,
            lockedBy ? `Check status of ${lockedBy}` : 'Check system logs for lock holder',
            'If lock is stale, consider force-releasing (with caution)',
        ],
    };
}

/**
 * Throw an error when a resource is locked.
 *
 * @param resourceId - The ID of the locked resource
 * @param lockedBy - Description of what's holding the lock
 * @throws Error with standardized message
 */
export function throwResourceLocked(resourceId: string, lockedBy?: string): never {
    const error = createResourceLockedError(resourceId, lockedBy);
    throw new Error(`[${error.code}] ${error.message}`);
}

/**
 * Create an error for a ticket update conflict (optimistic locking failure).
 *
 * **Simple explanation**: Like two people trying to edit the same Google Doc
 * at the exact same moment - one person's changes might be lost.
 *
 * @param ticketId - The ID of the ticket
 * @param expectedVersion - The version we expected to update
 * @param actualVersion - The actual current version
 * @returns StateError object with resolution steps
 */
export function createTicketConflictError(
    ticketId: string,
    expectedVersion?: string,
    actualVersion?: string
): StateError {
    return {
        code: ErrorCode.TICKET_UPDATE_CONFLICT,
        message: `Update conflict for ticket '${ticketId}': ticket was modified by another operation`,
        resourceId: ticketId,
        currentState: actualVersion ? `version ${actualVersion}` : 'modified',
        requestedState: expectedVersion ? `version ${expectedVersion}` : 'update',
        resolutionSteps: [
            `Refresh ticket '${ticketId}' to get latest state`,
            'Re-apply your changes to the updated ticket',
            'Consider implementing retry logic with backoff',
        ],
    };
}

/**
 * Throw an error for a ticket update conflict.
 *
 * @param ticketId - The ID of the ticket
 * @param expectedVersion - The version we expected
 * @param actualVersion - The actual current version
 * @throws Error with standardized message
 */
export function throwTicketConflict(
    ticketId: string,
    expectedVersion?: string,
    actualVersion?: string
): never {
    const error = createTicketConflictError(ticketId, expectedVersion, actualVersion);
    throw new Error(`[${error.code}] ${error.message}`);
}

/**
 * Ticket state machine - defines valid state transitions.
 *
 * **Simple explanation**: A map that shows which states a ticket can
 * move to from any given state. Like rules for a board game.
 */
export const TICKET_STATE_MACHINE: Record<string, string[]> = {
    'open': ['in-progress', 'blocked', 'pending'],
    'pending': ['open', 'in-progress', 'blocked'],
    'in-progress': ['done', 'blocked', 'pending'],
    'blocked': ['open', 'in-progress', 'pending'],
    'done': [], // Terminal state - no transitions out
};

/**
 * Validate that a ticket state transition is allowed.
 *
 * @param ticketId - The ID of the ticket
 * @param fromState - Current state
 * @param toState - Desired new state
 * @throws Error if transition is invalid
 */
export function validateTicketTransition(
    ticketId: string,
    fromState: string,
    toState: string
): void {
    const allowedTransitions = TICKET_STATE_MACHINE[fromState] ?? [];

    if (!allowedTransitions.includes(toState)) {
        throwInvalidTransition(ticketId, fromState, toState, allowedTransitions);
    }
}

/**
 * Check if an error is a state conflict error.
 *
 * @param error - The error to check
 * @returns true if this is a state conflict error
 */
export function isStateConflictError(error: unknown): boolean {
    if (error instanceof Error) {
        return (
            error.message.includes('[INVALID_STATE]') ||
            error.message.includes('[TICKET_UPDATE_CONFLICT]') ||
            error.message.includes('conflict') ||
            error.message.includes('locked')
        );
    }
    return false;
}
