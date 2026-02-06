/**
 * @file verification/investigation.ts
 * @module InvestigationManager
 * @description Creates investigation tickets and fix tasks for failures (MT-015.10, MT-015.11)
 * 
 * When verification fails, this module creates detailed investigation tickets
 * with failure analysis and schedules fix tasks for the coding agent.
 * 
 * **Simple explanation**: The problem reporter. When something fails,
 * it creates detailed bug reports explaining what went wrong and
 * schedules the fix work for the coding team.
 */

import { logInfo, logError } from '../../logger';
import { createTicket, updateTicket, getTicket } from '../../services/ticketDb';
import type { TestResult } from './testRunner';
import type { DecisionResult } from './decision';

// ============================================================================
// Types
// ============================================================================

export interface InvestigationTicket {
    id: string;
    parentTaskId: string;
    type: 'investigation';
    title: string;
    description: string;
    failureAnalysis: FailureAnalysis;
    priority: number;
    createdAt: Date;
}

export interface FailureAnalysis {
    testsFailed: number;
    testsTotal: number;
    unmatchedCriteria: string[];
    errorMessages: string[];
    likelyCategories: string[];
    suggestedFixes: string[];
}

export interface FixTask {
    id: string;
    investigationId: string;
    parentTaskId: string;
    title: string;
    description: string;
    priority: number;
    retryNumber: number;
}

// ============================================================================
// InvestigationManager Class
// ============================================================================

/**
 * Creates investigation tickets and fix tasks for verification failures.
 * 
 * **Simple explanation**: The failure detective.
 * Analyzes what went wrong, categorizes the problem, and creates
 * actionable tickets to guide the fix process.
 */
export class InvestigationManager {
    private investigationCounter = 0;
    private fixTaskCounter = 0;

    /**
     * Create an investigation ticket for a verification failure
     */
    async createInvestigationTicket(
        taskId: string,
        decision: DecisionResult,
        testResult: TestResult
    ): Promise<InvestigationTicket | null> {
        try {
            const failureAnalysis = this.analyzeFailure(decision, testResult);
            const investigationId = `INV-${++this.investigationCounter}`;

            const ticket = {
                title: `🔍 Investigation: ${taskId} verification failed`,
                description: this.formatInvestigationDescription(taskId, decision, failureAnalysis),
                type: 'ai_to_human' as const,
                priority: this.calculatePriority(failureAnalysis),
                creator: 'VerificationTeam',
                status: 'open' as const,
                assignee: null,
                taskId: investigationId,
                version: 1,
                resolution: null
            };

            await createTicket(ticket);
            logInfo(`[Investigation] Created investigation ticket: ${investigationId}`);

            return {
                id: investigationId,
                parentTaskId: taskId,
                type: 'investigation',
                title: ticket.title,
                description: ticket.description,
                failureAnalysis,
                priority: ticket.priority,
                createdAt: new Date()
            };

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[Investigation] Failed to create investigation ticket: ${msg}`);
            return null;
        }
    }

    /**
     * Create a fix task linked to an investigation
     */
    async createFixTask(
        taskId: string,
        decision: DecisionResult,
        retryNumber: number
    ): Promise<FixTask | null> {
        try {
            const fixTaskId = `FIX-${++this.fixTaskCounter}`;

            const ticket = {
                title: `🔧 Fix: ${taskId} (attempt ${retryNumber})`,
                description: this.formatFixTaskDescription(taskId, decision, retryNumber),
                type: 'human_to_ai' as const,
                priority: 1, // Fix tasks are high priority
                creator: 'VerificationTeam',
                status: 'open' as const,
                assignee: 'CodingAgent',
                taskId: fixTaskId,
                version: 1,
                resolution: null
            };

            await createTicket(ticket);
            logInfo(`[Investigation] Created fix task: ${fixTaskId}`);

            return {
                id: fixTaskId,
                investigationId: `INV-${this.investigationCounter}`,
                parentTaskId: taskId,
                title: ticket.title,
                description: ticket.description,
                priority: ticket.priority,
                retryNumber
            };

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[Investigation] Failed to create fix task: ${msg}`);
            return null;
        }
    }

    /**
     * Analyze the failure to categorize and suggest fixes
     */
    private analyzeFailure(decision: DecisionResult, testResult: TestResult): FailureAnalysis {
        const likelyCategories: string[] = [];
        const suggestedFixes: string[] = [];
        const errorMessages: string[] = [];

        // Categorize based on test results
        if (testResult.failed > 0) {
            likelyCategories.push('test_failure');
            suggestedFixes.push('Review failing test output and fix implementation');

            // Extract error messages from output if available
            if (testResult.errorOutput) {
                const errors = this.extractErrorMessages(testResult.errorOutput);
                errorMessages.push(...errors);
            }
        }

        // Categorize based on AC matching
        if (decision.details.failedCriteria && decision.details.failedCriteria.length > 0) {
            likelyCategories.push('incomplete_implementation');
            suggestedFixes.push('Implement missing acceptance criteria');
        }

        // Categorize based on coverage
        if (decision.details.coverageMet === false) {
            likelyCategories.push('insufficient_tests');
            suggestedFixes.push('Add unit tests for uncovered code paths');
        }

        // Add generic suggestions if no specific category
        if (likelyCategories.length === 0) {
            likelyCategories.push('unknown');
            suggestedFixes.push('Review implementation against requirements');
        }

        return {
            testsFailed: testResult.failed,
            testsTotal: testResult.total,
            unmatchedCriteria: decision.details.failedCriteria ?? [],
            errorMessages,
            likelyCategories,
            suggestedFixes
        };
    }

    /**
     * Extract error messages from test output
     */
    private extractErrorMessages(output: string): string[] {
        const errors: string[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            // Look for common error patterns
            if (line.includes('Error:') ||
                line.includes('FAILED') ||
                line.includes('TypeError:') ||
                line.includes('ReferenceError:') ||
                line.includes('AssertionError:')) {
                errors.push(line.trim().substring(0, 200)); // Limit length
            }
        }

        return errors.slice(0, 10); // Limit to 10 errors
    }

    /**
     * Calculate priority based on failure severity
     */
    private calculatePriority(analysis: FailureAnalysis): number {
        let priority = 3; // Default: normal

        // More failing tests = higher priority
        if (analysis.testsFailed > 5) priority = 1;
        else if (analysis.testsFailed > 0) priority = 2;

        // Many unmatched criteria = higher priority
        if (analysis.unmatchedCriteria.length > 3) priority = Math.min(priority, 2);

        return priority;
    }

    /**
     * Format the investigation ticket description
     */
    private formatInvestigationDescription(
        taskId: string,
        decision: DecisionResult,
        analysis: FailureAnalysis
    ): string {
        return [
            `## Verification Failure Investigation`,
            '',
            `**Parent Task:** ${taskId}`,
            `**Failure Reason:** ${decision.reason}`,
            '',
            '### Test Results',
            `- Total Tests: ${analysis.testsTotal}`,
            `- Failed Tests: ${analysis.testsFailed}`,
            '',
            '### Unmatched Acceptance Criteria',
            ...analysis.unmatchedCriteria.map(c => `- [ ] ${c}`),
            '',
            '### Error Messages',
            ...analysis.errorMessages.slice(0, 5).map(e => `\`\`\`\n${e}\n\`\`\``),
            '',
            '### Analysis',
            `**Categories:** ${analysis.likelyCategories.join(', ')}`,
            '',
            '### Suggested Fixes',
            ...analysis.suggestedFixes.map(f => `- ${f}`),
            '',
            '---',
            '*This ticket was auto-generated by the Verification Team.*'
        ].join('\n');
    }

    /**
     * Format the fix task description
     */
    private formatFixTaskDescription(
        taskId: string,
        decision: DecisionResult,
        retryNumber: number
    ): string {
        return [
            `## Fix Task`,
            '',
            `**Original Task:** ${taskId}`,
            `**Attempt:** ${retryNumber}`,
            '',
            '### What Needs to be Fixed',
            decision.reason,
            '',
            '### Recommendations',
            ...(decision.recommendations ?? ['Review and fix the implementation']).map(r => `- ${r}`),
            '',
            '### Instructions',
            '1. Review the failure reason above',
            '2. Check the related investigation ticket for detailed analysis',
            '3. Make the necessary code changes',
            '4. Ensure all tests pass before marking complete',
            '',
            '---',
            '*This fix task was auto-generated by the Verification Team.*'
        ].join('\n');
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new InvestigationManager instance
 */
export function createInvestigation(): InvestigationManager {
    return new InvestigationManager();
}
