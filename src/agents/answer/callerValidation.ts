/**
 * Caller Validation for Answer Team
 * 
 * MT-014.11: Enforces invoke_trigger validation to ensure only
 * the Coding AI can invoke askQuestion.
 * 
 * **Simple explanation**: A security guard that checks who's calling.
 * Only the Coding AI is allowed to ask questions - anyone else gets
 * rejected with a clear error message.
 * 
 * @module agents/answer/callerValidation
 */

import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { logInfo, logWarn, logError } from '../../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Valid caller identifiers
 */
export enum ValidCaller {
    CODING_AI = 'coding_ai',
    CODING_AI_AGENT = 'coding_ai_agent',
    COPILOT_CODING = 'copilot_coding',
    VSCODE_COPILOT = 'vscode_copilot'
}

/**
 * Invoke trigger modes (from config)
 */
export enum InvokeTrigger {
    CODING_AI_ONLY = 'coding_ai_only',
    ANY_AGENT = 'any_agent',
    MANUAL_ONLY = 'manual_only'
}

/**
 * Validation result
 */
export interface CallerValidationResult {
    allowed: boolean;
    caller: string;
    invokeTrigger: InvokeTrigger;
    reason?: string;
    errorCode?: string;
}

/**
 * Request context for validation
 */
export interface RequestContext {
    /** Caller identifier from request headers/metadata */
    callerId?: string;
    /** Agent name if called by another agent */
    callerAgent?: string;
    /** Source type (mcp, internal, manual) */
    sourceType?: 'mcp' | 'internal' | 'manual';
    /** Session ID if available */
    sessionId?: string;
}

// ============================================================================
// CallerValidator Class
// ============================================================================

/**
 * Validates that only authorized callers can invoke answer team functions.
 * 
 * **Simple explanation**: Checks ID badges before letting anyone through.
 * The config file says who's allowed, and this class enforces it.
 */
export class CallerValidator {
    private invokeTrigger: InvokeTrigger = InvokeTrigger.CODING_AI_ONLY;
    private allowedCallers: Set<string> = new Set();
    private configLoaded: boolean = false;
    
    /**
     * Initialize validator with workspace path
     */
    public async initialize(workspacePath?: string): Promise<void> {
        await this.loadConfig(workspacePath);
        this.setupAllowedCallers();
        this.configLoaded = true;
    }

    /**
     * Load configuration from answer-team config.yaml
     */
    private async loadConfig(workspacePath?: string): Promise<void> {
        const configPath = workspacePath
            ? path.join(workspacePath, '.coe', 'agents', 'answer-team', 'config.yaml')
            : path.join(process.cwd(), '.coe', 'agents', 'answer-team', 'config.yaml');

        try {
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf-8');
                const config = yaml.load(content) as Record<string, unknown>;
                
                if (config?.invoke_trigger) {
                    const trigger = String(config.invoke_trigger);
                    if (Object.values(InvokeTrigger).includes(trigger as InvokeTrigger)) {
                        this.invokeTrigger = trigger as InvokeTrigger;
                        logInfo(`[CallerValidator] Loaded invoke_trigger: ${this.invokeTrigger}`);
                    } else {
                        logWarn(`[CallerValidator] Invalid invoke_trigger: ${trigger}, using default`);
                    }
                }
            } else {
                logInfo(`[CallerValidator] Config not found, using default (coding_ai_only)`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[CallerValidator] Failed to load config: ${msg}`);
        }
    }

    /**
     * Setup the set of allowed callers based on invoke_trigger
     */
    private setupAllowedCallers(): void {
        this.allowedCallers.clear();

        switch (this.invokeTrigger) {
            case InvokeTrigger.CODING_AI_ONLY:
                // Only coding AI variants are allowed
                this.allowedCallers.add(ValidCaller.CODING_AI);
                this.allowedCallers.add(ValidCaller.CODING_AI_AGENT);
                this.allowedCallers.add(ValidCaller.COPILOT_CODING);
                this.allowedCallers.add(ValidCaller.VSCODE_COPILOT);
                break;

            case InvokeTrigger.ANY_AGENT:
                // Any agent can call
                // Don't add specific entries - validate by checking sourceType instead
                break;

            case InvokeTrigger.MANUAL_ONLY:
                // No programmatic callers allowed
                break;
        }
    }

    /**
     * Validate a request caller
     * 
     * @param context - Request context with caller information
     * @returns Validation result
     */
    public validate(context: RequestContext): CallerValidationResult {
        if (!this.configLoaded) {
            // Lazy initialization with defaults
            this.setupAllowedCallers();
            this.configLoaded = true;
        }

        const caller = context.callerId || context.callerAgent || 'unknown';

        // Manual mode check
        if (this.invokeTrigger === InvokeTrigger.MANUAL_ONLY) {
            if (context.sourceType !== 'manual') {
                return {
                    allowed: false,
                    caller,
                    invokeTrigger: this.invokeTrigger,
                    reason: 'Answer Team is configured for manual invocation only',
                    errorCode: 'E_MANUAL_ONLY'
                };
            }
            return {
                allowed: true,
                caller,
                invokeTrigger: this.invokeTrigger
            };
        }

        // Any agent mode
        if (this.invokeTrigger === InvokeTrigger.ANY_AGENT) {
            // Allow if it's from MCP or internal
            if (context.sourceType === 'mcp' || context.sourceType === 'internal') {
                return {
                    allowed: true,
                    caller,
                    invokeTrigger: this.invokeTrigger
                };
            }
        }

        // Coding AI only mode (default)
        if (this.invokeTrigger === InvokeTrigger.CODING_AI_ONLY) {
            // Check if caller is in allowed list
            const normalizedCaller = caller.toLowerCase().replace(/[-_\s]/g, '_');
            
            // Check direct match
            if (this.allowedCallers.has(normalizedCaller)) {
                logInfo(`[CallerValidator] Caller ${caller} allowed (direct match)`);
                return {
                    allowed: true,
                    caller,
                    invokeTrigger: this.invokeTrigger
                };
            }

            // Check if caller contains coding_ai pattern
            const isCodingAI = normalizedCaller.includes('coding_ai') ||
                             normalizedCaller.includes('copilot') ||
                             context.callerAgent?.toLowerCase().includes('coding');

            if (isCodingAI) {
                logInfo(`[CallerValidator] Caller ${caller} allowed (pattern match)`);
                return {
                    allowed: true,
                    caller,
                    invokeTrigger: this.invokeTrigger
                };
            }

            // Not allowed
            logWarn(`[CallerValidator] Caller ${caller} rejected - not a Coding AI`);
            return {
                allowed: false,
                caller,
                invokeTrigger: this.invokeTrigger,
                reason: `Only Coding AI can invoke askQuestion. Received call from: ${caller}`,
                errorCode: 'E_UNAUTHORIZED_CALLER'
            };
        }

        // Default deny
        return {
            allowed: false,
            caller,
            invokeTrigger: this.invokeTrigger,
            reason: 'Request denied by caller validation',
            errorCode: 'E_VALIDATION_FAILED'
        };
    }

    /**
     * Get the current invoke trigger setting
     */
    public getInvokeTrigger(): InvokeTrigger {
        return this.invokeTrigger;
    }

    /**
     * Set invoke trigger (for testing or runtime override)
     */
    public setInvokeTrigger(trigger: InvokeTrigger): void {
        this.invokeTrigger = trigger;
        this.setupAllowedCallers();
        logInfo(`[CallerValidator] Override invoke_trigger to: ${trigger}`);
    }

    /**
     * Check if a specific caller ID is allowed
     */
    public isCallerAllowed(callerId: string): boolean {
        return this.validate({ callerId }).allowed;
    }
}

// ============================================================================
// Factory Function
// ============================================================================

let validatorInstance: CallerValidator | null = null;

/**
 * Get or create the CallerValidator singleton
 */
export function getCallerValidator(): CallerValidator {
    if (!validatorInstance) {
        validatorInstance = new CallerValidator();
    }
    return validatorInstance;
}

/**
 * Initialize the caller validator with workspace path
 */
export async function initializeCallerValidator(workspacePath?: string): Promise<CallerValidator> {
    const validator = getCallerValidator();
    await validator.initialize(workspacePath);
    return validator;
}

/**
 * Reset validator instance (for testing)
 */
export function resetCallerValidator(): void {
    validatorInstance = null;
}

/**
 * Quick validation check
 */
export function validateCaller(context: RequestContext): CallerValidationResult {
    return getCallerValidator().validate(context);
}
