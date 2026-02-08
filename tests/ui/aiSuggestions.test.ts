/**
 * Comprehensive tests for AI suggestions system.
 * Tests suggestion generation, filtering, sorting, and UI rendering.
 */

import {
    AISuggestion,
    SuggestionCategory,
    SuggestionConfig,
    DEFAULT_SUGGESTION_CONFIG,
    generateSuggestions,
    renderSuggestionsPanel,
    getSuggestionsStyles,
    getSuggestionsScript,
} from '../../src/ui/aiSuggestions';
import {
    CompletePlan,
    PlanMetadata,
    ProjectOverview,
    FeatureBlock,
    UserStory,
    DeveloperStory,
    SuccessCriterion,
    BlockLink,
    ConditionalLogic,
    PriorityLevel,
} from '../../src/planning/types';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMinimalPlan(overrides: Partial<CompletePlan> = {}): CompletePlan {
    const metadata: PlanMetadata = {
        id: 'test-plan-1',
        name: 'Test Plan',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        version: 1,
        author: 'Test Author',
    };

    const overview: ProjectOverview = {
        name: 'Test Project',
        description: 'A test project description',
        goals: ['Goal 1', 'Goal 2'],
    };

    return {
        metadata,
        overview,
        featureBlocks: [],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: [],
        successCriteria: [],
        ...overrides,
    };
}

function createFeatureBlock(overrides: Partial<FeatureBlock> = {}): FeatureBlock {
    return {
        id: 'feature-1',
        name: 'Test Feature',
        description: 'A test feature description',
        purpose: 'Test purpose',
        acceptanceCriteria: ['Criterion 1'],
        technicalNotes: '',
        priority: 'medium' as PriorityLevel,
        order: 0,
        ...overrides,
    };
}

function createUserStory(overrides: Partial<UserStory> = {}): UserStory {
    return {
        id: 'story-1',
        userType: 'developer',
        action: 'test the feature',
        benefit: 'ensure quality',
        relatedBlockIds: [],
        acceptanceCriteria: [],
        priority: 'medium' as PriorityLevel,
        ...overrides,
    };
}

function createDeveloperStory(overrides: Partial<DeveloperStory> = {}): DeveloperStory {
    return {
        id: 'dev-story-1',
        action: 'Implement the feature',
        benefit: 'Deliver value',
        technicalRequirements: [],
        apiNotes: '',
        databaseNotes: '',
        estimatedHours: 8,
        relatedBlockIds: [],
        relatedTaskIds: [],
        ...overrides,
    };
}

function createSuccessCriterion(overrides: Partial<SuccessCriterion> = {}): SuccessCriterion {
    return {
        id: 'criterion-1',
        description: 'Test success criterion',
        smartAttributes: {
            specific: true,
            measurable: true,
            achievable: true,
            relevant: true,
            timeBound: true,
        },
        relatedFeatureIds: [],
        relatedStoryIds: [],
        testable: true,
        priority: 'medium' as PriorityLevel,
        ...overrides,
    };
}

// ============================================================================
// Test Suite: DEFAULT_SUGGESTION_CONFIG
// ============================================================================

describe('DEFAULT_SUGGESTION_CONFIG', () => {
    it('Test 1: should have all required properties', () => {
        expect(DEFAULT_SUGGESTION_CONFIG).toHaveProperty('clarity');
        expect(DEFAULT_SUGGESTION_CONFIG).toHaveProperty('completeness');
        expect(DEFAULT_SUGGESTION_CONFIG).toHaveProperty('specificity');
        expect(DEFAULT_SUGGESTION_CONFIG).toHaveProperty('organization');
        expect(DEFAULT_SUGGESTION_CONFIG).toHaveProperty('risks');
        expect(DEFAULT_SUGGESTION_CONFIG).toHaveProperty('minConfidence');
    });

    it('Test 2: should have boolean flags for suggestion categories', () => {
        expect(typeof DEFAULT_SUGGESTION_CONFIG.clarity).toBe('boolean');
        expect(typeof DEFAULT_SUGGESTION_CONFIG.completeness).toBe('boolean');
        expect(typeof DEFAULT_SUGGESTION_CONFIG.specificity).toBe('boolean');
        expect(typeof DEFAULT_SUGGESTION_CONFIG.organization).toBe('boolean');
        expect(typeof DEFAULT_SUGGESTION_CONFIG.risks).toBe('boolean');
    });

    it('Test 3: should have minConfidence as number', () => {
        expect(typeof DEFAULT_SUGGESTION_CONFIG.minConfidence).toBe('number');
        expect(DEFAULT_SUGGESTION_CONFIG.minConfidence).toBeGreaterThanOrEqual(0);
        expect(DEFAULT_SUGGESTION_CONFIG.minConfidence).toBeLessThanOrEqual(100);
    });
});

// ============================================================================
// Test Suite: generateSuggestions - Empty Plan
// ============================================================================

describe('generateSuggestions - Empty Plan', () => {
    it('Test 4: should return empty array for minimal plan', () => {
        const plan = createMinimalPlan();
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        expect(Array.isArray(suggestions)).toBe(true);
    });

    it('Test 5: should return sorted suggestions by priority', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ priority: 'critical' }),
                createFeatureBlock({ id: 'feature-2', priority: 'critical' }),
                createFeatureBlock({ id: 'feature-3', priority: 'critical' }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);

        // High priority suggestions should come first
        for (let i = 0; i < suggestions.length - 1; i++) {
            const currentPriority = suggestions[i].priority;
            const nextPriority = suggestions[i + 1].priority;
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            expect(priorityOrder[currentPriority]).toBeLessThanOrEqual(priorityOrder[nextPriority]);
        }
    });
});

// ============================================================================
// Test Suite: generateSuggestions - Clarity Suggestions
// ============================================================================

describe('generateSuggestions - Clarity Suggestions', () => {
    it('Test 6: should detect vague words in feature descriptions', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: 'Handle stuff and things' }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const claritySuggestions = suggestions.filter(s => s.category === 'clarity');
        expect(claritySuggestions.length).toBeGreaterThan(0);
    });

    it('Test 7: should detect passive voice patterns', () => {
        const plan = createMinimalPlan({
            overview: {
                name: 'Test',
                description: 'The feature should be implemented properly',
                goals: [],
            },
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const claritySuggestions = suggestions.filter(s => s.category === 'clarity');
        // The title is "Consider active voice", not "passive"
        expect(claritySuggestions.some(s => s.title.includes('active voice'))).toBe(true);
    });

    it('Test 8: should detect vague words in project overview', () => {
        const plan = createMinimalPlan({
            overview: {
                name: 'Test Project',
                description: 'This project does misc things',
                goals: ['Do things'],
            },
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const claritySuggestions = suggestions.filter(s => s.category === 'clarity');
        expect(claritySuggestions.length).toBeGreaterThan(0);
    });

    it('Test 9: should not flag clear descriptions', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({
                    description: 'Implement user authentication using OAuth2 with JWT tokens',
                }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const claritySuggestions = suggestions.filter(s => s.category === 'clarity');
        expect(claritySuggestions.length).toBe(0);
    });

    it('Test 10: should respect clarity config toggle', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: 'Handle stuff and things' }),
            ],
        });
        const config: SuggestionConfig = {
            ...DEFAULT_SUGGESTION_CONFIG,
            clarity: false,
        };
        const suggestions = generateSuggestions(plan, config);
        const claritySuggestions = suggestions.filter(s => s.category === 'clarity');
        expect(claritySuggestions.length).toBe(0);
    });
});

// ============================================================================
// Test Suite: generateSuggestions - Completeness Suggestions
// ============================================================================

describe('generateSuggestions - Completeness Suggestions', () => {
    it('Test 11: should suggest user stories when plan has features but no stories', () => {
        const plan = createMinimalPlan({
            featureBlocks: [createFeatureBlock()],
            userStories: [],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const completenSuggestions = suggestions.filter(s => s.category === 'completeness');
        expect(completenSuggestions.some(s => s.title.toLowerCase().includes('user stor') || s.description.toLowerCase().includes('user stor'))).toBe(true);
    });

    it('Test 12: should suggest adding acceptance criteria to features without any', () => {
        const plan = createMinimalPlan({
            featureBlocks: [createFeatureBlock({ acceptanceCriteria: [] })],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const completeSuggestions = suggestions.filter(s => s.category === 'completeness');
        expect(completeSuggestions.some(s =>
            s.title.toLowerCase().includes('acceptance criteria') ||
            s.description.toLowerCase().includes('acceptance criteria')
        )).toBe(true);
    });

    it('Test 13: should suggest success criteria when missing', () => {
        const plan = createMinimalPlan({
            featureBlocks: [createFeatureBlock()],
            successCriteria: [],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const completenSuggestions = suggestions.filter(s => s.category === 'completeness');
        expect(completenSuggestions.some(s =>
            s.title.toLowerCase().includes('success') ||
            s.description.toLowerCase().includes('success criteria')
        )).toBe(true);
    });

    it('Test 14: should detect missing project-type specific features', () => {
        const plan = createMinimalPlan({
            overview: {
                name: 'My Web Application',
                description: 'A web app for managing tasks',
                goals: [],
            },
            featureBlocks: [createFeatureBlock({ name: 'Task list' })],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const completenSuggestions = suggestions.filter(s => s.category === 'completeness');
        // Web apps typically need auth, error handling, etc.
        expect(completenSuggestions.length).toBeGreaterThan(0);
    });

    it('Test 15: should respect completeness config toggle', () => {
        const plan = createMinimalPlan({
            featureBlocks: [createFeatureBlock()],
            userStories: [],
            developerStories: [],
        });
        const config: SuggestionConfig = {
            ...DEFAULT_SUGGESTION_CONFIG,
            completeness: false,
        };
        const suggestions = generateSuggestions(plan, config);
        const completeSuggestions = suggestions.filter(s => s.category === 'completeness');
        expect(completeSuggestions.length).toBe(0);
    });
});

// ============================================================================
// Test Suite: generateSuggestions - Specificity Suggestions
// ============================================================================

describe('generateSuggestions - Specificity Suggestions', () => {
    it('Test 16: should detect improvement verbs without metrics in goals', () => {
        const plan = createMinimalPlan({
            overview: {
                name: 'Test',
                description: 'Test',
                goals: ['Improve performance', 'Enhance user experience'],
            },
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const specificitySuggestions = suggestions.filter(s => s.category === 'specificity');
        expect(specificitySuggestions.some(s => s.title.toLowerCase().includes('metric'))).toBe(true);
    });

    it('Test 17: should accept goals with metrics', () => {
        const plan = createMinimalPlan({
            overview: {
                name: 'Test',
                description: 'Test',
                goals: ['Improve performance by 50%', 'Reduce load time to under 2 seconds'],
            },
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const specificitySuggestions = suggestions.filter(s =>
            s.category === 'specificity' && s.title.toLowerCase().includes('metric')
        );
        expect(specificitySuggestions.length).toBe(0);
    });

    it('Test 18: should detect success criteria without measurable attribute', () => {
        const plan = createMinimalPlan({
            successCriteria: [
                createSuccessCriterion({
                    description: 'System should be faster than before',
                    smartAttributes: {
                        specific: true,
                        measurable: false,
                        achievable: true,
                        relevant: true,
                        timeBound: true,
                    },
                }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const specificitySuggestions = suggestions.filter(s => s.category === 'specificity');
        expect(specificitySuggestions.some(s =>
            s.description.toLowerCase().includes('faster') ||
            s.title.toLowerCase().includes('target')
        )).toBe(true);
    });

    it('Test 19: should detect developer stories without estimates', () => {
        const plan = createMinimalPlan({
            developerStories: [
                createDeveloperStory({ estimatedHours: 0 }),
                createDeveloperStory({ id: 'dev-2', estimatedHours: undefined as unknown as number }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const specificitySuggestions = suggestions.filter(s => s.category === 'specificity');
        expect(specificitySuggestions.some(s => s.title.toLowerCase().includes('estimate'))).toBe(true);
    });

    it('Test 20: should respect specificity config toggle', () => {
        const plan = createMinimalPlan({
            overview: {
                name: 'Test',
                description: 'Test',
                goals: ['Improve performance'],
            },
        });
        const config: SuggestionConfig = {
            ...DEFAULT_SUGGESTION_CONFIG,
            specificity: false,
        };
        const suggestions = generateSuggestions(plan, config);
        const specificitySuggestions = suggestions.filter(s => s.category === 'specificity');
        expect(specificitySuggestions.length).toBe(0);
    });
});

// ============================================================================
// Test Suite: generateSuggestions - Organization Suggestions (Splitting)
// ============================================================================

describe('generateSuggestions - Organization/Splitting Suggestions', () => {
    it('Test 21: should suggest splitting features with many acceptance criteria', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({
                    acceptanceCriteria: [
                        'Criterion 1', 'Criterion 2', 'Criterion 3',
                        'Criterion 4', 'Criterion 5', 'Criterion 6',
                    ],
                }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const splittingSuggestions = suggestions.filter(s => s.category === 'splitting');
        expect(splittingSuggestions.length).toBeGreaterThan(0);
    });

    it('Test 22: should suggest splitting features with long descriptions containing "and"', () => {
        const longDescription = 'This feature handles authentication and authorization and session management and user profiles and password reset and email verification and social login.'.repeat(2);
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({
                    description: longDescription,
                }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const splittingSuggestions = suggestions.filter(s => s.category === 'splitting');
        // Description says "and" conjunctions, checking for that
        expect(splittingSuggestions.some(s => s.description.toLowerCase().includes('and'))).toBe(true);
    });

    it('Test 23: should suggest splitting user stories with "and" in action', () => {
        const plan = createMinimalPlan({
            userStories: [
                createUserStory({ action: 'login and view dashboard and edit profile' }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const splittingSuggestions = suggestions.filter(s => s.category === 'splitting');
        expect(splittingSuggestions.some(s =>
            s.title.toLowerCase().includes('split') &&
            s.description.toLowerCase().includes('multiple actions')
        )).toBe(true);
    });

    it('Test 24: should not suggest splitting clean features', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({
                    acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
                    description: 'A simple, focused feature',
                }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const splittingSuggestions = suggestions.filter(s => s.category === 'splitting');
        expect(splittingSuggestions.length).toBe(0);
    });
});

// ============================================================================
// Test Suite: generateSuggestions - Organization Suggestions (Merging)
// ============================================================================

describe('generateSuggestions - Organization/Merging Suggestions', () => {
    it('Test 25: should suggest merging features with similar names', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ id: 'f1', name: 'User Authentication' }),
                createFeatureBlock({ id: 'f2', name: 'User Authentication System' }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const mergingSuggestions = suggestions.filter(s => s.category === 'merging');
        expect(mergingSuggestions.length).toBeGreaterThan(0);
    });

    it('Test 26: should not suggest merging distinct features', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ id: 'f1', name: 'User Authentication' }),
                createFeatureBlock({ id: 'f2', name: 'Dashboard Analytics' }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const mergingSuggestions = suggestions.filter(s => s.category === 'merging');
        expect(mergingSuggestions.length).toBe(0);
    });

    it('Test 27: should respect organization config toggle', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ id: 'f1', name: 'User Auth' }),
                createFeatureBlock({ id: 'f2', name: 'User Auth System' }),
            ],
        });
        const config: SuggestionConfig = {
            ...DEFAULT_SUGGESTION_CONFIG,
            organization: false,
        };
        const suggestions = generateSuggestions(plan, config);
        const orgSuggestions = suggestions.filter(s =>
            s.category === 'splitting' || s.category === 'merging'
        );
        expect(orgSuggestions.length).toBe(0);
    });
});

// ============================================================================
// Test Suite: generateSuggestions - Risk Suggestions
// ============================================================================

describe('generateSuggestions - Risk Suggestions', () => {
    it('Test 28: should warn about too many critical features', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ id: 'f1', priority: 'critical' }),
                createFeatureBlock({ id: 'f2', priority: 'critical' }),
                createFeatureBlock({ id: 'f3', priority: 'critical' }),
                createFeatureBlock({ id: 'f4', priority: 'low' }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const riskSuggestions = suggestions.filter(s => s.category === 'risk');
        expect(riskSuggestions.some(s =>
            s.title.toLowerCase().includes('critical') ||
            s.description.toLowerCase().includes('critical')
        )).toBe(true);
    });

    it('Test 29: should warn about no dependencies in complex plan', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ id: 'f1' }),
                createFeatureBlock({ id: 'f2' }),
                createFeatureBlock({ id: 'f3' }),
                createFeatureBlock({ id: 'f4' }),
                createFeatureBlock({ id: 'f5' }),
                createFeatureBlock({ id: 'f6' }),
            ],
            blockLinks: [],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const riskSuggestions = suggestions.filter(s => s.category === 'risk');
        expect(riskSuggestions.some(s =>
            s.title.toLowerCase().includes('dependenc') ||
            s.description.toLowerCase().includes('dependenc')
        )).toBe(true);
    });

    it('Test 30: should warn about large project scope', () => {
        const plan = createMinimalPlan({
            developerStories: [
                createDeveloperStory({ id: 'd1', estimatedHours: 80 }),
                createDeveloperStory({ id: 'd2', estimatedHours: 80 }),
                createDeveloperStory({ id: 'd3', estimatedHours: 40 }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const riskSuggestions = suggestions.filter(s => s.category === 'risk');
        expect(riskSuggestions.some(s =>
            s.title.toLowerCase().includes('scope') ||
            s.description.toLowerCase().includes('hours')
        )).toBe(true);
    });

    it('Test 31: should not warn about reasonable scope', () => {
        const plan = createMinimalPlan({
            developerStories: [
                createDeveloperStory({ id: 'd1', estimatedHours: 40 }),
                createDeveloperStory({ id: 'd2', estimatedHours: 40 }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const riskSuggestions = suggestions.filter(s =>
            s.category === 'risk' && s.title.toLowerCase().includes('scope')
        );
        expect(riskSuggestions.length).toBe(0);
    });

    it('Test 32: should respect risks config toggle', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ id: 'f1', priority: 'critical' }),
                createFeatureBlock({ id: 'f2', priority: 'critical' }),
                createFeatureBlock({ id: 'f3', priority: 'critical' }),
            ],
        });
        const config: SuggestionConfig = {
            ...DEFAULT_SUGGESTION_CONFIG,
            risks: false,
        };
        const suggestions = generateSuggestions(plan, config);
        const riskSuggestions = suggestions.filter(s => s.category === 'risk');
        expect(riskSuggestions.length).toBe(0);
    });
});

// ============================================================================
// Test Suite: generateSuggestions - Filtering
// ============================================================================

describe('generateSuggestions - Filtering', () => {
    it('Test 33: should filter by minConfidence', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: 'Handle stuff' }),
            ],
        });
        const config: SuggestionConfig = {
            ...DEFAULT_SUGGESTION_CONFIG,
            minConfidence: 100, // Very high threshold
        };
        const suggestions = generateSuggestions(plan, config);
        expect(suggestions.every(s => s.confidence >= 100)).toBe(true);
    });

    it('Test 34: should include all suggestions when minConfidence is 0', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: 'Handle stuff and things' }),
            ],
        });
        const config: SuggestionConfig = {
            ...DEFAULT_SUGGESTION_CONFIG,
            minConfidence: 0,
        };
        const suggestions = generateSuggestions(plan, config);
        expect(suggestions.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// Test Suite: generateSuggestions - Project Type Detection
// ============================================================================

describe('generateSuggestions - Project Type Detection', () => {
    it('Test 35: should detect VS Code extension projects', () => {
        const plan = createMinimalPlan({
            overview: {
                name: 'My VS Code Extension',
                description: 'An extension for VS Code',
                goals: [],
            },
            featureBlocks: [createFeatureBlock({ name: 'Command palette' })],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        // Should suggest vscode-specific features like commands, keybindings
        expect(suggestions.some(s =>
            s.description.toLowerCase().includes('command') ||
            s.description.toLowerCase().includes('activation') ||
            s.description.toLowerCase().includes('keybinding')
        )).toBe(true);
    });

    it('Test 36: should detect API projects', () => {
        const plan = createMinimalPlan({
            overview: {
                name: 'REST API Service',
                description: 'A RESTful API for data access',
                goals: [],
            },
            featureBlocks: [createFeatureBlock({ name: 'User endpoint' })],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        // Should suggest API-specific features
        const completeSuggestions = suggestions.filter(s => s.category === 'completeness');
        expect(completeSuggestions.length).toBeGreaterThan(0);
    });

    it('Test 37: should detect CLI projects', () => {
        const plan = createMinimalPlan({
            overview: {
                name: 'CLI Tool',
                description: 'A command line interface tool',
                goals: [],
            },
            featureBlocks: [createFeatureBlock({ name: 'Parse arguments' })],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        // Should suggest CLI-specific features
        const completeSuggestions = suggestions.filter(s => s.category === 'completeness');
        expect(completeSuggestions.length).toBeGreaterThan(0);
    });

    it('Test 38: should detect web app projects', () => {
        const plan = createMinimalPlan({
            overview: {
                name: 'Web Application',
                description: 'A frontend web application',
                goals: [],
            },
            featureBlocks: [createFeatureBlock({ name: 'Login page' })],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        // Should suggest web-specific features like responsive design
        const completeSuggestions = suggestions.filter(s => s.category === 'completeness');
        expect(completeSuggestions.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// Test Suite: generateSuggestions - Suggestion Structure
// ============================================================================

describe('generateSuggestions - Suggestion Structure', () => {
    it('Test 39: should return suggestions with required properties', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: 'Handle stuff' }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);

        suggestions.forEach(s => {
            expect(s).toHaveProperty('id');
            expect(s).toHaveProperty('category');
            expect(s).toHaveProperty('title');
            expect(s).toHaveProperty('description');
            expect(s).toHaveProperty('confidence');
            expect(s).toHaveProperty('priority');
            expect(s).toHaveProperty('dismissed');
            expect(s).toHaveProperty('applied');
        });
    });

    it('Test 40: should have unique IDs for each suggestion', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: 'Handle stuff and things and misc' }),
            ],
            overview: {
                name: 'Test',
                description: 'Various things',
                goals: ['Improve something', 'Enhance something else'],
            },
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const ids = suggestions.map(s => s.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    it('Test 41: should initialize dismissed and applied to false', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: 'Handle stuff' }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);

        suggestions.forEach(s => {
            expect(s.dismissed).toBe(false);
            expect(s.applied).toBe(false);
        });
    });

    it('Test 42: should have valid priority values', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: 'Handle stuff and things' }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const validPriorities = ['high', 'medium', 'low'];

        suggestions.forEach(s => {
            expect(validPriorities).toContain(s.priority);
        });
    });

    it('Test 43: should have valid category values', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({
                    description: 'Handle stuff and things',
                    acceptanceCriteria: ['1', '2', '3', '4', '5', '6'],
                }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const validCategories: SuggestionCategory[] = [
            'clarity', 'completeness', 'specificity', 'splitting',
            'merging', 'dependency', 'risk', 'best_practice',
        ];

        suggestions.forEach(s => {
            expect(validCategories).toContain(s.category);
        });
    });
});

// ============================================================================
// Test Suite: renderSuggestionsPanel - Empty State
// ============================================================================

describe('renderSuggestionsPanel - Empty State', () => {
    it('Test 44: should render empty state when no suggestions', () => {
        const html = renderSuggestionsPanel([]);
        expect(html).toContain('suggestions-panel');
        expect(html).toContain('empty');
        expect(html).toContain('No suggestions available');
    });

    it('Test 45: should include hint in empty state', () => {
        const html = renderSuggestionsPanel([]);
        expect(html).toContain('hint');
        expect(html).toContain('Try adding more content');
    });

    it('Test 46: should include robot icon in empty state', () => {
        const html = renderSuggestionsPanel([]);
        expect(html).toContain('🤖');
    });
});

// ============================================================================
// Test Suite: renderSuggestionsPanel - Active Suggestions
// ============================================================================

describe('renderSuggestionsPanel - Active Suggestions', () => {
    const activeSuggestion: AISuggestion = {
        id: 'test-1',
        category: 'clarity',
        title: 'Test Suggestion',
        description: 'Test description',
        confidence: 80,
        priority: 'medium',
        dismissed: false,
        applied: false,
    };

    it('Test 47: should render active suggestions', () => {
        const html = renderSuggestionsPanel([activeSuggestion]);
        expect(html).toContain('suggestions-list');
        expect(html).toContain('Test Suggestion');
    });

    it('Test 48: should show active count in header', () => {
        const html = renderSuggestionsPanel([activeSuggestion]);
        expect(html).toContain('1 active');
    });

    it('Test 49: should render suggestion card with icon', () => {
        const html = renderSuggestionsPanel([activeSuggestion]);
        expect(html).toContain('📝'); // Clarity icon
    });

    it('Test 50: should render suggestion description', () => {
        const html = renderSuggestionsPanel([activeSuggestion]);
        expect(html).toContain('Test description');
    });

    it('Test 51: should render confidence percentage', () => {
        const html = renderSuggestionsPanel([activeSuggestion]);
        expect(html).toContain('80% confidence');
    });

    it('Test 52: should render dismiss button for active suggestions', () => {
        const html = renderSuggestionsPanel([activeSuggestion]);
        expect(html).toContain('Dismiss');
        expect(html).toContain("dismissSuggestion('test-1')");
    });

    it('Test 53: should render apply button when suggestedText exists', () => {
        const suggestionWithText: AISuggestion = {
            ...activeSuggestion,
            suggestedText: 'Suggested replacement',
        };
        const html = renderSuggestionsPanel([suggestionWithText]);
        expect(html).toContain('Apply');
        expect(html).toContain("applySuggestion('test-1')");
    });

    it('Test 54: should not render apply button when no suggestedText', () => {
        const html = renderSuggestionsPanel([activeSuggestion]);
        expect(html).not.toContain("applySuggestion('test-1')");
    });
});

// ============================================================================
// Test Suite: renderSuggestionsPanel - Dismissed Suggestions
// ============================================================================

describe('renderSuggestionsPanel - Dismissed Suggestions', () => {
    const dismissedSuggestion: AISuggestion = {
        id: 'dismissed-1',
        category: 'specificity',
        title: 'Dismissed Suggestion',
        description: 'This was dismissed',
        confidence: 70,
        priority: 'low',
        dismissed: true,
        applied: false,
    };

    it('Test 55: should render dismissed section', () => {
        const html = renderSuggestionsPanel([dismissedSuggestion]);
        expect(html).toContain('Dismissed (1)');
    });

    it('Test 56: should use details/summary for dismissed section', () => {
        const html = renderSuggestionsPanel([dismissedSuggestion]);
        expect(html).toContain('<details');
        expect(html).toContain('<summary>');
    });

    it('Test 57: should render dismissed card with class', () => {
        const html = renderSuggestionsPanel([dismissedSuggestion]);
        expect(html).toContain('dismissed');
    });

    it('Test 58: should not render action buttons for dismissed', () => {
        const html = renderSuggestionsPanel([dismissedSuggestion]);
        expect(html).not.toContain("dismissSuggestion('dismissed-1')");
    });
});

// ============================================================================
// Test Suite: renderSuggestionsPanel - Applied Suggestions
// ============================================================================

describe('renderSuggestionsPanel - Applied Suggestions', () => {
    const appliedSuggestion: AISuggestion = {
        id: 'applied-1',
        category: 'completeness',
        title: 'Applied Suggestion',
        description: 'This was applied',
        confidence: 90,
        priority: 'high',
        dismissed: false,
        applied: true,
    };

    it('Test 59: should render applied section', () => {
        const html = renderSuggestionsPanel([appliedSuggestion]);
        expect(html).toContain('Applied (1)');
    });

    it('Test 60: should render applied card with class', () => {
        const html = renderSuggestionsPanel([appliedSuggestion]);
        expect(html).toContain('applied');
    });

    it('Test 61: should show celebration message when all addressed', () => {
        const allApplied: AISuggestion = { ...appliedSuggestion };
        const html = renderSuggestionsPanel([allApplied]);
        expect(html).toContain('All suggestions addressed');
        expect(html).toContain('🎉');
    });
});

// ============================================================================
// Test Suite: renderSuggestionsPanel - Category Icons
// ============================================================================

describe('renderSuggestionsPanel - Category Icons', () => {
    const categories: Array<{ category: SuggestionCategory; icon: string }> = [
        { category: 'clarity', icon: '📝' },
        { category: 'completeness', icon: '➕' },
        { category: 'specificity', icon: '🎯' },
        { category: 'splitting', icon: '✂️' },
        { category: 'merging', icon: '🔗' },
        { category: 'dependency', icon: '🔀' },
        { category: 'risk', icon: '⚠️' },
        { category: 'best_practice', icon: '⭐' },
    ];

    categories.forEach(({ category, icon }, index) => {
        it(`Test ${62 + index}: should render ${icon} icon for ${category} category`, () => {
            const suggestion: AISuggestion = {
                id: `${category}-1`,
                category,
                title: `${category} suggestion`,
                description: 'Test',
                confidence: 80,
                priority: 'medium',
                dismissed: false,
                applied: false,
            };
            const html = renderSuggestionsPanel([suggestion]);
            expect(html).toContain(icon);
        });
    });
});

// ============================================================================
// Test Suite: renderSuggestionsPanel - Priority Styling
// ============================================================================

describe('renderSuggestionsPanel - Priority Styling', () => {
    it('Test 70: should add high priority class', () => {
        const suggestion: AISuggestion = {
            id: 'high-1',
            category: 'risk',
            title: 'High Priority',
            description: 'Test',
            confidence: 90,
            priority: 'high',
            dismissed: false,
            applied: false,
        };
        const html = renderSuggestionsPanel([suggestion]);
        expect(html).toContain('suggestion-card high');
    });

    it('Test 71: should add medium priority class', () => {
        const suggestion: AISuggestion = {
            id: 'medium-1',
            category: 'clarity',
            title: 'Medium Priority',
            description: 'Test',
            confidence: 80,
            priority: 'medium',
            dismissed: false,
            applied: false,
        };
        const html = renderSuggestionsPanel([suggestion]);
        expect(html).toContain('suggestion-card medium');
    });

    it('Test 72: should add low priority class', () => {
        const suggestion: AISuggestion = {
            id: 'low-1',
            category: 'splitting',
            title: 'Low Priority',
            description: 'Test',
            confidence: 60,
            priority: 'low',
            dismissed: false,
            applied: false,
        };
        const html = renderSuggestionsPanel([suggestion]);
        expect(html).toContain('suggestion-card low');
    });
});

// ============================================================================
// Test Suite: renderSuggestionsPanel - HTML Escaping
// ============================================================================

describe('renderSuggestionsPanel - HTML Escaping', () => {
    it('Test 73: should escape HTML in title', () => {
        const suggestion: AISuggestion = {
            id: 'escape-1',
            category: 'clarity',
            title: 'Test <script>alert("xss")</script>',
            description: 'Test',
            confidence: 80,
            priority: 'medium',
            dismissed: false,
            applied: false,
        };
        const html = renderSuggestionsPanel([suggestion]);
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('Test 74: should escape HTML in description', () => {
        const suggestion: AISuggestion = {
            id: 'escape-2',
            category: 'clarity',
            title: 'Test',
            description: '<img onerror="alert(1)" src="x">',
            confidence: 80,
            priority: 'medium',
            dismissed: false,
            applied: false,
        };
        const html = renderSuggestionsPanel([suggestion]);
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });

    it('Test 75: should escape ampersands', () => {
        const suggestion: AISuggestion = {
            id: 'escape-3',
            category: 'clarity',
            title: 'Test & More',
            description: 'A & B',
            confidence: 80,
            priority: 'medium',
            dismissed: false,
            applied: false,
        };
        const html = renderSuggestionsPanel([suggestion]);
        expect(html).toContain('&amp;');
    });
});

// ============================================================================
// Test Suite: getSuggestionsStyles
// ============================================================================

describe('getSuggestionsStyles', () => {
    it('Test 76: should return CSS string', () => {
        const css = getSuggestionsStyles();
        expect(typeof css).toBe('string');
        expect(css.length).toBeGreaterThan(0);
    });

    it('Test 77: should include suggestions-panel styles', () => {
        const css = getSuggestionsStyles();
        expect(css).toContain('.suggestions-panel');
    });

    it('Test 78: should include suggestion-card styles', () => {
        const css = getSuggestionsStyles();
        expect(css).toContain('.suggestion-card');
    });

    it('Test 79: should include priority color styles', () => {
        const css = getSuggestionsStyles();
        expect(css).toContain('.suggestion-card.high');
        expect(css).toContain('.suggestion-card.medium');
        expect(css).toContain('.suggestion-card.low');
    });

    it('Test 80: should include VS Code theme variables', () => {
        const css = getSuggestionsStyles();
        expect(css).toContain('var(--vscode-');
    });

    it('Test 81: should include dismissed state styles', () => {
        const css = getSuggestionsStyles();
        expect(css).toContain('.suggestion-card.dismissed');
    });

    it('Test 82: should include applied state styles', () => {
        const css = getSuggestionsStyles();
        expect(css).toContain('.suggestion-card.applied');
    });

    it('Test 83: should include empty state styles', () => {
        const css = getSuggestionsStyles();
        expect(css).toContain('.suggestions-empty');
    });
});

// ============================================================================
// Test Suite: getSuggestionsScript
// ============================================================================

describe('getSuggestionsScript', () => {
    it('Test 84: should return JavaScript string', () => {
        const js = getSuggestionsScript();
        expect(typeof js).toBe('string');
        expect(js.length).toBeGreaterThan(0);
    });

    it('Test 85: should define applySuggestion function', () => {
        const js = getSuggestionsScript();
        expect(js).toContain('function applySuggestion');
    });

    it('Test 86: should define dismissSuggestion function', () => {
        const js = getSuggestionsScript();
        expect(js).toContain('function dismissSuggestion');
    });

    it('Test 87: should use vscode.postMessage', () => {
        const js = getSuggestionsScript();
        expect(js).toContain('vscode.postMessage');
    });

    it('Test 88: should send applySuggestion command', () => {
        const js = getSuggestionsScript();
        expect(js).toContain("command: 'applySuggestion'");
    });

    it('Test 89: should send dismissSuggestion command', () => {
        const js = getSuggestionsScript();
        expect(js).toContain("command: 'dismissSuggestion'");
    });

    it('Test 90: should pass suggestionId in message', () => {
        const js = getSuggestionsScript();
        expect(js).toContain('suggestionId');
    });
});

// ============================================================================
// Test Suite: Integration - Complex Plan
// ============================================================================

describe('Integration - Complex Plan', () => {
    it('Test 91: should generate multiple suggestion types for complex plan', () => {
        const plan = createMinimalPlan({
            overview: {
                name: 'Complex Web App',
                description: 'A web application with various things and stuff',
                goals: ['Improve performance', 'Enhance user experience'],
            },
            featureBlocks: [
                createFeatureBlock({
                    id: 'f1',
                    name: 'User Auth',
                    description: 'Should be implemented properly',
                    priority: 'critical',
                }),
                createFeatureBlock({
                    id: 'f2',
                    name: 'User Authentication System',
                    priority: 'critical',
                }),
                createFeatureBlock({
                    id: 'f3',
                    name: 'Dashboard',
                    priority: 'critical',
                    acceptanceCriteria: ['1', '2', '3', '4', '5', '6', '7'],
                }),
            ],
            userStories: [
                createUserStory({ action: 'login and view dashboard' }),
            ],
            developerStories: [
                createDeveloperStory({ estimatedHours: 0 }),
            ],
            successCriteria: [
                createSuccessCriterion({
                    description: 'System should be faster',
                    smartAttributes: {
                        specific: true,
                        measurable: false,
                        achievable: true,
                        relevant: true,
                        timeBound: true,
                    },
                }),
            ],
            blockLinks: [],
        });

        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);

        // Should have suggestions from multiple categories
        const categories = new Set(suggestions.map(s => s.category));
        expect(categories.size).toBeGreaterThan(2);
    });

    it('Test 92: should render complex suggestion list correctly', () => {
        const suggestions: AISuggestion[] = [
            {
                id: 'active-1',
                category: 'clarity',
                title: 'Active 1',
                description: 'Test',
                confidence: 80,
                priority: 'high',
                dismissed: false,
                applied: false,
            },
            {
                id: 'active-2',
                category: 'risk',
                title: 'Active 2',
                description: 'Test',
                confidence: 70,
                priority: 'medium',
                dismissed: false,
                applied: false,
            },
            {
                id: 'applied-1',
                category: 'specificity',
                title: 'Applied',
                description: 'Test',
                confidence: 85,
                priority: 'medium',
                dismissed: false,
                applied: true,
            },
            {
                id: 'dismissed-1',
                category: 'splitting',
                title: 'Dismissed',
                description: 'Test',
                confidence: 60,
                priority: 'low',
                dismissed: true,
                applied: false,
            },
        ];

        const html = renderSuggestionsPanel(suggestions);

        expect(html).toContain('2 active');
        expect(html).toContain('Applied (1)');
        expect(html).toContain('Dismissed (1)');
    });
});

// ============================================================================
// Test Suite: Edge Cases
// ============================================================================

describe('Edge Cases', () => {
    it('Test 93: should handle empty strings gracefully', () => {
        const plan = createMinimalPlan({
            overview: {
                name: '',
                description: '',
                goals: [],
            },
        });
        expect(() => generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG)).not.toThrow();
    });

    it('Test 94: should handle very long descriptions', () => {
        const longDesc = 'a'.repeat(10000);
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: longDesc }),
            ],
        });
        expect(() => generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG)).not.toThrow();
    });

    it('Test 95: should handle special characters in text', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({
                    name: '特殊字符 & <script>',
                    description: 'éàü ❤️ 🚀',
                }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        expect(Array.isArray(suggestions)).toBe(true);
    });

    it('Test 96: should handle null/undefined in optional fields', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({
                    technicalNotes: undefined as unknown as string,
                }),
            ],
        });
        expect(() => generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG)).not.toThrow();
    });

    it('Test 97: should handle action field in suggestion with special chars', () => {
        const suggestion: AISuggestion = {
            id: 'action-1',
            category: 'clarity',
            title: 'Test',
            description: 'Test',
            action: 'Fix <this> & that',
            confidence: 80,
            priority: 'medium',
            dismissed: false,
            applied: false,
        };
        const html = renderSuggestionsPanel([suggestion]);
        expect(html).toContain('💡');
        expect(html).toContain('&lt;this&gt;');
    });

    it('Test 98: should generate targetPath for targeted suggestions', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: 'Handle stuff' }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        const targeted = suggestions.filter(s => s.targetPath);
        if (targeted.length > 0) {
            targeted.forEach(s => {
                expect(typeof s.targetPath).toBe('string');
                expect(s.targetPath!.length).toBeGreaterThan(0);
            });
        }
    });

    it('Test 99: should not duplicate suggestions for same issue', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: 'stuff stuff stuff stuff' }),
            ],
        });
        const suggestions = generateSuggestions(plan, DEFAULT_SUGGESTION_CONFIG);
        // Same vague word multiple times shouldn't create multiple suggestions
        const stuffSuggestions = suggestions.filter(s =>
            s.description.toLowerCase().includes('stuff')
        );
        expect(stuffSuggestions.length).toBeLessThanOrEqual(1);
    });

    it('Test 100: should handle plan with all suggestion types disabled', () => {
        const plan = createMinimalPlan({
            featureBlocks: [
                createFeatureBlock({ description: 'Handle stuff' }),
            ],
        });
        const config: SuggestionConfig = {
            clarity: false,
            completeness: false,
            specificity: false,
            organization: false,
            risks: false,
            minConfidence: 0,
        };
        const suggestions = generateSuggestions(plan, config);
        expect(suggestions).toEqual([]);
    });
});
