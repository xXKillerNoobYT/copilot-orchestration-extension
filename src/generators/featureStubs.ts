/**
 * Feature Stub Generator (MT-033.24)
 *
 * **Simple explanation**: Generates implementation stub files for each feature
 * in your plan. Includes TODO comments, type definitions, and basic structure
 * so you can jump right into coding.
 *
 * @module generators/featureStubs
 */

import { FeatureBlock, DeveloperStory, CompletePlan, BlockLink } from '../planning/types';

// ============================================================================
// Types
// ============================================================================

export interface StubConfig {
    /** Include JSDoc comments */
    includeJsdoc: boolean;
    /** Include TODO markers for acceptance criteria */
    includeTodos: boolean;
    /** Include error handling templates */
    includeErrorHandling: boolean;
    /** Include logging stubs */
    includeLogging: boolean;
    /** Include test template alongside */
    includeTestTemplate: boolean;
    /** Style preference */
    style: 'class' | 'functional' | 'mixed';
}

export interface GeneratedStub {
    /** Feature this stub is for */
    featureId: string;
    /** Feature name */
    featureName: string;
    /** Main implementation file */
    mainFile: StubFile;
    /** Types file */
    typesFile: StubFile;
    /** Index file (exports) */
    indexFile: StubFile;
    /** Test file (if requested) */
    testFile?: StubFile;
}

export interface StubFile {
    /** Relative path */
    path: string;
    /** File content */
    content: string;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_STUB_CONFIG: StubConfig = {
    includeJsdoc: true,
    includeTodos: true,
    includeErrorHandling: true,
    includeLogging: true,
    includeTestTemplate: true,
    style: 'functional',
};

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate feature stubs for all features in a plan.
 *
 * **Simple explanation**: Creates starter code files for each feature
 * with all the boilerplate and structure already set up.
 */
export function generateAllStubs(
    plan: CompletePlan,
    config: StubConfig = DEFAULT_STUB_CONFIG
): GeneratedStub[] {
    return plan.featureBlocks.map(feature =>
        generateFeatureStub(feature, plan, config)
    );
}

/**
 * Generate stub for a single feature.
 */
export function generateFeatureStub(
    feature: FeatureBlock,
    plan: CompletePlan,
    config: StubConfig = DEFAULT_STUB_CONFIG
): GeneratedStub {
    const kebabName = toKebabCase(feature.name);
    const relatedStories = plan.developerStories.filter(s => s.relatedBlockIds.includes(feature.id));
    const dependencies = plan.blockLinks.filter(l => l.sourceBlockId === feature.id);
    const dependents = plan.blockLinks.filter(l => l.targetBlockId === feature.id);

    return {
        featureId: feature.id,
        featureName: feature.name,
        mainFile: generateMainFile(feature, relatedStories, dependencies, dependents, config),
        typesFile: generateTypesFile(feature, config),
        indexFile: generateIndexFile(feature, config),
        testFile: config.includeTestTemplate
            ? generateTestFile(feature, config)
            : undefined,
    };
}

// ============================================================================
// File Generators
// ============================================================================

function generateMainFile(
    feature: FeatureBlock,
    stories: DeveloperStory[],
    dependencies: BlockLink[],
    dependents: BlockLink[],
    config: StubConfig
): StubFile {
    const kebabName = toKebabCase(feature.name);
    const pascalName = toPascalCase(feature.name);
    const camelName = toCamelCase(feature.name);

    let content = '';

    // File header
    content += generateFileHeader(feature, config);

    // Imports
    content += generateImports(feature, dependencies, config);

    // Type imports
    content += `import {
    ${pascalName}Options,
    ${pascalName}Result,
    ${pascalName}State,
    ${pascalName}Error,
} from './types';

`;

    // Constants
    content += generateConstants(feature, config);

    // Main implementation based on style
    if (config.style === 'class') {
        content += generateClassImplementation(feature, stories, config);
    } else {
        content += generateFunctionalImplementation(feature, stories, config);
    }

    // Helper functions
    content += generateHelperFunctions(feature, config);

    return {
        path: `src/${kebabName}/${kebabName}.ts`,
        content,
    };
}

function generateTypesFile(feature: FeatureBlock, config: StubConfig): StubFile {
    const kebabName = toKebabCase(feature.name);
    const pascalName = toPascalCase(feature.name);

    let content = '';

    // Header
    if (config.includeJsdoc) {
        content += `/**
 * Type definitions for ${feature.name}
 * 
 * ${feature.description || 'No description provided'}
 * 
 * @module ${kebabName}/types
 */

`;
    }

    // Options interface
    content += `/**
 * Options for initializing ${feature.name}.
 */
export interface ${pascalName}Options {
    /** Enable debug mode */
    debug?: boolean;
    /** Operation timeout in milliseconds */
    timeout?: number;
    ${config.includeTodos ? `// TODO: Add feature-specific options based on requirements` : ''}
}

`;

    // Result interface
    content += `/**
 * Result of a ${feature.name} operation.
 */
export interface ${pascalName}Result<T = unknown> {
    /** Whether the operation succeeded */
    success: boolean;
    /** Result data (if successful) */
    data?: T;
    /** Error information (if failed) */
    error?: ${pascalName}Error;
    /** Operation metadata */
    metadata?: {
        /** Duration in milliseconds */
        duration: number;
        /** Timestamp of completion */
        timestamp: string;
    };
}

`;

    // State interface
    content += `/**
 * Internal state for ${feature.name}.
 */
export interface ${pascalName}State {
    /** Whether the feature is initialized */
    initialized: boolean;
    /** Current status */
    status: 'idle' | 'running' | 'error' | 'completed';
    /** Last error (if any) */
    lastError?: ${pascalName}Error;
    ${config.includeTodos ? `// TODO: Add state properties based on feature requirements` : ''}
}

`;

    // Error type
    content += `/**
 * Error type for ${feature.name} operations.
 */
export interface ${pascalName}Error {
    /** Error code */
    code: ${pascalName}ErrorCode;
    /** Human-readable message */
    message: string;
    /** Original error (if wrapping another error) */
    cause?: Error;
    /** Additional context */
    context?: Record<string, unknown>;
}

/**
 * Error codes for ${feature.name}.
 */
export type ${pascalName}ErrorCode = 
    | 'NOT_INITIALIZED'
    | 'INVALID_OPTIONS'
    | 'OPERATION_FAILED'
    | 'TIMEOUT'
    | 'UNKNOWN_ERROR';

`;

    // Acceptance criteria as comments
    if (feature.acceptanceCriteria.length > 0) {
        content += `/**
 * Acceptance Criteria Types
 * 
 * These types represent the acceptance criteria for this feature:
${feature.acceptanceCriteria.map((c, i) => ` * ${i + 1}. ${c}`).join('\n')}
 */

`;
    }

    // Export utility types
    content += `// Utility types
export type ${pascalName}Callback<T> = (result: ${pascalName}Result<T>) => void;
export type ${pascalName}AsyncCallback<T> = (result: ${pascalName}Result<T>) => Promise<void>;
`;

    return {
        path: `src/${kebabName}/types.ts`,
        content,
    };
}

function generateIndexFile(feature: FeatureBlock, config: StubConfig): StubFile {
    const kebabName = toKebabCase(feature.name);
    const pascalName = toPascalCase(feature.name);
    const camelName = toCamelCase(feature.name);

    return {
        path: `src/${kebabName}/index.ts`,
        content: `/**
 * ${feature.name} Module
 * 
 * ${feature.description || 'No description provided'}
 * 
 * @module ${kebabName}
 */

// Export types
export * from './types';

// Export main functionality
export {
    initialize${pascalName},
    ${config.style === 'class' ? pascalName : camelName},
    get${pascalName}State,
    reset${pascalName},
} from './${kebabName}';
`,
    };
}

function generateTestFile(feature: FeatureBlock, config: StubConfig): StubFile {
    const kebabName = toKebabCase(feature.name);
    const pascalName = toPascalCase(feature.name);
    const camelName = toCamelCase(feature.name);

    let content = `/**
 * Tests for ${feature.name}
 * 
 * Priority: ${feature.priority}
 */

import {
    initialize${pascalName},
    ${config.style === 'class' ? pascalName : camelName},
    get${pascalName}State,
    reset${pascalName},
} from './${kebabName}';
import { ${pascalName}Options } from './types';

describe('${pascalName}', () => {
    beforeEach(() => {
        reset${pascalName}();
    });

    describe('initialization', () => {
        it('Test 1: should initialize with default options', async () => {
            await initialize${pascalName}();
            const state = get${pascalName}State();
            expect(state.initialized).toBe(true);
        });

        it('Test 2: should initialize with custom options', async () => {
            const options: ${pascalName}Options = {
                debug: true,
                timeout: 5000,
            };
            await initialize${pascalName}(options);
            const state = get${pascalName}State();
            expect(state.initialized).toBe(true);
        });

        it('Test 3: should throw if already initialized', async () => {
            await initialize${pascalName}();
            await expect(initialize${pascalName}()).rejects.toThrow();
        });
    });

`;

    // Generate tests for acceptance criteria
    if (feature.acceptanceCriteria.length > 0) {
        content += `    describe('acceptance criteria', () => {
`;
        feature.acceptanceCriteria.forEach((criterion, i) => {
            content += `        it('Test ${i + 4}: ${escapeString(criterion)}', async () => {
            // TODO: Implement test for: ${criterion}
            await initialize${pascalName}();
            
            // Assert acceptance criterion is met
            expect(true).toBe(true); // Replace with actual assertion
        });

`;
        });
        content += `    });

`;
    }

    content += `    describe('error handling', () => {
        it('Test N: should handle errors gracefully', async () => {
            await initialize${pascalName}();
            // TODO: Test error scenarios
        });
    });
});
`;

    return {
        path: `tests/${kebabName}.test.ts`,
        content,
    };
}

// ============================================================================
// Component Generators
// ============================================================================

function generateFileHeader(feature: FeatureBlock, config: StubConfig): string {
    if (!config.includeJsdoc) return '';

    return `/**
 * ${feature.name} Implementation
 * 
 * ${feature.description || 'No description provided'}
 * 
 * Priority: ${feature.priority}
 * 
 * Acceptance Criteria:
${feature.acceptanceCriteria.map(c => ` * - ${c}`).join('\n') || ' * - No criteria defined'}
 * 
 * @module ${toKebabCase(feature.name)}
 */

`;
}

function generateImports(feature: FeatureBlock, dependencies: BlockLink[], config: StubConfig): string {
    let imports = '';

    // Import dependencies
    if (dependencies.length > 0) {
        imports += `// Feature dependencies\n`;
        // Note: In a real implementation, we would resolve the actual import paths
        imports += `// TODO: Import required dependencies\n`;
        dependencies.forEach(dep => {
            imports += `// import { ... } from '../${dep.targetBlockId}'; // ${dep.dependencyType}\n`;
        });
        imports += '\n';
    }

    return imports;
}

function generateConstants(feature: FeatureBlock, config: StubConfig): string {
    const pascalName = toPascalCase(feature.name);

    return `// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPTIONS: ${pascalName}Options = {
    debug: false,
    timeout: 30000,
};

const DEFAULT_STATE: ${pascalName}State = {
    initialized: false,
    status: 'idle',
};

`;
}

function generateFunctionalImplementation(
    feature: FeatureBlock,
    stories: DeveloperStory[],
    config: StubConfig
): string {
    const pascalName = toPascalCase(feature.name);
    const camelName = toCamelCase(feature.name);

    let content = `// ============================================================================
// State
// ============================================================================

let state: ${pascalName}State = { ...DEFAULT_STATE };
let options: ${pascalName}Options = { ...DEFAULT_OPTIONS };

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize ${feature.name}.
 * 
 * **Simple explanation**: Sets up ${feature.name} with the given options.
 * Must be called before using other functions.
 */
export async function initialize${pascalName}(opts?: ${pascalName}Options): Promise<void> {
    if (state.initialized) {
        throw new Error('${pascalName} is already initialized');
    }

    options = { ...DEFAULT_OPTIONS, ...opts };
    
    ${config.includeLogging ? `if (options.debug) {
        console.log('[${pascalName}] Initializing with options:', options);
    }` : ''}

    ${config.includeTodos ? `// TODO: Add initialization logic
    // - Set up connections
    // - Load configuration
    // - Validate prerequisites` : ''}

    state = {
        ...DEFAULT_STATE,
        initialized: true,
        status: 'idle',
    };
}

/**
 * Main ${feature.name} operation.
 * 
 * **Simple explanation**: Performs the main action of ${feature.name}.
 */
export async function ${camelName}<T>(): Promise<${pascalName}Result<T>> {
    if (!state.initialized) {
        return {
            success: false,
            error: {
                code: 'NOT_INITIALIZED',
                message: '${pascalName} must be initialized before use',
            },
        };
    }

    const startTime = Date.now();
    state.status = 'running';

    try {
        ${config.includeTodos ? `// TODO: Implement main functionality
        // Based on acceptance criteria:
${feature.acceptanceCriteria.map(c => `        // - ${c}`).join('\n') || '        // - Define acceptance criteria'}` : ''}

        state.status = 'completed';
        
        return {
            success: true,
            data: undefined as T,
            metadata: {
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString(),
            },
        };
    } catch (error) {
        ${config.includeErrorHandling ? `const err = error instanceof Error ? error : new Error(String(error));
        state.status = 'error';
        state.lastError = {
            code: 'OPERATION_FAILED',
            message: err.message,
            cause: err,
        };

        ${config.includeLogging ? `if (options.debug) {
            console.error('[${pascalName}] Operation failed:', err);
        }` : ''}

        return {
            success: false,
            error: state.lastError,
        };` : `throw error;`}
    }
}

/**
 * Get current state of ${feature.name}.
 */
export function get${pascalName}State(): ${pascalName}State {
    return { ...state };
}

/**
 * Reset ${feature.name} to initial state.
 */
export function reset${pascalName}(): void {
    state = { ...DEFAULT_STATE };
    options = { ...DEFAULT_OPTIONS };
}

`;

    // Add functions for each developer story
    if (stories.length > 0) {
        content += `// ============================================================================
// Story Functions
// ============================================================================

`;
        for (const story of stories) {
            const funcName = toCamelCase(story.action.replace(/^As a.*?, I want to /, '').replace(/[^a-zA-Z0-9]/g, ' '));
            content += `/**
 * ${story.action} - ${story.benefit}
 * 
 * Technical Requirements:
${story.technicalRequirements.map((c: string) => ` * - ${c}`).join('\n') || ' * - No requirements'}
 */
export async function ${funcName}(): Promise<${pascalName}Result> {
    ${config.includeTodos ? `// TODO: Implement story functionality` : ''}
    return { success: true };
}

`;
        }
    }

    return content;
}

function generateClassImplementation(
    feature: FeatureBlock,
    stories: DeveloperStory[],
    config: StubConfig
): string {
    const pascalName = toPascalCase(feature.name);

    let content = `// ============================================================================
// Class Implementation
// ============================================================================

let instance: ${pascalName} | null = null;

/**
 * ${feature.name} class.
 * 
 * Singleton implementation of ${feature.name} functionality.
 */
export class ${pascalName} {
    private state: ${pascalName}State = { ...DEFAULT_STATE };
    private options: ${pascalName}Options;

    private constructor(options: ${pascalName}Options) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    /**
     * Initialize and get the singleton instance.
     */
    static async initialize(options?: ${pascalName}Options): Promise<${pascalName}> {
        if (instance) {
            throw new Error('${pascalName} is already initialized');
        }
        instance = new ${pascalName}(options || {});
        await instance.init();
        return instance;
    }

    /**
     * Get the singleton instance.
     */
    static getInstance(): ${pascalName} {
        if (!instance) {
            throw new Error('${pascalName} is not initialized');
        }
        return instance;
    }

    /**
     * Reset the singleton (for testing).
     */
    static reset(): void {
        instance = null;
    }

    private async init(): Promise<void> {
        ${config.includeLogging ? `if (this.options.debug) {
            console.log('[${pascalName}] Initializing...');
        }` : ''}

        ${config.includeTodos ? `// TODO: Add initialization logic` : ''}

        this.state.initialized = true;
    }

    /**
     * Get current state.
     */
    getState(): ${pascalName}State {
        return { ...this.state };
    }

    /**
     * Main operation.
     */
    async execute<T>(): Promise<${pascalName}Result<T>> {
        ${config.includeTodos ? `// TODO: Implement main functionality` : ''}
        return { success: true };
    }
}

// Convenience exports
export const initialize${pascalName} = ${pascalName}.initialize.bind(${pascalName});
export const get${pascalName}State = () => ${pascalName}.getInstance().getState();
export const reset${pascalName} = ${pascalName}.reset.bind(${pascalName});

`;

    return content;
}

function generateHelperFunctions(feature: FeatureBlock, config: StubConfig): string {
    const pascalName = toPascalCase(feature.name);

    return `// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate options.
 */
function validateOptions(opts: ${pascalName}Options): void {
    if (opts.timeout !== undefined && opts.timeout < 0) {
        throw new Error('Timeout must be a positive number');
    }
    ${config.includeTodos ? `// TODO: Add more validation as needed` : ''}
}

/**
 * Create an error result.
 */
function createError(
    code: import('./types').${pascalName}ErrorCode,
    message: string,
    cause?: Error
): import('./types').${pascalName}Error {
    return { code, message, cause };
}
`;
}

// ============================================================================
// Utility Functions
// ============================================================================

function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

function toPascalCase(str: string): string {
    return str
        .split(/[-_\s]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

function toCamelCase(str: string): string {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function escapeString(str: string): string {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}
