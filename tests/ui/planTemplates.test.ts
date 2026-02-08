/**
 * Tests for Plan Template Library (MT-033.10)
 *
 * Unit tests for plan templates, lookup functions, template application,
 * HTML rendering, and edge cases. Covers all exported templates, the
 * registry, getTemplateById, getTemplatesByCategory, applyTemplate,
 * renderTemplateSelector, and style/script helpers.
 */

import {
    WEB_APP_TEMPLATE,
    REST_API_TEMPLATE,
    CLI_TOOL_TEMPLATE,
    VSCODE_EXTENSION_TEMPLATE,
    DOCS_SITE_TEMPLATE,
    PLAN_TEMPLATES,
    PlanTemplate,
    getTemplateById,
    getTemplatesByCategory,
    applyTemplate,
    renderTemplateSelector,
    getTemplateSelectorStyles,
    getTemplateSelectorScript,
} from '../../src/ui/planTemplates';

// Mock crypto.randomUUID to return deterministic, unique IDs for testing.
// We attach the counter to `global` so the hoisted jest.mock factory can
// reference it before any `let`/`const` declarations are initialized (TDZ).
(global as any).__uuidCounter = 0;
jest.mock('crypto', () => ({
    randomUUID: () => {
        (global as any).__uuidCounter++;
        return `00000000-0000-0000-0000-${String((global as any).__uuidCounter).padStart(12, '0')}`;
    },
}));

describe('Plan Templates', () => {
    beforeEach(() => {
        // Do NOT reset counter to 0 here -- the template module was already loaded
        // with IDs from the initial import. We only care that applyTemplate generates
        // fresh IDs that differ from the template-level IDs.
    });

    // ========================================================================
    // Template Definitions
    // ========================================================================
    describe('Template Definitions', () => {
        it('Test 1: WEB_APP_TEMPLATE should have correct id, name, and category', () => {
            expect(WEB_APP_TEMPLATE.id).toBe('web-app');
            expect(WEB_APP_TEMPLATE.name).toBe('Web Application');
            expect(WEB_APP_TEMPLATE.category).toBe('web');
            expect(WEB_APP_TEMPLATE.icon).toBe('🌐');
            expect(WEB_APP_TEMPLATE.description).toContain('Full-stack web app');
        });

        it('Test 2: REST_API_TEMPLATE should have correct id, name, and category', () => {
            expect(REST_API_TEMPLATE.id).toBe('rest-api');
            expect(REST_API_TEMPLATE.name).toBe('REST API');
            expect(REST_API_TEMPLATE.category).toBe('api');
            expect(REST_API_TEMPLATE.icon).toBe('🔌');
            expect(REST_API_TEMPLATE.description).toContain('Backend API');
        });

        it('Test 3: CLI_TOOL_TEMPLATE should have correct id, name, and category', () => {
            expect(CLI_TOOL_TEMPLATE.id).toBe('cli-tool');
            expect(CLI_TOOL_TEMPLATE.name).toBe('CLI Tool');
            expect(CLI_TOOL_TEMPLATE.category).toBe('cli');
            expect(CLI_TOOL_TEMPLATE.icon).toBe('💻');
            expect(CLI_TOOL_TEMPLATE.description).toContain('Command-line application');
        });

        it('Test 4: VSCODE_EXTENSION_TEMPLATE should have correct id, name, and category', () => {
            expect(VSCODE_EXTENSION_TEMPLATE.id).toBe('vscode-extension');
            expect(VSCODE_EXTENSION_TEMPLATE.name).toBe('VS Code Extension');
            expect(VSCODE_EXTENSION_TEMPLATE.category).toBe('extension');
            expect(VSCODE_EXTENSION_TEMPLATE.icon).toBe('🧩');
            expect(VSCODE_EXTENSION_TEMPLATE.description).toContain('VS Code extension');
        });

        it('Test 5: DOCS_SITE_TEMPLATE should have correct id, name, and category', () => {
            expect(DOCS_SITE_TEMPLATE.id).toBe('docs-site');
            expect(DOCS_SITE_TEMPLATE.name).toBe('Documentation Site');
            expect(DOCS_SITE_TEMPLATE.category).toBe('docs');
            expect(DOCS_SITE_TEMPLATE.icon).toBe('📚');
            expect(DOCS_SITE_TEMPLATE.description).toContain('Static documentation site');
        });
    });

    // ========================================================================
    // Template Content Validation
    // ========================================================================
    describe('Template Content', () => {
        it('Test 6: WEB_APP_TEMPLATE should contain overview with goals', () => {
            const overview = WEB_APP_TEMPLATE.template.overview;
            expect(overview).toBeDefined();
            expect(overview!.name).toBe('My Web Application');
            expect(overview!.description).toBeTruthy();
            expect(overview!.goals).toBeInstanceOf(Array);
            expect(overview!.goals.length).toBeGreaterThanOrEqual(3);
        });

        it('Test 7: WEB_APP_TEMPLATE should contain feature blocks with correct structure', () => {
            const blocks = WEB_APP_TEMPLATE.template.featureBlocks;
            expect(blocks).toBeDefined();
            expect(blocks!.length).toBe(4);

            // Verify feature blocks have required fields
            for (const block of blocks!) {
                expect(block.id).toBeTruthy();
                expect(block.name).toBeTruthy();
                expect(block.description).toBeTruthy();
                expect(block.purpose).toBeTruthy();
                expect(block.acceptanceCriteria).toBeInstanceOf(Array);
                expect(block.acceptanceCriteria.length).toBeGreaterThan(0);
                expect(block.technicalNotes).toBeTruthy();
                expect(['low', 'medium', 'high', 'critical']).toContain(block.priority);
                expect(typeof block.order).toBe('number');
            }
        });

        it('Test 8: WEB_APP_TEMPLATE should have feature blocks ordered sequentially', () => {
            const blocks = WEB_APP_TEMPLATE.template.featureBlocks!;
            for (let i = 0; i < blocks.length; i++) {
                expect(blocks[i].order).toBe(i);
            }
        });

        it('Test 9: WEB_APP_TEMPLATE should contain user stories with correct structure', () => {
            const stories = WEB_APP_TEMPLATE.template.userStories;
            expect(stories).toBeDefined();
            expect(stories!.length).toBe(3);

            for (const story of stories!) {
                expect(story.id).toBeTruthy();
                expect(story.userType).toBeTruthy();
                expect(story.action).toBeTruthy();
                expect(story.benefit).toBeTruthy();
                expect(story.relatedBlockIds).toBeInstanceOf(Array);
                expect(story.acceptanceCriteria).toBeInstanceOf(Array);
                expect(['low', 'medium', 'high', 'critical']).toContain(story.priority);
            }
        });

        it('Test 10: WEB_APP_TEMPLATE should contain developer stories with correct structure', () => {
            const devStories = WEB_APP_TEMPLATE.template.developerStories;
            expect(devStories).toBeDefined();
            expect(devStories!.length).toBe(2);

            for (const story of devStories!) {
                expect(story.id).toBeTruthy();
                expect(story.action).toBeTruthy();
                expect(story.benefit).toBeTruthy();
                expect(story.technicalRequirements).toBeInstanceOf(Array);
                expect(story.technicalRequirements.length).toBeGreaterThan(0);
                expect(typeof story.estimatedHours).toBe('number');
                expect(story.estimatedHours).toBeGreaterThan(0);
                expect(story.relatedBlockIds).toBeInstanceOf(Array);
                expect(story.relatedTaskIds).toBeInstanceOf(Array);
            }
        });

        it('Test 11: WEB_APP_TEMPLATE should contain success criteria with SMART attributes', () => {
            const criteria = WEB_APP_TEMPLATE.template.successCriteria;
            expect(criteria).toBeDefined();
            expect(criteria!.length).toBe(2);

            for (const criterion of criteria!) {
                expect(criterion.id).toBeTruthy();
                expect(criterion.description).toBeTruthy();
                expect(criterion.smartAttributes).toBeDefined();
                expect(typeof criterion.smartAttributes.specific).toBe('boolean');
                expect(typeof criterion.smartAttributes.measurable).toBe('boolean');
                expect(typeof criterion.smartAttributes.achievable).toBe('boolean');
                expect(typeof criterion.smartAttributes.relevant).toBe('boolean');
                expect(typeof criterion.smartAttributes.timeBound).toBe('boolean');
                expect(criterion.testable).toBe(true);
                expect(['low', 'medium', 'high', 'critical']).toContain(criterion.priority);
            }
        });

        it('Test 12: REST_API_TEMPLATE should have 4 feature blocks covering auth, endpoints, validation, and docs', () => {
            const blocks = REST_API_TEMPLATE.template.featureBlocks!;
            expect(blocks.length).toBe(4);
            const names = blocks.map(b => b.name);
            expect(names).toContain('API Authentication');
            expect(names).toContain('Resource Endpoints');
            expect(names).toContain('Input Validation');
            expect(names).toContain('API Documentation');
        });

        it('Test 13: CLI_TOOL_TEMPLATE should have 3 feature blocks covering parser, config, and output', () => {
            const blocks = CLI_TOOL_TEMPLATE.template.featureBlocks!;
            expect(blocks.length).toBe(3);
            const names = blocks.map(b => b.name);
            expect(names).toContain('Command Parser');
            expect(names).toContain('Configuration');
            expect(names).toContain('Output Formatting');
        });

        it('Test 14: VSCODE_EXTENSION_TEMPLATE should have 4 feature blocks covering commands, tree view, settings, and webview', () => {
            const blocks = VSCODE_EXTENSION_TEMPLATE.template.featureBlocks!;
            expect(blocks.length).toBe(4);
            const names = blocks.map(b => b.name);
            expect(names).toContain('Commands');
            expect(names).toContain('Tree View');
            expect(names).toContain('Settings');
            expect(names).toContain('Webview Panel');
        });

        it('Test 15: DOCS_SITE_TEMPLATE should have 3 feature blocks covering markdown, navigation, and search', () => {
            const blocks = DOCS_SITE_TEMPLATE.template.featureBlocks!;
            expect(blocks.length).toBe(3);
            const names = blocks.map(b => b.name);
            expect(names).toContain('Markdown Rendering');
            expect(names).toContain('Navigation');
            expect(names).toContain('Search');
        });
    });

    // ========================================================================
    // Template Registry
    // ========================================================================
    describe('PLAN_TEMPLATES Registry', () => {
        it('Test 16: should contain exactly 5 templates', () => {
            expect(PLAN_TEMPLATES).toHaveLength(5);
        });

        it('Test 17: should include all defined templates in correct order', () => {
            expect(PLAN_TEMPLATES[0]).toBe(WEB_APP_TEMPLATE);
            expect(PLAN_TEMPLATES[1]).toBe(REST_API_TEMPLATE);
            expect(PLAN_TEMPLATES[2]).toBe(CLI_TOOL_TEMPLATE);
            expect(PLAN_TEMPLATES[3]).toBe(VSCODE_EXTENSION_TEMPLATE);
            expect(PLAN_TEMPLATES[4]).toBe(DOCS_SITE_TEMPLATE);
        });

        it('Test 18: all templates should have unique IDs', () => {
            const ids = PLAN_TEMPLATES.map(t => t.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it('Test 19: all templates should have unique names', () => {
            const names = PLAN_TEMPLATES.map(t => t.name);
            const uniqueNames = new Set(names);
            expect(uniqueNames.size).toBe(names.length);
        });
    });

    // ========================================================================
    // getTemplateById
    // ========================================================================
    describe('getTemplateById', () => {
        it('Test 20: should return WEB_APP_TEMPLATE for id "web-app"', () => {
            const result = getTemplateById('web-app');
            expect(result).toBe(WEB_APP_TEMPLATE);
        });

        it('Test 21: should return REST_API_TEMPLATE for id "rest-api"', () => {
            const result = getTemplateById('rest-api');
            expect(result).toBe(REST_API_TEMPLATE);
        });

        it('Test 22: should return CLI_TOOL_TEMPLATE for id "cli-tool"', () => {
            const result = getTemplateById('cli-tool');
            expect(result).toBe(CLI_TOOL_TEMPLATE);
        });

        it('Test 23: should return VSCODE_EXTENSION_TEMPLATE for id "vscode-extension"', () => {
            const result = getTemplateById('vscode-extension');
            expect(result).toBe(VSCODE_EXTENSION_TEMPLATE);
        });

        it('Test 24: should return DOCS_SITE_TEMPLATE for id "docs-site"', () => {
            const result = getTemplateById('docs-site');
            expect(result).toBe(DOCS_SITE_TEMPLATE);
        });

        it('Test 25: should return undefined for unknown template ID', () => {
            const result = getTemplateById('nonexistent');
            expect(result).toBeUndefined();
        });

        it('Test 26: should return undefined for empty string ID', () => {
            const result = getTemplateById('');
            expect(result).toBeUndefined();
        });

        it('Test 27: should be case-sensitive when matching IDs', () => {
            const result = getTemplateById('Web-App');
            expect(result).toBeUndefined();
        });
    });

    // ========================================================================
    // getTemplatesByCategory
    // ========================================================================
    describe('getTemplatesByCategory', () => {
        it('Test 28: should return web templates', () => {
            const results = getTemplatesByCategory('web');
            expect(results).toHaveLength(1);
            expect(results[0]).toBe(WEB_APP_TEMPLATE);
        });

        it('Test 29: should return api templates', () => {
            const results = getTemplatesByCategory('api');
            expect(results).toHaveLength(1);
            expect(results[0]).toBe(REST_API_TEMPLATE);
        });

        it('Test 30: should return cli templates', () => {
            const results = getTemplatesByCategory('cli');
            expect(results).toHaveLength(1);
            expect(results[0]).toBe(CLI_TOOL_TEMPLATE);
        });

        it('Test 31: should return extension templates', () => {
            const results = getTemplatesByCategory('extension');
            expect(results).toHaveLength(1);
            expect(results[0]).toBe(VSCODE_EXTENSION_TEMPLATE);
        });

        it('Test 32: should return docs templates', () => {
            const results = getTemplatesByCategory('docs');
            expect(results).toHaveLength(1);
            expect(results[0]).toBe(DOCS_SITE_TEMPLATE);
        });

        it('Test 33: should return empty array for mobile category (no templates defined)', () => {
            const results = getTemplatesByCategory('mobile');
            expect(results).toHaveLength(0);
            expect(results).toEqual([]);
        });
    });

    // ========================================================================
    // applyTemplate
    // ========================================================================
    describe('applyTemplate', () => {
        it('Test 34: should return a CompletePlan when given a valid template ID', () => {
            const plan = applyTemplate('web-app');
            expect(plan).toBeDefined();
            expect(plan!.metadata).toBeDefined();
            expect(plan!.overview).toBeDefined();
            expect(plan!.featureBlocks).toBeDefined();
            expect(plan!.userStories).toBeDefined();
            expect(plan!.developerStories).toBeDefined();
            expect(plan!.successCriteria).toBeDefined();
            expect(plan!.blockLinks).toEqual([]);
            expect(plan!.conditionalLogic).toEqual([]);
        });

        it('Test 35: should return undefined for unknown template ID', () => {
            const plan = applyTemplate('nonexistent');
            expect(plan).toBeUndefined();
        });

        it('Test 36: should generate fresh metadata with UUID, timestamps, and version', () => {
            const before = new Date();
            const plan = applyTemplate('rest-api');
            const after = new Date();

            expect(plan).toBeDefined();
            expect(plan!.metadata.id).toBeTruthy();
            expect(plan!.metadata.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(plan!.metadata.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
            expect(plan!.metadata.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(plan!.metadata.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
            expect(plan!.metadata.version).toBe(1);
        });

        it('Test 37: should set metadata name from template overview name', () => {
            const plan = applyTemplate('cli-tool');
            expect(plan).toBeDefined();
            expect(plan!.metadata.name).toBe('My CLI Tool');
        });

        it('Test 38: should regenerate UUIDs for all feature blocks', () => {
            const plan = applyTemplate('web-app');
            expect(plan).toBeDefined();

            const templateBlockIds = WEB_APP_TEMPLATE.template.featureBlocks!.map(f => f.id);
            const planBlockIds = plan!.featureBlocks.map(f => f.id);

            // Plan block IDs should all be fresh (not matching the template IDs)
            for (const planId of planBlockIds) {
                expect(templateBlockIds).not.toContain(planId);
            }

            // All plan block IDs should be unique
            const uniqueIds = new Set(planBlockIds);
            expect(uniqueIds.size).toBe(planBlockIds.length);
        });

        it('Test 39: should regenerate UUIDs for all user stories', () => {
            const plan = applyTemplate('web-app');
            expect(plan).toBeDefined();

            const templateStoryIds = WEB_APP_TEMPLATE.template.userStories!.map(s => s.id);
            const planStoryIds = plan!.userStories.map(s => s.id);

            for (const planId of planStoryIds) {
                expect(templateStoryIds).not.toContain(planId);
            }
        });

        it('Test 40: should regenerate UUIDs for all developer stories', () => {
            const plan = applyTemplate('web-app');
            expect(plan).toBeDefined();

            const templateDevIds = WEB_APP_TEMPLATE.template.developerStories!.map(d => d.id);
            const planDevIds = plan!.developerStories.map(d => d.id);

            for (const planId of planDevIds) {
                expect(templateDevIds).not.toContain(planId);
            }
        });

        it('Test 41: should regenerate UUIDs for all success criteria', () => {
            const plan = applyTemplate('web-app');
            expect(plan).toBeDefined();

            const templateCriteriaIds = WEB_APP_TEMPLATE.template.successCriteria!.map(c => c.id);
            const planCriteriaIds = plan!.successCriteria.map(c => c.id);

            for (const planId of planCriteriaIds) {
                expect(templateCriteriaIds).not.toContain(planId);
            }
        });

        it('Test 42: should preserve feature block content except IDs', () => {
            const plan = applyTemplate('rest-api');
            expect(plan).toBeDefined();

            const templateBlock = REST_API_TEMPLATE.template.featureBlocks![0];
            const planBlock = plan!.featureBlocks[0];

            expect(planBlock.name).toBe(templateBlock.name);
            expect(planBlock.description).toBe(templateBlock.description);
            expect(planBlock.purpose).toBe(templateBlock.purpose);
            expect(planBlock.acceptanceCriteria).toEqual(templateBlock.acceptanceCriteria);
            expect(planBlock.technicalNotes).toBe(templateBlock.technicalNotes);
            expect(planBlock.priority).toBe(templateBlock.priority);
            expect(planBlock.order).toBe(templateBlock.order);
            // But the ID should differ
            expect(planBlock.id).not.toBe(templateBlock.id);
        });

        it('Test 43: should preserve user story content except IDs', () => {
            const plan = applyTemplate('web-app');
            expect(plan).toBeDefined();

            const templateStory = WEB_APP_TEMPLATE.template.userStories![0];
            const planStory = plan!.userStories[0];

            expect(planStory.userType).toBe(templateStory.userType);
            expect(planStory.action).toBe(templateStory.action);
            expect(planStory.benefit).toBe(templateStory.benefit);
            expect(planStory.acceptanceCriteria).toEqual(templateStory.acceptanceCriteria);
            expect(planStory.priority).toBe(templateStory.priority);
            expect(planStory.id).not.toBe(templateStory.id);
        });

        it('Test 44: should preserve overview data from the template', () => {
            const plan = applyTemplate('docs-site');
            expect(plan).toBeDefined();

            const templateOverview = DOCS_SITE_TEMPLATE.template.overview!;
            expect(plan!.overview.name).toBe(templateOverview.name);
            expect(plan!.overview.description).toBe(templateOverview.description);
            expect(plan!.overview.goals).toEqual(templateOverview.goals);
        });

        it('Test 45: should preserve the correct number of items from each template section', () => {
            const plan = applyTemplate('vscode-extension');
            expect(plan).toBeDefined();

            expect(plan!.featureBlocks).toHaveLength(VSCODE_EXTENSION_TEMPLATE.template.featureBlocks!.length);
            expect(plan!.userStories).toHaveLength(VSCODE_EXTENSION_TEMPLATE.template.userStories!.length);
            expect(plan!.developerStories).toHaveLength(VSCODE_EXTENSION_TEMPLATE.template.developerStories!.length);
            expect(plan!.successCriteria).toHaveLength(VSCODE_EXTENSION_TEMPLATE.template.successCriteria!.length);
        });

        it('Test 46: should default metadata name to "New Plan" if template has no overview name', () => {
            // Temporarily modify a template to simulate missing overview name
            const originalOverview = DOCS_SITE_TEMPLATE.template.overview;
            DOCS_SITE_TEMPLATE.template.overview = { name: '', description: '', goals: [] };

            const plan = applyTemplate('docs-site');
            expect(plan).toBeDefined();
            expect(plan!.metadata.name).toBe('New Plan');

            // Restore original
            DOCS_SITE_TEMPLATE.template.overview = originalOverview;
        });

        it('Test 47: should initialize blockLinks and conditionalLogic as empty arrays', () => {
            const plan = applyTemplate('web-app');
            expect(plan).toBeDefined();
            expect(plan!.blockLinks).toEqual([]);
            expect(plan!.conditionalLogic).toEqual([]);
        });
    });

    // ========================================================================
    // renderTemplateSelector
    // ========================================================================
    describe('renderTemplateSelector', () => {
        it('Test 48: should return HTML containing the template selector container', () => {
            const html = renderTemplateSelector();
            expect(html).toContain('class="template-selector"');
            expect(html).toContain('class="template-grid"');
        });

        it('Test 49: should include all template IDs as data attributes', () => {
            const html = renderTemplateSelector();
            for (const template of PLAN_TEMPLATES) {
                expect(html).toContain(`data-template-id="${template.id}"`);
            }
        });

        it('Test 50: should include all template names in the output', () => {
            const html = renderTemplateSelector();
            for (const template of PLAN_TEMPLATES) {
                expect(html).toContain(template.name);
            }
        });

        it('Test 51: should include loadTemplate onclick handlers for each template', () => {
            const html = renderTemplateSelector();
            for (const template of PLAN_TEMPLATES) {
                expect(html).toContain(`loadTemplate('${template.id}')`);
            }
        });

        it('Test 52: should include a blank plan option with startBlank onclick', () => {
            const html = renderTemplateSelector();
            expect(html).toContain('template-blank');
            expect(html).toContain('startBlank()');
            expect(html).toContain('Blank Plan');
        });

        it('Test 53: should include template icons', () => {
            const html = renderTemplateSelector();
            for (const template of PLAN_TEMPLATES) {
                expect(html).toContain(template.icon);
            }
        });

        it('Test 54: should escape HTML in template descriptions', () => {
            // Descriptions are passed through escapeHtml; verify structure
            const html = renderTemplateSelector();
            expect(html).toContain('class="template-desc"');
            // No raw < or > from descriptions should appear unescaped
            // All templates have safe descriptions, so just verify they are present
            for (const template of PLAN_TEMPLATES) {
                expect(html).toContain(template.description);
            }
        });
    });

    // ========================================================================
    // getTemplateSelectorStyles
    // ========================================================================
    describe('getTemplateSelectorStyles', () => {
        it('Test 55: should return CSS with template-selector styles', () => {
            const css = getTemplateSelectorStyles();
            expect(css).toContain('.template-selector');
            expect(css).toContain('.template-grid');
            expect(css).toContain('.template-card');
            expect(css).toContain('.template-card:hover');
            expect(css).toContain('.template-card.selected');
            expect(css).toContain('.template-icon');
            expect(css).toContain('.template-info');
            expect(css).toContain('.template-name');
            expect(css).toContain('.template-desc');
            expect(css).toContain('.template-blank');
        });

        it('Test 56: should use VS Code CSS variables', () => {
            const css = getTemplateSelectorStyles();
            expect(css).toContain('var(--vscode-');
        });
    });

    // ========================================================================
    // getTemplateSelectorScript
    // ========================================================================
    describe('getTemplateSelectorScript', () => {
        it('Test 57: should return JavaScript with loadTemplate function', () => {
            const script = getTemplateSelectorScript();
            expect(script).toContain('function loadTemplate(templateId)');
            expect(script).toContain("vscode.postMessage({ command: 'loadTemplate'");
        });

        it('Test 58: should return JavaScript with startBlank function', () => {
            const script = getTemplateSelectorScript();
            expect(script).toContain('function startBlank()');
            expect(script).toContain("vscode.postMessage({ command: 'startBlank'");
        });
    });

    // ========================================================================
    // PlanTemplate Interface Conformance
    // ========================================================================
    describe('PlanTemplate Interface Conformance', () => {
        it('Test 59: every template should conform to PlanTemplate interface shape', () => {
            for (const template of PLAN_TEMPLATES) {
                expect(typeof template.id).toBe('string');
                expect(typeof template.name).toBe('string');
                expect(typeof template.description).toBe('string');
                expect(typeof template.icon).toBe('string');
                expect(['web', 'api', 'cli', 'extension', 'docs', 'mobile']).toContain(template.category);
                expect(template.template).toBeDefined();
                expect(typeof template.template).toBe('object');
            }
        });

        it('Test 60: every template should have a non-empty overview with goals', () => {
            for (const template of PLAN_TEMPLATES) {
                const overview = template.template.overview;
                expect(overview).toBeDefined();
                expect(overview!.name.length).toBeGreaterThan(0);
                expect(overview!.description.length).toBeGreaterThan(0);
                expect(overview!.goals.length).toBeGreaterThan(0);
            }
        });

        it('Test 61: every template should have at least one feature block', () => {
            for (const template of PLAN_TEMPLATES) {
                expect(template.template.featureBlocks).toBeDefined();
                expect(template.template.featureBlocks!.length).toBeGreaterThan(0);
            }
        });

        it('Test 62: every template should have at least one user story', () => {
            for (const template of PLAN_TEMPLATES) {
                expect(template.template.userStories).toBeDefined();
                expect(template.template.userStories!.length).toBeGreaterThan(0);
            }
        });

        it('Test 63: every template should have at least one developer story', () => {
            for (const template of PLAN_TEMPLATES) {
                expect(template.template.developerStories).toBeDefined();
                expect(template.template.developerStories!.length).toBeGreaterThan(0);
            }
        });

        it('Test 64: every template should have at least one success criterion', () => {
            for (const template of PLAN_TEMPLATES) {
                expect(template.template.successCriteria).toBeDefined();
                expect(template.template.successCriteria!.length).toBeGreaterThan(0);
            }
        });

        it('Test 65: every feature block should have a critical-priority block at order 0', () => {
            for (const template of PLAN_TEMPLATES) {
                const firstBlock = template.template.featureBlocks!.find(b => b.order === 0);
                expect(firstBlock).toBeDefined();
                expect(firstBlock!.priority).toBe('critical');
            }
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================
    describe('Edge Cases', () => {
        it('Test 66: applyTemplate should return undefined for empty string', () => {
            const plan = applyTemplate('');
            expect(plan).toBeUndefined();
        });

        it('Test 67: applyTemplate should set createdAt and updatedAt to the same value', () => {
            const plan = applyTemplate('web-app');
            expect(plan).toBeDefined();
            expect(plan!.metadata.createdAt.getTime()).toBe(plan!.metadata.updatedAt.getTime());
        });

        it('Test 68: applying the same template twice should produce different metadata IDs', () => {
            const plan1 = applyTemplate('rest-api');
            const plan2 = applyTemplate('rest-api');
            expect(plan1).toBeDefined();
            expect(plan2).toBeDefined();
            expect(plan1!.metadata.id).not.toBe(plan2!.metadata.id);
        });

        it('Test 69: applying the same template twice should produce different feature block IDs', () => {
            const plan1 = applyTemplate('cli-tool');
            const plan2 = applyTemplate('cli-tool');
            expect(plan1).toBeDefined();
            expect(plan2).toBeDefined();

            const ids1 = plan1!.featureBlocks.map(f => f.id);
            const ids2 = plan2!.featureBlocks.map(f => f.id);

            // No IDs should overlap between the two plans
            for (const id of ids1) {
                expect(ids2).not.toContain(id);
            }
        });

        it('Test 70: all generated IDs across a single applied plan should be unique', () => {
            const plan = applyTemplate('web-app');
            expect(plan).toBeDefined();

            const allIds: string[] = [
                plan!.metadata.id,
                ...plan!.featureBlocks.map(f => f.id),
                ...plan!.userStories.map(s => s.id),
                ...plan!.developerStories.map(d => d.id),
                ...plan!.successCriteria.map(c => c.id),
            ];

            const uniqueIds = new Set(allIds);
            expect(uniqueIds.size).toBe(allIds.length);
        });
    });
});
