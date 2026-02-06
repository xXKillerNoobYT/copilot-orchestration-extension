/**
 * Planning Agent - Main Orchestrator
 * 
 * **Simple explanation**: This is the "brain" of the Planning Team. It
 * coordinates all the other components (analysis, vagueness detection,
 * decomposition, handoff) to turn requirements into executable tasks.
 * 
 * @module agents/planning/index
 */

import { logInfo, logWarn, logError } from '../../logger';
import { RequirementAnalyzer, getRequirementAnalyzer, type AnalysisResult } from './analysis';
import { VaguenessDetector, getVaguenessDetector, type VaguenessAnalysis } from './vagueness';
import { TaskDecomposer, getTaskDecomposer, type AtomicTask, type DecompositionResult } from './decomposer';
import { PRDParser, getPRDParser, type ParsedPRD, type PRDFeature } from './prdParser';
import { HandoffManager, getHandoffManager, type HandoffPackage, type HandoffResult } from './handoff';

// Re-export types for convenience
export type {
    AnalysisResult,
    VaguenessAnalysis,
    AtomicTask,
    DecompositionResult,
    ParsedPRD,
    PRDFeature,
    HandoffPackage,
    HandoffResult
};

/**
 * Planning Agent configuration
 */
export interface PlanningAgentConfig {
    /** Vagueness threshold (0-100) */
    vaguenessThreshold: number;
    /** Whether to auto-handoff after planning */
    autoHandoff: boolean;
    /** Max tasks per feature */
    maxTasksPerFeature: number;
    /** Min task duration in minutes */
    minTaskDuration: number;
    /** Max task duration in minutes */
    maxTaskDuration: number;
}

const DEFAULT_CONFIG: PlanningAgentConfig = {
    vaguenessThreshold: 70,
    autoHandoff: true,
    maxTasksPerFeature: 20,
    minTaskDuration: 15,
    maxTaskDuration: 60
};

/**
 * Complete planning result
 */
export interface PlanningResult {
    /** Analysis of the requirement */
    analysis: AnalysisResult;
    /** Vagueness check result */
    vaguenessCheck: VaguenessAnalysis;
    /** Decomposed tasks by feature */
    decompositions: DecompositionResult[];
    /** Handoff result (if executed) */
    handoff?: HandoffResult;
    /** Overall planning status */
    status: 'complete' | 'needs_clarification' | 'failed';
    /** Total tasks generated */
    totalTasks: number;
    /** Total estimated time */
    totalEstimateMinutes: number;
    /** Planning errors */
    errors: string[];
    /** Planning timestamp */
    timestamp: Date;
}

/**
 * PlanningAgent class - Main entry point for planning operations
 * 
 * **Simple explanation**: Like a project manager that takes your idea,
 * makes sure it's clear, breaks it into tasks, and assigns them to be done.
 */
export class PlanningAgent {
    private config: PlanningAgentConfig;
    private analyzer: RequirementAnalyzer;
    private vaguenessDetector: VaguenessDetector;
    private decomposer: TaskDecomposer;
    private prdParser: PRDParser;
    private handoffManager: HandoffManager;
    private isInitialized: boolean;

    constructor(config: Partial<PlanningAgentConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.analyzer = getRequirementAnalyzer();
        this.vaguenessDetector = getVaguenessDetector();
        this.decomposer = getTaskDecomposer();
        this.prdParser = getPRDParser();
        this.handoffManager = getHandoffManager();
        this.isInitialized = false;
    }

    /**
     * Initialize the Planning Agent
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            logWarn('[PlanningAgent] Already initialized');
            return;
        }

        logInfo('[PlanningAgent] Initializing...');
        this.vaguenessDetector.setThreshold(this.config.vaguenessThreshold);
        this.isInitialized = true;
        logInfo('[PlanningAgent] Initialized successfully');
    }

    /**
     * Plan from a text requirement
     * 
     * @param requirement - The requirement text
     * @param context - Optional additional context
     * @param ticketId - Optional ticket to update with clarification
     * @returns Complete planning result
     */
    async planFromRequirement(
        requirement: string,
        context?: string,
        ticketId?: string
    ): Promise<PlanningResult> {
        logInfo('[PlanningAgent] Starting planning from requirement');
        const errors: string[] = [];

        // Check if we can invoke planning
        if (!this.handoffManager.canInvokePlanning()) {
            logWarn('[PlanningAgent] Planning blocked - active handoff exists');
            return this.createFailedResult('Planning Team cannot be called after handoff', errors);
        }

        try {
            // Step 1: Analyze requirement
            logInfo('[PlanningAgent] Step 1: Analyzing requirement');
            const analysis = await this.analyzer.analyze(requirement, context);

            // Step 2: Check for vagueness
            logInfo('[PlanningAgent] Step 2: Checking for vagueness');
            const vaguenessCheck = await this.vaguenessDetector.detect(requirement, ticketId);

            // If too vague, stop and request clarification
            if (vaguenessCheck.requiresClarification) {
                logInfo(`[PlanningAgent] Requirement needs clarification (score: ${vaguenessCheck.overallScore})`);
                return {
                    analysis,
                    vaguenessCheck,
                    decompositions: [],
                    status: 'needs_clarification',
                    totalTasks: 0,
                    totalEstimateMinutes: 0,
                    errors,
                    timestamp: new Date()
                };
            }

            // Step 3: Decompose each feature into tasks
            logInfo(`[PlanningAgent] Step 3: Decomposing ${analysis.features.length} features`);
            const decompositions: DecompositionResult[] = [];

            for (const feature of analysis.features) {
                try {
                    const decomp = await this.decomposer.decompose(
                        {
                            id: feature.id,
                            description: feature.description,
                            isUI: feature.isUI,
                            sourceText: feature.sourceText
                        },
                        context
                    );
                    decompositions.push(decomp);
                } catch (error: unknown) {
                    const msg = error instanceof Error ? error.message : String(error);
                    errors.push(`Failed to decompose feature ${feature.id}: ${msg}`);
                }
            }

            // Calculate totals
            const totalTasks = decompositions.reduce((sum, d) => sum + d.tasks.length, 0);
            const totalEstimate = decompositions.reduce((sum, d) => sum + d.totalEstimateMinutes, 0);

            logInfo(`[PlanningAgent] Generated ${totalTasks} tasks, total estimate: ${totalEstimate} min`);

            // Step 4: Auto-handoff if configured
            let handoff: HandoffResult | undefined;
            if (this.config.autoHandoff && decompositions.length > 0) {
                logInfo('[PlanningAgent] Step 4: Executing handoff to Orchestrator');
                const pkg = this.handoffManager.createHandoffPackage(decompositions);
                handoff = await this.handoffManager.executeHandoff(pkg);

                if (!handoff.success) {
                    errors.push(`Handoff failed: ${handoff.error}`);
                }
            }

            return {
                analysis,
                vaguenessCheck,
                decompositions,
                handoff,
                status: 'complete',
                totalTasks,
                totalEstimateMinutes: totalEstimate,
                errors,
                timestamp: new Date()
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[PlanningAgent] Planning failed: ${msg}`);
            return this.createFailedResult(msg, errors);
        }
    }

    /**
     * Plan from a PRD file
     * 
     * @param prdPath - Path to PRD.json file
     * @param context - Optional additional context
     * @returns Complete planning result
     */
    async planFromPRD(prdPath?: string, context?: string): Promise<PlanningResult> {
        logInfo('[PlanningAgent] Starting planning from PRD');
        const errors: string[] = [];

        // Check if we can invoke planning
        if (!this.handoffManager.canInvokePlanning()) {
            logWarn('[PlanningAgent] Planning blocked - active handoff exists');
            return this.createFailedResult('Planning Team cannot be called after handoff', errors);
        }

        try {
            // Parse PRD
            const prd = await this.prdParser.parse(prdPath);

            if (prd.parseErrors.length > 0) {
                errors.push(...prd.parseErrors);
            }

            // Get features that need planning
            const features = this.prdParser.getFeaturesForPlanning(prd);

            if (features.length === 0) {
                logWarn('[PlanningAgent] No features to plan');
                return this.createFailedResult('No features found in PRD', errors);
            }

            logInfo(`[PlanningAgent] Found ${features.length} features to plan`);

            // Create synthetic analysis result
            const analysis: AnalysisResult = {
                features: features.map(f => ({
                    id: f.id,
                    description: `${f.name}: ${f.description}`,
                    isUI: this.isUIFeature(f.name, f.description),
                    sourceText: f.description
                })),
                constraints: [],
                dependencies: [],
                unclearItems: [],
                clarityScore: 80, // PRD features are assumed to be clearer
                rawAnalysis: '',
                timestamp: new Date()
            };

            // Create synthetic vagueness check (PRD is pre-validated)
            const vaguenessCheck: VaguenessAnalysis = {
                originalText: prd.description,
                overallScore: 80,
                items: [],
                requiresClarification: false,
                timestamp: new Date()
            };

            // Decompose each feature
            const decompositions: DecompositionResult[] = [];
            for (const feature of features) {
                try {
                    const decomp = await this.decomposer.decompose(
                        {
                            id: feature.id,
                            description: `${feature.name}: ${feature.description}`,
                            isUI: this.isUIFeature(feature.name, feature.description),
                            sourceText: feature.description
                        },
                        context
                    );
                    decompositions.push(decomp);
                } catch (error: unknown) {
                    const msg = error instanceof Error ? error.message : String(error);
                    errors.push(`Failed to decompose feature ${feature.id}: ${msg}`);
                }
            }

            const totalTasks = decompositions.reduce((sum, d) => sum + d.tasks.length, 0);
            const totalEstimate = decompositions.reduce((sum, d) => sum + d.totalEstimateMinutes, 0);

            // Auto-handoff
            let handoff: HandoffResult | undefined;
            if (this.config.autoHandoff && decompositions.length > 0) {
                const pkg = this.handoffManager.createHandoffPackage(decompositions, prd);
                handoff = await this.handoffManager.executeHandoff(pkg);

                if (!handoff.success) {
                    errors.push(`Handoff failed: ${handoff.error}`);
                }
            }

            return {
                analysis,
                vaguenessCheck,
                decompositions,
                handoff,
                status: 'complete',
                totalTasks,
                totalEstimateMinutes: totalEstimate,
                errors,
                timestamp: new Date()
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[PlanningAgent] PRD planning failed: ${msg}`);
            return this.createFailedResult(msg, errors);
        }
    }

    /**
     * Check if a feature is UI-related
     */
    private isUIFeature(name: string, description: string): boolean {
        const uiKeywords = ['ui', 'interface', 'button', 'form', 'page', 'screen',
            'display', 'view', 'component', 'modal', 'sidebar', 'panel', 'webview'];
        const text = `${name} ${description}`.toLowerCase();
        return uiKeywords.some(kw => text.includes(kw));
    }

    /**
     * Create a failed result
     */
    private createFailedResult(error: string, previousErrors: string[]): PlanningResult {
        return {
            analysis: {
                features: [],
                constraints: [],
                dependencies: [],
                unclearItems: [],
                clarityScore: 0,
                rawAnalysis: '',
                timestamp: new Date()
            },
            vaguenessCheck: {
                originalText: '',
                overallScore: 0,
                items: [],
                requiresClarification: false,
                timestamp: new Date()
            },
            decompositions: [],
            status: 'failed',
            totalTasks: 0,
            totalEstimateMinutes: 0,
            errors: [...previousErrors, error],
            timestamp: new Date()
        };
    }

    /**
     * Quick check if requirement needs clarification
     */
    quickClarityCheck(requirement: string): boolean {
        return this.analyzer.quickClarityCheck(requirement);
    }

    /**
     * Check if planning is blocked
     */
    isPlanningBlocked(): boolean {
        return !this.handoffManager.canInvokePlanning();
    }

    /**
     * Get active handoff
     */
    getActiveHandoff(): HandoffPackage | null {
        return this.handoffManager.getActiveHandoff();
    }

    /**
     * Reset for new planning session (clears handoff block)
     */
    reset(): void {
        this.handoffManager.clearHandoff();
        logInfo('[PlanningAgent] Reset for new planning session');
    }

    /**
     * Shutdown the agent
     */
    async shutdown(): Promise<void> {
        logInfo('[PlanningAgent] Shutting down');
        this.isInitialized = false;
    }
}

// Singleton instance
let planningAgentInstance: PlanningAgent | null = null;

/**
 * Initialize the Planning Agent
 */
export async function initializePlanningAgent(
    config?: Partial<PlanningAgentConfig>
): Promise<void> {
    if (planningAgentInstance !== null) {
        throw new Error('PlanningAgent already initialized');
    }
    planningAgentInstance = new PlanningAgent(config);
    await planningAgentInstance.initialize();
}

/**
 * Get the Planning Agent instance
 */
export function getPlanningAgent(): PlanningAgent {
    if (!planningAgentInstance) {
        throw new Error('PlanningAgent not initialized. Call initializePlanningAgent() first.');
    }
    return planningAgentInstance;
}

/**
 * Reset Planning Agent for tests
 */
export function resetPlanningAgentForTests(): void {
    planningAgentInstance = null;
}

// Re-export sub-module getters
export { getRequirementAnalyzer, resetRequirementAnalyzerForTests } from './analysis';
export { getVaguenessDetector, resetVaguenessDetectorForTests } from './vagueness';
export { getTaskDecomposer, resetTaskDecomposerForTests } from './decomposer';
export { getPRDParser, resetPRDParserForTests } from './prdParser';
export { getHandoffManager, resetHandoffManagerForTests } from './handoff';

// New modules from Stage 4
export * from './acceptanceCriteria';
export * from './planValidator';
export * from './prompts';
export * from './patterns';
export * from './context';
export * from './estimation';
export * from './priority';
export * from './zenTasks';
export * from './tasksync';
