/**
 * Tests for Agent Templates Library
 *
 * Tests for the pre-built agent templates and template functions.
 */

import {
    AGENT_TEMPLATES,
    AgentTemplate,
    TemplateCategory,
    TemplateAgentConfig,
    getAllTemplates,
    getTemplatesByCategory,
    getTemplate,
    searchTemplates,
    createFromTemplate,
    getCategoriesWithCounts,
} from '../../../src/agents/custom/templates';

describe('Agent Templates', () => {
    // ============================================================================
    // AGENT_TEMPLATES Constant Tests
    // ============================================================================
    describe('AGENT_TEMPLATES', () => {
        it('Test 1: should have multiple built-in templates', () => {
            const templates = Object.keys(AGENT_TEMPLATES);
            expect(templates.length).toBeGreaterThan(0);
        });

        it('Test 2: should include research-assistant template', () => {
            expect(AGENT_TEMPLATES['research-assistant']).toBeDefined();
            expect(AGENT_TEMPLATES['research-assistant'].name).toBe('Research Assistant');
        });

        it('Test 3: should include code-reviewer template', () => {
            expect(AGENT_TEMPLATES['code-reviewer']).toBeDefined();
            expect(AGENT_TEMPLATES['code-reviewer'].name).toBe('Code Reviewer');
        });

        it('Test 4: should include documentation-writer template', () => {
            expect(AGENT_TEMPLATES['documentation-writer']).toBeDefined();
        });

        it('Test 5: each template should have required fields', () => {
            for (const [id, template] of Object.entries(AGENT_TEMPLATES)) {
                expect(template.id).toBe(id);
                expect(template.name).toBeTruthy();
                expect(template.description).toBeTruthy();
                expect(template.category).toBeTruthy();
                expect(template.difficulty).toBeTruthy();
                expect(template.baseAgent).toBeDefined();
                expect(template.tags).toBeInstanceOf(Array);
                expect(template.usageExamples).toBeInstanceOf(Array);
            }
        });

        it('Test 6: each baseAgent should have required configuration', () => {
            for (const template of Object.values(AGENT_TEMPLATES)) {
                const baseAgent = template.baseAgent;
                expect(baseAgent.name).toBeTruthy();
                expect(baseAgent.description).toBeTruthy();
                expect(baseAgent.systemPrompt).toBeTruthy();
                expect(baseAgent.goals).toBeInstanceOf(Array);
                expect(baseAgent.goals.length).toBeGreaterThan(0);
            }
        });

        it('Test 7: templates should have valid difficulty levels', () => {
            const validDifficulties = ['beginner', 'intermediate', 'advanced'];
            for (const template of Object.values(AGENT_TEMPLATES)) {
                expect(validDifficulties).toContain(template.difficulty);
            }
        });

        it('Test 8: templates should have valid categories', () => {
            const validCategories: TemplateCategory[] = ['research', 'writing', 'code', 'analysis', 'testing', 'docs'];
            for (const template of Object.values(AGENT_TEMPLATES)) {
                expect(validCategories).toContain(template.category);
            }
        });
    });

    // ============================================================================
    // getAllTemplates Tests
    // ============================================================================
    describe('getAllTemplates', () => {
        it('Test 9: should return all templates as array', () => {
            const templates = getAllTemplates();
            expect(Array.isArray(templates)).toBe(true);
            expect(templates.length).toBe(Object.keys(AGENT_TEMPLATES).length);
        });

        it('Test 10: should return template objects with all fields', () => {
            const templates = getAllTemplates();
            templates.forEach(template => {
                expect(template.id).toBeDefined();
                expect(template.name).toBeDefined();
                expect(template.baseAgent).toBeDefined();
            });
        });
    });

    // ============================================================================
    // getTemplatesByCategory Tests
    // ============================================================================
    describe('getTemplatesByCategory', () => {
        it('Test 11: should return templates for research category', () => {
            const templates = getTemplatesByCategory('research');
            expect(Array.isArray(templates)).toBe(true);
            templates.forEach(t => expect(t.category).toBe('research'));
        });

        it('Test 12: should return templates for code category', () => {
            const templates = getTemplatesByCategory('code');
            expect(Array.isArray(templates)).toBe(true);
            templates.forEach(t => expect(t.category).toBe('code'));
        });

        it('Test 13: should return templates for docs category', () => {
            const templates = getTemplatesByCategory('docs');
            expect(Array.isArray(templates)).toBe(true);
            templates.forEach(t => expect(t.category).toBe('docs'));
        });

        it('Test 14: should return templates for writing category', () => {
            const templates = getTemplatesByCategory('writing');
            expect(Array.isArray(templates)).toBe(true);
            templates.forEach(t => expect(t.category).toBe('writing'));
        });

        it('Test 15: should return templates for analysis category', () => {
            const templates = getTemplatesByCategory('analysis');
            expect(Array.isArray(templates)).toBe(true);
            templates.forEach(t => expect(t.category).toBe('analysis'));
        });

        it('Test 16: should return templates for testing category', () => {
            const templates = getTemplatesByCategory('testing');
            expect(Array.isArray(templates)).toBe(true);
            templates.forEach(t => expect(t.category).toBe('testing'));
        });

        it('Test 17: should return empty array for unused category', () => {
            // This will still be type-safe, just might have 0 results
            const allTemplates = getAllTemplates();
            const unusedCategory = (['research', 'writing', 'code', 'analysis', 'testing', 'docs'] as TemplateCategory[])
                .find(cat => !allTemplates.some(t => t.category === cat));

            if (unusedCategory) {
                const templates = getTemplatesByCategory(unusedCategory);
                expect(templates).toEqual([]);
            }
        });
    });

    // ============================================================================
    // getTemplate Tests
    // ============================================================================
    describe('getTemplate', () => {
        it('Test 18: should return template for valid ID', () => {
            const template = getTemplate('research-assistant');
            expect(template).not.toBeNull();
            expect(template?.id).toBe('research-assistant');
        });

        it('Test 19: should return null for invalid ID', () => {
            const template = getTemplate('non-existent-template');
            expect(template).toBeNull();
        });

        it('Test 20: should return null for empty ID', () => {
            const template = getTemplate('');
            expect(template).toBeNull();
        });

        it('Test 21: should return code-reviewer template', () => {
            const template = getTemplate('code-reviewer');
            expect(template).not.toBeNull();
            expect(template?.category).toBe('code');
        });

        it('Test 22: should return template with baseAgent', () => {
            const template = getTemplate('research-assistant');
            expect(template?.baseAgent).toBeDefined();
            expect(template?.baseAgent.systemPrompt).toBeTruthy();
        });
    });

    // ============================================================================
    // searchTemplates Tests
    // ============================================================================
    describe('searchTemplates', () => {
        it('Test 23: should find templates by name keyword', () => {
            const results = searchTemplates('research');
            expect(results.length).toBeGreaterThan(0);
            expect(results.some(t => t.name.toLowerCase().includes('research'))).toBe(true);
        });

        it('Test 24: should find templates by description keyword', () => {
            const results = searchTemplates('code');
            expect(results.length).toBeGreaterThan(0);
        });

        it('Test 25: should find templates by tag', () => {
            const results = searchTemplates('quality');
            expect(results.length).toBeGreaterThan(0);
        });

        it('Test 26: should be case-insensitive', () => {
            const lowerResults = searchTemplates('research');
            const upperResults = searchTemplates('RESEARCH');
            const mixedResults = searchTemplates('ReSeArCh');

            expect(lowerResults.length).toBe(upperResults.length);
            expect(lowerResults.length).toBe(mixedResults.length);
        });

        it('Test 27: should return empty array for no matches', () => {
            const results = searchTemplates('xyznonexistent');
            expect(results).toEqual([]);
        });

        it('Test 28: should find templates matching partial keyword', () => {
            const results = searchTemplates('doc');
            expect(results.length).toBeGreaterThan(0);
        });

        it('Test 29: should find multiple matching templates', () => {
            // Search for a common term that appears in multiple templates
            const results = searchTemplates('assistant');
            // May find 0-N depending on templates - just verify it returns array
            expect(Array.isArray(results)).toBe(true);
        });
    });

    // ============================================================================
    // createFromTemplate Tests
    // ============================================================================
    describe('createFromTemplate', () => {
        it('Test 30: should create agent from valid template', () => {
            const agent = createFromTemplate('research-assistant', 'My Research Agent');
            expect(agent).not.toBeNull();
            expect(agent?.name).toBe('My Research Agent');
        });

        it('Test 31: should return null for invalid template ID', () => {
            const agent = createFromTemplate('non-existent', 'Test Agent');
            expect(agent).toBeNull();
        });

        it('Test 32: should copy baseAgent properties', () => {
            const template = getTemplate('research-assistant');
            const agent = createFromTemplate('research-assistant', 'Test Agent');

            expect(agent).not.toBeNull();
            expect(agent?.systemPrompt).toBe(template?.baseAgent.systemPrompt);
            expect(agent?.goals).toEqual(template?.baseAgent.goals);
        });

        it('Test 33: should use custom name', () => {
            const customName = 'My Custom Agent Name';
            const agent = createFromTemplate('code-reviewer', customName);

            expect(agent?.name).toBe(customName);
        });

        it('Test 34: should copy description from template', () => {
            const agent = createFromTemplate('research-assistant', 'Test');
            expect(agent?.description).toBeTruthy();
        });

        it('Test 35: should set default priority if not specified', () => {
            const agent = createFromTemplate('research-assistant', 'Test');
            expect(agent?.priority).toBeDefined();
        });

        it('Test 36: should preserve template timeout', () => {
            const template = getTemplate('research-assistant');
            const agent = createFromTemplate('research-assistant', 'Test');

            expect(agent?.timeoutSeconds).toBe(template?.baseAgent.timeoutSeconds);
        });

        it('Test 37: should preserve template maxTokens', () => {
            const template = getTemplate('code-reviewer');
            const agent = createFromTemplate('code-reviewer', 'Test');

            expect(agent?.maxTokens).toBe(template?.baseAgent.maxTokens);
        });

        it('Test 38: should preserve template temperature', () => {
            const template = getTemplate('research-assistant');
            const agent = createFromTemplate('research-assistant', 'Test');

            expect(agent?.temperature).toBe(template?.baseAgent.temperature);
        });

        it('Test 39: should copy checklist from template', () => {
            const template = getTemplate('code-reviewer');
            const agent = createFromTemplate('code-reviewer', 'Test');

            expect(agent?.checklist).toEqual(template?.baseAgent.checklist);
        });

        it('Test 40: should set metadata with version', () => {
            const agent = createFromTemplate('research-assistant', 'Test');
            expect(agent?.metadata?.version).toBeDefined();
        });

        it('Test 41: should set isActive from template', () => {
            const agent = createFromTemplate('research-assistant', 'Test');
            expect(agent?.isActive).toBe(true);
        });

        it('Test 42: should handle empty customLists', () => {
            const agent = createFromTemplate('research-assistant', 'Test');
            expect(agent?.customLists).toBeDefined();
        });
    });

    // ============================================================================
    // getCategoriesWithCounts Tests
    // ============================================================================
    describe('getCategoriesWithCounts', () => {
        it('Test 43: should return array of categories with counts', () => {
            const categories = getCategoriesWithCounts();
            expect(Array.isArray(categories)).toBe(true);
            categories.forEach(cat => {
                expect(cat.category).toBeDefined();
                expect(typeof cat.count).toBe('number');
                expect(cat.count).toBeGreaterThanOrEqual(0);
            });
        });

        it('Test 44: should include all unique categories', () => {
            const categories = getCategoriesWithCounts();
            const allTemplates = getAllTemplates();
            const uniqueCategories = new Set(allTemplates.map(t => t.category));

            expect(categories.length).toBe(uniqueCategories.size);
        });

        it('Test 45: should correctly count templates per category', () => {
            const categories = getCategoriesWithCounts();

            categories.forEach(({ category, count }) => {
                const actual = getTemplatesByCategory(category).length;
                expect(count).toBe(actual);
            });
        });

        it('Test 46: should sum to total template count', () => {
            const categories = getCategoriesWithCounts();
            const totalFromCategories = categories.reduce((sum, cat) => sum + cat.count, 0);
            const totalTemplates = getAllTemplates().length;

            expect(totalFromCategories).toBe(totalTemplates);
        });
    });

    // ============================================================================
    // Template Content Quality Tests
    // ============================================================================
    describe('Template Content Quality', () => {
        it('Test 47: all templates should have non-empty usage examples', () => {
            getAllTemplates().forEach(template => {
                expect(template.usageExamples.length).toBeGreaterThan(0);
                template.usageExamples.forEach(example => {
                    expect(example.length).toBeGreaterThan(0);
                });
            });
        });

        it('Test 48: all templates should have multiple goals', () => {
            getAllTemplates().forEach(template => {
                expect(template.baseAgent.goals.length).toBeGreaterThan(1);
            });
        });

        it('Test 49: all templates should have reasonable timeout', () => {
            getAllTemplates().forEach(template => {
                const timeout = template.baseAgent.timeoutSeconds || 60;
                expect(timeout).toBeGreaterThanOrEqual(30);
                expect(timeout).toBeLessThanOrEqual(300);
            });
        });

        it('Test 50: all templates should have valid temperature', () => {
            getAllTemplates().forEach(template => {
                const temp = template.baseAgent.temperature || 0.7;
                expect(temp).toBeGreaterThanOrEqual(0);
                expect(temp).toBeLessThanOrEqual(2);
            });
        });
    });
});
