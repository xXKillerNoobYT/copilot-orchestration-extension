/**
 * Answer Team MCP Handler: askQuestion
 * 
 * **Simple explanation**: Handles clarification questions from agents,
 * enforcing the invoke_trigger pattern where questions must include
 * how they'll use the answer.
 * 
 * @module agents/answer/handlers/askQuestion
 */

import { logInfo, logWarn, logError } from '../../../logger';

/**
 * Question request from an agent
 */
export interface QuestionRequest {
    /** Agent asking the question */
    agentId: string;
    /** Type of question */
    questionType: 'clarification' | 'approval' | 'choice' | 'information';
    /** The question text */
    question: string;
    /** How the answer will be used (invoke_trigger) */
    invokeTrigger: string;
    /** Default answer if no response */
    defaultValue?: string;
    /** Options for choice questions */
    options?: string[];
    /** Timeout in seconds */
    timeoutSeconds?: number;
    /** Context for the question */
    context?: string;
    /** Priority */
    priority: 'low' | 'normal' | 'high' | 'urgent';
}

/**
 * askQuestion response
 */
export interface AskQuestionResponse {
    /** Whether the question was sent */
    sent: boolean;
    /** Answer if already available */
    answer?: string;
    /** Selected option index for choice questions */
    selectedIndex?: number;
    /** Question ID for tracking */
    questionId: string;
    /** Status */
    status: 'pending' | 'answered' | 'timeout' | 'rejected';
    /** Message */
    message: string;
}

/**
 * Handler configuration
 */
export interface AskQuestionConfig {
    /** Require invoke_trigger */
    requireInvokeTrigger: boolean;
    /** Default timeout seconds */
    defaultTimeoutSeconds: number;
    /** Maximum pending questions */
    maxPendingQuestions: number;
    /** Allow auto-answer from cache */
    allowAutoAnswer: boolean;
}

const DEFAULT_CONFIG: AskQuestionConfig = {
    requireInvokeTrigger: true,
    defaultTimeoutSeconds: 300, // 5 minutes
    maxPendingQuestions: 10,
    allowAutoAnswer: true
};

/**
 * Pending question storage
 */
interface PendingQuestion {
    request: QuestionRequest;
    questionId: string;
    createdAt: Date;
    expiresAt: Date;
    answer?: string;
    selectedIndex?: number;
    answered: boolean;
}

// In-memory storage for pending questions
const pendingQuestions: Map<string, PendingQuestion> = new Map();
let questionCounter = 0;

/**
 * Handle ask question request from agent
 * 
 * @param request - Question request
 * @param config - Handler configuration
 * @returns Question response
 */
export async function handleAskQuestion(
    request: QuestionRequest,
    config: Partial<AskQuestionConfig> = {}
): Promise<AskQuestionResponse> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    logInfo(`[AskQuestion] Agent ${request.agentId} asking: ${request.question.substring(0, 50)}...`);

    try {
        // Validate request
        const validationError = validateRequest(request, cfg);
        if (validationError) {
            logWarn(`[AskQuestion] Validation failed: ${validationError}`);
            return {
                sent: false,
                questionId: '',
                status: 'rejected',
                message: validationError
            };
        }

        // Check pending question limit
        if (pendingQuestions.size >= cfg.maxPendingQuestions) {
            logWarn('[AskQuestion] Max pending questions reached');
            return {
                sent: false,
                questionId: '',
                status: 'rejected',
                message: `Maximum pending questions (${cfg.maxPendingQuestions}) reached`
            };
        }

        // Check for cached/auto-answer
        if (cfg.allowAutoAnswer) {
            const cached = checkCachedAnswer(request);
            if (cached) {
                logInfo(`[AskQuestion] Auto-answered from cache`);
                return {
                    sent: true,
                    answer: cached.answer,
                    selectedIndex: cached.selectedIndex,
                    questionId: `auto-${++questionCounter}`,
                    status: 'answered',
                    message: 'Answered from cache'
                };
            }
        }

        // Create pending question
        const questionId = `q-${++questionCounter}-${Date.now()}`;
        const timeoutSeconds = request.timeoutSeconds || cfg.defaultTimeoutSeconds;
        const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);

        const pending: PendingQuestion = {
            request,
            questionId,
            createdAt: new Date(),
            expiresAt,
            answered: false
        };

        pendingQuestions.set(questionId, pending);

        // Set timeout to clean up
        setTimeout(() => {
            const q = pendingQuestions.get(questionId);
            if (q && !q.answered) {
                pendingQuestions.delete(questionId);
                logInfo(`[AskQuestion] Question ${questionId} timed out`);
            }
        }, timeoutSeconds * 1000);

        logInfo(`[AskQuestion] Question ${questionId} queued, expires in ${timeoutSeconds}s`);

        return {
            sent: true,
            questionId,
            status: 'pending',
            message: `Question queued. Waiting for answer (timeout: ${timeoutSeconds}s)`
        };

    } catch (error: unknown) {
        logError(`[AskQuestion] Error: ${error instanceof Error ? error.message : String(error)}`);
        return {
            sent: false,
            questionId: '',
            status: 'rejected',
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/**
 * Validate question request
 */
function validateRequest(request: QuestionRequest, config: AskQuestionConfig): string | null {
    if (!request.agentId) {
        return 'Agent ID is required';
    }

    if (!request.question || request.question.length < 5) {
        return 'Question must be at least 5 characters';
    }

    if (config.requireInvokeTrigger && !request.invokeTrigger) {
        return 'invoke_trigger is required - explain how the answer will be used';
    }

    if (request.questionType === 'choice' && (!request.options || request.options.length < 2)) {
        return 'Choice questions require at least 2 options';
    }

    return null;
}

/**
 * Check for cached answer (simple pattern matching)
 */
function checkCachedAnswer(request: QuestionRequest): { answer: string; selectedIndex?: number } | null {
    // Simple heuristics for auto-answering common questions
    const questionLower = request.question.toLowerCase();

    // Default answer patterns
    if (request.defaultValue) {
        // If question asks for confirmation and has default, use it
        if (questionLower.includes('proceed') || questionLower.includes('continue')) {
            return { answer: request.defaultValue };
        }
    }

    // For yes/no questions with options, default to first option
    if (request.questionType === 'choice' && request.options) {
        const opts = request.options.map(o => o.toLowerCase());
        if (opts.includes('yes') && opts.includes('no')) {
            // Default to 'yes' for confirmations
            if (questionLower.includes('should') || questionLower.includes('want to')) {
                const yesIndex = opts.indexOf('yes');
                return { answer: 'yes', selectedIndex: yesIndex };
            }
        }
    }

    return null;
}

/**
 * Answer a pending question
 */
export function answerQuestion(
    questionId: string,
    answer: string,
    selectedIndex?: number
): boolean {
    const pending = pendingQuestions.get(questionId);
    if (!pending) {
        logWarn(`[AskQuestion] Question ${questionId} not found`);
        return false;
    }

    if (pending.answered) {
        logWarn(`[AskQuestion] Question ${questionId} already answered`);
        return false;
    }

    pending.answer = answer;
    pending.selectedIndex = selectedIndex;
    pending.answered = true;

    logInfo(`[AskQuestion] Question ${questionId} answered`);
    return true;
}

/**
 * Get question status
 */
export function getQuestionStatus(questionId: string): AskQuestionResponse | null {
    const pending = pendingQuestions.get(questionId);
    if (!pending) {
        return null;
    }

    if (pending.answered) {
        return {
            sent: true,
            answer: pending.answer,
            selectedIndex: pending.selectedIndex,
            questionId,
            status: 'answered',
            message: 'Question has been answered'
        };
    }

    if (new Date() > pending.expiresAt) {
        return {
            sent: true,
            questionId,
            status: 'timeout',
            message: 'Question timed out'
        };
    }

    return {
        sent: true,
        questionId,
        status: 'pending',
        message: `Waiting for answer. Expires at ${pending.expiresAt.toISOString()}`
    };
}

/**
 * Get all pending questions
 */
export function getPendingQuestions(): QuestionRequest[] {
    const pending: QuestionRequest[] = [];
    const now = new Date();

    for (const q of pendingQuestions.values()) {
        if (!q.answered && q.expiresAt > now) {
            pending.push(q.request);
        }
    }

    return pending;
}

/**
 * Clear pending questions (for tests)
 */
export function clearPendingQuestions(): void {
    pendingQuestions.clear();
    questionCounter = 0;
}

/**
 * Validate askQuestion request parameters
 */
export function validateAskQuestionRequest(params: unknown): QuestionRequest | null {
    if (!params || typeof params !== 'object') {
        return null;
    }

    const p = params as Record<string, unknown>;

    if (typeof p['agentId'] !== 'string' || typeof p['question'] !== 'string') {
        return null;
    }

    return {
        agentId: p['agentId'] as string,
        questionType: (p['questionType'] as QuestionRequest['questionType']) || 'clarification',
        question: p['question'] as string,
        invokeTrigger: typeof p['invokeTrigger'] === 'string' ? p['invokeTrigger'] : '',
        defaultValue: typeof p['defaultValue'] === 'string' ? p['defaultValue'] : undefined,
        options: Array.isArray(p['options']) ? p['options'] as string[] : undefined,
        timeoutSeconds: typeof p['timeoutSeconds'] === 'number' ? p['timeoutSeconds'] : undefined,
        context: typeof p['context'] === 'string' ? p['context'] : undefined,
        priority: (p['priority'] as QuestionRequest['priority']) || 'normal'
    };
}
