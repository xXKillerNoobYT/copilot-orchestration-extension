/**
 * Planning Module Index (MT-033.46-50)
 *
 * **Simple explanation**: Central export point for all planning functionality.
 * Import from this file to access any planning feature.
 *
 * @module planning/index
 */

import * as crypto from 'crypto';

// ============================================================================
// Core Types
// ============================================================================

export {
    CompletePlan,
    ProjectOverview,
    FeatureBlock,
    BlockLink,
    DeveloperStory,
    UserStory,
    SuccessCriterion,
    WizardState,
} from './types';

// ============================================================================
// Schema Validation
// ============================================================================

export {
    CompletePlanSchema,
    ProjectOverviewSchema,
    FeatureBlockSchema,
    BlockLinkSchema,
    DeveloperStorySchema,
    UserStorySchema,
    SuccessCriterionSchema,
    validatePlan,
    validatePartialPlan,
    PLAN_CONSTRAINTS,
} from './schema';

// ============================================================================
// Planning Service
// ============================================================================

// Note: planningService to be created when service layer is implemented

// ============================================================================
// Orchestrator Integration
// ============================================================================

export {
    submitPlanToOrchestrator,
    startExecution,
    pauseExecution,
    resumeExecution,
    cancelExecution,
    updateTaskProgress,
    getNextTasks,
    getBlockedTasks,
    calculateProgress,
    renderProgressSummary,
    ExecutionPlan,
    ExecutionTask,
    PlanExecutionConfig,
    PlanSubmissionResult,
    TaskProgressUpdate,
    ExecutionProgress,
    TaskStatus,
    DEFAULT_EXECUTION_CONFIG,
} from './orchestratorIntegration';

// ============================================================================
// Error Handling
// ============================================================================

export {
    PlanErrorHandler,
    validatePlanWithErrors,
    renderErrorList,
    getErrorStyles,
    getErrorHandler,
    resetErrorHandler,
    PlanError,
    PlanErrorCode,
    ErrorSeverity,
    ErrorLocation,
    ErrorSuggestion,
    ErrorRecovery,
} from './errorHandler';

// ============================================================================
// Drift Detection
// ============================================================================

export {
    detectDrift,
    renderDriftReport,
    getDriftStyles,
    DriftReport,
    DriftFinding,
    DriftStatus,
    DriftType,
    DriftSubject,
    DriftSummary,
    DriftMonitorConfig,
    CodebaseMarkers,
    DEFAULT_DRIFT_CONFIG,
} from './driftDetection';

// ============================================================================
// Documentation Sync
// ============================================================================

export {
    generateDocumentation,
    checkDocumentationSync,
    renderSyncStatus,
    DocumentationConfig,
    GeneratedDoc,
    SyncStatus,
    DEFAULT_DOC_CONFIG,
} from './documentationSync';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create an empty plan with defaults.
 */
export function createEmptyPlan(): CompletePlan {
    const now = new Date();
    return {
        metadata: {
            id: generateId('plan'),
            name: 'New Plan',
            createdAt: now,
            updatedAt: now,
            version: 1,
        },
        overview: {
            name: '',
            description: '',
            goals: [],
        },
        featureBlocks: [],
        blockLinks: [],
        conditionalLogic: [],
        developerStories: [],
        userStories: [],
        successCriteria: [],
    };
}

/**
 * Create a feature block with defaults.
 */
export function createFeatureBlock(name: string, priority: 'critical' | 'high' | 'medium' | 'low' = 'medium'): FeatureBlock {
    return {
        id: generateId('feature'),
        name,
        description: '',
        purpose: '',
        acceptanceCriteria: [],
        technicalNotes: '',
        priority,
        order: 0,
    };
}

/**
 * Create a block link.
 */
export function createBlockLink(
    sourceBlockId: string,
    targetBlockId: string,
    dependencyType: 'requires' | 'blocks' | 'suggests' = 'requires'
): BlockLink {
    return {
        id: generateId('link'),
        sourceBlockId,
        targetBlockId,
        dependencyType,
    };
}

/**
 * Create a developer story.
 */
export function createDeveloperStory(action: string, benefit: string): DeveloperStory {
    return {
        id: generateId('devstory'),
        action,
        benefit,
        technicalRequirements: [],
        apiNotes: '',
        databaseNotes: '',
        estimatedHours: 0,
        relatedBlockIds: [],
        relatedTaskIds: [],
    };
}

/**
 * Create a user story.
 */
export function createUserStory(userType: string, action: string, benefit: string): UserStory {
    return {
        id: generateId('userstory'),
        userType,
        action,
        benefit,
        relatedBlockIds: [],
        acceptanceCriteria: [],
        priority: 'medium',
    };
}

/**
 * Create a success criterion.
 */
export function createSuccessCriterion(description: string): SuccessCriterion {
    return {
        id: generateId('criterion'),
        description,
        smartAttributes: {
            specific: false,
            measurable: false,
            achievable: false,
            relevant: false,
            timeBound: false,
        },
        relatedFeatureIds: [],
        relatedStoryIds: [],
        testable: false,
        priority: 'medium',
    };
}

// ============================================================================
// Version Info
// ============================================================================

/**
 * Planning module version.
 */
export const PLANNING_VERSION = '1.0.0';

/**
 * Get planning module info.
 */
export function getPlanningInfo(): {
    version: string;
    modules: string[];
    capabilities: string[];
} {
    return {
        version: PLANNING_VERSION,
        modules: [
            'types',
            'schema',
            'planningService',
            'orchestratorIntegration',
            'errorHandler',
            'driftDetection',
            'documentationSync',
        ],
        capabilities: [
            'Plan creation and validation',
            'Feature block management',
            'Dependency tracking',
            'Orchestrator integration',
            'Error handling with auto-fix',
            'Drift detection',
            'Documentation sync',
        ],
    };
}

// ============================================================================
// Internal Helpers
// ============================================================================

import { CompletePlan, FeatureBlock, BlockLink, DeveloperStory, UserStory, SuccessCriterion, PlanMetadata } from './types';

function generateId(_prefix: string): string {
    return crypto.randomUUID();
}
