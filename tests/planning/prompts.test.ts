/**
 * Tests for PromptTemplateManager
 * 
 * @module tests/planning/prompts.test
 */

import {
    TemplateVariables,
    PromptTemplate,
    GeneratedPrompt,
    PromptTemplateManager,
    getPromptTemplateManager,
    resetPromptTemplateManagerForTests,
    generatePrompt
} from '../../src/agents/planning/prompts';

// Mock logger
jest.mock('../../src/logger', () => ({
    logInfo: jest.fn()
}));

import { logInfo } from '../../src/logger';

describe('PromptTemplateManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetPromptTemplateManagerForTests();
    });

    // =========================================================================
    // CONSTRUCTOR TESTS (5+ tests)
    // =========================================================================
    describe('Constructor', () => {
        it('Test 1: should initialize with default templates loaded', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplates();
            expect(templates.length).toBeGreaterThan(0);
        });

        it('Test 2: should have new-feature-decomposition template', () => {
            const manager = new PromptTemplateManager();
            const template = manager.getTemplate('new-feature-decomposition');
            expect(template).toBeDefined();
            expect(template?.scenario).toBe('new-feature');
        });

        it('Test 3: should have bug-fix-analysis template', () => {
            const manager = new PromptTemplateManager();
            const template = manager.getTemplate('bug-fix-analysis');
            expect(template).toBeDefined();
            expect(template?.scenario).toBe('bug-fix');
        });

        it('Test 4: should have documentation-tasks template', () => {
            const manager = new PromptTemplateManager();
            const template = manager.getTemplate('documentation-tasks');
            expect(template).toBeDefined();
            expect(template?.scenario).toBe('documentation');
        });

        it('Test 5: should have refactor-planning template', () => {
            const manager = new PromptTemplateManager();
            const template = manager.getTemplate('refactor-planning');
            expect(template).toBeDefined();
            expect(template?.scenario).toBe('refactor');
        });

        it('Test 6: should have test-coverage template', () => {
            const manager = new PromptTemplateManager();
            const template = manager.getTemplate('test-coverage');
            expect(template).toBeDefined();
            expect(template?.scenario).toBe('testing');
        });

        it('Test 7: should have requirement-clarification template', () => {
            const manager = new PromptTemplateManager();
            const template = manager.getTemplate('requirement-clarification');
            expect(template).toBeDefined();
            expect(template?.scenario).toBe('general');
        });
    });

    // =========================================================================
    // getTemplates TESTS (5+ tests)
    // =========================================================================
    describe('getTemplates', () => {
        it('Test 8: should return an array of templates', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplates();
            expect(Array.isArray(templates)).toBe(true);
        });

        it('Test 9: should return at least 6 built-in templates', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplates();
            expect(templates.length).toBeGreaterThanOrEqual(6);
        });

        it('Test 10: all templates should have required id field', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplates();
            templates.forEach(template => {
                expect(template.id).toBeDefined();
                expect(typeof template.id).toBe('string');
                expect(template.id.length).toBeGreaterThan(0);
            });
        });

        it('Test 11: all templates should have required name, description fields', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplates();
            templates.forEach(template => {
                expect(template.name).toBeDefined();
                expect(template.description).toBeDefined();
                expect(typeof template.name).toBe('string');
                expect(typeof template.description).toBe('string');
            });
        });

        it('Test 12: all templates should have scenario, template, and systemPrompt', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplates();
            const validScenarios = ['new-feature', 'bug-fix', 'refactor', 'documentation', 'testing', 'general'];
            templates.forEach(template => {
                expect(template.scenario).toBeDefined();
                expect(validScenarios).toContain(template.scenario);
                expect(template.template).toBeDefined();
                expect(typeof template.template).toBe('string');
                expect(template.systemPrompt).toBeDefined();
                expect(typeof template.systemPrompt).toBe('string');
            });
        });

        it('Test 13: all templates should have requiredVariables, optionalVariables, and temperature', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplates();
            templates.forEach(template => {
                expect(Array.isArray(template.requiredVariables)).toBe(true);
                expect(typeof template.optionalVariables).toBe('object');
                expect(typeof template.temperature).toBe('number');
                expect(template.temperature).toBeGreaterThanOrEqual(0);
                expect(template.temperature).toBeLessThanOrEqual(1);
            });
        });
    });

    // =========================================================================
    // getTemplatesByScenario TESTS (10+ tests)
    // =========================================================================
    describe('getTemplatesByScenario', () => {
        it('Test 14: should return templates for new-feature scenario', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplatesByScenario('new-feature');
            expect(templates.length).toBeGreaterThan(0);
            templates.forEach(t => expect(t.scenario).toBe('new-feature'));
        });

        it('Test 15: should return templates for bug-fix scenario', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplatesByScenario('bug-fix');
            expect(templates.length).toBeGreaterThan(0);
            templates.forEach(t => expect(t.scenario).toBe('bug-fix'));
        });

        it('Test 16: should return templates for refactor scenario', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplatesByScenario('refactor');
            expect(templates.length).toBeGreaterThan(0);
            templates.forEach(t => expect(t.scenario).toBe('refactor'));
        });

        it('Test 17: should return templates for documentation scenario', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplatesByScenario('documentation');
            expect(templates.length).toBeGreaterThan(0);
            templates.forEach(t => expect(t.scenario).toBe('documentation'));
        });

        it('Test 18: should return templates for testing scenario', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplatesByScenario('testing');
            expect(templates.length).toBeGreaterThan(0);
            templates.forEach(t => expect(t.scenario).toBe('testing'));
        });

        it('Test 19: should return templates for general scenario', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplatesByScenario('general');
            expect(templates.length).toBeGreaterThan(0);
            templates.forEach(t => expect(t.scenario).toBe('general'));
        });

        it('Test 20: should return empty array for unknown scenario', () => {
            const manager = new PromptTemplateManager();
            // @ts-expect-error Testing with invalid scenario
            const templates = manager.getTemplatesByScenario('unknown-scenario');
            expect(templates).toEqual([]);
        });

        it('Test 21: should include new-feature-decomposition in new-feature scenario', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplatesByScenario('new-feature');
            const ids = templates.map(t => t.id);
            expect(ids).toContain('new-feature-decomposition');
        });

        it('Test 22: should include bug-fix-analysis in bug-fix scenario', () => {
            const manager = new PromptTemplateManager();
            const templates = manager.getTemplatesByScenario('bug-fix');
            const ids = templates.map(t => t.id);
            expect(ids).toContain('bug-fix-analysis');
        });

        it('Test 23: should return only templates matching the scenario', () => {
            const manager = new PromptTemplateManager();
            const scenarios: Array<PromptTemplate['scenario']> = [
                'new-feature', 'bug-fix', 'refactor', 'documentation', 'testing', 'general'
            ];

            scenarios.forEach(scenario => {
                const templates = manager.getTemplatesByScenario(scenario);
                const allMatch = templates.every(t => t.scenario === scenario);
                expect(allMatch).toBe(true);
            });
        });
    });

    // =========================================================================
    // getTemplate TESTS (5+ tests)
    // =========================================================================
    describe('getTemplate', () => {
        it('Test 24: should return template for valid ID', () => {
            const manager = new PromptTemplateManager();
            const template = manager.getTemplate('new-feature-decomposition');
            expect(template).toBeDefined();
            expect(template?.id).toBe('new-feature-decomposition');
        });

        it('Test 25: should return undefined for invalid ID', () => {
            const manager = new PromptTemplateManager();
            const template = manager.getTemplate('non-existent-template');
            expect(template).toBeUndefined();
        });

        it('Test 26: should return bug-fix-analysis template', () => {
            const manager = new PromptTemplateManager();
            const template = manager.getTemplate('bug-fix-analysis');
            expect(template).toBeDefined();
            expect(template?.name).toBe('Bug Fix Analysis');
            expect(template?.requiredVariables).toContain('bugSummary');
        });

        it('Test 27: should return refactor-planning template with correct fields', () => {
            const manager = new PromptTemplateManager();
            const template = manager.getTemplate('refactor-planning');
            expect(template).toBeDefined();
            expect(template?.requiredVariables).toContain('target');
            expect(template?.requiredVariables).toContain('reason');
            expect(template?.optionalVariables).toHaveProperty('constraints');
        });

        it('Test 28: should return test-coverage template with correct optional variables', () => {
            const manager = new PromptTemplateManager();
            const template = manager.getTemplate('test-coverage');
            expect(template).toBeDefined();
            expect(template?.optionalVariables).toHaveProperty('targetCoverage');
            expect(template?.optionalVariables.targetCoverage).toBe('80');
        });
    });

    // =========================================================================
    // addTemplate TESTS (5+ tests)
    // =========================================================================
    describe('addTemplate', () => {
        const customTemplate: PromptTemplate = {
            id: 'custom-template',
            name: 'Custom Template',
            description: 'A custom test template',
            scenario: 'general',
            template: 'Hello {{name}}, welcome to {{place}}!',
            requiredVariables: ['name'],
            optionalVariables: { place: 'the system' },
            systemPrompt: 'You are a helpful assistant.',
            temperature: 0.5
        };

        it('Test 29: should add new template successfully', () => {
            const manager = new PromptTemplateManager();
            const initialCount = manager.getTemplates().length;
            manager.addTemplate(customTemplate);
            expect(manager.getTemplates().length).toBe(initialCount + 1);
        });

        it('Test 30: should retrieve added template by ID', () => {
            const manager = new PromptTemplateManager();
            manager.addTemplate(customTemplate);
            const retrieved = manager.getTemplate('custom-template');
            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe('custom-template');
            expect(retrieved?.name).toBe('Custom Template');
        });

        it('Test 31: should log when template is added', () => {
            const manager = new PromptTemplateManager();
            manager.addTemplate(customTemplate);
            expect(logInfo).toHaveBeenCalledWith('[PromptTemplates] Added template: custom-template');
        });

        it('Test 32: should overwrite existing template with same ID', () => {
            const manager = new PromptTemplateManager();
            manager.addTemplate(customTemplate);

            const updatedTemplate = { ...customTemplate, name: 'Updated Template' };
            manager.addTemplate(updatedTemplate);

            const retrieved = manager.getTemplate('custom-template');
            expect(retrieved?.name).toBe('Updated Template');
        });

        it('Test 33: added template should appear in getTemplatesByScenario', () => {
            const manager = new PromptTemplateManager();
            manager.addTemplate(customTemplate);

            const generalTemplates = manager.getTemplatesByScenario('general');
            const ids = generalTemplates.map(t => t.id);
            expect(ids).toContain('custom-template');
        });
    });

    // =========================================================================
    // generate TESTS (15+ tests)
    // =========================================================================
    describe('generate', () => {
        it('Test 34: should generate prompt with required variables', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('new-feature-decomposition', {
                featureName: 'User Authentication',
                featureDescription: 'Implement login and logout functionality'
            });

            expect(result.prompt).toContain('User Authentication');
            expect(result.prompt).toContain('Implement login and logout functionality');
        });

        it('Test 35: should throw error for missing required variables', () => {
            const manager = new PromptTemplateManager();
            expect(() => {
                manager.generate('new-feature-decomposition', {
                    featureName: 'Test Feature'
                    // Missing featureDescription
                });
            }).toThrow('Missing required variables: featureDescription');
        });

        it('Test 36: should use optional variable defaults when not provided', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('documentation-tasks', {
                subject: 'API Documentation'
            });

            // audience has default 'developers'
            expect(result.variables.audience).toBe('developers');
        });

        it('Test 37: should handle {{variable}} substitution correctly', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('bug-fix-analysis', {
                bugSummary: 'Application crashes on save'
            });

            expect(result.prompt).toContain('BUG SUMMARY: Application crashes on save');
        });

        it('Test 38: should handle {{#if variable}}...{{/if}} conditionals', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('bug-fix-analysis', {
                bugSummary: 'Test bug',
                errorMessage: 'Error: Cannot read property'
            });

            expect(result.prompt).toContain('ERROR MESSAGE: Error: Cannot read property');
        });

        it('Test 39: should remove conditional blocks when variable is empty', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('bug-fix-analysis', {
                bugSummary: 'Test bug'
                // errorMessage not provided
            });

            expect(result.prompt).not.toContain('ERROR MESSAGE:');
        });

        it('Test 40: should handle array variables', () => {
            const manager = new PromptTemplateManager();

            // Add a template with array variable
            manager.addTemplate({
                id: 'array-test',
                name: 'Array Test',
                description: 'Test with array',
                scenario: 'general',
                template: 'Items:\n{{items}}',
                requiredVariables: ['items'],
                optionalVariables: {},
                systemPrompt: 'Test',
                temperature: 0.5
            });

            const result = manager.generate('array-test', {
                items: ['item1', 'item2', 'item3']
            });

            expect(result.prompt).toContain('item1');
            expect(result.prompt).toContain('item2');
            expect(result.prompt).toContain('item3');
        });

        it('Test 41: should clean up multiple newlines', () => {
            const manager = new PromptTemplateManager();

            manager.addTemplate({
                id: 'newline-test',
                name: 'Newline Test',
                description: 'Test newlines',
                scenario: 'general',
                template: 'Line1\n\n\n\n\nLine2',
                requiredVariables: [],
                optionalVariables: {},
                systemPrompt: 'Test',
                temperature: 0.5
            });

            const result = manager.generate('newline-test', {});

            // Should have at most 2 newlines in a row
            expect(result.prompt).not.toMatch(/\n{3,}/);
        });

        it('Test 42: should return correct templateId in result', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('new-feature-decomposition', {
                featureName: 'Test',
                featureDescription: 'Test desc'
            });

            expect(result.templateId).toBe('new-feature-decomposition');
        });

        it('Test 43: should return correct systemPrompt in result', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('new-feature-decomposition', {
                featureName: 'Test',
                featureDescription: 'Test desc'
            });

            expect(result.systemPrompt).toContain('senior software architect');
        });

        it('Test 44: should return correct temperature in result', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('new-feature-decomposition', {
                featureName: 'Test',
                featureDescription: 'Test desc'
            });

            expect(result.temperature).toBe(0.3);
        });

        it('Test 45: should report missing optional variables', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('new-feature-decomposition', {
                featureName: 'Test',
                featureDescription: 'Test desc'
                // existingPatterns optional and has '' default
            });

            expect(result.missingOptional).toContain('existingPatterns');
        });

        it('Test 46: should work with bug-fix-analysis template', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('bug-fix-analysis', {
                bugSummary: 'Memory leak in cache',
                errorMessage: 'Out of memory error',
                stackTrace: 'at CacheService.get()',
                reproduction: '1. Open app\n2. Wait 10 minutes',
                affectedFiles: 'src/cache.ts'
            });

            expect(result.prompt).toContain('Memory leak in cache');
            expect(result.prompt).toContain('Out of memory error');
            expect(result.prompt).toContain('at CacheService.get()');
            expect(result.prompt).toContain('1. Open app');
            expect(result.prompt).toContain('src/cache.ts');
        });

        it('Test 47: should work with refactor-planning template', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('refactor-planning', {
                target: 'Database layer',
                reason: 'Improve performance',
                constraints: 'Must maintain backward compatibility'
            });

            expect(result.prompt).toContain('Database layer');
            expect(result.prompt).toContain('Improve performance');
            expect(result.prompt).toContain('backward compatibility');
        });

        it('Test 48: should preserve provided optional variables over defaults', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('documentation-tasks', {
                subject: 'API Documentation',
                audience: 'end users'  // Override default 'developers'
            });

            expect(result.variables.audience).toBe('end users');
        });
    });

    // =========================================================================
    // validateVariables TESTS (5+ tests)
    // =========================================================================
    describe('validateVariables', () => {
        it('Test 49: should return valid=true when all required present', () => {
            const manager = new PromptTemplateManager();
            const result = manager.validateVariables('new-feature-decomposition', {
                featureName: 'Test',
                featureDescription: 'Test description'
            });

            expect(result.valid).toBe(true);
            expect(result.missing).toEqual([]);
        });

        it('Test 50: should return valid=false with missing required', () => {
            const manager = new PromptTemplateManager();
            const result = manager.validateVariables('new-feature-decomposition', {
                featureName: 'Test'
                // Missing featureDescription
            });

            expect(result.valid).toBe(false);
            expect(result.missing).toContain('featureDescription');
        });

        it('Test 51: should report extra variables', () => {
            const manager = new PromptTemplateManager();
            const result = manager.validateVariables('new-feature-decomposition', {
                featureName: 'Test',
                featureDescription: 'Test description',
                unknownVariable: 'extra value'
            });

            expect(result.extra).toContain('unknownVariable');
        });

        it('Test 52: should report all missing required variables', () => {
            const manager = new PromptTemplateManager();
            const result = manager.validateVariables('new-feature-decomposition', {});

            expect(result.valid).toBe(false);
            expect(result.missing).toContain('featureName');
            expect(result.missing).toContain('featureDescription');
        });

        it('Test 53: should handle optional variables correctly', () => {
            const manager = new PromptTemplateManager();
            const result = manager.validateVariables('new-feature-decomposition', {
                featureName: 'Test',
                featureDescription: 'Test description',
                existingPatterns: 'Some patterns'  // Optional variable
            });

            expect(result.valid).toBe(true);
            expect(result.extra).not.toContain('existingPatterns');
        });

        it('Test 54: should return valid=false for non-existent template', () => {
            const manager = new PromptTemplateManager();
            const result = manager.validateVariables('non-existent', {});

            expect(result.valid).toBe(false);
        });
    });

    // =========================================================================
    // SINGLETON TESTS (5+ tests)
    // =========================================================================
    describe('Singleton Functions', () => {
        it('Test 55: getPromptTemplateManager returns same instance', () => {
            const instance1 = getPromptTemplateManager();
            const instance2 = getPromptTemplateManager();

            expect(instance1).toBe(instance2);
        });

        it('Test 56: resetPromptTemplateManagerForTests clears instance', () => {
            const instance1 = getPromptTemplateManager();
            resetPromptTemplateManagerForTests();
            const instance2 = getPromptTemplateManager();

            expect(instance1).not.toBe(instance2);
        });

        it('Test 57: generatePrompt helper function works', () => {
            const result = generatePrompt('new-feature-decomposition', {
                featureName: 'Quick Test',
                featureDescription: 'A quick feature'
            });

            expect(result.prompt).toContain('Quick Test');
            expect(result.templateId).toBe('new-feature-decomposition');
        });

        it('Test 58: generatePrompt uses singleton instance', () => {
            const manager = getPromptTemplateManager();
            manager.addTemplate({
                id: 'singleton-test',
                name: 'Singleton Test',
                description: 'Test singleton',
                scenario: 'general',
                template: 'Singleton {{test}}',
                requiredVariables: ['test'],
                optionalVariables: {},
                systemPrompt: 'Test',
                temperature: 0.5
            });

            // generatePrompt should find the custom template
            const result = generatePrompt('singleton-test', { test: 'works' });
            expect(result.prompt).toContain('Singleton works');
        });

        it('Test 59: singleton persists templates across calls', () => {
            const manager1 = getPromptTemplateManager();
            manager1.addTemplate({
                id: 'persist-test',
                name: 'Persist Test',
                description: 'Test persistence',
                scenario: 'general',
                template: 'Persist {{value}}',
                requiredVariables: ['value'],
                optionalVariables: {},
                systemPrompt: 'Test',
                temperature: 0.5
            });

            const manager2 = getPromptTemplateManager();
            const template = manager2.getTemplate('persist-test');
            expect(template).toBeDefined();
        });
    });

    // =========================================================================
    // EDGE CASES (5+ tests)
    // =========================================================================
    describe('Edge Cases', () => {
        it('Test 60: should throw when template not found', () => {
            const manager = new PromptTemplateManager();
            expect(() => {
                manager.generate('non-existent-template', {});
            }).toThrow('Template not found: non-existent-template');
        });

        it('Test 61: should handle empty variables object', () => {
            const manager = new PromptTemplateManager();

            // requirement-clarification only requires 'requirement'
            expect(() => {
                manager.generate('requirement-clarification', {});
            }).toThrow('Missing required variables: requirement');
        });

        it('Test 62: should handle variables with special characters', () => {
            const manager = new PromptTemplateManager();
            const result = manager.generate('bug-fix-analysis', {
                bugSummary: 'Error with special chars: <>&"\'{{test}}'
            });

            expect(result.prompt).toContain("<>&\"'{{test}}");
        });

        it('Test 63: should handle very long variable values', () => {
            const manager = new PromptTemplateManager();
            const longValue = 'A'.repeat(10000);

            const result = manager.generate('bug-fix-analysis', {
                bugSummary: longValue
            });

            expect(result.prompt).toContain(longValue);
        });

        it('Test 64: should handle boolean variables', () => {
            const manager = new PromptTemplateManager();

            manager.addTemplate({
                id: 'bool-test',
                name: 'Boolean Test',
                description: 'Test booleans',
                scenario: 'general',
                template: 'Value: {{flag}}',
                requiredVariables: ['flag'],
                optionalVariables: {},
                systemPrompt: 'Test',
                temperature: 0.5
            });

            const result = manager.generate('bool-test', { flag: true });
            expect(result.prompt).toContain('Value: true');
        });

        it('Test 65: should handle number variables', () => {
            const manager = new PromptTemplateManager();

            manager.addTemplate({
                id: 'num-test',
                name: 'Number Test',
                description: 'Test numbers',
                scenario: 'general',
                template: 'Count: {{count}}',
                requiredVariables: ['count'],
                optionalVariables: {},
                systemPrompt: 'Test',
                temperature: 0.5
            });

            const result = manager.generate('num-test', { count: 42 });
            expect(result.prompt).toContain('Count: 42');
        });

        it('Test 66: should trim result prompt', () => {
            const manager = new PromptTemplateManager();

            manager.addTemplate({
                id: 'trim-test',
                name: 'Trim Test',
                description: 'Test trimming',
                scenario: 'general',
                template: '   Trimmed {{value}}   ',
                requiredVariables: ['value'],
                optionalVariables: {},
                systemPrompt: 'Test',
                temperature: 0.5
            });

            const result = manager.generate('trim-test', { value: 'content' });
            expect(result.prompt).toBe('Trimmed content');
        });

        it('Test 67: should handle conditional with false boolean', () => {
            const manager = new PromptTemplateManager();

            manager.addTemplate({
                id: 'cond-bool-test',
                name: 'Conditional Boolean Test',
                description: 'Test conditional with boolean',
                scenario: 'general',
                template: 'Start{{#if showExtra}}\nExtra content{{/if}}\nEnd',
                requiredVariables: [],
                optionalVariables: { showExtra: '' },
                systemPrompt: 'Test',
                temperature: 0.5
            });

            const result = manager.generate('cond-bool-test', { showExtra: false });
            expect(result.prompt).not.toContain('Extra content');
        });

        it('Test 68: should handle conditional with truthy value', () => {
            const manager = new PromptTemplateManager();

            manager.addTemplate({
                id: 'cond-truthy-test',
                name: 'Conditional Truthy Test',
                description: 'Test conditional with truthy',
                scenario: 'general',
                template: 'Start{{#if showExtra}}\nExtra content{{/if}}\nEnd',
                requiredVariables: [],
                optionalVariables: { showExtra: '' },
                systemPrompt: 'Test',
                temperature: 0.5
            });

            const result = manager.generate('cond-truthy-test', { showExtra: 'yes' });
            expect(result.prompt).toContain('Extra content');
        });
    });

    // =========================================================================
    // ADDITIONAL INTEGRATION TESTS
    // =========================================================================
    describe('Integration', () => {
        it('Test 69: should work end-to-end with documentation-tasks', () => {
            const result = generatePrompt('documentation-tasks', {
                subject: 'PromptTemplateManager class',
                audience: 'API consumers',
                existingDocs: 'Basic README exists'
            });

            expect(result.prompt).toContain('PromptTemplateManager class');
            expect(result.prompt).toContain('API consumers');
            expect(result.prompt).toContain('Basic README exists');
            expect(result.systemPrompt).toContain('technical writer');
            expect(result.temperature).toBe(0.4);
        });

        it('Test 70: should work end-to-end with test-coverage', () => {
            const result = generatePrompt('test-coverage', {
                target: 'LLM Service',
                currentCoverage: '65',
                targetCoverage: '90',
                untestedPaths: 'Error handling\nCache invalidation'
            });

            expect(result.prompt).toContain('LLM Service');
            expect(result.prompt).toContain('CURRENT COVERAGE: 65%');
            expect(result.prompt).toContain('TARGET COVERAGE: 90%');
            expect(result.prompt).toContain('Error handling');
        });

        it('Test 71: should work with chained template additions', () => {
            const manager = new PromptTemplateManager();

            // Add multiple templates
            for (let i = 1; i <= 5; i++) {
                manager.addTemplate({
                    id: `chain-${i}`,
                    name: `Chain Test ${i}`,
                    description: `Test ${i}`,
                    scenario: 'general',
                    template: `Template ${i}: {{value}}`,
                    requiredVariables: ['value'],
                    optionalVariables: {},
                    systemPrompt: `System ${i}`,
                    temperature: 0.1 * i
                });
            }

            // All should be accessible
            for (let i = 1; i <= 5; i++) {
                const template = manager.getTemplate(`chain-${i}`);
                expect(template).toBeDefined();
                expect(template?.temperature).toBe(0.1 * i);
            }
        });

        it('Test 72: should maintain correct variables in result', () => {
            const variables: TemplateVariables = {
                featureName: 'Auth System',
                featureDescription: 'Complete auth',
                existingPatterns: 'Use JWT'
            };

            const result = generatePrompt('new-feature-decomposition', variables);

            expect(result.variables.featureName).toBe('Auth System');
            expect(result.variables.featureDescription).toBe('Complete auth');
            expect(result.variables.existingPatterns).toBe('Use JWT');
        });
    });
});
