/**
 * Coding AI Workflow Integration
 * 
 * MT-014.14: Integrates Answer Team responses back to the Coding AI
 * workflow. When an answer is provided, this module ensures the
 * Coding AI can resume work with the information it needed.
 * 
 * **Simple explanation**: The messenger that delivers answers back
 * to the Coding AI. When the answer team figures something out,
 * this module makes sure the Coding AI gets the memo and continues.
 * 
 * @module agents/answer/codingAIWorkflow
 */

import { logInfo, logWarn, logError } from '../../logger';
import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

/**
 * Answer delivery status
 */
export enum DeliveryStatus {
    PENDING = 'pending',
    DELIVERED = 'delivered',
    ACKNOWLEDGED = 'acknowledged',
    TIMEOUT = 'timeout',
    FAILED = 'failed'
}

/**
 * Answer package to deliver to Coding AI
 */
export interface AnswerPackage {
    /** Unique ID for this answer */
    answerId: string;
    /** ID of the original question */
    questionId: string;
    /** The answer content */
    answer: string;
    /** Confidence score (0-100) */
    confidence: number;
    /** Supporting context or references */
    context?: string[];
    /** Suggested next actions */
    suggestedActions?: string[];
    /** Timestamp when answer was generated */
    timestamp: Date;
    /** Delivery status */
    status: DeliveryStatus;
}

/**
 * Coding AI session state
 */
export interface CodingAISession {
    /** Session ID */
    sessionId: string;
    /** Current task ID being worked on */
    currentTaskId?: string;
    /** Pending questions waiting for answers */
    pendingQuestions: string[];
    /** Whether session is paused waiting for answer */
    isPaused: boolean;
    /** Callback to resume with answer */
    resumeCallback?: (answer: AnswerPackage) => void;
}

/**
 * Workflow integration config
 */
export interface WorkflowConfig {
    /** Timeout for answer delivery (ms) */
    deliveryTimeoutMs: number;
    /** Whether to auto-resume on answer */
    autoResume: boolean;
    /** Minimum confidence to auto-resume */
    minConfidenceForAutoResume: number;
}

// ============================================================================
// Events
// ============================================================================

export const WORKFLOW_EVENTS = {
    ANSWER_READY: 'answer:ready',
    ANSWER_DELIVERED: 'answer:delivered',
    ANSWER_ACKNOWLEDGED: 'answer:acknowledged',
    SESSION_RESUMED: 'session:resumed',
    SESSION_TIMEOUT: 'session:timeout'
} as const;

// ============================================================================
// CodingAIWorkflow Class
// ============================================================================

/**
 * Manages the integration between Answer Team and Coding AI.
 * 
 * **Simple explanation**: A switchboard operator that connects
 * answer calls to the right Coding AI session and makes sure
 * the work continues smoothly.
 */
export class CodingAIWorkflow extends EventEmitter {
    private sessions: Map<string, CodingAISession> = new Map();
    private pendingAnswers: Map<string, AnswerPackage> = new Map();
    private questionToSession: Map<string, string> = new Map();
    private config: WorkflowConfig;
    private deliveryTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor(config?: Partial<WorkflowConfig>) {
        super();
        this.config = {
            deliveryTimeoutMs: 30000, // 30 seconds
            autoResume: true,
            minConfidenceForAutoResume: 80,
            ...config
        };
    }

    /**
     * Register a Coding AI session
     */
    public registerSession(session: CodingAISession): void {
        this.sessions.set(session.sessionId, session);
        logInfo(`[CodingAIWorkflow] Registered session: ${session.sessionId}`);
    }

    /**
     * Unregister a Coding AI session
     */
    public unregisterSession(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            // Clean up question mappings
            for (const questionId of session.pendingQuestions) {
                this.questionToSession.delete(questionId);
                this.pendingAnswers.delete(questionId);
                this.clearDeliveryTimer(questionId);
            }
            this.sessions.delete(sessionId);
            logInfo(`[CodingAIWorkflow] Unregistered session: ${sessionId}`);
        }
    }

    /**
     * Record that a question was asked by a session
     */
    public questionAsked(sessionId: string, questionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.pendingQuestions.push(questionId);
            session.isPaused = true;
            this.questionToSession.set(questionId, sessionId);
            logInfo(`[CodingAIWorkflow] Question ${questionId} registered for session ${sessionId}`);
        } else {
            logWarn(`[CodingAIWorkflow] Question asked from unknown session: ${sessionId}`);
        }
    }

    /**
     * Deliver an answer to the appropriate Coding AI session
     */
    public async deliverAnswer(answer: AnswerPackage): Promise<boolean> {
        const sessionId = this.questionToSession.get(answer.questionId);
        
        if (!sessionId) {
            logWarn(`[CodingAIWorkflow] No session found for question: ${answer.questionId}`);
            answer.status = DeliveryStatus.FAILED;
            return false;
        }

        const session = this.sessions.get(sessionId);
        if (!session) {
            logWarn(`[CodingAIWorkflow] Session not found: ${sessionId}`);
            answer.status = DeliveryStatus.FAILED;
            return false;
        }

        // Store pending answer
        answer.status = DeliveryStatus.PENDING;
        this.pendingAnswers.set(answer.questionId, answer);
        this.emit(WORKFLOW_EVENTS.ANSWER_READY, { sessionId, answer });

        // Set up delivery timeout
        this.setDeliveryTimer(answer.questionId, sessionId);

        // Try to deliver
        try {
            // Update status
            answer.status = DeliveryStatus.DELIVERED;
            this.emit(WORKFLOW_EVENTS.ANSWER_DELIVERED, { sessionId, answer });

            // Remove from pending questions
            const idx = session.pendingQuestions.indexOf(answer.questionId);
            if (idx > -1) {
                session.pendingQuestions.splice(idx, 1);
            }

            // Auto-resume if configured and confidence meets threshold
            if (this.config.autoResume && answer.confidence >= this.config.minConfidenceForAutoResume) {
                await this.resumeSession(sessionId, answer);
            }

            // Clean up
            this.clearDeliveryTimer(answer.questionId);
            this.questionToSession.delete(answer.questionId);
            
            logInfo(`[CodingAIWorkflow] Answer delivered to session ${sessionId}`);
            return true;

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[CodingAIWorkflow] Failed to deliver answer: ${msg}`);
            answer.status = DeliveryStatus.FAILED;
            return false;
        }
    }

    /**
     * Resume a Coding AI session with an answer
     */
    public async resumeSession(sessionId: string, answer: AnswerPackage): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            logWarn(`[CodingAIWorkflow] Cannot resume - session not found: ${sessionId}`);
            return;
        }

        if (!session.isPaused) {
            logInfo(`[CodingAIWorkflow] Session ${sessionId} not paused, skipping resume`);
            return;
        }

        // Mark as acknowledged
        answer.status = DeliveryStatus.ACKNOWLEDGED;
        
        // Call resume callback if registered
        if (session.resumeCallback) {
            try {
                session.resumeCallback(answer);
                logInfo(`[CodingAIWorkflow] Session ${sessionId} resumed via callback`);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logError(`[CodingAIWorkflow] Resume callback failed: ${msg}`);
            }
        }

        // Update session state
        session.isPaused = session.pendingQuestions.length > 0;
        
        this.emit(WORKFLOW_EVENTS.SESSION_RESUMED, { sessionId, answer });
        this.emit(WORKFLOW_EVENTS.ANSWER_ACKNOWLEDGED, { sessionId, answer });
    }

    /**
     * Set resume callback for a session
     */
    public setResumeCallback(sessionId: string, callback: (answer: AnswerPackage) => void): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.resumeCallback = callback;
        }
    }

    /**
     * Get session status
     */
    public getSessionStatus(sessionId: string): CodingAISession | null {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Get pending answer for a question
     */
    public getPendingAnswer(questionId: string): AnswerPackage | null {
        return this.pendingAnswers.get(questionId) || null;
    }

    /**
     * Check if session is waiting for answers
     */
    public isSessionWaiting(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        return session?.isPaused ?? false;
    }

    /**
     * Get all active sessions
     */
    public getActiveSessions(): CodingAISession[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Create answer package from raw answer
     */
    public createAnswerPackage(
        questionId: string,
        answer: string,
        confidence: number,
        options?: Partial<Omit<AnswerPackage, 'questionId' | 'answer' | 'confidence'>>
    ): AnswerPackage {
        return {
            answerId: `ans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            questionId,
            answer,
            confidence,
            timestamp: new Date(),
            status: DeliveryStatus.PENDING,
            ...options
        };
    }

    // Private helpers

    private setDeliveryTimer(questionId: string, sessionId: string): void {
        const timer = setTimeout(() => {
            const answer = this.pendingAnswers.get(questionId);
            if (answer && answer.status === DeliveryStatus.PENDING) {
                answer.status = DeliveryStatus.TIMEOUT;
                logWarn(`[CodingAIWorkflow] Answer delivery timeout for question: ${questionId}`);
                this.emit(WORKFLOW_EVENTS.SESSION_TIMEOUT, { sessionId, questionId });
            }
        }, this.config.deliveryTimeoutMs);

        this.deliveryTimers.set(questionId, timer);
    }

    private clearDeliveryTimer(questionId: string): void {
        const timer = this.deliveryTimers.get(questionId);
        if (timer) {
            clearTimeout(timer);
            this.deliveryTimers.delete(questionId);
        }
    }

    /**
     * Clean up all resources
     */
    public dispose(): void {
        for (const timer of this.deliveryTimers.values()) {
            clearTimeout(timer);
        }
        this.deliveryTimers.clear();
        this.sessions.clear();
        this.pendingAnswers.clear();
        this.questionToSession.clear();
        this.removeAllListeners();
    }
}

// ============================================================================
// Factory Function
// ============================================================================

let workflowInstance: CodingAIWorkflow | null = null;

/**
 * Get or create the CodingAIWorkflow singleton
 */
export function getCodingAIWorkflow(config?: Partial<WorkflowConfig>): CodingAIWorkflow {
    if (!workflowInstance) {
        workflowInstance = new CodingAIWorkflow(config);
    }
    return workflowInstance;
}

/**
 * Reset workflow instance (for testing)
 */
export function resetCodingAIWorkflow(): void {
    if (workflowInstance) {
        workflowInstance.dispose();
        workflowInstance = null;
    }
}
