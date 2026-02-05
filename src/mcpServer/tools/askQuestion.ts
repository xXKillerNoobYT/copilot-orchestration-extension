// askQuestion.ts
// MCP Tool: Ask a question via Answer Agent with timeout handling

import { logError, logInfo, logWarn } from '../../logger';
import { routeToAnswerAgent } from '../../services/orchestrator';
import { createTicket } from '../../services/ticketDb';

/**
 * Request parameters for askQuestion tool
 */
export interface AskQuestionParams {
    question: string;
    chatId?: string;
}

/**
 * Response for askQuestion tool
 */
export interface AskQuestionResponse {
    success: boolean;
    answer?: string;
    error?: {
        code: string;
        message: string;
    };
    ticketId?: string;
}

const DEFAULT_TIMEOUT_MS = 45_000;

const defaultTicketFields = {
    priority: 2,
    creator: 'system',
    assignee: 'Clarity Agent',
    taskId: null,
    version: 1,
    resolution: null
};

/**
 * Validate askQuestion parameters
 *
 * **Simple explanation**: Make sure we have a real question before asking the Answer Agent.
 */
export function validateAskQuestionParams(params: any): { isValid: boolean; error?: string } {
    if (!params || typeof params !== 'object') {
        return { isValid: false, error: 'Parameters must be an object' };
    }

    if (!params.question || typeof params.question !== 'string' || !params.question.trim()) {
        return { isValid: false, error: 'question is required and must be a non-empty string' };
    }

    if (params.chatId !== undefined && typeof params.chatId !== 'string') {
        return { isValid: false, error: 'chatId must be a string if provided' };
    }

    return { isValid: true };
}

/**
 * Ask a question via the Answer Agent with timeout handling
 *
 * **Simple explanation**: We ask the Answer Agent, but if it takes too long (45s),
 * we create a ticket so a human can answer later.
 */
export async function handleAskQuestion(params: AskQuestionParams): Promise<AskQuestionResponse> {
    const question = params.question.trim();
    const chatId = params.chatId;

    try {
        logInfo(`[askQuestion] Sending question (chatId=${chatId || 'new'}): ${question.substring(0, 80)}`);

        const answerPromise = routeToAnswerAgent(question);
        let timeoutId: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('ANSWER_TIMEOUT')), DEFAULT_TIMEOUT_MS);
        });

        try {
            const answer = await Promise.race([answerPromise, timeoutPromise]);
            return {
                success: true,
                answer
            };
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        if (message === 'ANSWER_TIMEOUT') {
            logWarn('[askQuestion] Answer Agent timeout, creating ticket');
            const ticket = await createTicket({
                title: `ANSWER TIMEOUT: ${question.substring(0, 60)}`,
                status: 'blocked',
                description: `Question timed out after ${DEFAULT_TIMEOUT_MS / 1000}s.

Question:
${question}

Chat ID: ${chatId || 'none'}`,
                type: 'human_to_ai',
                ...defaultTicketFields
            });

            return {
                success: false,
                error: {
                    code: 'ANSWER_TIMEOUT',
                    message: `Answer Agent timed out after ${DEFAULT_TIMEOUT_MS / 1000}s. Ticket created.`
                },
                ticketId: ticket.id
            };
        }

        logError(`[askQuestion] Error: ${message}`);
        return {
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: `Failed to get answer: ${message}`
            }
        };
    }
}
