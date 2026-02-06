/**
 * Pattern Recognition for Planning Team
 * 
 * **Simple explanation**: This module recognizes common software patterns
 * (like login systems, CRUD operations, etc.) and suggests standard
 * implementations - like having a cookbook of proven recipes.
 * 
 * @module agents/planning/patterns
 */

import { logInfo, logWarn } from '../../logger';

/**
 * Recognized pattern types
 */
export type PatternType =
    | 'crud'           // Create, Read, Update, Delete operations
    | 'authentication' // Login, logout, sessions
    | 'authorization'  // Permissions, roles
    | 'api'            // REST/GraphQL API endpoints
    | 'form'           // Form handling, validation
    | 'list-detail'    // List view with detail pages
    | 'search'         // Search functionality
    | 'pagination'     // List pagination
    | 'file-upload'    // File handling
    | 'notification'   // Alerts, toasts, emails
    | 'state-machine'  // Finite state workflows
    | 'singleton'      // Single instance pattern
    | 'observer'       // Event-based communication
    | 'factory'        // Object creation
    | 'repository'     // Data access layer
    | 'service'        // Business logic layer
    | 'cache'          // Caching layer
    | 'queue'          // Job/task queues
    | 'unknown';

/**
 * Pattern definition with implementation hints
 */
export interface PatternDefinition {
    /** Pattern type */
    type: PatternType;
    /** Human-readable name */
    name: string;
    /** Description */
    description: string;
    /** Trigger keywords that suggest this pattern */
    keywords: string[];
    /** Required components */
    requiredComponents: string[];
    /** Common file structure */
    suggestedFiles: string[];
    /** Implementation checklist */
    checklist: string[];
    /** Typical subtasks for this pattern */
    typicalTasks: string[];
    /** Estimated total time in minutes */
    estimatedMinutes: number;
}

/**
 * Pattern match result
 */
export interface PatternMatch {
    /** Matched pattern */
    pattern: PatternDefinition;
    /** Match confidence (0-1) */
    confidence: number;
    /** Keywords that triggered the match */
    matchedKeywords: string[];
    /** Suggested implementation approach */
    suggestedApproach: string;
}

/**
 * Pattern recognition result
 */
export interface PatternRecognitionResult {
    /** Input text analyzed */
    input: string;
    /** Matched patterns (sorted by confidence) */
    matches: PatternMatch[];
    /** Primary (most likely) pattern */
    primaryPattern: PatternMatch | null;
    /** Combined suggested tasks */
    suggestedTasks: string[];
    /** Recognition timestamp */
    timestamp: Date;
}

/**
 * Pattern library - built-in patterns
 */
const PATTERN_LIBRARY: PatternDefinition[] = [
    {
        type: 'crud',
        name: 'CRUD Operations',
        description: 'Create, Read, Update, Delete operations for an entity',
        keywords: ['create', 'read', 'update', 'delete', 'crud', 'add', 'remove', 'edit', 'list', 'entity', 'manage'],
        requiredComponents: ['Model/Schema', 'Service/Repository', 'API handlers', 'Validation'],
        suggestedFiles: [
            'src/models/{entity}.ts',
            'src/services/{entity}Service.ts',
            'src/handlers/{entity}Handlers.ts',
            'tests/{entity}.test.ts'
        ],
        checklist: [
            'Define entity schema/model',
            'Implement create operation with validation',
            'Implement read (single and list) operations',
            'Implement update operation with partial updates',
            'Implement delete operation (soft delete if needed)',
            'Add input validation',
            'Add error handling',
            'Write unit tests for each operation'
        ],
        typicalTasks: [
            'Define {entity} data model',
            'Implement create {entity}',
            'Implement read {entity} by ID',
            'Implement list {entities}',
            'Implement update {entity}',
            'Implement delete {entity}',
            'Add validation for {entity}',
            'Write tests for {entity} CRUD'
        ],
        estimatedMinutes: 180
    },
    {
        type: 'authentication',
        name: 'User Authentication',
        description: 'Login, logout, session management',
        keywords: ['login', 'logout', 'sign in', 'sign out', 'authenticate', 'auth', 'session', 'password', 'credential'],
        requiredComponents: ['Auth service', 'Token/session management', 'Password hashing', 'Login UI'],
        suggestedFiles: [
            'src/services/authService.ts',
            'src/handlers/authHandlers.ts',
            'src/middleware/authMiddleware.ts',
            'src/utils/password.ts'
        ],
        checklist: [
            'Implement login endpoint',
            'Implement logout endpoint',
            'Add password hashing',
            'Generate secure tokens',
            'Store and validate sessions',
            'Add auth middleware',
            'Handle remember me (if needed)',
            'Test authentication flows'
        ],
        typicalTasks: [
            'Create auth service skeleton',
            'Implement login logic',
            'Implement logout logic',
            'Add password hashing utilities',
            'Implement token generation',
            'Create auth middleware',
            'Write auth integration tests'
        ],
        estimatedMinutes: 240
    },
    {
        type: 'authorization',
        name: 'Authorization & Permissions',
        description: 'Role-based access control and permissions',
        keywords: ['permission', 'role', 'access', 'admin', 'authorize', 'rbac', 'acl', 'can', 'allow', 'deny'],
        requiredComponents: ['Role definitions', 'Permission checker', 'Authorization middleware'],
        suggestedFiles: [
            'src/services/permissionService.ts',
            'src/middleware/authorizationMiddleware.ts',
            'src/config/roles.ts'
        ],
        checklist: [
            'Define roles and permissions',
            'Implement permission checking logic',
            'Create authorization middleware',
            'Add role assignment to users',
            'Handle permission denied errors',
            'Test authorization rules'
        ],
        typicalTasks: [
            'Define role hierarchy',
            'Define permission types',
            'Implement permission checker',
            'Create authorization middleware',
            'Add permissions to routes',
            'Write authorization tests'
        ],
        estimatedMinutes: 120
    },
    {
        type: 'api',
        name: 'API Endpoint',
        description: 'REST or GraphQL API endpoint',
        keywords: ['api', 'endpoint', 'route', 'rest', 'graphql', 'request', 'response', 'get', 'post', 'put', 'patch'],
        requiredComponents: ['Route definition', 'Handler', 'Validation', 'Response formatting'],
        suggestedFiles: [
            'src/routes/{resource}.ts',
            'src/handlers/{resource}Handler.ts',
            'src/validators/{resource}Validator.ts'
        ],
        checklist: [
            'Define route path and method',
            'Implement request handler',
            'Add input validation',
            'Format response consistently',
            'Handle errors',
            'Add API documentation',
            'Write API tests'
        ],
        typicalTasks: [
            'Define route and HTTP method',
            'Implement handler function',
            'Add request validation',
            'Format response',
            'Add error handling',
            'Document endpoint',
            'Write API tests'
        ],
        estimatedMinutes: 90
    },
    {
        type: 'form',
        name: 'Form Handling',
        description: 'Form input, validation, and submission',
        keywords: ['form', 'input', 'validation', 'submit', 'field', 'error message', 'validate'],
        requiredComponents: ['Form component', 'Validation rules', 'Error display', 'Submit handler'],
        suggestedFiles: [
            'src/components/{form}Form.tsx',
            'src/validators/{form}Validator.ts',
            'src/hooks/useForm.ts'
        ],
        checklist: [
            'Create form component',
            'Add input fields',
            'Implement validation rules',
            'Display validation errors',
            'Handle form submission',
            'Add loading states',
            'Test form interactions'
        ],
        typicalTasks: [
            'Create form structure',
            'Add form fields',
            'Implement validation',
            'Add error display',
            'Handle submit',
            'Test form'
        ],
        estimatedMinutes: 120
    },
    {
        type: 'singleton',
        name: 'Singleton Service',
        description: 'Single instance service pattern',
        keywords: ['singleton', 'instance', 'service', 'global', 'shared', 'one instance'],
        requiredComponents: ['Private constructor', 'getInstance method', 'Reset for tests'],
        suggestedFiles: [
            'src/services/{name}Service.ts',
            'tests/{name}Service.test.ts'
        ],
        checklist: [
            'Create class with private constructor',
            'Add static getInstance method',
            'Implement initialization logic',
            'Add resetForTests method',
            'Handle async initialization',
            'Write tests with proper resets'
        ],
        typicalTasks: [
            'Create singleton class structure',
            'Implement initialization',
            'Add getInstance accessor',
            'Add test reset method',
            'Write unit tests'
        ],
        estimatedMinutes: 45
    },
    {
        type: 'observer',
        name: 'Event/Observer Pattern',
        description: 'Event-based communication between components',
        keywords: ['event', 'listener', 'emit', 'subscribe', 'callback', 'observer', 'notify', 'dispatch'],
        requiredComponents: ['Event emitter', 'Listeners', 'Event types'],
        suggestedFiles: [
            'src/events/{name}Events.ts',
            'src/events/eventBus.ts'
        ],
        checklist: [
            'Define event types',
            'Create event emitter/bus',
            'Implement subscribe method',
            'Implement emit method',
            'Handle listener cleanup',
            'Test event flow'
        ],
        typicalTasks: [
            'Define event types',
            'Create event emitter',
            'Add subscribe/unsubscribe',
            'Add emit functionality',
            'Write event tests'
        ],
        estimatedMinutes: 60
    },
    {
        type: 'cache',
        name: 'Caching Layer',
        description: 'In-memory or persistent caching',
        keywords: ['cache', 'cached', 'ttl', 'expire', 'invalidate', 'memo', 'store'],
        requiredComponents: ['Cache storage', 'Get/Set methods', 'TTL handling', 'Invalidation'],
        suggestedFiles: [
            'src/services/cache.ts',
            'tests/cache.test.ts'
        ],
        checklist: [
            'Implement cache storage',
            'Add get method',
            'Add set method with TTL',
            'Implement automatic expiration',
            'Add invalidation methods',
            'Handle cache misses',
            'Test cache behavior'
        ],
        typicalTasks: [
            'Create cache storage',
            'Implement get/set',
            'Add TTL support',
            'Add invalidation',
            'Write cache tests'
        ],
        estimatedMinutes: 90
    }
];

/**
 * PatternRecognizer class for identifying patterns in requirements
 * 
 * **Simple explanation**: Like a detective that looks at what you want to build
 * and says "Ah, this looks like a login system - here's how others build those."
 */
export class PatternRecognizer {
    private patterns: PatternDefinition[];

    constructor() {
        this.patterns = [...PATTERN_LIBRARY];
    }

    /**
     * Recognize patterns in text
     * 
     * @param text - Requirement or feature description
     * @returns Pattern recognition result
     */
    recognize(text: string): PatternRecognitionResult {
        logInfo('[PatternRecognizer] Analyzing text for patterns');

        const normalizedText = text.toLowerCase();
        const matches: PatternMatch[] = [];

        for (const pattern of this.patterns) {
            const matchResult = this.matchPattern(normalizedText, pattern);
            if (matchResult.confidence > 0.2) {
                matches.push(matchResult);
            }
        }

        // Sort by confidence
        matches.sort((a, b) => b.confidence - a.confidence);

        const primaryPattern = matches[0] || null;
        const suggestedTasks = this.generateSuggestedTasks(matches.slice(0, 3));

        const result: PatternRecognitionResult = {
            input: text,
            matches,
            primaryPattern,
            suggestedTasks,
            timestamp: new Date()
        };

        logInfo(`[PatternRecognizer] Found ${matches.length} pattern matches, primary: ${primaryPattern?.pattern.name || 'none'}`);
        return result;
    }

    /**
     * Match a single pattern against text
     */
    private matchPattern(text: string, pattern: PatternDefinition): PatternMatch {
        const matchedKeywords: string[] = [];
        let keywordScore = 0;

        for (const keyword of pattern.keywords) {
            if (text.includes(keyword.toLowerCase())) {
                matchedKeywords.push(keyword);
                keywordScore += 1;
            }
        }

        // Calculate confidence (0-1)
        const confidence = Math.min(1, keywordScore / Math.min(3, pattern.keywords.length));

        return {
            pattern,
            confidence,
            matchedKeywords,
            suggestedApproach: this.generateApproach(pattern, matchedKeywords)
        };
    }

    /**
     * Generate approach suggestion
     */
    private generateApproach(pattern: PatternDefinition, keywords: string[]): string {
        const components = pattern.requiredComponents.join(', ');
        return `Implement ${pattern.name} pattern with components: ${components}. Start with ${pattern.checklist[0] || 'defining requirements'}.`;
    }

    /**
     * Generate combined suggested tasks from top matches
     */
    private generateSuggestedTasks(topMatches: PatternMatch[]): string[] {
        const tasks: string[] = [];
        const seen = new Set<string>();

        for (const match of topMatches) {
            for (const task of match.pattern.typicalTasks) {
                if (!seen.has(task)) {
                    tasks.push(task);
                    seen.add(task);
                }
            }
        }

        return tasks.slice(0, 10); // Limit to 10 tasks
    }

    /**
     * Get pattern by type
     */
    getPattern(type: PatternType): PatternDefinition | undefined {
        return this.patterns.find(p => p.type === type);
    }

    /**
     * Get all patterns
     */
    getAllPatterns(): PatternDefinition[] {
        return [...this.patterns];
    }

    /**
     * Add a custom pattern
     */
    addPattern(pattern: PatternDefinition): void {
        const existing = this.patterns.findIndex(p => p.type === pattern.type);
        if (existing >= 0) {
            this.patterns[existing] = pattern;
        } else {
            this.patterns.push(pattern);
        }
        logInfo(`[PatternRecognizer] Added/updated pattern: ${pattern.name}`);
    }

    /**
     * Get checklist for a pattern
     */
    getChecklist(type: PatternType): string[] {
        const pattern = this.getPattern(type);
        return pattern?.checklist || [];
    }

    /**
     * Get estimated time for a pattern
     */
    getEstimate(type: PatternType): number {
        const pattern = this.getPattern(type);
        return pattern?.estimatedMinutes || 60;
    }
}

// Singleton instance
let instance: PatternRecognizer | null = null;

/**
 * Get the singleton PatternRecognizer
 */
export function getPatternRecognizer(): PatternRecognizer {
    if (!instance) {
        instance = new PatternRecognizer();
    }
    return instance;
}

/**
 * Reset the singleton for testing
 */
export function resetPatternRecognizerForTests(): void {
    instance = null;
}
