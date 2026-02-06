/**
 * Human Escalation System for Verification Team
 * 
 * **Simple explanation**: When automated verification fails too many times,
 * this shows a VS Code dialog asking the human for help. Provides options
 * like "Manual Fix", "Skip Task", or "Change Approach" with full retry history.
 * 
 * @module agents/verification/escalation
 */

import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';
import { getRetryLimitManager, type EscalationInfo, type RetryState } from './retryLimit';
import { getBossNotificationManager } from '../orchestrator/boss';

/**
 * Escalation action chosen by user
 */
export type EscalationAction = 'manual-fix' | 'skip' | 'change-approach' | 'retry-once' | 'dismissed';

/**
 * Escalation result
 */
export interface EscalationResult {
    /** Task ID */
    taskId: string;
    /** Action chosen */
    action: EscalationAction;
    /** User's note (if provided) */
    note?: string;
    /** Timestamp */
    timestamp: number;
    /** Whether escalation was handled */
    handled: boolean;
}

/**
 * Escalation callback
 */
export type EscalationCallback = (result: EscalationResult) => void;

/**
 * Human Escalation Handler
 * 
 * **Simple explanation**: Shows a modal dialog with the failure history
 * and asks the human what to do next.
 */
export class HumanEscalationHandler {
    private callbacks: Set<EscalationCallback> = new Set();
    private pendingEscalations: Map<string, EscalationInfo> = new Map();
    private results: Map<string, EscalationResult> = new Map();

    /**
     * Trigger escalation for a task
     */
    public async escalate(info: EscalationInfo): Promise<EscalationResult> {
        this.pendingEscalations.set(info.taskId, info);
        logInfo(`[Escalation] Escalating task ${info.taskId} after ${info.totalRetries} retries`);

        // Also notify Boss
        const boss = getBossNotificationManager();
        boss.notifyRetryLimitExceeded(info.taskId, info.totalRetries);

        // Show VS Code modal
        return this.showEscalationModal(info);
    }

    /**
     * Show the escalation modal dialog
     */
    private async showEscalationModal(info: EscalationInfo): Promise<EscalationResult> {
        // Build message
        const message = this.buildEscalationMessage(info);

        // Define action buttons with recommendations
        const manualFixButton = info.recommendation === 'manual-fix' ? '🔧 Manual Fix (Recommended)' : 'Manual Fix';
        const skipButton = info.recommendation === 'skip' ? '⏭️ Skip Task (Recommended)' : 'Skip Task';
        const changeButton = info.recommendation === 'change-approach' ? '🔄 Change Approach (Recommended)' : 'Change Approach';
        const retryButton = 'Retry Once More';

        // Show modal
        const selection = await vscode.window.showErrorMessage(
            message,
            { modal: true },
            manualFixButton,
            skipButton,
            changeButton,
            retryButton
        );

        let action: EscalationAction = 'dismissed';
        if (selection?.includes('Manual Fix')) action = 'manual-fix';
        else if (selection?.includes('Skip')) action = 'skip';
        else if (selection?.includes('Change Approach')) action = 'change-approach';
        else if (selection?.includes('Retry')) action = 'retry-once';

        const result: EscalationResult = {
            taskId: info.taskId,
            action,
            timestamp: Date.now(),
            handled: action !== 'dismissed'
        };

        // If action requires explanation, prompt for note
        if (action === 'change-approach' || action === 'manual-fix') {
            const note = await vscode.window.showInputBox({
                prompt: `Add a note for the ${action} action (optional)`,
                placeHolder: 'Describe what you plan to do...'
            });
            result.note = note;
        }

        // Store result
        this.results.set(info.taskId, result);
        this.pendingEscalations.delete(info.taskId);

        // Mark as escalated in retry manager
        if (action !== 'retry-once') {
            getRetryLimitManager().markEscalated(info.taskId);
        }

        // Notify callbacks
        this.notifyCallbacks(result);

        logInfo(`[Escalation] Task ${info.taskId} - User chose: ${action}`);
        return result;
    }

    /**
     * Build escalation message
     */
    private buildEscalationMessage(info: EscalationInfo): string {
        const lines = [
            `⚠️ Verification Failed After ${info.totalRetries} Retries`,
            ``,
            `Task: ${info.taskId}`,
            ``,
            info.failureSummary,
            ``,
            `Recommendation: ${this.getRecommendationText(info.recommendation)}`,
            ``,
            `Evidence:`,
            ...info.evidence.map(e => `• ${e}`)
        ];

        return lines.join('\n');
    }

    /**
     * Get human-readable recommendation text
     */
    private getRecommendationText(recommendation: EscalationInfo['recommendation']): string {
        switch (recommendation) {
            case 'manual-fix':
                return 'Manual intervention required - the same issues keep recurring';
            case 'skip':
                return 'Consider skipping - the failing criteria may be non-critical';
            case 'change-approach':
                return 'Try a different approach - current approach appears fundamentally flawed';
            default:
                return 'Review and decide the best course of action';
        }
    }

    /**
     * Register a callback for escalation results
     */
    public onEscalation(callback: EscalationCallback): vscode.Disposable {
        this.callbacks.add(callback);
        return {
            dispose: () => {
                this.callbacks.delete(callback);
            }
        };
    }

    /**
     * Notify all callbacks
     */
    private notifyCallbacks(result: EscalationResult): void {
        for (const callback of this.callbacks) {
            try {
                callback(result);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                logError(`[Escalation] Callback error: ${msg}`);
            }
        }
    }

    /**
     * Get escalation result for a task
     */
    public getResult(taskId: string): EscalationResult | undefined {
        return this.results.get(taskId);
    }

    /**
     * Check if task has been escalated
     */
    public isEscalated(taskId: string): boolean {
        return this.results.has(taskId);
    }

    /**
     * Check if escalation is pending
     */
    public isPending(taskId: string): boolean {
        return this.pendingEscalations.has(taskId);
    }

    /**
     * Get all pending escalations
     */
    public getPendingEscalations(): EscalationInfo[] {
        return Array.from(this.pendingEscalations.values());
    }

    /**
     * Get all results
     */
    public getAllResults(): EscalationResult[] {
        return Array.from(this.results.values());
    }

    /**
     * Show quiet notification (non-modal) for low-priority escalations
     */
    public async showQuietNotification(info: EscalationInfo): Promise<void> {
        const selection = await vscode.window.showWarningMessage(
            `Task ${info.taskId} failed ${info.totalRetries} times. Click for options.`,
            'View Details',
            'Dismiss'
        );

        if (selection === 'View Details') {
            await this.escalate(info);
        }
    }

    /**
     * Clear all state
     */
    public clear(): void {
        this.pendingEscalations.clear();
        this.results.clear();
        this.callbacks.clear();
    }
}

// Singleton instance
let handlerInstance: HumanEscalationHandler | null = null;

/**
 * Get the singleton HumanEscalationHandler instance
 */
export function getHumanEscalationHandler(): HumanEscalationHandler {
    if (!handlerInstance) {
        handlerInstance = new HumanEscalationHandler();
    }
    return handlerInstance;
}

/**
 * Reset for testing
 */
export function resetHumanEscalationHandlerForTests(): void {
    if (handlerInstance) {
        handlerInstance.clear();
    }
    handlerInstance = null;
}
