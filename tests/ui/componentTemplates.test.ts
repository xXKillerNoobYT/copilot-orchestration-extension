/**
 * Component Template Library Tests (MT-033.22)
 *
 * Tests for template loading, customization, rendering, search,
 * custom template saving, and library panel rendering.
 */

import {
    createTemplateLibrary,
    getAllTemplates,
    getTemplatesByCategory,
    searchTemplates,
    getTemplateById,
    getCategoryCounts,
    renderTemplate,
    renderTemplateDefaults,
    saveCustomTemplate,
    removeCustomTemplate,
    renderTemplateLibraryPanel,
    getTemplateLibraryStyles,
    ComponentTemplate,
    TemplateLibrary
} from '../../src/ui/componentTemplates';

// ============================================================================
// Library Creation Tests
// ============================================================================

describe('ComponentTemplates - Library Creation', () => {
    it('Test 1: should create library with built-in templates', () => {
        const lib = createTemplateLibrary();
        expect(lib.templates.length).toBeGreaterThan(0);
        expect(lib.customTemplates).toHaveLength(0);
    });

    it('Test 2: should have at least 9 built-in templates', () => {
        const lib = createTemplateLibrary();
        expect(lib.templates.length).toBeGreaterThanOrEqual(9);
    });

    it('Test 3: should return all templates including custom', () => {
        const lib = createTemplateLibrary();
        const all = getAllTemplates(lib);
        expect(all.length).toBe(lib.templates.length);
    });
});

// ============================================================================
// Category Tests
// ============================================================================

describe('ComponentTemplates - Categories', () => {
    let lib: TemplateLibrary;

    beforeEach(() => {
        lib = createTemplateLibrary();
    });

    it('Test 4: should filter templates by navigation category', () => {
        const navTemplates = getTemplatesByCategory(lib, 'navigation');
        expect(navTemplates.length).toBeGreaterThanOrEqual(2);
        expect(navTemplates.every(t => t.category === 'navigation')).toBe(true);
    });

    it('Test 5: should filter templates by forms category', () => {
        const formTemplates = getTemplatesByCategory(lib, 'forms');
        expect(formTemplates.length).toBeGreaterThanOrEqual(2);
        expect(formTemplates.every(t => t.category === 'forms')).toBe(true);
    });

    it('Test 6: should filter templates by content category', () => {
        const contentTemplates = getTemplatesByCategory(lib, 'content');
        expect(contentTemplates.length).toBeGreaterThanOrEqual(2);
    });

    it('Test 7: should get category counts', () => {
        const counts = getCategoryCounts(lib);
        expect(counts.navigation).toBeGreaterThanOrEqual(2);
        expect(counts.content).toBeGreaterThanOrEqual(2);
        expect(counts.forms).toBeGreaterThanOrEqual(2);
        expect(typeof counts.media).toBe('number');
        expect(typeof counts.layout).toBe('number');
        expect(typeof counts.feedback).toBe('number');
    });

    it('Test 8: should include all 6 categories', () => {
        const counts = getCategoryCounts(lib);
        expect(Object.keys(counts)).toHaveLength(6);
        expect(Object.keys(counts)).toContain('navigation');
        expect(Object.keys(counts)).toContain('content');
        expect(Object.keys(counts)).toContain('forms');
        expect(Object.keys(counts)).toContain('media');
        expect(Object.keys(counts)).toContain('layout');
        expect(Object.keys(counts)).toContain('feedback');
    });
});

// ============================================================================
// Search Tests
// ============================================================================

describe('ComponentTemplates - Search', () => {
    let lib: TemplateLibrary;

    beforeEach(() => {
        lib = createTemplateLibrary();
    });

    it('Test 9: should search by template name', () => {
        const results = searchTemplates(lib, 'Navigation');
        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('Test 10: should search by tag', () => {
        const results = searchTemplates(lib, 'form');
        expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('Test 11: should search case-insensitively', () => {
        const results = searchTemplates(lib, 'CARD');
        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('Test 12: should return empty for no match', () => {
        const results = searchTemplates(lib, 'xyznonexistent');
        expect(results).toHaveLength(0);
    });

    it('Test 13: should search by description', () => {
        const results = searchTemplates(lib, 'login');
        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('Test 14: should get template by ID', () => {
        const template = getTemplateById(lib, 'navbar-basic');
        expect(template).toBeDefined();
        expect(template!.name).toBe('Navigation Bar');
    });

    it('Test 15: should return undefined for unknown ID', () => {
        const template = getTemplateById(lib, 'nonexistent');
        expect(template).toBeUndefined();
    });
});

// ============================================================================
// Template Rendering Tests
// ============================================================================

describe('ComponentTemplates - Rendering', () => {
    let lib: TemplateLibrary;

    beforeEach(() => {
        lib = createTemplateLibrary();
    });

    it('Test 16: should render template with default values', () => {
        const navbar = getTemplateById(lib, 'navbar-basic')!;
        const rendered = renderTemplateDefaults(navbar);
        expect(rendered.html).toContain('My App');
        expect(rendered.html).toContain('navbar');
        expect(rendered.css).toContain('.navbar');
    });

    it('Test 17: should render template with custom values', () => {
        const navbar = getTemplateById(lib, 'navbar-basic')!;
        const rendered = renderTemplate(navbar, { brandName: 'COE App', bgColor: '#333333' });
        expect(rendered.html).toContain('COE App');
        expect(rendered.html).toContain('#333333');
        expect(rendered.html).not.toContain('My App');
    });

    it('Test 18: should use defaults for missing property values', () => {
        const navbar = getTemplateById(lib, 'navbar-basic')!;
        const rendered = renderTemplate(navbar, { brandName: 'Test' });
        // bgColor should use default
        expect(rendered.html).toContain('#ffffff');
    });

    it('Test 19: should render card template', () => {
        const card = getTemplateById(lib, 'card-basic')!;
        const rendered = renderTemplateDefaults(card);
        expect(rendered.html).toContain('Card Title');
        expect(rendered.html).toContain('Learn More');
        expect(rendered.css).toContain('.card');
    });

    it('Test 20: should render hero section template', () => {
        const hero = getTemplateById(lib, 'hero-section')!;
        const rendered = renderTemplateDefaults(hero);
        expect(rendered.html).toContain('Welcome to Our App');
        expect(rendered.html).toContain('Get Started');
    });

    it('Test 21: should render login form template', () => {
        const form = getTemplateById(lib, 'form-login')!;
        const rendered = renderTemplateDefaults(form);
        expect(rendered.html).toContain('Sign In');
        expect(rendered.html).toContain('email');
        expect(rendered.html).toContain('password');
    });

    it('Test 22: should render footer template', () => {
        const footer = getTemplateById(lib, 'layout-footer')!;
        const rendered = renderTemplateDefaults(footer);
        expect(rendered.html).toContain('Product');
        expect(rendered.html).toContain('Company');
        expect(rendered.html).toContain('© 2026');
    });

    it('Test 23: should render alert template with variant', () => {
        const alert = getTemplateById(lib, 'feedback-alert')!;
        const rendered = renderTemplate(alert, { message: 'Success!', variant: 'success' });
        expect(rendered.html).toContain('alert-success');
        expect(rendered.html).toContain('Success!');
    });

    it('Test 24: should handle numeric property values', () => {
        const card = getTemplateById(lib, 'card-basic')!;
        const rendered = renderTemplate(card, { maxWidth: 500, title: 'Wide Card', description: 'desc', buttonText: 'Go' });
        expect(rendered.html).toContain('500');
    });
});

// ============================================================================
// Template Properties Tests
// ============================================================================

describe('ComponentTemplates - Properties', () => {
    let lib: TemplateLibrary;

    beforeEach(() => {
        lib = createTemplateLibrary();
    });

    it('Test 25: should have properties with valid types', () => {
        const all = getAllTemplates(lib);
        for (const t of all) {
            for (const p of t.properties) {
                expect(['string', 'number', 'boolean', 'color', 'select']).toContain(p.type);
            }
        }
    });

    it('Test 26: should have default values for all properties', () => {
        const all = getAllTemplates(lib);
        for (const t of all) {
            for (const p of t.properties) {
                expect(p.defaultValue).toBeDefined();
            }
        }
    });

    it('Test 27: should have options for select-type properties', () => {
        const alert = getTemplateById(lib, 'feedback-alert')!;
        const selectProp = alert.properties.find(p => p.type === 'select');
        expect(selectProp).toBeDefined();
        expect(selectProp!.options).toBeDefined();
        expect(selectProp!.options!.length).toBeGreaterThan(0);
    });

    it('Test 28: should have descriptions for all properties', () => {
        const all = getAllTemplates(lib);
        for (const t of all) {
            for (const p of t.properties) {
                expect(p.description.length).toBeGreaterThan(0);
            }
        }
    });
});

// ============================================================================
// Custom Template Tests
// ============================================================================

describe('ComponentTemplates - Custom Templates', () => {
    it('Test 29: should save custom template', () => {
        const lib = createTemplateLibrary();
        const result = saveCustomTemplate(
            lib,
            'My Button',
            'forms',
            'Custom button component',
            '<button class="my-btn">{{text}}</button>',
            '.my-btn { padding: 8px; }',
            [{ name: 'text', type: 'string', defaultValue: 'Click', description: 'Button text' }],
            ['button', 'custom']
        );
        expect(result.template.name).toBe('My Button');
        expect(result.template.isCustom).toBe(true);
        expect(result.library.customTemplates).toHaveLength(1);
    });

    it('Test 30: should include custom templates in getAllTemplates', () => {
        let lib = createTemplateLibrary();
        const builtInCount = getAllTemplates(lib).length;
        const result = saveCustomTemplate(lib, 'Custom', 'content', 'desc', '<div></div>', '', [], []);
        expect(getAllTemplates(result.library).length).toBe(builtInCount + 1);
    });

    it('Test 31: should find custom templates by search', () => {
        const lib = createTemplateLibrary();
        const result = saveCustomTemplate(lib, 'UniqueCustomWidget', 'content', 'desc', '<div></div>', '', [], ['widget']);
        const found = searchTemplates(result.library, 'UniqueCustomWidget');
        expect(found).toHaveLength(1);
    });

    it('Test 32: should remove custom template', () => {
        const lib = createTemplateLibrary();
        const result = saveCustomTemplate(lib, 'Temp', 'content', 'desc', '<div></div>', '', [], []);
        const updated = removeCustomTemplate(result.library, result.template.id);
        expect(updated.customTemplates).toHaveLength(0);
    });

    it('Test 33: should not remove built-in templates', () => {
        const lib = createTemplateLibrary();
        const builtInCount = lib.templates.length;
        const updated = removeCustomTemplate(lib, 'navbar-basic');
        expect(updated.templates.length).toBe(builtInCount);
    });

    it('Test 34: should render custom template', () => {
        const lib = createTemplateLibrary();
        const result = saveCustomTemplate(
            lib,
            'Badge',
            'feedback',
            'Status badge',
            '<span class="badge badge-{{color}}">{{text}}</span>',
            '.badge { padding: 4px 8px; border-radius: 4px; }',
            [
                { name: 'text', type: 'string', defaultValue: 'New', description: 'Badge text' },
                { name: 'color', type: 'string', defaultValue: 'blue', description: 'Badge color class' }
            ],
            ['badge']
        );
        const rendered = renderTemplateDefaults(result.template);
        expect(rendered.html).toContain('badge-blue');
        expect(rendered.html).toContain('New');
    });

    it('Test 35: should include custom templates in category counts', () => {
        let lib = createTemplateLibrary();
        const originalFeedback = getCategoryCounts(lib).feedback;
        const result = saveCustomTemplate(lib, 'Custom Alert', 'feedback', 'desc', '<div></div>', '', [], []);
        expect(getCategoryCounts(result.library).feedback).toBe(originalFeedback + 1);
    });
});

// ============================================================================
// Library Panel Rendering Tests
// ============================================================================

describe('ComponentTemplates - Panel Rendering', () => {
    it('Test 36: should render template library panel', () => {
        const lib = createTemplateLibrary();
        const html = renderTemplateLibraryPanel(lib);
        expect(html).toContain('template-library');
        expect(html).toContain('Component Templates');
        expect(html).toContain('template-search');
    });

    it('Test 37: should render category buttons', () => {
        const lib = createTemplateLibrary();
        const html = renderTemplateLibraryPanel(lib);
        expect(html).toContain('Navigation');
        expect(html).toContain('Content');
        expect(html).toContain('Forms');
        expect(html).toContain('Media');
        expect(html).toContain('Layout');
        expect(html).toContain('Feedback');
    });

    it('Test 38: should render template cards', () => {
        const lib = createTemplateLibrary();
        const html = renderTemplateLibraryPanel(lib);
        expect(html).toContain('template-card');
        expect(html).toContain('template-preview');
        expect(html).toContain('template-name');
    });

    it('Test 39: should show custom badge for custom templates', () => {
        const lib = createTemplateLibrary();
        const result = saveCustomTemplate(lib, 'My Widget', 'content', 'desc', '<div></div>', '', [], []);
        const html = renderTemplateLibraryPanel(result.library);
        expect(html).toContain('template-custom-badge');
        expect(html).toContain('Custom');
    });

    it('Test 40: should return template library styles', () => {
        const styles = getTemplateLibraryStyles();
        expect(styles).toContain('.template-library');
        expect(styles).toContain('.template-grid');
        expect(styles).toContain('.template-card');
        expect(styles).toContain('.category-btn');
    });
});
