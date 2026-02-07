/**
 * AI-Powered Suggestions (MT-033.17)
 *
 * **Simple explanation**: Uses AI to analyze your plan and suggest improvements,
 * missing features, better wording, and potential issues. Like having an
 * experienced project manager review your plan.
 *
 * @module ui/aiSuggestions
 */

import { CompletePlan, FeatureBlock, UserStory, DeveloperStory } from '../planning/types';

// ============================================================================
// Types
// ============================================================================

export interface AISuggestion {
    /** Unique suggestion ID */
    id: string;
    /** Suggestion category */
    category: SuggestionCategory;
    /** Where this suggestion applies */
    targetPath?: string;
    /** The suggestion title */
    title: string;
    /** Detailed explanation */
    description: string;
    /** What to do about it */
    action?: string;
    /** Suggested replacement text (if applicable) */
    suggestedText?: string;
    /** Confidence score (0-100) */
    confidence: number;
    /** Priority */
    priority: 'low' | 'medium' | 'high';
    /** Whether user has dismissed this */
    dismissed: boolean;
    /** Whether user has applied this */
    applied: boolean;
}

export type SuggestionCategory =
    | 'clarity'       // Improve wording/clarity
    | 'completeness'  // Add missing items
    | 'specificity'   // Make more specific
    | 'splitting'     // Split large items
    | 'merging'       // Merge related items
    | 'dependency'    // Dependency suggestions
    | 'risk'          // Risk identification
    | 'best_practice'; // Industry best practices

export interface SuggestionConfig {
    /** Enable clarity suggestions */
    clarity: boolean;
    /** Enable completeness suggestions */
    completeness: boolean;
    /** Enable specificity suggestions */
    specificity: boolean;
    /** Enable split/merge suggestions */
    organization: boolean;
    /** Enable risk suggestions */
    risks: boolean;
    /** Minimum confidence to show */
    minConfidence: number;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_SUGGESTION_CONFIG: SuggestionConfig = {
    clarity: true,
    completeness: true,
    specificity: true,
    organization: true,
    risks: true,
    minConfidence: 60,
};

// Patterns for detecting issues
const VAGUE_WORDS = [
    'stuff', 'things', 'misc', 'etc', 'various', 'something',
    'somehow', 'somewhere', 'somewhat', 'properly', 'correctly',
    'basically', 'essentially', 'just', 'simply',
];

const IMPROVEMENT_VERBS = [
    'improve', 'enhance', 'better', 'optimize', 'streamline',
    'upgrade', 'refine', 'boost',
];

const PASSIVE_PATTERNS = [
    /should be (\w+ed)/gi,
    /will be (\w+ed)/gi,
    /can be (\w+ed)/gi,
    /must be (\w+ed)/gi,
];

// Feature suggestion templates by project type
const FEATURE_SUGGESTIONS: { [key: string]: string[] } = {
    web_app: [
        'User authentication and authorization',
        'User profile management',
        'Responsive design / mobile support',
        'Error handling and user feedback',
        'Loading states and skeleton screens',
        'Search functionality',
        'Settings/preferences page',
        'Analytics and tracking',
    ],
    api: [
        'Authentication (API keys, OAuth)',
        'Rate limiting',
        'Request validation',
        'Error response standardization',
        'API versioning',
        'Logging and monitoring',
        'Health check endpoint',
        'Documentation (OpenAPI/Swagger)',
    ],
    cli: [
        'Help command and documentation',
        'Configuration file support',
        'Progress indicators',
        'Colored output',
        'Error handling and exit codes',
        'Shell completion',
        'Version command',
        'Verbose/debug mode',
    ],
    vscode_extension: [
        'Command palette integration',
        'Settings/configuration',
        'Status bar indicator',
        'Output channel for logs',
        'Keyboard shortcuts',
        'Tree view provider',
        'Webview panel',
        'Activation events optimization',
    ],
};

// User story templates
const USER_STORY_TEMPLATES = [
    { userType: 'new user', action: 'sign up and create an account', benefit: 'I can access the system' },
    { userType: 'returning user', action: 'log in securely', benefit: 'I can access my data' },
    { userType: 'user', action: 'reset my password', benefit: 'I can regain access if I forget it' },
    { userType: 'user', action: 'receive clear error messages', benefit: 'I know how to fix problems' },
    { userType: 'admin', action: 'view usage analytics', benefit: 'I can understand how the system is used' },
];

// ============================================================================
// Suggestion Generation
// ============================================================================

/**
 * Generate AI-powered suggestions for a plan.
 *
 * **Simple explanation**: Analyzes your plan using pattern matching and
 * heuristics to find potential improvements. Returns suggestions you
 * can apply or dismiss.
 */
export function generateSuggestions(
    plan: CompletePlan,
    config: SuggestionConfig = DEFAULT_SUGGESTION_CONFIG
): AISuggestion[] {
    const suggestions: AISuggestion[] = [];

    if (config.clarity) {
        suggestions.push(...generateClaritySuggestions(plan));
    }

    if (config.completeness) {
        suggestions.push(...generateCompletenessSuggestions(plan));
    }

    if (config.specificity) {
        suggestions.push(...generateSpecificitySuggestions(plan));
    }

    if (config.organization) {
        suggestions.push(...generateOrganizationSuggestions(plan));
    }

    if (config.risks) {
        suggestions.push(...generateRiskSuggestions(plan));
    }

    // Filter by confidence and sort by priority
    return suggestions
        .filter(s => s.confidence >= config.minConfidence)
        .sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return b.confidence - a.confidence;
        });
}

/**
 * Generate clarity suggestions.
 */
function generateClaritySuggestions(plan: CompletePlan): AISuggestion[] {
    const suggestions: AISuggestion[] = [];
    let idCounter = 1;

    // Check project description
    if (plan.overview.description) {
        for (const word of VAGUE_WORDS) {
            if (plan.overview.description.toLowerCase().includes(word)) {
                suggestions.push({
                    id: `clarity-${idCounter++}`,
                    category: 'clarity',
                    targetPath: 'overview.description',
                    title: `Remove vague language: "${word}"`,
                    description: `The project description contains "${word}" which doesn't convey specific meaning.`,
                    action: `Replace "${word}" with more specific terminology`,
                    confidence: 75,
                    priority: 'medium',
                    dismissed: false,
                    applied: false,
                });
                break; // One suggestion per field
            }
        }

        // Check for passive voice
        for (const pattern of PASSIVE_PATTERNS) {
            const match = plan.overview.description.match(pattern);
            if (match) {
                suggestions.push({
                    id: `clarity-${idCounter++}`,
                    category: 'clarity',
                    targetPath: 'overview.description',
                    title: 'Consider active voice',
                    description: `Found passive construction "${match[0]}". Active voice is often clearer.`,
                    action: 'Rewrite using active voice',
                    confidence: 65,
                    priority: 'low',
                    dismissed: false,
                    applied: false,
                });
                break;
            }
        }
    }

    // Check feature descriptions
    plan.featureBlocks.forEach((feature, i) => {
        if (!feature.description) return;

        // Very short description
        if (feature.description.length < 30) {
            suggestions.push({
                id: `clarity-${idCounter++}`,
                category: 'clarity',
                targetPath: `featureBlocks[${i}].description`,
                title: `Expand "${feature.name}" description`,
                description: 'This feature description is quite brief. More detail helps developers understand requirements.',
                action: 'Add what, why, and acceptance criteria',
                confidence: 80,
                priority: 'medium',
                dismissed: false,
                applied: false,
            });
        }

        // Contains vague words
        for (const word of VAGUE_WORDS) {
            if (feature.description.toLowerCase().includes(word)) {
                suggestions.push({
                    id: `clarity-${idCounter++}`,
                    category: 'clarity',
                    targetPath: `featureBlocks[${i}].description`,
                    title: `Clarify "${feature.name}" description`,
                    description: `Contains vague word "${word}" - be more specific about what the feature does.`,
                    confidence: 70,
                    priority: 'low',
                    dismissed: false,
                    applied: false,
                });
                break;
            }
        }
    });

    return suggestions;
}

/**
 * Generate completeness suggestions.
 */
function generateCompletenessSuggestions(plan: CompletePlan): AISuggestion[] {
    const suggestions: AISuggestion[] = [];
    let idCounter = 1;

    // Detect project type for feature suggestions
    const projectType = detectProjectType(plan);

    // Suggest missing common features
    if (projectType && FEATURE_SUGGESTIONS[projectType]) {
        const existingNames = plan.featureBlocks.map(f => f.name.toLowerCase());
        const suggestedFeatures = FEATURE_SUGGESTIONS[projectType];

        for (const feature of suggestedFeatures) {
            // Check if something similar exists
            const exists = existingNames.some(name =>
                name.includes(feature.toLowerCase().split(' ')[0]) ||
                feature.toLowerCase().includes(name.split(' ')[0])
            );

            if (!exists) {
                suggestions.push({
                    id: `complete-${idCounter++}`,
                    category: 'completeness',
                    targetPath: 'featureBlocks',
                    title: `Consider adding: ${feature}`,
                    description: `Most ${projectType.replace('_', ' ')} projects include ${feature.toLowerCase()}.`,
                    action: 'Add this feature to your plan',
                    suggestedText: feature,
                    confidence: 70,
                    priority: 'medium',
                    dismissed: false,
                    applied: false,
                });
            }
        }
    }

    // Suggest user stories if missing
    if (plan.userStories.length === 0 && plan.featureBlocks.length > 0) {
        suggestions.push({
            id: `complete-${idCounter++}`,
            category: 'completeness',
            targetPath: 'userStories',
            title: 'Add user stories',
            description: 'Your plan has features but no user stories. User stories help capture requirements from the end-user perspective.',
            action: 'Add at least 3 user stories',
            confidence: 85,
            priority: 'high',
            dismissed: false,
            applied: false,
        });
    }

    // Suggest common user stories
    if (plan.userStories.length > 0 && plan.userStories.length < 5) {
        const existingActions = plan.userStories.map(s => s.action.toLowerCase());

        for (const template of USER_STORY_TEMPLATES) {
            const actionWords = template.action.toLowerCase().split(' ').slice(0, 2).join(' ');
            const exists = existingActions.some(a => a.includes(actionWords));

            if (!exists) {
                suggestions.push({
                    id: `complete-${idCounter++}`,
                    category: 'completeness',
                    targetPath: 'userStories',
                    title: `Consider user story: "${template.action}"`,
                    description: `As a ${template.userType}, I want to ${template.action}, so that ${template.benefit}.`,
                    action: 'Add this user story',
                    confidence: 65,
                    priority: 'low',
                    dismissed: false,
                    applied: false,
                });
            }
        }
    }

    // Features without acceptance criteria
    const featuresNoCriteria = plan.featureBlocks.filter(f => f.acceptanceCriteria.length === 0);
    if (featuresNoCriteria.length > 0) {
        suggestions.push({
            id: `complete-${idCounter++}`,
            category: 'completeness',
            targetPath: 'featureBlocks',
            title: `Add acceptance criteria to ${featuresNoCriteria.length} feature(s)`,
            description: `Features need acceptance criteria to define "done": ${featuresNoCriteria.map(f => f.name).join(', ')}`,
            action: 'Add at least one acceptance criterion per feature',
            confidence: 90,
            priority: 'high',
            dismissed: false,
            applied: false,
        });
    }

    // No success criteria
    if (plan.successCriteria.length === 0) {
        suggestions.push({
            id: `complete-${idCounter++}`,
            category: 'completeness',
            targetPath: 'successCriteria',
            title: 'Add success criteria',
            description: 'Your plan has no success criteria. How will you know when the project is successful?',
            action: 'Add at least 3 measurable success criteria',
            confidence: 85,
            priority: 'high',
            dismissed: false,
            applied: false,
        });
    }

    return suggestions;
}

/**
 * Generate specificity suggestions.
 */
function generateSpecificitySuggestions(plan: CompletePlan): AISuggestion[] {
    const suggestions: AISuggestion[] = [];
    let idCounter = 1;

    // Goals with improvement verbs but no metrics
    plan.overview.goals.forEach((goal, i) => {
        for (const verb of IMPROVEMENT_VERBS) {
            if (goal.toLowerCase().includes(verb) && !/\d/.test(goal)) {
                suggestions.push({
                    id: `specific-${idCounter++}`,
                    category: 'specificity',
                    targetPath: `overview.goals[${i}]`,
                    title: 'Add metrics to goal',
                    description: `"${truncate(goal, 40)}" uses "${verb}" but lacks specific metrics.`,
                    action: 'Add numbers or percentages (e.g., "by 50%", "within 2 seconds")',
                    confidence: 80,
                    priority: 'medium',
                    dismissed: false,
                    applied: false,
                });
                break;
            }
        }
    });

    // Success criteria without measurable attributes
    plan.successCriteria.forEach((criterion, i) => {
        if (!criterion.smartAttributes.measurable && criterion.description) {
            const descrip = criterion.description.toLowerCase();
            // Looks like it should have a metric
            if (
                descrip.includes('faster') ||
                descrip.includes('more') ||
                descrip.includes('less') ||
                descrip.includes('increase') ||
                descrip.includes('decrease')
            ) {
                suggestions.push({
                    id: `specific-${idCounter++}`,
                    category: 'specificity',
                    targetPath: `successCriteria[${i}]`,
                    title: 'Add target value to criterion',
                    description: `"${truncate(criterion.description, 40)}" could benefit from a specific target value.`,
                    action: 'Set a measurable target value',
                    confidence: 75,
                    priority: 'medium',
                    dismissed: false,
                    applied: false,
                });
            }
        }
    });

    // Developer stories without estimates
    const noEstimates = plan.developerStories.filter(s => !s.estimatedHours || s.estimatedHours <= 0);
    if (noEstimates.length > 0) {
        suggestions.push({
            id: `specific-${idCounter++}`,
            category: 'specificity',
            targetPath: 'developerStories',
            title: `Add estimates to ${noEstimates.length} dev story(ies)`,
            description: 'Developer stories without time estimates make planning difficult.',
            action: 'Add hour estimates to all developer stories',
            confidence: 85,
            priority: 'medium',
            dismissed: false,
            applied: false,
        });
    }

    return suggestions;
}

/**
 * Generate organization suggestions.
 */
function generateOrganizationSuggestions(plan: CompletePlan): AISuggestion[] {
    const suggestions: AISuggestion[] = [];
    let idCounter = 1;

    // Very large features that could be split
    plan.featureBlocks.forEach((feature, i) => {
        // Multiple acceptance criteria might indicate complex feature
        if (feature.acceptanceCriteria.length > 5) {
            suggestions.push({
                id: `org-${idCounter++}`,
                category: 'splitting',
                targetPath: `featureBlocks[${i}]`,
                title: `Consider splitting "${feature.name}"`,
                description: `This feature has ${feature.acceptanceCriteria.length} acceptance criteria, which might indicate it's too large.`,
                action: 'Split into smaller, focused features',
                confidence: 70,
                priority: 'low',
                dismissed: false,
                applied: false,
            });
        }

        // Long description with "and" suggesting multiple features
        if (feature.description && feature.description.length > 200) {
            const andCount = (feature.description.match(/\band\b/gi) || []).length;
            if (andCount >= 3) {
                suggestions.push({
                    id: `org-${idCounter++}`,
                    category: 'splitting',
                    targetPath: `featureBlocks[${i}]`,
                    title: `"${feature.name}" might be multiple features`,
                    description: 'The description contains multiple "and" conjunctions suggesting it covers multiple capabilities.',
                    action: 'Consider splitting into separate features',
                    confidence: 65,
                    priority: 'low',
                    dismissed: false,
                    applied: false,
                });
            }
        }
    });

    // User stories with "and" in action
    plan.userStories.forEach((story, i) => {
        if (story.action.toLowerCase().includes(' and ')) {
            suggestions.push({
                id: `org-${idCounter++}`,
                category: 'splitting',
                targetPath: `userStories[${i}]`,
                title: 'Split user story',
                description: `"${truncate(story.action, 40)}" contains multiple actions. Each story should have one action.`,
                action: 'Split into separate user stories',
                confidence: 75,
                priority: 'medium',
                dismissed: false,
                applied: false,
            });
        }
    });

    // Similar features that could be merged
    for (let i = 0; i < plan.featureBlocks.length; i++) {
        for (let j = i + 1; j < plan.featureBlocks.length; j++) {
            const similarity = calculateSimilarity(
                plan.featureBlocks[i].name.toLowerCase(),
                plan.featureBlocks[j].name.toLowerCase()
            );
            if (similarity > 0.6) {
                suggestions.push({
                    id: `org-${idCounter++}`,
                    category: 'merging',
                    targetPath: `featureBlocks[${i}]`,
                    title: 'Possibly duplicate features',
                    description: `"${plan.featureBlocks[i].name}" and "${plan.featureBlocks[j].name}" have similar names.`,
                    action: 'Review and merge if they represent the same capability',
                    confidence: 65,
                    priority: 'low',
                    dismissed: false,
                    applied: false,
                });
            }
        }
    }

    return suggestions;
}

/**
 * Generate risk suggestions.
 */
function generateRiskSuggestions(plan: CompletePlan): AISuggestion[] {
    const suggestions: AISuggestion[] = [];
    let idCounter = 1;

    // Many critical priority features
    const criticalCount = plan.featureBlocks.filter(f => f.priority === 'critical').length;
    if (criticalCount > plan.featureBlocks.length * 0.5 && plan.featureBlocks.length > 2) {
        suggestions.push({
            id: `risk-${idCounter++}`,
            category: 'risk',
            title: 'Too many critical features',
            description: `${criticalCount} of ${plan.featureBlocks.length} features are marked "critical". If everything is critical, nothing is.`,
            action: 'Re-evaluate priorities and limit critical to truly essential features',
            confidence: 80,
            priority: 'high',
            dismissed: false,
            applied: false,
        });
    }

    // Features with no dependencies in complex plan
    if (plan.featureBlocks.length > 5 && plan.blockLinks.length === 0) {
        suggestions.push({
            id: `risk-${idCounter++}`,
            category: 'risk',
            title: 'No dependencies defined',
            description: 'With many features, defining dependencies helps with planning and parallel work.',
            action: 'Add "requires" or "blocks" dependencies between features',
            confidence: 75,
            priority: 'medium',
            dismissed: false,
            applied: false,
        });
    }

    // Large estimated scope
    const totalHours = plan.developerStories.reduce((sum, s) => sum + (s.estimatedHours || 0), 0);
    if (totalHours > 160) { // > 1 month
        suggestions.push({
            id: `risk-${idCounter++}`,
            category: 'risk',
            title: 'Large project scope',
            description: `Total estimated time is ${totalHours} hours (${Math.round(totalHours / 40)} weeks). Consider phasing.`,
            action: 'Break into phases/releases with intermediate milestones',
            confidence: 70,
            priority: 'medium',
            dismissed: false,
            applied: false,
        });
    }

    return suggestions;
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Renders the AI suggestions panel.
 */
export function renderSuggestionsPanel(suggestions: AISuggestion[]): string {
    const active = suggestions.filter(s => !s.dismissed && !s.applied);
    const dismissed = suggestions.filter(s => s.dismissed);
    const applied = suggestions.filter(s => s.applied);

    if (active.length === 0 && dismissed.length === 0 && applied.length === 0) {
        return `
      <div class="suggestions-panel empty">
        <div class="suggestions-empty">
          <div class="icon">🤖</div>
          <div class="message">No suggestions available</div>
          <div class="hint">Try adding more content to your plan</div>
        </div>
      </div>
    `;
    }

    return `
    <div class="suggestions-panel">
      <div class="suggestions-header">
        <h4>🤖 AI Suggestions</h4>
        <span class="suggestion-count">${active.length} active</span>
      </div>

      ${active.length > 0 ? `
        <div class="suggestions-list">
          ${active.map(s => renderSuggestionCard(s)).join('')}
        </div>
      ` : `
        <div class="suggestions-empty-inline">
          All suggestions addressed! 🎉
        </div>
      `}

      ${applied.length > 0 ? `
        <details class="suggestions-section">
          <summary>Applied (${applied.length})</summary>
          <div class="suggestions-list applied">
            ${applied.map(s => renderSuggestionCard(s, true)).join('')}
          </div>
        </details>
      ` : ''}

      ${dismissed.length > 0 ? `
        <details class="suggestions-section">
          <summary>Dismissed (${dismissed.length})</summary>
          <div class="suggestions-list dismissed">
            ${dismissed.map(s => renderSuggestionCard(s, true)).join('')}
          </div>
        </details>
      ` : ''}
    </div>
  `;
}

function renderSuggestionCard(suggestion: AISuggestion, compact: boolean = false): string {
    const categoryIcons: Record<SuggestionCategory, string> = {
        clarity: '📝',
        completeness: '➕',
        specificity: '🎯',
        splitting: '✂️',
        merging: '🔗',
        dependency: '🔀',
        risk: '⚠️',
        best_practice: '⭐',
    };

    return `
    <div class="suggestion-card ${suggestion.priority} ${suggestion.dismissed ? 'dismissed' : ''} ${suggestion.applied ? 'applied' : ''}" data-suggestion-id="${suggestion.id}">
      <div class="suggestion-icon">${categoryIcons[suggestion.category]}</div>
      <div class="suggestion-content">
        <div class="suggestion-title">${escapeHtml(suggestion.title)}</div>
        ${!compact ? `
          <div class="suggestion-description">${escapeHtml(suggestion.description)}</div>
          ${suggestion.action ? `<div class="suggestion-action">💡 ${escapeHtml(suggestion.action)}</div>` : ''}
        ` : ''}
        <div class="suggestion-meta">
          <span class="confidence">${suggestion.confidence}% confidence</span>
          <span class="category">${suggestion.category}</span>
        </div>
      </div>
      ${!suggestion.dismissed && !suggestion.applied ? `
        <div class="suggestion-actions">
          ${suggestion.suggestedText ? `
            <button class="btn-small btn-primary" onclick="applySuggestion('${suggestion.id}')">Apply</button>
          ` : ''}
          <button class="btn-small" onclick="dismissSuggestion('${suggestion.id}')">Dismiss</button>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Get CSS styles for AI suggestions.
 */
export function getSuggestionsStyles(): string {
    return `
    .suggestions-panel {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      padding: 16px;
    }

    .suggestions-panel.empty {
      padding: 32px;
    }

    .suggestions-empty {
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    .suggestions-empty .icon {
      font-size: 48px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .suggestions-empty .message {
      font-size: 14px;
      margin-bottom: 4px;
    }

    .suggestions-empty .hint {
      font-size: 12px;
    }

    .suggestions-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .suggestions-header h4 {
      margin: 0;
    }

    .suggestion-count {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .suggestions-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .suggestions-empty-inline {
      text-align: center;
      padding: 20px;
      color: var(--vscode-testing-iconPassed);
    }

    .suggestion-card {
      display: flex;
      gap: 12px;
      padding: 12px;
      background: var(--vscode-input-background);
      border-radius: 6px;
      border-left: 4px solid var(--vscode-input-border);
    }

    .suggestion-card.high {
      border-left-color: var(--vscode-errorForeground);
    }

    .suggestion-card.medium {
      border-left-color: var(--vscode-editorWarning-foreground);
    }

    .suggestion-card.low {
      border-left-color: var(--vscode-editorInfo-foreground);
    }

    .suggestion-card.dismissed {
      opacity: 0.6;
    }

    .suggestion-card.applied {
      border-left-color: var(--vscode-testing-iconPassed);
    }

    .suggestion-icon {
      font-size: 20px;
    }

    .suggestion-content {
      flex: 1;
      min-width: 0;
    }

    .suggestion-title {
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 4px;
    }

    .suggestion-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }

    .suggestion-action {
      font-size: 11px;
      padding: 4px 6px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      margin: 6px 0;
    }

    .suggestion-meta {
      display: flex;
      gap: 12px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    .suggestion-actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-self: center;
    }

    .suggestions-section {
      margin-top: 16px;
    }

    .suggestions-section summary {
      cursor: pointer;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    .suggestions-list.applied .suggestion-card,
    .suggestions-list.dismissed .suggestion-card {
      padding: 8px 12px;
    }
  `;
}

/**
 * Get JavaScript for AI suggestions.
 */
export function getSuggestionsScript(): string {
    return `
    function applySuggestion(suggestionId) {
      vscode.postMessage({ command: 'applySuggestion', suggestionId });
    }

    function dismissSuggestion(suggestionId) {
      vscode.postMessage({ command: 'dismissSuggestion', suggestionId });
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function detectProjectType(plan: CompletePlan): string | null {
    const text = [
        plan.overview.name,
        plan.overview.description,
        ...plan.featureBlocks.map(f => f.name),
    ].join(' ').toLowerCase();

    if (text.includes('vscode') || text.includes('extension') || text.includes('vs code')) {
        return 'vscode_extension';
    }
    if (text.includes('api') || text.includes('rest') || text.includes('endpoint')) {
        return 'api';
    }
    if (text.includes('cli') || text.includes('command line') || text.includes('terminal')) {
        return 'cli';
    }
    if (text.includes('web') || text.includes('app') || text.includes('frontend') || text.includes('ui')) {
        return 'web_app';
    }

    return null;
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function calculateSimilarity(str1: string, str2: string): number {
    // Simple Jaccard similarity on words
    const words1 = new Set(str1.split(/\W+/).filter(w => w.length > 2));
    const words2 = new Set(str2.split(/\W+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    let intersection = 0;
    for (const word of words1) {
        if (words2.has(word)) intersection++;
    }

    const union = words1.size + words2.size - intersection;
    return intersection / union;
}

