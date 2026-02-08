/**
 * Error Escalation System (MT-033.36)
 *
 * Manages the escalation ladder when errors can't be auto-fixed. Handles
 * retry logic, agent re-assignment, specialist delegation, and human
 * escalation — with full context at every step.
 *
 * **Simple explanation**: When something breaks and the first fix attempt
 * doesn't work, this system decides what to try next — retry? Ask another
 * agent? Call a human? It never loops forever; after 5 tries it stops and
 * asks for help.
 *
 * Escalation ladder:
 * 1. Retry (1-3 attempts) — same task, maybe different approach
 * 2. Coding agent fix — send error back with context
 * 3. Different agent — try a specialist
 * 4. Human escalation — create ticket for user intervention
 *
 * @module services/errorEscalation
 */

import {
    DetectedError,
    ErrorSeverity
} from './errorDetector';

import {
    AutoFixResult
} from './autoFixer';

// ============================================================================
// Types
// ============================================================================

/** Current escalation level */
export type EscalationLevel = 'retry' | 'agent_fix' | 'specialist' | 'human';

/** Status of an escalation */
export type EscalationStatus =
    | 'pending'
    | 'in_progress'
    | 'resolved'
    | 'escalated'
    | 'human_required'
    | 'abandoned';

/**
 * Record of a single escalation attempt.
 *
 * **Simple explanation**: "We tried X and here's what happened."
 */
export interface EscalationAttempt {
    /** Attempt number (1-based) */
    attemptNumber: number;
    /** Level at which this attempt was made */
    level: EscalationLevel;
    /** What was tried */
    action: string;
    /** Agent that performed the action (if applicable) */
    agentId?: string;
    /** Whether this attempt resolved the error */
    resolved: boolean;
    /** Result description */
    result: string;
    /** Duration in ms */
    durationMs: number;
    /** Timestamp */
    timestamp: string;
}

/**
 * A human escalation ticket — created when all automated attempts fail.
 *
 * **Simple explanation**: "We tried everything, here's the full story —
 * please fix this manually."
 */
export interface HumanEscalationTicket {
    /** Unique ticket ID */
    id: string;
    /** Task ID */
    taskId: string;
    /** The original error */
    error: DetectedError;
    /** All attempts made */
    attempts: EscalationAttempt[];
    /** Summary of what was tried */
    whatWasTried: string;
    /** Why automated fixes failed */
    whyAutoFailed: string;
    /** Suggested approach for human */
    suggestedApproach: string;
    /** Urgency */
    urgency: 'immediate' | 'normal' | 'low';
    /** Status */
    status: EscalationStatus;
    /** Created timestamp */
    createdAt: string;
}

/**
 * Full escalation state for a single error.
 *
 * **Simple explanation**: The complete history of trying to fix one error —
 * where we are in the escalation ladder and what's happened so far.
 */
export interface EscalationState {
    /** Unique escalation ID */
    id: string;
    /** The error being escalated */
    error: DetectedError;
    /** Task ID */
    taskId: string;
    /** Current level */
    currentLevel: EscalationLevel;
    /** Current status */
    status: EscalationStatus;
    /** All attempts */
    attempts: EscalationAttempt[];
    /** Total attempts */
    totalAttempts: number;
    /** Human ticket (if escalated to human) */
    humanTicket?: HumanEscalationTicket;
    /** Created timestamp */
    createdAt: string;
    /** Last updated */
    updatedAt: string;
}

/**
 * Configuration for the escalation system.
 *
 * **Simple explanation**: Rules for how the escalation ladder works —
 * max retries, when to escalate, etc.
 */
export interface EscalationConfig {
    /** Max retry attempts at same level (default: 3) */
    maxRetries: number;
    /** Max total attempts before human (default: 5) */
    maxTotalAttempts: number;
    /** Auto-escalate critical errors (default: true) */
    autoEscalateCritical: boolean;
    /** Skip agent_fix level for simple errors (default: false) */
    skipAgentForSimple: boolean;
    /** Include full context in human tickets (default: true) */
    includeFullContext: boolean;
}

/**
 * Default escalation configuration.
 *
 * **Simple explanation**: Standard settings — 3 retries, 5 total max,
 * auto-escalate critical errors.
 */
export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
    maxRetries: 3,
    maxTotalAttempts: 5,
    autoEscalateCritical: true,
    skipAgentForSimple: false,
    includeFullContext: true
};

// ============================================================================
// ID Generation
// ============================================================================

let escalationCounter = 0;
let humanTicketCounter = 0;

/**
 * Generate a unique escalation ID.
 */
export function generateEscalationId(taskId: string): string {
    escalationCounter++;
    return `ESC-${taskId}-${String(escalationCounter).padStart(3, '0')}`;
}

/**
 * Generate a unique human ticket ID.
 */
export function generateHumanTicketId(): string {
    humanTicketCounter++;
    return `HUM-${String(humanTicketCounter).padStart(3, '0')}`;
}

/**
 * Reset counters (for testing).
 */
export function resetEscalationCounters(): void {
    escalationCounter = 0;
    humanTicketCounter = 0;
}

// ============================================================================
// Escalation Level Logic
// ============================================================================

/**
 * Determine the next escalation level.
 *
 * **Simple explanation**: "We tried this level and it didn't work —
 * what level should we try next?"
 */
export function getNextLevel(
    current: EscalationLevel,
    retryCount: number,
    config: EscalationConfig
): EscalationLevel {
    switch (current) {
        case 'retry':
            // Still have retries left?
            if (retryCount < config.maxRetries) {
                return 'retry';
            }
            return 'agent_fix';

        case 'agent_fix':
            return 'specialist';

        case 'specialist':
            return 'human';

        case 'human':
            return 'human'; // Already at top
    }
}

/**
 * Determine the initial escalation level based on error properties.
 *
 * **Simple explanation**: "What level should we start at?" — critical
 * errors may skip directly to agent_fix or higher.
 */
export function getInitialLevel(
    error: DetectedError,
    config: EscalationConfig
): EscalationLevel {
    // Critical errors with auto-escalate skip retry
    if (config.autoEscalateCritical && error.severity === 'critical') {
        return 'agent_fix';
    }

    // Security errors go straight to specialist/human
    if (error.category === 'security') {
        return 'specialist';
    }

    // Simple auto-fixable errors that somehow failed → retry
    if (error.fixability === 'auto_fixable') {
        return 'retry';
    }

    // Agent-fixable → start at agent_fix
    if (error.fixability === 'agent_fixable') {
        return 'agent_fix';
    }

    // Human-required → go straight to human
    if (error.fixability === 'human_required') {
        return 'human';
    }

    return 'retry';
}

// ============================================================================
// Escalation State Management
// ============================================================================

/**
 * Create a new escalation state for an error.
 *
 * **Simple explanation**: Start tracking escalation for one error.
 */
export function createEscalation(
    error: DetectedError,
    taskId: string,
    config?: Partial<EscalationConfig>
): EscalationState {
    const cfg: EscalationConfig = { ...DEFAULT_ESCALATION_CONFIG, ...config };
    const initialLevel = getInitialLevel(error, cfg);

    return {
        id: generateEscalationId(taskId),
        error,
        taskId,
        currentLevel: initialLevel,
        status: 'pending',
        attempts: [],
        totalAttempts: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

/**
 * Record an escalation attempt.
 *
 * **Simple explanation**: "We just tried something — record what happened
 * and figure out what to do next."
 */
export function recordAttempt(
    state: EscalationState,
    action: string,
    resolved: boolean,
    result: string,
    durationMs: number,
    agentId?: string,
    config?: Partial<EscalationConfig>
): EscalationState {
    const cfg: EscalationConfig = { ...DEFAULT_ESCALATION_CONFIG, ...config };

    const attempt: EscalationAttempt = {
        attemptNumber: state.totalAttempts + 1,
        level: state.currentLevel,
        action,
        agentId,
        resolved,
        result,
        durationMs,
        timestamp: new Date().toISOString()
    };

    const newAttempts = [...state.attempts, attempt];
    const newTotalAttempts = state.totalAttempts + 1;

    // If resolved, we're done
    if (resolved) {
        return {
            ...state,
            attempts: newAttempts,
            totalAttempts: newTotalAttempts,
            status: 'resolved',
            updatedAt: new Date().toISOString()
        };
    }

    // Check if we've exceeded max total attempts
    if (newTotalAttempts >= cfg.maxTotalAttempts) {
        const humanTicket = createHumanTicket(state, newAttempts, cfg);
        return {
            ...state,
            attempts: newAttempts,
            totalAttempts: newTotalAttempts,
            currentLevel: 'human',
            status: 'human_required',
            humanTicket,
            updatedAt: new Date().toISOString()
        };
    }

    // Determine retry count at current level
    const retryCount = newAttempts.filter(a => a.level === state.currentLevel).length;
    const nextLevel = getNextLevel(state.currentLevel, retryCount, cfg);

    return {
        ...state,
        attempts: newAttempts,
        totalAttempts: newTotalAttempts,
        currentLevel: nextLevel,
        status: nextLevel === 'human' ? 'human_required' : 'in_progress',
        humanTicket: nextLevel === 'human'
            ? createHumanTicket(state, newAttempts, cfg)
            : undefined,
        updatedAt: new Date().toISOString()
    };
}

// ============================================================================
// Human Ticket Creation
// ============================================================================

/**
 * Create a human escalation ticket.
 *
 * **Simple explanation**: "Automated fixes failed. Here's everything we
 * tried, plus all the context, so a human can fix it."
 */
export function createHumanTicket(
    state: EscalationState,
    attempts: EscalationAttempt[],
    config: EscalationConfig
): HumanEscalationTicket {
    const whatWasTried = attempts.map(a =>
        `${a.attemptNumber}. [${a.level}] ${a.action} → ${a.resolved ? 'RESOLVED' : 'FAILED'}: ${a.result}`
    ).join('\n');

    const whyAutoFailed = generateFailureAnalysis(attempts);
    const suggestedApproach = generateHumanSuggestion(state.error, attempts);

    const urgencyMap: Record<ErrorSeverity, 'immediate' | 'normal' | 'low'> = {
        'critical': 'immediate',
        'high': 'immediate',
        'medium': 'normal',
        'low': 'low'
    };

    return {
        id: generateHumanTicketId(),
        taskId: state.taskId,
        error: state.error,
        attempts,
        whatWasTried,
        whyAutoFailed,
        suggestedApproach,
        urgency: urgencyMap[state.error.severity],
        status: 'human_required',
        createdAt: new Date().toISOString()
    };
}

/**
 * Analyze why automated fixes failed.
 *
 * **Simple explanation**: "Here's the pattern of failures — this helps
 * the human understand what went wrong."
 */
export function generateFailureAnalysis(attempts: EscalationAttempt[]): string {
    if (attempts.length === 0) {
        return 'No attempts were made.';
    }

    const failedAttempts = attempts.filter(a => !a.resolved);
    if (failedAttempts.length === 0) {
        return 'All attempts succeeded (unexpected escalation).';
    }

    const levels = [...new Set(failedAttempts.map(a => a.level))];
    const parts: string[] = [];

    parts.push(`${failedAttempts.length} of ${attempts.length} attempts failed`);
    parts.push(`Levels tried: ${levels.join(', ')}`);

    const lastAttempt = failedAttempts[failedAttempts.length - 1];
    parts.push(`Last failure: ${lastAttempt.result}`);

    return parts.join('. ');
}

/**
 * Generate a suggested approach for human review.
 *
 * **Simple explanation**: "Based on the error type and what we tried,
 * here's what a human should try."
 */
export function generateHumanSuggestion(
    error: DetectedError,
    attempts: EscalationAttempt[]
): string {
    const parts: string[] = [];

    // Category-specific suggestions
    switch (error.category) {
        case 'compile':
            parts.push('Review the TypeScript compilation error — check types, imports, and module resolution');
            break;
        case 'test_failure':
            parts.push('Debug the failing test — check assertions, mocks, and test setup');
            break;
        case 'security':
            parts.push('Security review required — evaluate the security implications and apply appropriate mitigation');
            break;
        case 'logic':
            parts.push('Logic error — trace through the code flow and verify business logic');
            break;
        case 'runtime':
            parts.push('Runtime error — check for null references, async timing, and resource management');
            break;
        case 'performance':
            parts.push('Performance optimization — profile the code and identify bottlenecks');
            break;
        default:
            parts.push('Review the error and apply appropriate fix');
    }

    if (error.suggestedFix) {
        parts.push(`Original suggestion: ${error.suggestedFix}`);
    }

    if (attempts.length > 0) {
        const lastResult = attempts[attempts.length - 1].result;
        parts.push(`Last attempt result: ${lastResult}`);
    }

    return parts.join('. ');
}

// ============================================================================
// Batch Escalation
// ============================================================================

/**
 * Check if an error should be immediately escalated to human.
 *
 * **Simple explanation**: Some errors skip the ladder entirely —
 * security issues, human-required fixability, etc.
 */
export function shouldImmediatelyEscalate(
    error: DetectedError,
    config?: Partial<EscalationConfig>
): boolean {
    const cfg: EscalationConfig = { ...DEFAULT_ESCALATION_CONFIG, ...config };

    // Human-required fixability → always escalate
    if (error.fixability === 'human_required') {
        return true;
    }

    // Critical + auto-escalate config
    if (cfg.autoEscalateCritical && error.severity === 'critical' &&
        error.category === 'security') {
        return true;
    }

    return false;
}

/**
 * Create escalation states for all errors that need escalation.
 *
 * **Simple explanation**: Takes the errors that auto-fix couldn't handle
 * and creates escalation tracking for each one.
 */
export function createEscalationsFromFixResult(
    autoFixResult: AutoFixResult,
    taskId: string,
    remainingErrors: DetectedError[],
    config?: Partial<EscalationConfig>
): EscalationState[] {
    const cfg: EscalationConfig = { ...DEFAULT_ESCALATION_CONFIG, ...config };
    const escalations: EscalationState[] = [];

    for (const error of remainingErrors) {
        escalations.push(createEscalation(error, taskId, cfg));
    }

    return escalations;
}

// ============================================================================
// Summary & Reporting
// ============================================================================

/**
 * Generate a summary of all escalation states.
 *
 * **Simple explanation**: Overview of all escalations — how many resolved,
 * pending, escalated to human, etc.
 */
export function generateEscalationSummary(escalations: EscalationState[]): string {
    if (escalations.length === 0) {
        return 'No escalations needed';
    }

    const resolved = escalations.filter(e => e.status === 'resolved').length;
    const pending = escalations.filter(e => e.status === 'pending' || e.status === 'in_progress').length;
    const human = escalations.filter(e => e.status === 'human_required').length;
    const abandoned = escalations.filter(e => e.status === 'abandoned').length;

    const parts: string[] = [];
    parts.push(`${escalations.length} escalation(s)`);
    if (resolved > 0) parts.push(`${resolved} resolved`);
    if (pending > 0) parts.push(`${pending} pending`);
    if (human > 0) parts.push(`${human} need human review`);
    if (abandoned > 0) parts.push(`${abandoned} abandoned`);

    return parts.join(', ');
}

/**
 * Get a compact escalation report.
 *
 * **Simple explanation**: A text report for agents or users showing
 * what's escalated and what needs attention.
 */
export function getEscalationReport(escalations: EscalationState[]): string {
    if (escalations.length === 0) {
        return 'No escalations to report.';
    }

    const lines: string[] = [];
    lines.push('## Escalation Report');
    lines.push('');
    lines.push(`**Summary**: ${generateEscalationSummary(escalations)}`);
    lines.push('');

    // Human-required first
    const humanRequired = escalations.filter(e => e.status === 'human_required');
    if (humanRequired.length > 0) {
        lines.push('### 🔴 Requires Human Intervention');
        for (const esc of humanRequired) {
            lines.push(`- **${esc.error.title}** (${esc.id})`);
            lines.push(`  ${esc.error.message}`);
            if (esc.humanTicket) {
                lines.push(`  Ticket: ${esc.humanTicket.id}`);
                lines.push(`  Attempts: ${esc.totalAttempts}`);
            }
        }
        lines.push('');
    }

    // Pending
    const pending = escalations.filter(e => e.status === 'pending' || e.status === 'in_progress');
    if (pending.length > 0) {
        lines.push('### 🟡 In Progress');
        for (const esc of pending) {
            lines.push(`- **${esc.error.title}** at level: ${esc.currentLevel} (attempt ${esc.totalAttempts})`);
        }
        lines.push('');
    }

    // Resolved
    const resolved = escalations.filter(e => e.status === 'resolved');
    if (resolved.length > 0) {
        lines.push('### 🟢 Resolved');
        for (const esc of resolved) {
            lines.push(`- **${esc.error.title}** after ${esc.totalAttempts} attempt(s)`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Check if all escalations are terminal (resolved, human_required, or abandoned).
 *
 * **Simple explanation**: "Are we done escalating, or are there still
 * things in progress?"
 */
export function areAllEscalationsTerminal(escalations: EscalationState[]): boolean {
    return escalations.every(e =>
        e.status === 'resolved' ||
        e.status === 'human_required' ||
        e.status === 'abandoned'
    );
}
