/**
 * Effort Estimation for Planning Team
 * 
 * **Simple explanation**: This module estimates how long tasks will take based on
 * their complexity, dependencies, and historical data - like a contractor giving
 * you a time quote for a project.
 * 
 * @module agents/planning/estimation
 */

import { logInfo, logWarn } from '../../logger';

/**
 * Task complexity factors
 */
export interface ComplexityFactors {
    /** Code complexity (1-5) */
    codeComplexity: number;
    /** Number of files to modify */
    fileCount: number;
    /** Number of dependencies */
    dependencyCount: number;
    /** Whether UI work is involved */
    hasUI: boolean;
    /** Whether tests are required */
    requiresTests: boolean;
    /** Whether external API integration needed */
    hasExternalAPI: boolean;
    /** Uncertainty level (0-1) */
    uncertainty: number;
}

/**
 * Estimation result
 */
export interface EstimationResult {
    /** Estimated time in minutes */
    estimateMinutes: number;
    /** Confidence level (0-1) */
    confidence: number;
    /** Minimum estimate (optimistic) */
    minMinutes: number;
    /** Maximum estimate (pessimistic) */
    maxMinutes: number;
    /** Breakdown of time */
    breakdown: EstimationBreakdown;
    /** Estimation factors used */
    factors: ComplexityFactors;
    /** Warnings about uncertainty */
    warnings: string[];
}

/**
 * Breakdown of estimated time
 */
export interface EstimationBreakdown {
    /** Implementation time */
    implementation: number;
    /** Testing time */
    testing: number;
    /** Documentation time */
    documentation: number;
    /** Review/polish time */
    review: number;
}

/**
 * Historical data point for calibration
 */
export interface HistoricalDataPoint {
    /** Task type */
    taskType: string;
    /** Estimated minutes */
    estimated: number;
    /** Actual minutes */
    actual: number;
    /** Complexity factors */
    factors: Partial<ComplexityFactors>;
}

/**
 * Estimation configuration
 */
export interface EstimationConfig {
    /** Minimum task duration (minutes) */
    minMinutes: number;
    /** Maximum task duration (minutes) */
    maxMinutes: number;
    /** Base time per file (minutes) */
    minutesPerFile: number;
    /** Buffer percentage for uncertainty */
    uncertaintyBuffer: number;
    /** Include test time in estimates */
    includeTests: boolean;
}

const DEFAULT_CONFIG: EstimationConfig = {
    minMinutes: 15,
    maxMinutes: 60,
    minutesPerFile: 15,
    uncertaintyBuffer: 0.2,
    includeTests: true
};

/**
 * Task type base estimates
 */
const BASE_ESTIMATES: Record<string, number> = {
    'create-file': 20,
    'modify-file': 15,
    'create-component': 30,
    'create-service': 45,
    'create-test': 25,
    'fix-bug': 30,
    'refactor': 35,
    'documentation': 20,
    'configuration': 15,
    'integration': 45,
    'unknown': 30
};

/**
 * EffortEstimator class for estimating task duration
 * 
 * **Simple explanation**: Like a GPS that tells you how long your trip will take -
 * it uses factors like distance (complexity) and traffic (dependencies) to estimate.
 */
export class EffortEstimator {
    private config: EstimationConfig;
    private historicalData: HistoricalDataPoint[];
    private calibrationFactor: number;

    constructor(config: Partial<EstimationConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.historicalData = [];
        this.calibrationFactor = 1.0;
    }

    /**
     * Estimate effort for a task
     * 
     * @param title - Task title
     * @param description - Task description
     * @param factors - Complexity factors
     * @returns Estimation result
     */
    estimate(
        title: string,
        description: string,
        factors: Partial<ComplexityFactors> = {}
    ): EstimationResult {
        logInfo(`[EffortEstimator] Estimating: ${title}`);

        // Fill in default factors
        const fullFactors = this.inferFactors(title, description, factors);

        // Calculate base estimate
        const taskType = this.detectTaskType(title, description);
        let baseMinutes = BASE_ESTIMATES[taskType] || BASE_ESTIMATES['unknown'];

        // Apply complexity multipliers
        baseMinutes = this.applyComplexityMultipliers(baseMinutes, fullFactors);

        // Add breakdown components
        const breakdown = this.calculateBreakdown(baseMinutes, fullFactors);
        const totalMinutes = breakdown.implementation + breakdown.testing + 
                            breakdown.documentation + breakdown.review;

        // Apply calibration from historical data
        const calibratedMinutes = Math.round(totalMinutes * this.calibrationFactor);

        // Clamp to min/max
        const clampedMinutes = Math.max(
            this.config.minMinutes,
            Math.min(this.config.maxMinutes, calibratedMinutes)
        );

        // Calculate confidence and range
        const confidence = this.calculateConfidence(fullFactors);
        const variance = clampedMinutes * (1 - confidence) * this.config.uncertaintyBuffer;
        const minMinutes = Math.max(this.config.minMinutes, Math.round(clampedMinutes - variance));
        const maxMinutes = Math.min(this.config.maxMinutes, Math.round(clampedMinutes + variance * 2));

        // Generate warnings
        const warnings = this.generateWarnings(fullFactors, clampedMinutes);

        const result: EstimationResult = {
            estimateMinutes: clampedMinutes,
            confidence,
            minMinutes,
            maxMinutes,
            breakdown,
            factors: fullFactors,
            warnings
        };

        logInfo(`[EffortEstimator] Estimated ${clampedMinutes} min (${minMinutes}-${maxMinutes}) confidence: ${Math.round(confidence * 100)}%`);
        return result;
    }

    /**
     * Detect task type from title/description
     */
    private detectTaskType(title: string, description: string): string {
        const text = `${title} ${description}`.toLowerCase();

        if (text.includes('create') && text.includes('component')) return 'create-component';
        if (text.includes('create') && text.includes('service')) return 'create-service';
        if (text.includes('create') && text.includes('test')) return 'create-test';
        if (text.includes('create') && text.includes('file')) return 'create-file';
        if (text.includes('fix') || text.includes('bug')) return 'fix-bug';
        if (text.includes('refactor')) return 'refactor';
        if (text.includes('document') || text.includes('jsdoc')) return 'documentation';
        if (text.includes('config') || text.includes('setup')) return 'configuration';
        if (text.includes('integrat')) return 'integration';
        if (text.includes('modify') || text.includes('update')) return 'modify-file';

        return 'unknown';
    }

    /**
     * Infer factors from title/description
     */
    private inferFactors(
        title: string,
        description: string,
        provided: Partial<ComplexityFactors>
    ): ComplexityFactors {
        const text = `${title} ${description}`.toLowerCase();

        return {
            codeComplexity: provided.codeComplexity ?? this.inferCodeComplexity(text),
            fileCount: provided.fileCount ?? this.inferFileCount(text),
            dependencyCount: provided.dependencyCount ?? 0,
            hasUI: provided.hasUI ?? (text.includes('ui') || text.includes('component') || text.includes('render')),
            requiresTests: provided.requiresTests ?? this.config.includeTests,
            hasExternalAPI: provided.hasExternalAPI ?? (text.includes('api') || text.includes('endpoint') || text.includes('fetch')),
            uncertainty: provided.uncertainty ?? 0.2
        };
    }

    /**
     * Infer code complexity (1-5)
     */
    private inferCodeComplexity(text: string): number {
        let complexity = 2; // Default moderate

        // Increase for complex indicators
        if (text.includes('algorithm')) complexity++;
        if (text.includes('complex')) complexity++;
        if (text.includes('async') || text.includes('promise')) complexity++;
        if (text.includes('state machine')) complexity += 2;
        if (text.includes('recursive')) complexity++;
        if (text.includes('concurrent') || text.includes('parallel')) complexity++;

        // Decrease for simple indicators
        if (text.includes('simple')) complexity--;
        if (text.includes('basic')) complexity--;
        if (text.includes('trivial')) complexity--;

        return Math.max(1, Math.min(5, complexity));
    }

    /**
     * Infer number of files
     */
    private inferFileCount(text: string): number {
        // Check for explicit file mentions
        const fileMatches = text.match(/\b\d+\s+files?\b/i);
        if (fileMatches) {
            const count = parseInt(fileMatches[0], 10);
            if (!isNaN(count)) return count;
        }

        // Estimate based on task type
        if (text.includes('refactor') || text.includes('rename')) return 3;
        if (text.includes('component')) return 2; // Component + test
        if (text.includes('service')) return 2; // Service + test
        return 1;
    }

    /**
     * Apply complexity multipliers to base estimate
     */
    private applyComplexityMultipliers(baseMinutes: number, factors: ComplexityFactors): number {
        let result = baseMinutes;

        // Code complexity multiplier (1.0 to 2.0)
        result *= 1 + (factors.codeComplexity - 1) * 0.25;

        // File count multiplier
        result *= 1 + (factors.fileCount - 1) * 0.3;

        // Dependency multiplier
        result *= 1 + factors.dependencyCount * 0.1;

        // UI multiplier (UI work takes longer)
        if (factors.hasUI) result *= 1.2;

        // External API multiplier
        if (factors.hasExternalAPI) result *= 1.3;

        return result;
    }

    /**
     * Calculate time breakdown
     */
    private calculateBreakdown(totalMinutes: number, factors: ComplexityFactors): EstimationBreakdown {
        // Base ratios
        let implementationRatio = 0.6;
        let testingRatio = factors.requiresTests ? 0.25 : 0;
        let documentationRatio = 0.1;
        let reviewRatio = 0.05;

        // Adjust for complexity
        if (factors.codeComplexity >= 4) {
            implementationRatio += 0.1;
            testingRatio += 0.05;
        }

        // Normalize to 1.0
        const total = implementationRatio + testingRatio + documentationRatio + reviewRatio;
        
        return {
            implementation: Math.round(totalMinutes * (implementationRatio / total)),
            testing: Math.round(totalMinutes * (testingRatio / total)),
            documentation: Math.round(totalMinutes * (documentationRatio / total)),
            review: Math.round(totalMinutes * (reviewRatio / total))
        };
    }

    /**
     * Calculate confidence level
     */
    private calculateConfidence(factors: ComplexityFactors): number {
        let confidence = 0.8; // Base confidence

        // Reduce for complexity
        confidence -= (factors.codeComplexity - 2) * 0.1;

        // Reduce for uncertainty
        confidence -= factors.uncertainty * 0.2;

        // Reduce for external dependencies
        if (factors.hasExternalAPI) confidence -= 0.1;

        // Increase if we have historical data
        if (this.historicalData.length > 10) confidence += 0.1;

        return Math.max(0.3, Math.min(0.95, confidence));
    }

    /**
     * Generate warnings
     */
    private generateWarnings(factors: ComplexityFactors, estimateMinutes: number): string[] {
        const warnings: string[] = [];

        if (factors.codeComplexity >= 4) {
            warnings.push('High complexity - consider breaking into smaller tasks');
        }

        if (factors.hasExternalAPI) {
            warnings.push('External API integration - may vary based on API reliability');
        }

        if (factors.fileCount > 3) {
            warnings.push('Multiple files - consider if this should be multiple tasks');
        }

        if (factors.uncertainty > 0.4) {
            warnings.push('High uncertainty - estimate may vary significantly');
        }

        if (estimateMinutes === this.config.maxMinutes) {
            warnings.push('Task at maximum duration - consider splitting');
        }

        return warnings;
    }

    /**
     * Add historical data point for calibration
     */
    addHistoricalData(data: HistoricalDataPoint): void {
        this.historicalData.push(data);
        this.recalibrate();
    }

    /**
     * Recalibrate based on historical data
     */
    private recalibrate(): void {
        if (this.historicalData.length < 5) return;

        // Calculate average ratio of actual/estimated
        const ratios = this.historicalData.map(d => d.actual / d.estimated);
        const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;

        // Apply smoothing (don't change too drastically)
        this.calibrationFactor = this.calibrationFactor * 0.7 + avgRatio * 0.3;
        
        // Clamp to reasonable range
        this.calibrationFactor = Math.max(0.5, Math.min(2.0, this.calibrationFactor));

        logInfo(`[EffortEstimator] Recalibrated with factor: ${this.calibrationFactor.toFixed(2)}`);
    }

    /**
     * Format estimate for display
     */
    formatEstimate(result: EstimationResult): string {
        const { estimateMinutes, minMinutes, maxMinutes, confidence } = result;
        
        if (minMinutes === maxMinutes) {
            return `${estimateMinutes} minutes`;
        }

        const confPct = Math.round(confidence * 100);
        return `${estimateMinutes} minutes (${minMinutes}-${maxMinutes}, ${confPct}% confidence)`;
    }

    /**
     * Get estimation statistics
     */
    getStatistics(): { avgAccuracy: number; dataPoints: number; calibration: number } {
        if (this.historicalData.length === 0) {
            return { avgAccuracy: 0, dataPoints: 0, calibration: this.calibrationFactor };
        }

        const accuracies = this.historicalData.map(d => {
            const error = Math.abs(d.actual - d.estimated) / d.estimated;
            return 1 - Math.min(1, error);
        });

        const avgAccuracy = accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length;

        return {
            avgAccuracy: Math.round(avgAccuracy * 100) / 100,
            dataPoints: this.historicalData.length,
            calibration: Math.round(this.calibrationFactor * 100) / 100
        };
    }
}

// Singleton instance
let instance: EffortEstimator | null = null;

/**
 * Get the singleton EffortEstimator
 */
export function getEffortEstimator(): EffortEstimator {
    if (!instance) {
        instance = new EffortEstimator();
    }
    return instance;
}

/**
 * Reset the singleton for testing
 */
export function resetEffortEstimatorForTests(): void {
    instance = null;
}
