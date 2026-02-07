/**
 * Agent Templates Library - Pre-built agents for common use cases
 *
 * **Simple explanation**: Instead of building agents from scratch, users can
 * start with a pre-made template that's already configured for common tasks
 * like "Research", "Code Review", "Testing", etc.
 *
 * @module agents/custom/templates
 */

import { CustomAgent } from './schema';

/**
 * Template category for organizing templates
 */
export type TemplateCategory = 'research' | 'writing' | 'code' | 'analysis' | 'testing' | 'docs';

/**
 * Template agent configuration (simplified, non-id version of CustomAgent)
 */
export interface TemplateAgentConfig {
    name: string;
    description: string;
    systemPrompt: string;
    goals: string[];
    checklist?: string[];
    customLists?: Array<{ name: string; description?: string; items: string[] }>;
    metadata?: { version?: string; author?: string; tags?: string[] };
    isActive?: boolean;
    timeoutSeconds?: number;
    maxTokens?: number;
    temperature?: number;
    priority?: 'P0' | 'P1' | 'P2' | 'P3';
    routing?: { keywords?: string[]; patterns?: string[]; tags?: string[] };
}

/**
 * Agent template with metadata
 */
export interface AgentTemplate {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    baseAgent: TemplateAgentConfig;
    tags: string[];
    usageExamples: string[];
}

/**
 * Built-in templates library
 *
 * **Simple explanation**: A collection of pre-configured agents ready to use
 */
export const AGENT_TEMPLATES: Record<string, AgentTemplate> = {
    'research-assistant': {
        id: 'research-assistant',
        name: 'Research Assistant',
        description: 'Gathers and analyzes information to answer complex questions',
        category: 'research',
        difficulty: 'beginner',
        tags: ['research', 'analysis', 'information-gathering'],
        usageExamples: [
            'Research{{query}}',
            'Find information about {{topic}}',
            'Analyze and summarize {{subject}}'
        ],
        baseAgent: {
            name: 'research-assistant',
            description: 'Researches topics and gathers information',
            systemPrompt: `You are a research assistant specialized in finding and synthesizing information.

Your task: {{query}}

Approach:
1. Break down the query into researchable components
2. Search for relevant information
3. Verify sources and credibility
4. Synthesize findings into a clear answer

Provide citations and specific details.`,
            goals: [
                'Find relevant, credible sources',
                'Synthesize information into clear answer',
                'Provide citations and sources',
                'Highlight key insights'
            ],
            checklist: [
                'Used multiple sources',
                'Verified information credibility',
                'Organized findings logically',
                'Included citations',
                'Answered the core question'
            ],
            customLists: [],
            metadata: {
                version: '1.0.0',
                author: 'COE Team',
                tags: ['research', 'built-in']
            },
            isActive: true,
            timeoutSeconds: 120,
            maxTokens: 2048,
            temperature: 0.5
        }
    },

    'code-reviewer': {
        id: 'code-reviewer',
        name: 'Code Reviewer',
        description: 'Reviews code for quality, performance, and best practices',
        category: 'code',
        difficulty: 'intermediate',
        tags: ['code-review', 'quality', 'best-practices'],
        usageExamples: [
            'Review this code for quality',
            'Check {{file_path}} for issues',
            'Analyze performance of code snippet'
        ],
        baseAgent: {
            name: 'code-reviewer',
            description: 'Reviews code for quality and best practices',
            systemPrompt: `You are an expert code reviewer with deep knowledge of software engineering best practices.

Code to review:
{{selection}}

Review criteria:
- Correctness and logic
- Performance considerations
- Code readability and maintainability
- Best practices adherence
- Security concerns
- Test coverage

Provide constructive feedback with specific improvements.`,
            goals: [
                'Identify bugs and logical errors',
                'Suggest performance improvements',
                'Recommend better naming and structure',
                'Point out security vulnerabilities',
                'Provide actionable feedback'
            ],
            checklist: [
                'Checked for syntax errors',
                'Verified business logic',
                'Analyzed performance impact',
                'Reviewed best practices',
                'Provided improvement suggestions'
            ],
            customLists: [],
            metadata: {
                version: '1.0.0',
                author: 'COE Team',
                tags: ['code-review', 'quality', 'built-in']
            },
            isActive: true,
            timeoutSeconds: 90,
            maxTokens: 2048,
            temperature: 0.3
        }
    },

    'documentation-writer': {
        id: 'documentation-writer',
        name: 'Documentation Writer',
        description: 'Creates clear, comprehensive documentation',
        category: 'docs',
        difficulty: 'intermediate',
        tags: ['documentation', 'writing', 'technical-writing'],
        usageExamples: [
            'Write documentation for {{file_path}}',
            'Create user guide for {{feature}}',
            'Document API for {{system}}'
        ],
        baseAgent: {
            name: 'documentation-writer',
            description: 'Writes clear technical documentation',
            systemPrompt: `You are a technical writer skilled in creating clear, accessible documentation.

Topic: {{query}}

Write documentation that includes:
1. Overview and purpose
2. Key concepts explained simply
3. Step-by-step instructions
4. Examples with code or screenshots
5. Troubleshooting section
6. Related resources

Use plain language. Assume minimal prior knowledge.`,
            goals: [
                'Explain concepts clearly for beginners',
                'Provide step-by-step instructions',
                'Include practical examples',
                'Add troubleshooting section',
                'Create comprehensive guide'
            ],
            checklist: [
                'Used simple, clear language',
                'Included all key sections',
                'Provided working examples',
                'Added visual descriptions',
                'Proofread for clarity'
            ],
            customLists: [],
            metadata: {
                version: '1.0.0',
                author: 'COE Team',
                tags: ['documentation', 'writing', 'built-in']
            },
            isActive: true,
            timeoutSeconds: 90,
            maxTokens: 3000,
            temperature: 0.6
        }
    },

    'test-case-generator': {
        id: 'test-case-generator',
        name: 'Test Case Generator',
        description: 'Creates comprehensive test cases and scenarios',
        category: 'testing',
        difficulty: 'advanced',
        tags: ['testing', 'qa', 'test-cases'],
        usageExamples: [
            'Generate test cases for {{feature}}',
            'Create edge cases for {{function}}',
            'Write test scenario for {{user_query}}'
        ],
        baseAgent: {
            name: 'test-case-generator',
            description: 'Generates comprehensive test cases',
            systemPrompt: `You are a QA specialist skilled in creating comprehensive test cases.

Component/Feature: {{query}}

Generate test cases covering:
1. Happy path scenarios
2. Edge cases and boundaries
3. Error conditions
4. Performance considerations
5. Integration points

For each test case provide:
- Description
- Preconditions
- Steps
- Expected result
- Priority (P0/P1/P2)`,
            goals: [
                'Cover happy path scenarios',
                'Identify edge cases',
                'Test error handling',
                'Verify integration points',
                'Ensure comprehensive coverage'
            ],
            checklist: [
                'Included positive test cases',
                'Added edge case scenarios',
                'Covered error conditions',
                'Tested integration points',
                'Prioritized test cases'
            ],
            customLists: [],
            metadata: {
                version: '1.0.0',
                author: 'COE Team',
                tags: ['testing', 'qa', 'built-in']
            },
            isActive: true,
            timeoutSeconds: 120,
            maxTokens: 2048,
            temperature: 0.4
        }
    },

    'content-strategist': {
        id: 'content-strategist',
        name: 'Content Strategist',
        description: 'Plans and structures content for maximum clarity and impact',
        category: 'writing',
        difficulty: 'intermediate',
        tags: ['content', 'writing', 'strategy'],
        usageExamples: [
            'Plan content for {{topic}}',
            'Outline {{document_type}}',
            'Structure content about {{subject}}'
        ],
        baseAgent: {
            name: 'content-strategist',
            description: 'Plans content strategy and structure',
            systemPrompt: `You are a content strategist skilled in organizing information effectively.

Content topic: {{query}}

Create a content strategy including:
1. Target audience analysis
2. Key messages and themes
3. Content outline with sections
4. Visual elements suggestions
5. Tone and style recommendations
6. Distribution suggestions

Focus on clarity, engagement, and impact.`,
            goals: [
                'Define clear target audience',
                'Identify key messages',
                'Create logical structure',
                'Suggest visual elements',
                'Ensure audience engagement'
            ],
            checklist: [
                'Analyzed target audience',
                'Outlined main sections',
                'Defined key messages',
                'Suggested visual elements',
                'Set engagement goals'
            ],
            customLists: [],
            metadata: {
                version: '1.0.0',
                author: 'COE Team',
                tags: ['content', 'strategy', 'built-in']
            },
            isActive: true,
            timeoutSeconds: 90,
            maxTokens: 2000,
            temperature: 0.7
        }
    }
};

/**
 * Get all templates
 *
 * **Simple explanation**: Return list of all available templates
 */
export function getAllTemplates(): AgentTemplate[] {
    return Object.values(AGENT_TEMPLATES);
}

/**
 * Get templates by category
 *
 * **Simple explanation**: Filter templates by category (research, code, etc)
 */
export function getTemplatesByCategory(category: TemplateCategory): AgentTemplate[] {
    return Object.values(AGENT_TEMPLATES).filter(t => t.category === category);
}

/**
 * Get a specific template by ID
 *
 * **Simple explanation**: Fetch one template by name
 */
export function getTemplate(id: string): AgentTemplate | null {
    return AGENT_TEMPLATES[id] ?? null;
}

/**
 * Search templates by keyword
 *
 * **Simple explanation**: Find templates matching a search term
 */
export function searchTemplates(keyword: string): AgentTemplate[] {
    const lower = keyword.toLowerCase();
    return Object.values(AGENT_TEMPLATES).filter(
        t =>
            t.name.toLowerCase().includes(lower) ||
            t.description.toLowerCase().includes(lower) ||
            t.tags.some(tag => tag.toLowerCase().includes(lower))
    );
}

/**
 * Create custom agent from template
 *
 * **Simple explanation**: Start building an agent from a template base
 */
export function createFromTemplate(templateId: string, customName: string): CustomAgent | null {
    const template = getTemplate(templateId);
    if (!template) return null;

    // Merge template baseAgent with required fields and overrides
    const agent: CustomAgent = {
        // Spread template base configuration
        ...template.baseAgent,
        // Override/ensure required fields
        name: customName,
        description: template.baseAgent.description || template.description,
        systemPrompt: template.baseAgent.systemPrompt || '',
        goals: template.baseAgent.goals || [],
        checklist: template.baseAgent.checklist || [],
        customLists: template.baseAgent.customLists || [],
        priority: template.baseAgent.priority || 'P2',
        routing: template.baseAgent.routing || {},
        metadata: {
            ...(template.baseAgent.metadata || {}),
            version: template.baseAgent.metadata?.version || '1.0.0',
            tags: template.baseAgent.metadata?.tags || [],
            author: template.baseAgent.metadata?.author || 'Template User'
        },
        isActive: template.baseAgent.isActive !== undefined ? template.baseAgent.isActive : true,
        timeoutSeconds: template.baseAgent.timeoutSeconds || 60,
        maxTokens: template.baseAgent.maxTokens || 2048,
        temperature: template.baseAgent.temperature || 0.7
    } as CustomAgent;

    return agent;
}

/**
 * Get categories with count of templates
 *
 * **Simple explanation**: Show how many templates are in each category
 */
export function getCategoriesWithCounts(): Array<{ category: TemplateCategory; count: number }> {
    const categories = new Set<TemplateCategory>();
    Object.values(AGENT_TEMPLATES).forEach(t => categories.add(t.category));

    return Array.from(categories).map(cat => ({
        category: cat,
        count: Object.values(AGENT_TEMPLATES).filter(t => t.category === cat).length
    }));
}
