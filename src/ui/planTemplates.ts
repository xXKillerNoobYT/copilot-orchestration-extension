/**
 * Plan Template Library (MT-033.10)
 *
 * **Simple explanation**: Pre-built plan templates for common project types.
 * Like starter kits - pick a template and it fills in example goals, features,
 * and stories that you can customize.
 *
 * @module ui/planTemplates
 */

import * as crypto from 'crypto';
import { CompletePlan, FeatureBlock, UserStory, DeveloperStory, SuccessCriterion } from '../planning/types';

// ============================================================================
// Types
// ============================================================================

export interface PlanTemplate {
    /** Unique template identifier */
    id: string;
    /** Display name */
    name: string;
    /** Short description */
    description: string;
    /** Icon/emoji for display */
    icon: string;
    /** Template category */
    category: 'web' | 'api' | 'cli' | 'extension' | 'docs' | 'mobile';
    /** Partial plan with example content */
    template: Partial<CompletePlan>;
}

// ============================================================================
// Template Definitions
// ============================================================================

/**
 * Web Application Template
 *
 * **Simple explanation**: A template for building web apps with frontend,
 * backend, authentication, and dashboard features.
 */
export const WEB_APP_TEMPLATE: PlanTemplate = {
    id: 'web-app',
    name: 'Web Application',
    description: 'Full-stack web app with authentication, dashboard, and CRUD operations',
    icon: '🌐',
    category: 'web',
    template: {
        overview: {
            name: 'My Web Application',
            description: 'A modern web application with user authentication, dashboard, and data management capabilities.',
            goals: [
                'Provide secure user authentication',
                'Enable users to manage their data through an intuitive dashboard',
                'Achieve <200ms response time for core operations',
                'Support 1000+ concurrent users',
            ],
        },
        featureBlocks: [
            {
                id: crypto.randomUUID(),
                name: 'User Authentication',
                description: 'Secure login, registration, password reset, and session management',
                purpose: 'Allow users to securely access their accounts and protect their data',
                acceptanceCriteria: [
                    'Users can register with email and password',
                    'Users can log in and receive a JWT token',
                    'Users can reset their password via email',
                    'Sessions expire after 24 hours of inactivity',
                ],
                technicalNotes: 'Use bcrypt for password hashing, JWT for tokens, refresh token rotation',
                priority: 'critical',
                order: 0,
            },
            {
                id: crypto.randomUUID(),
                name: 'Dashboard',
                description: 'Main user interface showing key metrics and recent activity',
                purpose: 'Give users a quick overview of their account status and data',
                acceptanceCriteria: [
                    'Dashboard loads within 500ms',
                    'Shows 5 most recent activities',
                    'Displays key metrics with charts',
                    'Responsive design for mobile and desktop',
                ],
                technicalNotes: 'Use Chart.js for visualizations, lazy load data components',
                priority: 'high',
                order: 1,
            },
            {
                id: crypto.randomUUID(),
                name: 'Data Management',
                description: 'CRUD operations for user data with search and filtering',
                purpose: 'Allow users to create, view, edit, and delete their records',
                acceptanceCriteria: [
                    'Users can create new records with validation',
                    'Users can view records in list and detail views',
                    'Users can edit existing records',
                    'Users can delete records with confirmation',
                    'Search returns results within 200ms',
                ],
                technicalNotes: 'Paginate large lists (20 items/page), debounce search input',
                priority: 'high',
                order: 2,
            },
            {
                id: crypto.randomUUID(),
                name: 'Settings & Profile',
                description: 'User preferences, profile management, and notification settings',
                purpose: 'Let users customize their experience and manage their account',
                acceptanceCriteria: [
                    'Users can update their profile information',
                    'Users can change their password',
                    'Users can manage notification preferences',
                    'Users can delete their account',
                ],
                technicalNotes: 'Require current password for sensitive changes',
                priority: 'medium',
                order: 3,
            },
        ],
        userStories: [
            {
                id: crypto.randomUUID(),
                userType: 'new user',
                action: 'register for an account',
                benefit: 'I can start using the application',
                relatedBlockIds: [],
                acceptanceCriteria: ['Registration form validates email format', 'Password strength indicator shown'],
                priority: 'critical',
            },
            {
                id: crypto.randomUUID(),
                userType: 'returning user',
                action: 'log in to my account',
                benefit: 'I can access my data',
                relatedBlockIds: [],
                acceptanceCriteria: ['Login remembers me option', 'Failed login shows helpful error'],
                priority: 'critical',
            },
            {
                id: crypto.randomUUID(),
                userType: 'user',
                action: 'see my dashboard after logging in',
                benefit: 'I can quickly understand my current status',
                relatedBlockIds: [],
                acceptanceCriteria: ['Dashboard is the default landing page', 'Key metrics are visible above fold'],
                priority: 'high',
            },
        ],
        developerStories: [
            {
                id: crypto.randomUUID(),
                action: 'set up authentication middleware',
                benefit: 'protected routes are secure',
                technicalRequirements: ['JWT validation', 'Role-based access control', 'Token refresh logic'],
                apiNotes: 'POST /auth/login, POST /auth/register, POST /auth/refresh',
                databaseNotes: 'users table with hashed passwords, refresh_tokens table',
                estimatedHours: 8,
                relatedBlockIds: [],
                relatedTaskIds: [],
            },
            {
                id: crypto.randomUUID(),
                action: 'implement dashboard API endpoints',
                benefit: 'frontend can load dashboard data',
                technicalRequirements: ['Aggregation queries', 'Caching layer', 'Response compression'],
                apiNotes: 'GET /api/dashboard/metrics, GET /api/dashboard/activity',
                databaseNotes: 'Create materialized views for complex aggregations',
                estimatedHours: 6,
                relatedBlockIds: [],
                relatedTaskIds: [],
            },
        ],
        successCriteria: [
            {
                id: crypto.randomUUID(),
                description: 'Users can complete registration in under 2 minutes',
                smartAttributes: { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true },
                relatedFeatureIds: [],
                relatedStoryIds: [],
                testable: true,
                priority: 'critical',
            },
            {
                id: crypto.randomUUID(),
                description: 'Dashboard loads within 500ms for 95% of requests',
                smartAttributes: { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true },
                relatedFeatureIds: [],
                relatedStoryIds: [],
                testable: true,
                priority: 'high',
            },
        ],
    },
};

/**
 * REST API Template
 *
 * **Simple explanation**: A template for building backend APIs with
 * endpoints, authentication, validation, and documentation.
 */
export const REST_API_TEMPLATE: PlanTemplate = {
    id: 'rest-api',
    name: 'REST API',
    description: 'Backend API with authentication, CRUD endpoints, and OpenAPI documentation',
    icon: '🔌',
    category: 'api',
    template: {
        overview: {
            name: 'My REST API',
            description: 'A RESTful API service providing data access with authentication, rate limiting, and comprehensive documentation.',
            goals: [
                'Provide RESTful endpoints for all resources',
                'Implement secure API key authentication',
                'Achieve <100ms response time for simple queries',
                'Auto-generate OpenAPI documentation',
            ],
        },
        featureBlocks: [
            {
                id: crypto.randomUUID(),
                name: 'API Authentication',
                description: 'API key management, JWT tokens, and rate limiting',
                purpose: 'Secure API access and prevent abuse',
                acceptanceCriteria: [
                    'Generate and revoke API keys',
                    'JWT tokens for user authentication',
                    'Rate limit: 100 requests/minute per key',
                    'Return 401 for invalid credentials',
                ],
                technicalNotes: 'Use Redis for rate limiting counters',
                priority: 'critical',
                order: 0,
            },
            {
                id: crypto.randomUUID(),
                name: 'Resource Endpoints',
                description: 'CRUD endpoints for all data resources',
                purpose: 'Allow clients to manage data programmatically',
                acceptanceCriteria: [
                    'GET /resource - list with pagination',
                    'GET /resource/:id - single item',
                    'POST /resource - create with validation',
                    'PUT /resource/:id - full update',
                    'PATCH /resource/:id - partial update',
                    'DELETE /resource/:id - soft delete',
                ],
                technicalNotes: 'Use query params for filtering: ?status=active&sort=-createdAt',
                priority: 'critical',
                order: 1,
            },
            {
                id: crypto.randomUUID(),
                name: 'Input Validation',
                description: 'Request body and query parameter validation',
                purpose: 'Ensure data integrity and provide helpful error messages',
                acceptanceCriteria: [
                    'Validate all required fields',
                    'Return 400 with field-level errors',
                    'Sanitize inputs to prevent injection',
                    'Validate enum values and ranges',
                ],
                technicalNotes: 'Use Zod or Joi for schema validation',
                priority: 'high',
                order: 2,
            },
            {
                id: crypto.randomUUID(),
                name: 'API Documentation',
                description: 'OpenAPI spec and interactive docs',
                purpose: 'Enable developers to understand and test the API',
                acceptanceCriteria: [
                    'OpenAPI 3.0 spec auto-generated',
                    'Swagger UI available at /docs',
                    'Examples for all endpoints',
                    'Error response schemas documented',
                ],
                technicalNotes: 'Use swagger-jsdoc to generate from code comments',
                priority: 'medium',
                order: 3,
            },
        ],
        userStories: [
            {
                id: crypto.randomUUID(),
                userType: 'API consumer',
                action: 'authenticate with my API key',
                benefit: 'I can make authorized requests',
                relatedBlockIds: [],
                acceptanceCriteria: ['API key in Authorization header', 'Clear error for invalid key'],
                priority: 'critical',
            },
            {
                id: crypto.randomUUID(),
                userType: 'API consumer',
                action: 'paginate through large result sets',
                benefit: 'I can efficiently retrieve all data',
                relatedBlockIds: [],
                acceptanceCriteria: ['cursor-based pagination', 'Link headers for next/prev'],
                priority: 'high',
            },
        ],
        developerStories: [
            {
                id: crypto.randomUUID(),
                action: 'implement input validation middleware',
                benefit: 'all endpoints validate inputs consistently',
                technicalRequirements: ['Zod schemas', 'Custom error formatter', 'Type inference'],
                apiNotes: 'Middleware validates req.body, req.query, req.params',
                databaseNotes: 'N/A - validation layer only',
                estimatedHours: 4,
                relatedBlockIds: [],
                relatedTaskIds: [],
            },
        ],
        successCriteria: [
            {
                id: crypto.randomUUID(),
                description: 'API responds to health check within 50ms',
                smartAttributes: { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true },
                relatedFeatureIds: [],
                relatedStoryIds: [],
                testable: true,
                priority: 'critical',
            },
        ],
    },
};

/**
 * CLI Tool Template
 *
 * **Simple explanation**: A template for command-line tools with
 * argument parsing, subcommands, and configuration.
 */
export const CLI_TOOL_TEMPLATE: PlanTemplate = {
    id: 'cli-tool',
    name: 'CLI Tool',
    description: 'Command-line application with subcommands, flags, and configuration',
    icon: '💻',
    category: 'cli',
    template: {
        overview: {
            name: 'My CLI Tool',
            description: 'A command-line tool for automating tasks with an intuitive interface, helpful documentation, and configuration file support.',
            goals: [
                'Provide intuitive command structure',
                'Support configuration via file and environment variables',
                'Include comprehensive --help documentation',
                'Support both interactive and non-interactive modes',
            ],
        },
        featureBlocks: [
            {
                id: crypto.randomUUID(),
                name: 'Command Parser',
                description: 'Parse arguments, flags, and subcommands',
                purpose: 'Allow users to invoke tool with various options',
                acceptanceCriteria: [
                    'Support subcommands: mycli <command> [options]',
                    'Parse --flag and -f short forms',
                    'Support --key=value and --key value formats',
                    'Show help with --help or -h',
                ],
                technicalNotes: 'Use commander or yargs for parsing',
                priority: 'critical',
                order: 0,
            },
            {
                id: crypto.randomUUID(),
                name: 'Configuration',
                description: 'Load config from file, env vars, and CLI flags',
                purpose: 'Allow flexible configuration for different environments',
                acceptanceCriteria: [
                    'Load from .myclirc or mycli.config.js',
                    'Environment variables override file config',
                    'CLI flags override all',
                    'Validate config schema',
                ],
                technicalNotes: 'Use cosmiconfig for config loading',
                priority: 'high',
                order: 1,
            },
            {
                id: crypto.randomUUID(),
                name: 'Output Formatting',
                description: 'Format output for humans and machines',
                purpose: 'Support both interactive use and scripting',
                acceptanceCriteria: [
                    'Default: colored, formatted output',
                    '--json flag outputs JSON',
                    '--quiet suppresses non-essential output',
                    'Progress bars for long operations',
                ],
                technicalNotes: 'Use chalk for colors, ora for spinners',
                priority: 'medium',
                order: 2,
            },
        ],
        userStories: [
            {
                id: crypto.randomUUID(),
                userType: 'developer',
                action: 'run the tool with --help',
                benefit: 'I can learn how to use it',
                relatedBlockIds: [],
                acceptanceCriteria: ['Shows all commands', 'Shows examples', 'Shows version'],
                priority: 'critical',
            },
            {
                id: crypto.randomUUID(),
                userType: 'developer',
                action: 'pipe output to other tools',
                benefit: 'I can integrate it into my workflow',
                relatedBlockIds: [],
                acceptanceCriteria: ['--json for machine-readable output', 'Exit codes for success/failure'],
                priority: 'high',
            },
        ],
        developerStories: [
            {
                id: crypto.randomUUID(),
                action: 'set up command structure with yargs',
                benefit: 'commands are organized and extensible',
                technicalRequirements: ['Command modules', 'Global options', 'Middleware'],
                apiNotes: 'N/A - CLI tool',
                databaseNotes: 'N/A',
                estimatedHours: 3,
                relatedBlockIds: [],
                relatedTaskIds: [],
            },
        ],
        successCriteria: [
            {
                id: crypto.randomUUID(),
                description: 'Tool starts and shows help within 200ms',
                smartAttributes: { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true },
                relatedFeatureIds: [],
                relatedStoryIds: [],
                testable: true,
                priority: 'high',
            },
        ],
    },
};

/**
 * VS Code Extension Template
 *
 * **Simple explanation**: A template for building VS Code extensions
 * with commands, views, and settings.
 */
export const VSCODE_EXTENSION_TEMPLATE: PlanTemplate = {
    id: 'vscode-extension',
    name: 'VS Code Extension',
    description: 'VS Code extension with commands, tree views, and webviews',
    icon: '🧩',
    category: 'extension',
    template: {
        overview: {
            name: 'My VS Code Extension',
            description: 'A VS Code extension that enhances the development workflow with custom commands, views, and integrations.',
            goals: [
                'Integrate seamlessly with VS Code UI',
                'Provide helpful commands accessible via Command Palette',
                'Show relevant information in the sidebar',
                'Support configuration via VS Code settings',
            ],
        },
        featureBlocks: [
            {
                id: crypto.randomUUID(),
                name: 'Commands',
                description: 'Command Palette actions for key features',
                purpose: 'Allow users to invoke extension features',
                acceptanceCriteria: [
                    'Commands registered in package.json',
                    'Commands appear in Command Palette',
                    'Commands show progress for long operations',
                    'Commands handle errors gracefully',
                ],
                technicalNotes: 'Use vscode.commands.registerCommand',
                priority: 'critical',
                order: 0,
            },
            {
                id: crypto.randomUUID(),
                name: 'Tree View',
                description: 'Sidebar panel showing hierarchical data',
                purpose: 'Display information in an organized, browsable format',
                acceptanceCriteria: [
                    'Tree view appears in Activity Bar',
                    'Items are expandable/collapsible',
                    'Items have context menu actions',
                    'Refresh button updates tree',
                ],
                technicalNotes: 'Implement TreeDataProvider interface',
                priority: 'high',
                order: 1,
            },
            {
                id: crypto.randomUUID(),
                name: 'Settings',
                description: 'User-configurable settings via VS Code preferences',
                purpose: 'Allow users to customize extension behavior',
                acceptanceCriteria: [
                    'Settings defined in package.json contributes.configuration',
                    'Settings have descriptions and defaults',
                    'Extension reacts to setting changes',
                    'Workspace and user settings supported',
                ],
                technicalNotes: 'Use vscode.workspace.getConfiguration',
                priority: 'medium',
                order: 2,
            },
            {
                id: crypto.randomUUID(),
                name: 'Webview Panel',
                description: 'Rich UI panel for complex interactions',
                purpose: 'Provide advanced UI beyond VS Code native components',
                acceptanceCriteria: [
                    'Webview opens in editor area',
                    'Retains state when hidden',
                    'Communicates with extension via messages',
                    'Follows VS Code theming',
                ],
                technicalNotes: 'Use vscode.window.createWebviewPanel',
                priority: 'medium',
                order: 3,
            },
        ],
        userStories: [
            {
                id: crypto.randomUUID(),
                userType: 'VS Code user',
                action: 'invoke extension commands from Command Palette',
                benefit: 'I can use the extension features quickly',
                relatedBlockIds: [],
                acceptanceCriteria: ['Ctrl+Shift+P shows extension commands', 'Commands have descriptive labels'],
                priority: 'critical',
            },
            {
                id: crypto.randomUUID(),
                userType: 'VS Code user',
                action: 'see extension data in the sidebar',
                benefit: 'I can browse information while coding',
                relatedBlockIds: [],
                acceptanceCriteria: ['Tree view in Activity Bar', 'Click item to open details'],
                priority: 'high',
            },
        ],
        developerStories: [
            {
                id: crypto.randomUUID(),
                action: 'implement TreeDataProvider for sidebar',
                benefit: 'data displays in VS Code native format',
                technicalRequirements: ['TreeDataProvider interface', 'EventEmitter for refresh', 'TreeItem icons'],
                apiNotes: 'vscode.window.registerTreeDataProvider',
                databaseNotes: 'N/A',
                estimatedHours: 4,
                relatedBlockIds: [],
                relatedTaskIds: [],
            },
        ],
        successCriteria: [
            {
                id: crypto.randomUUID(),
                description: 'Extension activates within 500ms of trigger',
                smartAttributes: { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true },
                relatedFeatureIds: [],
                relatedStoryIds: [],
                testable: true,
                priority: 'high',
            },
        ],
    },
};

/**
 * Documentation Site Template
 *
 * **Simple explanation**: A template for building documentation websites
 * with markdown content, navigation, and search.
 */
export const DOCS_SITE_TEMPLATE: PlanTemplate = {
    id: 'docs-site',
    name: 'Documentation Site',
    description: 'Static documentation site with markdown, navigation, and search',
    icon: '📚',
    category: 'docs',
    template: {
        overview: {
            name: 'My Documentation Site',
            description: 'A documentation website for developer guides, API references, and tutorials with full-text search and easy navigation.',
            goals: [
                'Organize documentation by topic',
                'Support markdown with code highlighting',
                'Provide fast full-text search',
                'Deploy as static site (no server)',
            ],
        },
        featureBlocks: [
            {
                id: crypto.randomUUID(),
                name: 'Markdown Rendering',
                description: 'Convert markdown files to HTML with syntax highlighting',
                purpose: 'Allow documentation to be written in markdown',
                acceptanceCriteria: [
                    'Standard markdown syntax supported',
                    'Code blocks with syntax highlighting',
                    'Tables, lists, and blockquotes',
                    'Custom components (admonitions)',
                ],
                technicalNotes: 'Use Docusaurus or VitePress',
                priority: 'critical',
                order: 0,
            },
            {
                id: crypto.randomUUID(),
                name: 'Navigation',
                description: 'Sidebar and breadcrumb navigation',
                purpose: 'Help users find and browse documentation',
                acceptanceCriteria: [
                    'Collapsible sidebar with categories',
                    'Breadcrumb showing current location',
                    'Previous/Next page links',
                    'Auto-generated from folder structure',
                ],
                technicalNotes: 'Configure in sidebar.js or similar',
                priority: 'high',
                order: 1,
            },
            {
                id: crypto.randomUUID(),
                name: 'Search',
                description: 'Full-text search across all documentation',
                purpose: 'Help users find specific information quickly',
                acceptanceCriteria: [
                    'Instant search results as you type',
                    'Highlights matching text',
                    'Keyboard navigation (up/down/enter)',
                    'Works offline',
                ],
                technicalNotes: 'Use Algolia DocSearch or local search',
                priority: 'high',
                order: 2,
            },
        ],
        userStories: [
            {
                id: crypto.randomUUID(),
                userType: 'developer',
                action: 'search for a specific topic',
                benefit: 'I can find the information I need',
                relatedBlockIds: [],
                acceptanceCriteria: ['Ctrl+K opens search', 'Results show context'],
                priority: 'high',
            },
        ],
        developerStories: [
            {
                id: crypto.randomUUID(),
                action: 'set up documentation site with VitePress',
                benefit: 'docs build and deploy automatically',
                technicalRequirements: ['VitePress config', 'GitHub Actions for deploy', 'Custom theme'],
                apiNotes: 'N/A - static site',
                databaseNotes: 'N/A',
                estimatedHours: 4,
                relatedBlockIds: [],
                relatedTaskIds: [],
            },
        ],
        successCriteria: [
            {
                id: crypto.randomUUID(),
                description: 'Search returns results within 100ms',
                smartAttributes: { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true },
                relatedFeatureIds: [],
                relatedStoryIds: [],
                testable: true,
                priority: 'high',
            },
        ],
    },
};

// ============================================================================
// Template Registry
// ============================================================================

/**
 * All available plan templates.
 */
export const PLAN_TEMPLATES: PlanTemplate[] = [
    WEB_APP_TEMPLATE,
    REST_API_TEMPLATE,
    CLI_TOOL_TEMPLATE,
    VSCODE_EXTENSION_TEMPLATE,
    DOCS_SITE_TEMPLATE,
];

/**
 * Get a template by ID.
 *
 * @param id - Template ID
 * @returns Template or undefined
 */
export function getTemplateById(id: string): PlanTemplate | undefined {
    return PLAN_TEMPLATES.find(t => t.id === id);
}

/**
 * Get templates by category.
 *
 * @param category - Template category
 * @returns Array of templates in that category
 */
export function getTemplatesByCategory(category: PlanTemplate['category']): PlanTemplate[] {
    return PLAN_TEMPLATES.filter(t => t.category === category);
}

// ============================================================================
// HTML Rendering
// ============================================================================

/**
 * Renders the template selector UI.
 *
 * **Simple explanation**: Creates the HTML for a template picker dialog
 * that shows all available templates with their descriptions.
 *
 * @returns HTML string
 */
export function renderTemplateSelector(): string {
    return `
    <div class="template-selector">
      <h3>📋 Start from a Template</h3>
      <p class="template-hint">Choose a template to get started quickly, or start from scratch.</p>
      
      <div class="template-grid">
        ${PLAN_TEMPLATES.map(t => `
          <div class="template-card" data-template-id="${t.id}" onclick="loadTemplate('${t.id}')">
            <div class="template-icon">${t.icon}</div>
            <div class="template-info">
              <div class="template-name">${escapeHtml(t.name)}</div>
              <div class="template-desc">${escapeHtml(t.description)}</div>
            </div>
          </div>
        `).join('')}
        
        <div class="template-card template-blank" onclick="startBlank()">
          <div class="template-icon">📝</div>
          <div class="template-info">
            <div class="template-name">Blank Plan</div>
            <div class="template-desc">Start from scratch with an empty plan</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Get CSS styles for template selector.
 */
export function getTemplateSelectorStyles(): string {
    return `
    .template-selector {
      margin-bottom: 24px;
    }

    .template-selector h3 {
      margin-bottom: 8px;
    }

    .template-hint {
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      margin-bottom: 16px;
    }

    .template-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 12px;
    }

    .template-card {
      display: flex;
      gap: 12px;
      padding: 12px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .template-card:hover {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 0 0 1px var(--vscode-focusBorder);
    }

    .template-card.selected {
      border-color: var(--vscode-activityBarBadge-background);
      background: var(--vscode-list-activeSelectionBackground);
    }

    .template-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .template-info {
      flex: 1;
      min-width: 0;
    }

    .template-name {
      font-weight: 600;
      margin-bottom: 4px;
    }

    .template-desc {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .template-blank {
      border-style: dashed;
    }
  `;
}

/**
 * Get JavaScript for template selector.
 */
export function getTemplateSelectorScript(): string {
    return `
    function loadTemplate(templateId) {
      vscode.postMessage({ command: 'loadTemplate', templateId });
    }

    function startBlank() {
      vscode.postMessage({ command: 'startBlank' });
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function escapeHtml(text: string): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Apply a template to create a new plan.
 *
 * **Simple explanation**: Takes a template and generates a new plan with
 * fresh UUIDs and current timestamps. Like copying a template but making
 * it unique.
 *
 * @param templateId - Template ID to apply
 * @returns New plan based on template, or undefined if template not found
 */
export function applyTemplate(templateId: string): CompletePlan | undefined {
    const template = getTemplateById(templateId);
    if (!template) return undefined;

    const now = new Date();

    // Deep clone and regenerate IDs
    const plan: CompletePlan = {
        metadata: {
            id: crypto.randomUUID(),
            name: template.template.overview?.name || 'New Plan',
            createdAt: now,
            updatedAt: now,
            version: 1,
        },
        overview: template.template.overview || { name: '', description: '', goals: [] },
        featureBlocks: (template.template.featureBlocks || []).map(f => ({
            ...f,
            id: crypto.randomUUID(),
        })),
        blockLinks: [],
        conditionalLogic: [],
        userStories: (template.template.userStories || []).map(s => ({
            ...s,
            id: crypto.randomUUID(),
        })),
        developerStories: (template.template.developerStories || []).map(d => ({
            ...d,
            id: crypto.randomUUID(),
        })),
        successCriteria: (template.template.successCriteria || []).map(c => ({
            ...c,
            id: crypto.randomUUID(),
        })),
    };

    return plan;
}
