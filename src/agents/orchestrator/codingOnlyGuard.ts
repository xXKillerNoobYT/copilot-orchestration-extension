/**
 * Coding-Only Guard for Orchestrator
 * 
 * MT-013.6: Enforces the coding_only flag by rejecting planning requests.
 * The Orchestrator only handles coding workflow - planning is done by Planning Team.
 * 
 * **Simple explanation**: A bouncer that only lets coding tasks through.
 * If someone tries to ask the Orchestrator to do planning, it politely
 * redirects them to the Planning Team.
 * 
 * @module agents/orchestrator/codingOnlyGuard
 */

import { logWarn, logInfo } from '../../logger';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================================================
// Types
// ============================================================================

/**
 * Request types that the Orchestrator handles
 */
export type AllowedRequestType =
    | 'getNextTask'
    | 'reportTaskDone'
    | 'taskStatus'
    | 'queueStats'
    | 'routeToCodingAI'
    | 'routeToVerification';

/**
 * Request types that should be rejected (planning-related)
 */
export type RejectedRequestType =
    | 'createPlan'
    | 'analyzePRD'
    | 'decomposeTasks'
    | 'generateAcceptanceCriteria'
    | 'planProject'
    | 'estimateEffort';

/**
 * Guard result
 */
export interface GuardResult {
    allowed: boolean;
    requestType: string;
    message: string;
    reason?: string;  // Alias for message for compatibility
    redirectTo?: string;
}

/**
 * Request object that can be passed to checkRequest
 */
export interface RequestObject {
    method: string;
    body?: { content?: string };
}

/**
 * Orchestrator config from YAML
 */
interface OrchestratorConfig {
    settings?: {
        coding_only?: boolean;
    };
}

// ============================================================================
// Constants
// ============================================================================

const PLANNING_REQUEST_PATTERNS = [
    /^plan/i,
    /^create.*plan/i,
    /^analyze.*prd/i,
    /^decompose/i,
    /^generate.*criteria/i,
    /^estimate.*effort/i,
    /^break.*down/i,
    /requirements.*analysis/i,
    /task.*generation/i
];

const ALLOWED_REQUESTS: Set<AllowedRequestType> = new Set([
    'getNextTask',
    'reportTaskDone',
    'taskStatus',
    'queueStats',
    'routeToCodingAI',
    'routeToVerification'
]);

// ============================================================================
// CodingOnlyGuard Class
// ============================================================================

/**
 * Guard that enforces coding_only mode for the Orchestrator.
 * 
 * **Simple explanation**: The gatekeeper that ensures the Orchestrator
 * sticks to its job (coding workflow) and doesn't try to do planning.
 */
export class CodingOnlyGuard {
    private codingOnly: boolean = true;
    private configPath: string;

    constructor(configPath?: string) {
        this.configPath = configPath || path.join(
            process.cwd(),
            '.coe',
            'agents',
            'orchestrator',
            'config.yaml'
        );
        this.loadConfig();
    }

    /**
     * Load configuration from YAML
     */
    private loadConfig(): void {
        try {
            if (fs.existsSync(this.configPath)) {
                const content = fs.readFileSync(this.configPath, 'utf-8');
                const config = yaml.load(content) as OrchestratorConfig;
                this.codingOnly = config?.settings?.coding_only ?? true;
                logInfo(`[CodingOnlyGuard] Loaded config: coding_only=${this.codingOnly}`);
            }
        } catch (error) {
            logWarn(`[CodingOnlyGuard] Could not load config, defaulting to coding_only=true`);
            this.codingOnly = true;
        }
    }

    /**
     * Enable or disable coding_only mode
     */
    public setEnabled(enabled: boolean): void {
        this.codingOnly = enabled;
        logInfo(`[CodingOnlyGuard] coding_only mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Check if a request is allowed
     * 
     * @param request - Type of request being made (string or object with method)
     * @returns Guard result indicating if request is allowed
     */
    public checkRequest(request: string | RequestObject): GuardResult {
        const requestType = typeof request === 'string' ? request : request.method;
        const requestBody = typeof request === 'object' ? request.body : undefined;
        // If coding_only is disabled, allow all requests
        if (!this.codingOnly) {
            return {
                allowed: true,
                requestType,
                message: 'coding_only mode disabled, all requests allowed',
                reason: 'coding_only mode disabled, all requests allowed'
            };
        }

        // Check for planning content in request body
        if (requestBody?.content && this.hasPlanningContent(requestBody.content)) {
            const msg = `Request contains planning-related content. coding_only mode is enabled.`;
            return {
                allowed: false,
                requestType,
                message: msg,
                reason: msg,
                redirectTo: 'planning-team'
            };
        }

        // Check if explicitly allowed
        if (ALLOWED_REQUESTS.has(requestType as AllowedRequestType)) {
            const msg = `Request type '${requestType}' is allowed for Orchestrator`;
            return {
                allowed: true,
                requestType,
                message: msg,
                reason: msg
            };
        }

        // Check against planning patterns
        if (this.isPlanningRequest(requestType)) {
            logWarn(`[CodingOnlyGuard] Rejected planning request: ${requestType}`);
            const msg = this.formatRejectionMessage(requestType);
            return {
                allowed: false,
                requestType,
                message: msg,
                reason: msg,
                redirectTo: 'planning-team'
            };
        }

        // Unknown request type - allow by default but log
        logInfo(`[CodingOnlyGuard] Unknown request type '${requestType}', allowing`);
        const msg = `Unknown request type '${requestType}' allowed (not a planning request)`;
        return {
            allowed: true,
            requestType,
            message: msg,
            reason: msg
        };
    }

    /**
     * Check if content contains planning-related keywords
     */
    private hasPlanningContent(content: string): boolean {
        const planningKeywords = [
            'create a plan',
            'make a plan',
            'planning session',
            'break down into tasks',
            'decompose',
            'generate acceptance criteria',
            'analyze requirements'
        ];
        const lowerContent = content.toLowerCase();
        return planningKeywords.some(kw => lowerContent.includes(kw));
    }

    /**
     * Check if request matches planning patterns
     */
    private isPlanningRequest(requestType: string): boolean {
        return PLANNING_REQUEST_PATTERNS.some(pattern => pattern.test(requestType));
    }

    /**
     * Format rejection message with helpful guidance
     */
    private formatRejectionMessage(requestType: string): string {
        return [
            `❌ Request '${requestType}' rejected by Orchestrator.`,
            '',
            'The Programming Orchestrator operates in coding_only mode.',
            'It handles task execution workflow, not planning.',
            '',
            '📋 For planning-related requests, use the Planning Team:',
            '   - Task decomposition',
            '   - Acceptance criteria generation',
            '   - PRD analysis',
            '   - Effort estimation',
            '',
            '🔧 The Orchestrator handles:',
            '   - getNextTask: Get next task for coding',
            '   - reportTaskDone: Report task completion',
            '   - taskStatus: Check task status',
            '   - routeToCodingAI: Route to GitHub Copilot',
            '   - routeToVerification: Trigger verification',
            '',
            'Redirecting to: planning-team'
        ].join('\n');
    }

    /**
     * Check if coding_only mode is enabled
     */
    public isCodingOnlyEnabled(): boolean {
        return this.codingOnly;
    }

    /**
     * Get list of allowed request types
     */
    public getAllowedRequestTypes(): AllowedRequestType[] {
        return Array.from(ALLOWED_REQUESTS);
    }
}

// ============================================================================
// Factory Function
// ============================================================================

let guardInstance: CodingOnlyGuard | null = null;

/**
 * Get or create the CodingOnlyGuard singleton
 */
export function getCodingOnlyGuard(): CodingOnlyGuard {
    if (!guardInstance) {
        guardInstance = new CodingOnlyGuard();
    }
    return guardInstance;
}

/**
 * Reset guard instance (for testing)
 */
export function resetCodingOnlyGuard(): void {
    guardInstance = null;
}

/**
 * Quick check if a request is allowed
 * 
 * @param request - Type of request (string or object with method)
 * @returns true if allowed, false if rejected
 */
export function isRequestAllowed(request: string | RequestObject): boolean {
    return getCodingOnlyGuard().checkRequest(request).allowed;
}
