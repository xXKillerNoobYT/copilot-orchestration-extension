/**
 * TaskSync Feedback Loops for Planning Team
 * 
 * **Simple explanation**: This module collects feedback during task execution and uses
 * it to improve future estimates and plans - like a learning system that gets better
 * at predicting how long things will take based on past experience.
 * 
 * @module agents/planning/tasksync
 */

import { logInfo, logWarn } from '../../logger';
import type { AtomicTask } from './decomposer';
import type { ZenTask } from './zenTasks';

/**
 * Blocker feedback
 */
export interface BlockerFeedback {
    /** Type of blocker */
    type: 'dependency' | 'unclear' | 'technical' | 'external' | 'other';
    /** Description */
    description: string;
    /** How it was resolved */
    resolution: string;
    /** Time lost in minutes */
    timeLostMinutes: number;
}

/**
 * Feedback about a completed task
 */
export interface TaskFeedback {
    /** Task ID */
    taskId: string;
    /** Original estimate in minutes */
    estimatedMinutes: number;
    /** Actual time taken in minutes */
    actualMinutes: number;
    /** Whether the task was completed successfully */
    completed: boolean;
    /** Blockers encountered */
    blockers: BlockerFeedback[];
    /** What went well */
    positives: string[];
    /** What could be improved */
    improvements: string[];
    /** Accuracy score (actual/estimated ratio) */
    accuracyRatio: number;
    /** Feedback timestamp */
    timestamp: Date;
}

/**
 * Aggregate feedback analysis
 */
export interface FeedbackAnalysis {
    /** Total tasks analyzed */
    totalTasks: number;
    /** Average accuracy ratio */
    avgAccuracy: number;
    /** Common blockers by type */
    blockersByType: Map<string, number>;
    /** Tasks that took longer than estimated */
    overrunCount: number;
    /** Tasks completed faster than estimated */
    underrunCount: number;
    /** Calibration factor suggestion */
    suggestedCalibration: number;
    /** Improvement recommendations */
    recommendations: string[];
}

/**
 * Plan adjustment suggestion
 */
export interface PlanAdjustment {
    /** Type of adjustment */
    type: 'estimate' | 'dependency' | 'priority' | 'decomposition';
    /** Affected task IDs */
    affectedTasks: string[];
    /** Suggestion description */
    suggestion: string;
    /** Confidence (0-1) */
    confidence: number;
    /** Based on how many data points */
    dataPoints: number;
}

/**
 * TaskSync configuration
 */
export interface TaskSyncConfig {
    /** Minimum data points before making suggestions */
    minDataPoints: number;
    /** Accuracy threshold for flagging issues */
    accuracyThreshold: number;
    /** History retention period in days */
    historyRetentionDays: number;
}

const DEFAULT_CONFIG: TaskSyncConfig = {
    minDataPoints: 5,
    accuracyThreshold: 0.8,
    historyRetentionDays: 30
};

/**
 * TaskSyncManager class for feedback collection and analysis
 * 
 * **Simple explanation**: Like a coach that watches how your estimates compare
 * to reality and helps you get better at planning over time.
 */
export class TaskSyncManager {
    private config: TaskSyncConfig;
    private feedbackHistory: TaskFeedback[];
    private adjustmentQueue: PlanAdjustment[];

    constructor(config: Partial<TaskSyncConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.feedbackHistory = [];
        this.adjustmentQueue = [];
    }

    /**
     * Record feedback for a completed task
     */
    recordFeedback(feedback: Omit<TaskFeedback, 'accuracyRatio' | 'timestamp'>): TaskFeedback {
        const accuracyRatio = feedback.estimatedMinutes > 0
            ? feedback.actualMinutes / feedback.estimatedMinutes
            : 1;

        const fullFeedback: TaskFeedback = {
            ...feedback,
            accuracyRatio,
            timestamp: new Date()
        };

        this.feedbackHistory.push(fullFeedback);
        this.pruneOldHistory();

        // Check for immediate adjustments
        this.checkForAdjustments(fullFeedback);

        logInfo(`[TaskSync] Recorded feedback for ${feedback.taskId}: ${feedback.actualMinutes}/${feedback.estimatedMinutes} min (${Math.round(accuracyRatio * 100)}% accuracy)`);
        return fullFeedback;
    }

    /**
     * Create feedback from a ZenTask
     */
    recordFromZenTask(
        zenTask: ZenTask,
        positives: string[] = [],
        improvements: string[] = []
    ): TaskFeedback {
        const blockers: BlockerFeedback[] = zenTask.interruptions
            .filter(i => i.reason.toLowerCase().includes('block'))
            .map(i => ({
                type: 'other' as const,
                description: i.reason,
                resolution: i.savedContext,
                timeLostMinutes: i.durationMinutes
            }));

        return this.recordFeedback({
            taskId: zenTask.id,
            estimatedMinutes: zenTask.estimateMinutes,
            actualMinutes: zenTask.totalFocusMinutes,
            completed: zenTask.zenState === 'zen_complete',
            blockers,
            positives,
            improvements
        });
    }

    /**
     * Analyze collected feedback
     */
    analyzeFeedback(): FeedbackAnalysis {
        if (this.feedbackHistory.length === 0) {
            return this.emptyAnalysis();
        }

        const blockersByType = new Map<string, number>();
        let totalAccuracy = 0;
        let overrunCount = 0;
        let underrunCount = 0;

        for (const fb of this.feedbackHistory) {
            totalAccuracy += fb.accuracyRatio;

            if (fb.accuracyRatio > 1.1) overrunCount++;
            if (fb.accuracyRatio < 0.9) underrunCount++;

            for (const blocker of fb.blockers) {
                blockersByType.set(blocker.type, (blockersByType.get(blocker.type) || 0) + 1);
            }
        }

        const avgAccuracy = totalAccuracy / this.feedbackHistory.length;
        const suggestedCalibration = this.calculateCalibration();
        const recommendations = this.generateRecommendations(avgAccuracy, blockersByType, overrunCount);

        return {
            totalTasks: this.feedbackHistory.length,
            avgAccuracy,
            blockersByType,
            overrunCount,
            underrunCount,
            suggestedCalibration,
            recommendations
        };
    }

    /**
     * Get pending plan adjustments
     */
    getPendingAdjustments(): PlanAdjustment[] {
        return [...this.adjustmentQueue];
    }

    /**
     * Apply an adjustment (mark as used)
     */
    applyAdjustment(adjustment: PlanAdjustment): void {
        const index = this.adjustmentQueue.indexOf(adjustment);
        if (index >= 0) {
            this.adjustmentQueue.splice(index, 1);
        }
        logInfo(`[TaskSync] Applied adjustment: ${adjustment.type} - ${adjustment.suggestion}`);
    }

    /**
     * Suggest adjustments for a set of tasks
     */
    suggestAdjustments(tasks: AtomicTask[]): PlanAdjustment[] {
        const suggestions: PlanAdjustment[] = [];
        const analysis = this.analyzeFeedback();

        // Suggest estimate adjustments
        if (analysis.totalTasks >= this.config.minDataPoints &&
            analysis.suggestedCalibration !== 1.0) {
            suggestions.push({
                type: 'estimate',
                affectedTasks: tasks.map(t => t.id),
                suggestion: `Multiply estimates by ${analysis.suggestedCalibration.toFixed(2)} based on historical data`,
                confidence: Math.min(0.9, analysis.totalTasks / 20),
                dataPoints: analysis.totalTasks
            });
        }

        // Suggest based on common blockers
        const mostCommonBlocker = this.getMostCommonBlocker(analysis.blockersByType);
        if (mostCommonBlocker && mostCommonBlocker.count >= 3) {
            suggestions.push({
                type: 'dependency',
                affectedTasks: [],
                suggestion: `Consider adding buffer for "${mostCommonBlocker.type}" blockers (occurred ${mostCommonBlocker.count} times)`,
                confidence: 0.7,
                dataPoints: mostCommonBlocker.count
            });
        }

        return suggestions;
    }

    /**
     * Get improvement stats
     */
    getImprovementStats(): { trend: 'improving' | 'stable' | 'declining'; recentAccuracy: number } {
        if (this.feedbackHistory.length < 10) {
            return { trend: 'stable', recentAccuracy: 1 };
        }

        // Compare first half to second half
        const midpoint = Math.floor(this.feedbackHistory.length / 2);
        const firstHalf = this.feedbackHistory.slice(0, midpoint);
        const secondHalf = this.feedbackHistory.slice(midpoint);

        const firstAvg = firstHalf.reduce((sum, f) => sum + f.accuracyRatio, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, f) => sum + f.accuracyRatio, 0) / secondHalf.length;

        // Calculate how close to 1.0 (closer is better)
        const firstDistance = Math.abs(1 - firstAvg);
        const secondDistance = Math.abs(1 - secondAvg);

        let trend: 'improving' | 'stable' | 'declining';
        if (secondDistance < firstDistance - 0.1) {
            trend = 'improving';
        } else if (secondDistance > firstDistance + 0.1) {
            trend = 'declining';
        } else {
            trend = 'stable';
        }

        return { trend, recentAccuracy: secondAvg };
    }

    /**
     * Check for immediate adjustments based on new feedback
     */
    private checkForAdjustments(feedback: TaskFeedback): void {
        // Check for severe overrun
        if (feedback.accuracyRatio > 2.0) {
            this.adjustmentQueue.push({
                type: 'estimate',
                affectedTasks: [feedback.taskId],
                suggestion: `Task ${feedback.taskId} took ${Math.round(feedback.accuracyRatio * 100)}% of estimate - consider similar task estimates`,
                confidence: 0.8,
                dataPoints: 1
            });
        }

        // Check for significant blockers
        const totalBlockerTime = feedback.blockers.reduce((sum, b) => sum + b.timeLostMinutes, 0);
        if (totalBlockerTime > 30) {
            this.adjustmentQueue.push({
                type: 'dependency',
                affectedTasks: [feedback.taskId],
                suggestion: `${totalBlockerTime} min lost to blockers on ${feedback.taskId} - add buffer for similar tasks`,
                confidence: 0.6,
                dataPoints: 1
            });
        }
    }

    /**
     * Calculate calibration factor
     */
    private calculateCalibration(): number {
        if (this.feedbackHistory.length < this.config.minDataPoints) {
            return 1.0;
        }

        const ratios = this.feedbackHistory.map(f => f.accuracyRatio);
        const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;

        // Smooth the calibration (don't adjust too drastically)
        const calibration = Math.max(0.6, Math.min(1.5, avgRatio));
        return Math.round(calibration * 100) / 100;
    }

    /**
     * Generate recommendations based on analysis
     */
    private generateRecommendations(
        avgAccuracy: number,
        blockersByType: Map<string, number>,
        overrunCount: number
    ): string[] {
        const recommendations: string[] = [];

        // Accuracy-based recommendations
        if (avgAccuracy > 1.3) {
            recommendations.push('Tasks consistently take longer than estimated - consider increasing base estimates');
        } else if (avgAccuracy < 0.7) {
            recommendations.push('Tasks often complete faster than estimated - consider decreasing estimates or adding stretch goals');
        }

        // Blocker-based recommendations
        const unclearBlockers = blockersByType.get('unclear') || 0;
        if (unclearBlockers >= 3) {
            recommendations.push('Many tasks blocked by unclear requirements - improve upfront clarification');
        }

        const dependencyBlockers = blockersByType.get('dependency') || 0;
        if (dependencyBlockers >= 3) {
            recommendations.push('Dependency blockers common - review task ordering and dependencies');
        }

        // Overrun-based recommendations
        if (overrunCount > this.feedbackHistory.length * 0.5) {
            recommendations.push('Over 50% of tasks overrun - consider smaller task decomposition');
        }

        return recommendations;
    }

    /**
     * Get most common blocker type
     */
    private getMostCommonBlocker(blockersByType: Map<string, number>): { type: string; count: number } | null {
        let maxType = '';
        let maxCount = 0;

        for (const [type, count] of blockersByType) {
            if (count > maxCount) {
                maxType = type;
                maxCount = count;
            }
        }

        return maxCount > 0 ? { type: maxType, count: maxCount } : null;
    }

    /**
     * Prune old history
     */
    private pruneOldHistory(): void {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - this.config.historyRetentionDays);

        this.feedbackHistory = this.feedbackHistory.filter(f => f.timestamp >= cutoff);
    }

    /**
     * Create empty analysis
     */
    private emptyAnalysis(): FeedbackAnalysis {
        return {
            totalTasks: 0,
            avgAccuracy: 1,
            blockersByType: new Map(),
            overrunCount: 0,
            underrunCount: 0,
            suggestedCalibration: 1.0,
            recommendations: ['Not enough data - collect more feedback']
        };
    }

    /**
     * Export feedback history
     */
    exportHistory(): TaskFeedback[] {
        return [...this.feedbackHistory];
    }

    /**
     * Import feedback history
     */
    importHistory(history: TaskFeedback[]): void {
        this.feedbackHistory = [...history];
        this.pruneOldHistory();
        logInfo(`[TaskSync] Imported ${history.length} feedback records`);
    }

    /**
     * Clear all history
     */
    clearHistory(): void {
        this.feedbackHistory = [];
        this.adjustmentQueue = [];
        logInfo('[TaskSync] History cleared');
    }
}

// Singleton instance
let instance: TaskSyncManager | null = null;

/**
 * Get the singleton TaskSyncManager
 */
export function getTaskSyncManager(): TaskSyncManager {
    if (!instance) {
        instance = new TaskSyncManager();
    }
    return instance;
}

/**
 * Reset the singleton for testing
 */
export function resetTaskSyncManagerForTests(): void {
    instance = null;
}
