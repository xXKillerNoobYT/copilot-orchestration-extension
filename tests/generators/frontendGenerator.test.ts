/**
 * Tests for Frontend Code Generator (MT-033.23)
 *
 * Tests for React/HTML component generation from feature blocks.
 */

import {
    generateFrontend,
    extractUIComponents,
    featureToComponent,
    userStoryToComponent,
    inferComponentType,
    inferProps,
    inferChildComponents,
    inferStyles,
    generateComponentFiles,
    generateReactComponent,
    generateHTMLComponent,
    generateStyleFile,
    generateTypesFile,
    generateComponentIndex,
    generateSharedTypes,
    generateIndexFile,
    generateGlobalStyles,
    toPascalCase,
    toCamelCase,
    toKebabCase,
    getComponentDescription,
    generateSummary,
    DEFAULT_FRONTEND_CONFIG,
    FrontendConfig,
    UIComponent,
    ComponentType,
    COMPONENT_TYPE_ELEMENTS,
    ARIA_ROLES,
} from '../../src/generators/frontendGenerator';
import { CompletePlan, FeatureBlock, UserStory, PriorityLevel } from '../../src/planning/types';

describe('Frontend Code Generator', () => {
    // ============================================================================
    // Helper Functions
    // ============================================================================

    const createMinimalPlan = (): CompletePlan => ({
        metadata: {
            id: 'test-plan-1',
            name: 'Test Plan',
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
        },
        overview: {
            name: 'Test Project',
            description: 'A test project',
            goals: ['Build UI'],
        },
        featureBlocks: [],
        blockLinks: [],
        conditionalLogic: [],
        userStories: [],
        developerStories: [],
        successCriteria: [],
    });

    const createFeature = (
        id: string,
        name: string,
        description: string = 'Test description',
        acceptanceCriteria: string[] = ['AC 1']
    ): FeatureBlock => ({
        id,
        name,
        description,
        purpose: `Purpose of ${name}`,
        acceptanceCriteria,
        technicalNotes: 'Technical notes',
        priority: 'medium' as PriorityLevel,
        order: 1,
    });

    const createUserStory = (
        id: string,
        userType: string,
        action: string
    ): UserStory => ({
        id,
        userType,
        action,
        benefit: 'get value',
        acceptanceCriteria: [],
        relatedBlockIds: [],
        priority: 'medium' as PriorityLevel,
    });

    const createPlanWithFeatures = (features: FeatureBlock[]): CompletePlan => {
        const plan = createMinimalPlan();
        plan.featureBlocks = features;
        return plan;
    };

    // ============================================================================
    // DEFAULT_FRONTEND_CONFIG Tests
    // ============================================================================
    describe('DEFAULT_FRONTEND_CONFIG', () => {
        it('Test 1: should have react-tsx as default output format', () => {
            expect(DEFAULT_FRONTEND_CONFIG.outputFormat).toBe('react-tsx');
        });

        it('Test 2: should have css-modules as default styling', () => {
            expect(DEFAULT_FRONTEND_CONFIG.styling).toBe('css-modules');
        });

        it('Test 3: should include accessibility by default', () => {
            expect(DEFAULT_FRONTEND_CONFIG.includeAccessibility).toBe(true);
        });

        it('Test 4: should have 3 default breakpoints', () => {
            expect(DEFAULT_FRONTEND_CONFIG.breakpoints).toHaveLength(3);
            expect(DEFAULT_FRONTEND_CONFIG.breakpoints[0].name).toBe('mobile');
            expect(DEFAULT_FRONTEND_CONFIG.breakpoints[1].name).toBe('tablet');
            expect(DEFAULT_FRONTEND_CONFIG.breakpoints[2].name).toBe('desktop');
        });

        it('Test 5: should include types by default', () => {
            expect(DEFAULT_FRONTEND_CONFIG.includeTypes).toBe(true);
        });

        it('Test 6: should use PascalCase naming convention', () => {
            expect(DEFAULT_FRONTEND_CONFIG.namingConvention).toBe('PascalCase');
        });
    });

    // ============================================================================
    // COMPONENT_TYPE_ELEMENTS Tests
    // ============================================================================
    describe('COMPONENT_TYPE_ELEMENTS', () => {
        it('Test 7: should map page to main element', () => {
            expect(COMPONENT_TYPE_ELEMENTS.page).toBe('main');
        });

        it('Test 8: should map form to form element', () => {
            expect(COMPONENT_TYPE_ELEMENTS.form).toBe('form');
        });

        it('Test 9: should map modal to dialog element', () => {
            expect(COMPONENT_TYPE_ELEMENTS.modal).toBe('dialog');
        });

        it('Test 10: should have elements for all component types', () => {
            const types: ComponentType[] = ['page', 'card', 'form', 'list', 'button', 'input', 'modal', 'navbar', 'sidebar', 'table', 'section', 'container'];
            types.forEach(type => {
                expect(COMPONENT_TYPE_ELEMENTS[type]).toBeDefined();
            });
        });
    });

    // ============================================================================
    // ARIA_ROLES Tests
    // ============================================================================
    describe('ARIA_ROLES', () => {
        it('Test 11: should map navbar to navigation role', () => {
            expect(ARIA_ROLES.navbar).toBe('navigation');
        });

        it('Test 12: should map modal to dialog role', () => {
            expect(ARIA_ROLES.modal).toBe('dialog');
        });

        it('Test 13: should have roles for all component types', () => {
            const types: ComponentType[] = ['page', 'card', 'form', 'list', 'button', 'input', 'modal', 'navbar', 'sidebar', 'table', 'section', 'container'];
            types.forEach(type => {
                expect(ARIA_ROLES[type]).toBeDefined();
            });
        });
    });

    // ============================================================================
    // generateFrontend Tests
    // ============================================================================
    describe('generateFrontend()', () => {
        it('Test 14: should return files array', () => {
            const plan = createPlanWithFeatures([createFeature('f1', 'Dashboard')]);
            const result = generateFrontend(plan);
            expect(Array.isArray(result.files)).toBe(true);
            expect(result.files.length).toBeGreaterThan(0);
        });

        it('Test 15: should return summary string', () => {
            const plan = createPlanWithFeatures([createFeature('f1', 'Dashboard')]);
            const result = generateFrontend(plan);
            expect(typeof result.summary).toBe('string');
            expect(result.summary.length).toBeGreaterThan(0);
        });

        it('Test 16: should return components array', () => {
            const plan = createPlanWithFeatures([createFeature('f1', 'Dashboard')]);
            const result = generateFrontend(plan);
            expect(Array.isArray(result.components)).toBe(true);
        });

        it('Test 17: should return warnings array', () => {
            const plan = createPlanWithFeatures([]);
            const result = generateFrontend(plan);
            expect(Array.isArray(result.warnings)).toBe(true);
        });

        it('Test 18: should warn when no UI components found', () => {
            const plan = createMinimalPlan();
            const result = generateFrontend(plan);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('No UI components');
        });

        it('Test 19: should generate types file when configured', () => {
            const plan = createPlanWithFeatures([createFeature('f1', 'Dashboard')]);
            const config: FrontendConfig = { ...DEFAULT_FRONTEND_CONFIG, includeTypes: true };
            const result = generateFrontend(plan, config);
            expect(result.files.some(f => f.type === 'type')).toBe(true);
        });

        it('Test 20: should skip types file when disabled', () => {
            const plan = createPlanWithFeatures([createFeature('f1', 'Dashboard')]);
            const config: FrontendConfig = { ...DEFAULT_FRONTEND_CONFIG, includeTypes: false };
            const result = generateFrontend(plan, config);
            const typeFiles = result.files.filter(f => f.path.includes('.types.ts'));
            expect(typeFiles.length).toBe(0);
        });

        it('Test 21: should generate global styles', () => {
            const plan = createPlanWithFeatures([createFeature('f1', 'Dashboard')]);
            const result = generateFrontend(plan);
            expect(result.files.some(f => f.path.includes('globals.css'))).toBe(true);
        });
    });

    // ============================================================================
    // extractUIComponents Tests
    // ============================================================================
    describe('extractUIComponents()', () => {
        it('Test 22: should extract components from features', () => {
            const plan = createPlanWithFeatures([
                createFeature('f1', 'Dashboard'),
                createFeature('f2', 'Settings Form'),
            ]);
            const components = extractUIComponents(plan);
            expect(components.length).toBe(2);
        });

        it('Test 23: should extract components from user stories', () => {
            const plan = createMinimalPlan();
            plan.userStories = [createUserStory('us1', 'user', 'view my dashboard')];
            const components = extractUIComponents(plan);
            expect(components.length).toBeGreaterThanOrEqual(1);
        });

        it('Test 24: should not duplicate components', () => {
            const plan = createPlanWithFeatures([createFeature('f1', 'Dashboard')]);
            plan.userStories = [createUserStory('us1', 'user', 'view my dashboard')];
            const components = extractUIComponents(plan);
            const names = components.map(c => c.name);
            const uniqueNames = [...new Set(names)];
            expect(names.length).toBe(uniqueNames.length);
        });
    });

    // ============================================================================
    // featureToComponent Tests
    // ============================================================================
    describe('featureToComponent()', () => {
        it('Test 25: should create component with PascalCase name', () => {
            const feature = createFeature('f1', 'user dashboard');
            const component = featureToComponent(feature);
            expect(component.name).toBe('UserDashboard');
        });

        it('Test 26: should infer component type', () => {
            const feature = createFeature('f1', 'Login Form', 'A form for logging in');
            const component = featureToComponent(feature);
            expect(component.type).toBe('form');
        });

        it('Test 27: should include aria role', () => {
            const feature = createFeature('f1', 'Navigation', 'Main nav menu');
            const component = featureToComponent(feature);
            expect(component.ariaRole).toBeDefined();
        });

        it('Test 28: should infer props from acceptance criteria', () => {
            const feature = createFeature('f1', 'Dashboard', 'Dashboard', ['Show loading indicator']);
            const component = featureToComponent(feature);
            expect(component.props.some(p => p.name === 'isLoading')).toBe(true);
        });
    });

    // ============================================================================
    // userStoryToComponent Tests
    // ============================================================================
    describe('userStoryToComponent()', () => {
        it('Test 29: should create component for UI-related stories', () => {
            const story = createUserStory('us1', 'user', 'view my profile');
            const component = userStoryToComponent(story);
            expect(component).not.toBeNull();
        });

        it('Test 30: should return null for non-UI stories', () => {
            const story = createUserStory('us1', 'user', 'save data to database');
            const component = userStoryToComponent(story);
            expect(component).toBeNull();
        });

        it('Test 31: should create component for click actions', () => {
            const story = createUserStory('us1', 'user', 'click a button');
            const component = userStoryToComponent(story);
            expect(component).not.toBeNull();
        });
    });

    // ============================================================================
    // inferComponentType Tests
    // ============================================================================
    describe('inferComponentType()', () => {
        it('Test 32: should infer form type from description', () => {
            const feature = createFeature('f1', 'Registration', 'A form for new users');
            expect(inferComponentType(feature)).toBe('form');
        });

        it('Test 33: should infer list type from description', () => {
            const feature = createFeature('f1', 'Products', 'Display list of items');
            expect(inferComponentType(feature)).toBe('list');
        });

        it('Test 34: should infer page type for dashboard', () => {
            const feature = createFeature('f1', 'User Dashboard', 'Main dashboard view');
            expect(inferComponentType(feature)).toBe('page');
        });

        it('Test 35: should infer modal type from description', () => {
            const feature = createFeature('f1', 'Confirm', 'A modal dialog for confirmation');
            expect(inferComponentType(feature)).toBe('modal');
        });

        it('Test 36: should infer table type for data grids', () => {
            const feature = createFeature('f1', 'Report', 'Data grid showing results');
            expect(inferComponentType(feature)).toBe('table');
        });

        it('Test 37: should default to section for unknown types', () => {
            const feature = createFeature('f1', 'Something', 'Does something');
            expect(inferComponentType(feature)).toBe('section');
        });
    });

    // ============================================================================
    // inferProps Tests
    // ============================================================================
    describe('inferProps()', () => {
        it('Test 38: should always include className prop', () => {
            const feature = createFeature('f1', 'Test');
            const props = inferProps(feature);
            expect(props.some(p => p.name === 'className')).toBe(true);
        });

        it('Test 39: should infer title prop from criteria', () => {
            const feature = createFeature('f1', 'Test', 'Desc', ['Display title']);
            const props = inferProps(feature);
            expect(props.some(p => p.name === 'title')).toBe(true);
        });

        it('Test 40: should infer error prop from criteria', () => {
            const feature = createFeature('f1', 'Test', 'Desc', ['Show error message']);
            const props = inferProps(feature);
            expect(props.some(p => p.name === 'error')).toBe(true);
        });

        it('Test 41: should infer onClick prop from criteria', () => {
            const feature = createFeature('f1', 'Test', 'Desc', ['Handle click action']);
            const props = inferProps(feature);
            expect(props.some(p => p.name === 'onClick')).toBe(true);
        });

        it('Test 42: should not duplicate props', () => {
            const feature = createFeature('f1', 'Test', 'Desc', ['Show title', 'Display title heading']);
            const props = inferProps(feature);
            const titleProps = props.filter(p => p.name === 'title');
            expect(titleProps.length).toBe(1);
        });
    });

    // ============================================================================
    // inferChildComponents Tests
    // ============================================================================
    describe('inferChildComponents()', () => {
        it('Test 43: should infer children for forms', () => {
            const feature = createFeature('f1', 'Login', 'A login form');
            const children = inferChildComponents(feature);
            expect(children.length).toBeGreaterThan(0);
            expect(children.some(c => c.type === 'button')).toBe(true);
        });

        it('Test 44: should infer children for lists', () => {
            const feature = createFeature('f1', 'Products', 'List of items');
            const children = inferChildComponents(feature);
            expect(children.some(c => c.name === 'ListItem')).toBe(true);
        });

        it('Test 45: should return empty array for simple components', () => {
            const feature = createFeature('f1', 'Button', 'Just a button');
            const children = inferChildComponents(feature);
            expect(children.length).toBe(0);
        });
    });

    // ============================================================================
    // inferStyles Tests
    // ============================================================================
    describe('inferStyles()', () => {
        it('Test 46: should return default styles', () => {
            const feature = createFeature('f1', 'Test');
            const styles = inferStyles(feature);
            expect(styles.display).toBe('flex');
        });

        it('Test 47: should include padding', () => {
            const feature = createFeature('f1', 'Test');
            const styles = inferStyles(feature);
            expect(styles.padding).toBe('1rem');
        });
    });

    // ============================================================================
    // generateComponentFiles Tests
    // ============================================================================
    describe('generateComponentFiles()', () => {
        const mockComponent: UIComponent = {
            name: 'TestComponent',
            type: 'section',
            children: [],
            props: [{ name: 'className', type: 'string', required: false }],
            ariaRole: 'region',
        };

        it('Test 48: should generate tsx file for React output', () => {
            const files = generateComponentFiles(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(files.some(f => f.path.endsWith('.tsx'))).toBe(true);
        });

        it('Test 49: should generate css module file', () => {
            const files = generateComponentFiles(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(files.some(f => f.path.endsWith('.module.css'))).toBe(true);
        });

        it('Test 50: should generate types file when enabled', () => {
            const files = generateComponentFiles(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(files.some(f => f.path.endsWith('.types.ts'))).toBe(true);
        });

        it('Test 51: should generate html file for HTML output', () => {
            const config: FrontendConfig = { ...DEFAULT_FRONTEND_CONFIG, outputFormat: 'html-css' };
            const files = generateComponentFiles(mockComponent, config);
            expect(files.some(f => f.path.endsWith('.html'))).toBe(true);
        });
    });

    // ============================================================================
    // generateReactComponent Tests
    // ============================================================================
    describe('generateReactComponent()', () => {
        const mockComponent: UIComponent = {
            name: 'TestComponent',
            type: 'section',
            children: [],
            props: [{ name: 'title', type: 'string', required: true }],
            ariaRole: 'region',
        };

        it('Test 52: should include React import', () => {
            const code = generateReactComponent(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(code).toContain("import React from 'react'");
        });

        it('Test 53: should include style import for css-modules', () => {
            const code = generateReactComponent(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(code).toContain('import styles from');
        });

        it('Test 54: should include accessibility attributes', () => {
            const code = generateReactComponent(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(code).toContain('role="region"');
            expect(code).toContain('aria-label');
        });

        it('Test 55: should include displayName', () => {
            const code = generateReactComponent(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(code).toContain(".displayName = 'TestComponent'");
        });

        it('Test 56: should skip accessibility when disabled', () => {
            const config: FrontendConfig = { ...DEFAULT_FRONTEND_CONFIG, includeAccessibility: false };
            const code = generateReactComponent(mockComponent, config);
            expect(code).not.toContain('role=');
        });
    });

    // ============================================================================
    // generateHTMLComponent Tests
    // ============================================================================
    describe('generateHTMLComponent()', () => {
        const mockComponent: UIComponent = {
            name: 'TestComponent',
            type: 'section',
            children: [],
            props: [],
            ariaRole: 'region',
        };

        it('Test 57: should include doctype', () => {
            const html = generateHTMLComponent(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(html).toContain('<!DOCTYPE html>');
        });

        it('Test 58: should include viewport meta', () => {
            const html = generateHTMLComponent(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(html).toContain('viewport');
        });

        it('Test 59: should link to CSS file', () => {
            const html = generateHTMLComponent(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(html).toContain('.css');
        });

        it('Test 60: should include accessibility role', () => {
            const html = generateHTMLComponent(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(html).toContain('role="region"');
        });
    });

    // ============================================================================
    // generateStyleFile Tests
    // ============================================================================
    describe('generateStyleFile()', () => {
        const mockComponent: UIComponent = {
            name: 'TestComponent',
            type: 'section',
            children: [],
            props: [],
        };

        it('Test 61: should include responsive breakpoints', () => {
            const css = generateStyleFile(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(css).toContain('@media');
        });

        it('Test 62: should include focus styles for accessibility', () => {
            const css = generateStyleFile(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(css).toContain(':focus-visible');
        });

        it('Test 63: should use camelCase selector for css-modules', () => {
            const css = generateStyleFile(mockComponent, DEFAULT_FRONTEND_CONFIG);
            expect(css).toContain('.testComponent');
        });
    });

    // ============================================================================
    // generateTypesFile Tests
    // ============================================================================
    describe('generateTypesFile()', () => {
        const mockComponent: UIComponent = {
            name: 'TestComponent',
            type: 'section',
            children: [],
            props: [
                { name: 'title', type: 'string', required: true, description: 'The title' },
                { name: 'isActive', type: 'boolean', required: false },
            ],
        };

        it('Test 64: should generate interface', () => {
            const types = generateTypesFile(mockComponent);
            expect(types).toContain('export interface TestComponentProps');
        });

        it('Test 65: should mark required props', () => {
            const types = generateTypesFile(mockComponent);
            expect(types).toContain('title: string;');
        });

        it('Test 66: should mark optional props with ?', () => {
            const types = generateTypesFile(mockComponent);
            expect(types).toContain('isActive?: boolean;');
        });

        it('Test 67: should include JSDoc comments', () => {
            const types = generateTypesFile(mockComponent);
            expect(types).toContain('/** The title */');
        });
    });

    // ============================================================================
    // Utility Function Tests
    // ============================================================================
    describe('toPascalCase()', () => {
        it('Test 68: should convert dash-case', () => {
            expect(toPascalCase('my-component')).toBe('MyComponent');
        });

        it('Test 69: should convert space-separated', () => {
            expect(toPascalCase('user dashboard')).toBe('UserDashboard');
        });

        it('Test 70: should handle already PascalCase', () => {
            expect(toPascalCase('MyComponent')).toBe('MyComponent');
        });
    });

    describe('toCamelCase()', () => {
        it('Test 71: should convert to camelCase', () => {
            expect(toCamelCase('my-component')).toBe('myComponent');
        });

        it('Test 72: should start with lowercase', () => {
            expect(toCamelCase('MyComponent')[0]).toBe('m');
        });
    });

    describe('toKebabCase()', () => {
        it('Test 73: should convert PascalCase', () => {
            expect(toKebabCase('MyComponent')).toBe('my-component');
        });

        it('Test 74: should convert camelCase', () => {
            expect(toKebabCase('myComponent')).toBe('my-component');
        });

        it('Test 75: should handle spaces', () => {
            expect(toKebabCase('My Component')).toBe('my-component');
        });
    });

    describe('getComponentDescription()', () => {
        it('Test 76: should return description for page', () => {
            const component: UIComponent = { name: 'Test', type: 'page', children: [], props: [] };
            expect(getComponentDescription(component)).toContain('page');
        });

        it('Test 77: should return description for form', () => {
            const component: UIComponent = { name: 'Test', type: 'form', children: [], props: [] };
            expect(getComponentDescription(component)).toContain('form');
        });
    });

    describe('generateSummary()', () => {
        it('Test 78: should include component count', () => {
            const summary = generateSummary(['A', 'B'], [], DEFAULT_FRONTEND_CONFIG);
            expect(summary).toContain('2');
        });

        it('Test 79: should include format type', () => {
            const summary = generateSummary(['A'], [], DEFAULT_FRONTEND_CONFIG);
            expect(summary).toContain('React TypeScript');
        });

        it('Test 80: should list component names', () => {
            const summary = generateSummary(['Dashboard', 'Sidebar'], [], DEFAULT_FRONTEND_CONFIG);
            expect(summary).toContain('Dashboard');
            expect(summary).toContain('Sidebar');
        });
    });

    // ============================================================================
    // Integration Tests
    // ============================================================================
    describe('Integration Tests', () => {
        it('Test 81: should generate complete dashboard component', () => {
            const plan = createPlanWithFeatures([
                createFeature('f1', 'User Dashboard', 'Main dashboard page view', ['Show loading', 'Display title', 'Handle click']),
            ]);
            const result = generateFrontend(plan);

            expect(result.components).toContain('UserDashboard');
            expect(result.files.length).toBeGreaterThan(3);
            expect(result.warnings.length).toBe(0);
        });

        it('Test 82: should generate multiple components', () => {
            const plan = createPlanWithFeatures([
                createFeature('f1', 'Header', 'Navigation header'),
                createFeature('f2', 'Sidebar', 'Side panel'),
                createFeature('f3', 'Main Content', 'Content area'),
            ]);
            const result = generateFrontend(plan);

            expect(result.components.length).toBe(3);
        });

        it('Test 83: should handle HTML/CSS output format', () => {
            const plan = createPlanWithFeatures([createFeature('f1', 'Dashboard')]);
            const config: FrontendConfig = { ...DEFAULT_FRONTEND_CONFIG, outputFormat: 'html-css' };
            const result = generateFrontend(plan, config);

            expect(result.files.some(f => f.path.endsWith('.html'))).toBe(true);
            expect(result.files.some(f => f.path.endsWith('.tsx'))).toBe(false);
        });
    });
});
