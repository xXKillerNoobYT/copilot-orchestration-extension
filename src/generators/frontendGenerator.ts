/**
 * Frontend Code Generator (MT-033.23)
 *
 * **Simple explanation**: Generates production-ready React components and HTML/CSS
 * from your feature blocks. Creates accessible, responsive UI components with
 * TypeScript types and proper styling.
 *
 * @module generators/frontendGenerator
 */

import { FeatureBlock, CompletePlan, UserStory } from '../planning/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for frontend code generation.
 */
export interface FrontendConfig {
    /** Output format: React with TypeScript or plain HTML/CSS */
    outputFormat: 'react-tsx' | 'html-css';
    /** Styling approach */
    styling: 'css-modules' | 'styled-components' | 'tailwind' | 'inline';
    /** Include accessibility attributes */
    includeAccessibility: boolean;
    /** Generate responsive styles for these breakpoints */
    breakpoints: ResponsiveBreakpoint[];
    /** Include PropTypes or TypeScript interfaces */
    includeTypes: boolean;
    /** Base component directory */
    baseDir: string;
    /** Component naming convention */
    namingConvention: 'PascalCase' | 'kebab-case';
}

/**
 * Responsive breakpoint configuration.
 */
export interface ResponsiveBreakpoint {
    name: string;
    minWidth: number;
    maxWidth?: number;
}

/**
 * UI component extracted from a feature.
 */
export interface UIComponent {
    /** Component name */
    name: string;
    /** Component type (page, form, list, card, etc.) */
    type: ComponentType;
    /** Child components */
    children: UIComponent[];
    /** Component props */
    props: ComponentProp[];
    /** Accessibility role */
    ariaRole?: string;
    /** Custom styles */
    styles?: Record<string, string>;
}

/**
 * Component types that can be generated.
 */
export type ComponentType =
    | 'page'
    | 'card'
    | 'form'
    | 'list'
    | 'button'
    | 'input'
    | 'modal'
    | 'navbar'
    | 'sidebar'
    | 'table'
    | 'section'
    | 'container';

/**
 * Component property definition.
 */
export interface ComponentProp {
    name: string;
    type: string;
    required: boolean;
    defaultValue?: string;
    description?: string;
}

/**
 * Result of frontend generation.
 */
export interface FrontendResult {
    /** Generated files */
    files: GeneratedFrontendFile[];
    /** Summary of what was generated */
    summary: string;
    /** Components that were created */
    components: string[];
    /** Warnings or suggestions */
    warnings: string[];
}

/**
 * A generated frontend file.
 */
export interface GeneratedFrontendFile {
    /** Relative file path */
    path: string;
    /** File content */
    content: string;
    /** File description */
    description: string;
    /** File type */
    type: 'component' | 'style' | 'type' | 'index' | 'test';
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_FRONTEND_CONFIG: FrontendConfig = {
    outputFormat: 'react-tsx',
    styling: 'css-modules',
    includeAccessibility: true,
    breakpoints: [
        { name: 'mobile', minWidth: 0, maxWidth: 767 },
        { name: 'tablet', minWidth: 768, maxWidth: 1023 },
        { name: 'desktop', minWidth: 1024 },
    ],
    includeTypes: true,
    baseDir: 'src/components',
    namingConvention: 'PascalCase',
};

/**
 * Maps component types to their typical HTML elements.
 */
export const COMPONENT_TYPE_ELEMENTS: Record<ComponentType, string> = {
    page: 'main',
    card: 'article',
    form: 'form',
    list: 'ul',
    button: 'button',
    input: 'input',
    modal: 'dialog',
    navbar: 'nav',
    sidebar: 'aside',
    table: 'table',
    section: 'section',
    container: 'div',
};

/**
 * Accessibility roles for component types.
 */
export const ARIA_ROLES: Record<ComponentType, string> = {
    page: 'main',
    card: 'article',
    form: 'form',
    list: 'list',
    button: 'button',
    input: 'textbox',
    modal: 'dialog',
    navbar: 'navigation',
    sidebar: 'complementary',
    table: 'table',
    section: 'region',
    container: 'group',
};

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate frontend code from a plan.
 *
 * **Simple explanation**: Takes your planned features and creates React
 * components (or HTML/CSS) for each one. The components are accessible,
 * responsive, and follow best practices.
 */
export function generateFrontend(
    plan: CompletePlan,
    config: FrontendConfig = DEFAULT_FRONTEND_CONFIG
): FrontendResult {
    const files: GeneratedFrontendFile[] = [];
    const components: string[] = [];
    const warnings: string[] = [];

    // Extract UI components from feature blocks
    const uiComponents = extractUIComponents(plan);

    // Generate component files
    for (const component of uiComponents) {
        const componentFiles = generateComponentFiles(component, config);
        files.push(...componentFiles);
        components.push(component.name);
    }

    // Generate shared types if TypeScript
    if (config.includeTypes && config.outputFormat === 'react-tsx') {
        files.push(generateSharedTypes(uiComponents, config));
    }

    // Generate index file for exports
    files.push(generateIndexFile(uiComponents, config));

    // Generate global styles
    files.push(generateGlobalStyles(config));

    // Collect warnings
    if (uiComponents.length === 0) {
        warnings.push('No UI components could be extracted from the plan. Consider adding more detailed feature descriptions.');
    }

    return {
        files,
        summary: generateSummary(components, files, config),
        components,
        warnings,
    };
}

// ============================================================================
// Component Extraction
// ============================================================================

/**
 * Extract UI components from plan features.
 *
 * **Simple explanation**: Looks at your feature descriptions and figures out
 * what UI components you'll need (like forms, buttons, pages).
 */
export function extractUIComponents(plan: CompletePlan): UIComponent[] {
    const components: UIComponent[] = [];

    // Extract from feature blocks
    for (const feature of plan.featureBlocks) {
        const component = featureToComponent(feature);
        components.push(component);
    }

    // Extract from user stories
    for (const story of plan.userStories) {
        const storyComponent = userStoryToComponent(story);
        if (storyComponent && !components.some(c => c.name === storyComponent.name)) {
            components.push(storyComponent);
        }
    }

    return components;
}

/**
 * Convert a feature block to a UI component.
 */
export function featureToComponent(feature: FeatureBlock): UIComponent {
    const componentType = inferComponentType(feature);
    const props = inferProps(feature);

    return {
        name: toPascalCase(feature.name),
        type: componentType,
        children: inferChildComponents(feature),
        props,
        ariaRole: ARIA_ROLES[componentType],
        styles: inferStyles(feature),
    };
}

/**
 * Convert a user story to a UI component (optional).
 */
export function userStoryToComponent(story: UserStory): UIComponent | null {
    // Only create components for stories that imply UI
    const actionLower = story.action.toLowerCase();
    if (!actionLower.includes('view') &&
        !actionLower.includes('click') &&
        !actionLower.includes('form') &&
        !actionLower.includes('button') &&
        !actionLower.includes('page')) {
        return null;
    }

    return {
        name: toPascalCase(`${story.userType} ${story.id}`),
        type: 'section',
        children: [],
        props: [],
        ariaRole: 'region',
    };
}

/**
 * Infer the component type from a feature.
 */
export function inferComponentType(feature: FeatureBlock): ComponentType {
    const name = feature.name.toLowerCase();
    const desc = feature.description.toLowerCase();
    const combined = `${name} ${desc}`;

    if (combined.includes('form') || combined.includes('input') || combined.includes('submit')) {
        return 'form';
    }
    if (combined.includes('list') || combined.includes('items') || combined.includes('collection')) {
        return 'list';
    }
    if (combined.includes('dashboard') || combined.includes('page') || combined.includes('view')) {
        return 'page';
    }
    if (combined.includes('modal') || combined.includes('dialog') || combined.includes('popup')) {
        return 'modal';
    }
    if (combined.includes('table') || combined.includes('grid') || combined.includes('data')) {
        return 'table';
    }
    if (combined.includes('nav') || combined.includes('menu') || combined.includes('header')) {
        return 'navbar';
    }
    if (combined.includes('card') || combined.includes('tile') || combined.includes('preview')) {
        return 'card';
    }
    if (combined.includes('side') || combined.includes('panel')) {
        return 'sidebar';
    }
    if (combined.includes('button') || combined.includes('action')) {
        return 'button';
    }

    return 'section';
}

/**
 * Infer props from feature acceptance criteria.
 */
export function inferProps(feature: FeatureBlock): ComponentProp[] {
    const props: ComponentProp[] = [];

    // Always add common props
    props.push({
        name: 'className',
        type: 'string',
        required: false,
        description: 'Additional CSS class names',
    });

    // Infer from acceptance criteria
    for (const criterion of feature.acceptanceCriteria) {
        const criterionLower = criterion.toLowerCase();

        if (criterionLower.includes('title') || criterionLower.includes('heading')) {
            props.push({
                name: 'title',
                type: 'string',
                required: true,
                description: 'Component title',
            });
        }
        if (criterionLower.includes('loading') || criterionLower.includes('loader')) {
            props.push({
                name: 'isLoading',
                type: 'boolean',
                required: false,
                defaultValue: 'false',
                description: 'Loading state indicator',
            });
        }
        if (criterionLower.includes('error') || criterionLower.includes('message')) {
            props.push({
                name: 'error',
                type: 'string | null',
                required: false,
                description: 'Error message to display',
            });
        }
        if (criterionLower.includes('data') || criterionLower.includes('items')) {
            props.push({
                name: 'data',
                type: 'unknown[]',
                required: false,
                defaultValue: '[]',
                description: 'Data items to display',
            });
        }
        if (criterionLower.includes('click') || criterionLower.includes('action') || criterionLower.includes('handler')) {
            props.push({
                name: 'onClick',
                type: '() => void',
                required: false,
                description: 'Click handler callback',
            });
        }
    }

    // Remove duplicates
    return props.filter((prop, index, self) =>
        index === self.findIndex(p => p.name === prop.name)
    );
}

/**
 * Infer child components from feature.
 */
export function inferChildComponents(feature: FeatureBlock): UIComponent[] {
    const children: UIComponent[] = [];
    const desc = feature.description.toLowerCase();

    // Infer common children based on parent type
    if (desc.includes('form')) {
        children.push({
            name: 'FormFields',
            type: 'container',
            children: [],
            props: [],
        });
        children.push({
            name: 'SubmitButton',
            type: 'button',
            children: [],
            props: [{ name: 'type', type: '"submit"', required: true }],
        });
    }

    if (desc.includes('list') || desc.includes('items')) {
        children.push({
            name: 'ListItem',
            type: 'card',
            children: [],
            props: [{ name: 'item', type: 'unknown', required: true }],
        });
    }

    return children;
}

/**
 * Infer styles from feature description.
 */
export function inferStyles(feature: FeatureBlock): Record<string, string> {
    const styles: Record<string, string> = {};

    // Default responsive styles
    styles['display'] = 'flex';
    styles['flexDirection'] = 'column';
    styles['padding'] = '1rem';

    return styles;
}

// ============================================================================
// Code Generation
// ============================================================================

/**
 * Generate all files for a component.
 */
export function generateComponentFiles(
    component: UIComponent,
    config: FrontendConfig
): GeneratedFrontendFile[] {
    const files: GeneratedFrontendFile[] = [];
    const componentDir = `${config.baseDir}/${component.name}`;

    if (config.outputFormat === 'react-tsx') {
        // Main component file
        files.push({
            path: `${componentDir}/${component.name}.tsx`,
            content: generateReactComponent(component, config),
            description: `React component for ${component.name}`,
            type: 'component',
        });

        // Style file
        files.push({
            path: `${componentDir}/${component.name}.module.css`,
            content: generateStyleFile(component, config),
            description: `Styles for ${component.name}`,
            type: 'style',
        });

        // Types file
        if (config.includeTypes) {
            files.push({
                path: `${componentDir}/${component.name}.types.ts`,
                content: generateTypesFile(component),
                description: `TypeScript types for ${component.name}`,
                type: 'type',
            });
        }

        // Component index
        files.push({
            path: `${componentDir}/index.ts`,
            content: generateComponentIndex(component),
            description: `Index export for ${component.name}`,
            type: 'index',
        });
    } else {
        // HTML/CSS output
        files.push({
            path: `${componentDir}/${toKebabCase(component.name)}.html`,
            content: generateHTMLComponent(component, config),
            description: `HTML template for ${component.name}`,
            type: 'component',
        });
        files.push({
            path: `${componentDir}/${toKebabCase(component.name)}.css`,
            content: generateStyleFile(component, config),
            description: `CSS styles for ${component.name}`,
            type: 'style',
        });
    }

    return files;
}

/**
 * Generate a React component file.
 */
export function generateReactComponent(
    component: UIComponent,
    config: FrontendConfig
): string {
    const Element = COMPONENT_TYPE_ELEMENTS[component.type];
    const propsInterface = `${component.name}Props`;
    const styleImport = config.styling === 'css-modules'
        ? `import styles from './${component.name}.module.css';`
        : '';

    const propsDestructure = component.props
        .map(p => p.defaultValue ? `${p.name} = ${p.defaultValue}` : p.name)
        .join(', ');

    const accessibilityAttrs = config.includeAccessibility && component.ariaRole
        ? `\n        role="${component.ariaRole}"\n        aria-label="${component.name}"`
        : '';

    const classNameAttr = config.styling === 'css-modules'
        ? `className={styles.${toCamelCase(component.name)}}`
        : `className="${toKebabCase(component.name)}"`;

    const childrenRender = component.children.length > 0
        ? component.children.map(c => `        <${c.name} />`).join('\n')
        : '        {/* Component content */}';

    return `/**
 * ${component.name} Component
 *
 * **Simple explanation**: ${getComponentDescription(component)}
 */

import React from 'react';
${styleImport}
${config.includeTypes ? `import type { ${propsInterface} } from './${component.name}.types';` : ''}

/**
 * ${component.name} component.
 */
export const ${component.name}: React.FC<${propsInterface}> = ({
    ${propsDestructure}${propsDestructure ? ',' : ''}
    className,
}) => {
    return (
        <${Element}
            ${classNameAttr}${accessibilityAttrs}
        >
${childrenRender}
        </${Element}>
    );
};

${component.name}.displayName = '${component.name}';

export default ${component.name};
`;
}

/**
 * Generate an HTML component file.
 */
export function generateHTMLComponent(
    component: UIComponent,
    config: FrontendConfig
): string {
    const Element = COMPONENT_TYPE_ELEMENTS[component.type];
    const accessibilityAttrs = config.includeAccessibility && component.ariaRole
        ? ` role="${component.ariaRole}" aria-label="${component.name}"`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${component.name}</title>
    <link rel="stylesheet" href="${toKebabCase(component.name)}.css">
</head>
<body>
    <${Element} class="${toKebabCase(component.name)}"${accessibilityAttrs}>
        <!-- ${component.name} content -->
    </${Element}>
</body>
</html>
`;
}

/**
 * Generate styles file for a component.
 */
export function generateStyleFile(
    component: UIComponent,
    config: FrontendConfig
): string {
    const selector = config.styling === 'css-modules'
        ? `.${toCamelCase(component.name)}`
        : `.${toKebabCase(component.name)}`;

    const responsiveStyles = config.breakpoints.map(bp => {
        const mediaQuery = bp.maxWidth
            ? `@media (min-width: ${bp.minWidth}px) and (max-width: ${bp.maxWidth}px)`
            : `@media (min-width: ${bp.minWidth}px)`;

        return `
/* ${bp.name} */
${mediaQuery} {
    ${selector} {
        /* ${bp.name}-specific styles */
    }
}`;
    }).join('\n');

    return `/**
 * Styles for ${component.name}
 *
 * Mobile-first responsive design with breakpoints:
 * ${config.breakpoints.map(bp => `${bp.name}: ${bp.minWidth}px${bp.maxWidth ? `-${bp.maxWidth}px` : '+'}`).join(', ')}
 */

${selector} {
    display: flex;
    flex-direction: column;
    padding: 1rem;
    gap: 0.5rem;
}

/* Focus state for accessibility */
${selector}:focus-visible {
    outline: 2px solid var(--focus-color, #0066cc);
    outline-offset: 2px;
}
${responsiveStyles}
`;
}

/**
 * Generate TypeScript types file.
 */
export function generateTypesFile(component: UIComponent): string {
    const propsInterface = component.props.map(prop => {
        const required = prop.required ? '' : '?';
        const comment = prop.description ? `    /** ${prop.description} */\n` : '';
        return `${comment}    ${prop.name}${required}: ${prop.type};`;
    }).join('\n');

    return `/**
 * Types for ${component.name} component
 */

export interface ${component.name}Props {
${propsInterface}
}
`;
}

/**
 * Generate component index file.
 */
export function generateComponentIndex(component: UIComponent): string {
    return `export { ${component.name}, default } from './${component.name}';
export type { ${component.name}Props } from './${component.name}.types';
`;
}

/**
 * Generate shared types file.
 */
export function generateSharedTypes(
    components: UIComponent[],
    config: FrontendConfig
): GeneratedFrontendFile {
    const exports = components
        .map(c => `export type { ${c.name}Props } from './${c.name}/${c.name}.types';`)
        .join('\n');

    return {
        path: `${config.baseDir}/types.ts`,
        content: `/**
 * Shared component types
 *
 * Re-exports all component prop types for convenient importing.
 */

${exports}
`,
        description: 'Shared TypeScript types for all components',
        type: 'type',
    };
}

/**
 * Generate main index file.
 */
export function generateIndexFile(
    components: UIComponent[],
    config: FrontendConfig
): GeneratedFrontendFile {
    const exports = components
        .map(c => `export { ${c.name} } from './${c.name}';`)
        .join('\n');

    return {
        path: `${config.baseDir}/index.ts`,
        content: `/**
 * Component exports
 *
 * **Simple explanation**: Import all your UI components from this file.
 */

${exports}
`,
        description: 'Index file exporting all components',
        type: 'index',
    };
}

/**
 * Generate global styles file.
 */
export function generateGlobalStyles(config: FrontendConfig): GeneratedFrontendFile {
    return {
        path: `${config.baseDir}/globals.css`,
        content: `/**
 * Global styles and CSS variables
 */

:root {
    /* Color palette */
    --primary-color: #0066cc;
    --secondary-color: #6c757d;
    --success-color: #28a745;
    --danger-color: #dc3545;
    --warning-color: #ffc107;
    --info-color: #17a2b8;

    /* Typography */
    --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    --font-size-base: 16px;
    --line-height-base: 1.5;

    /* Spacing */
    --spacing-xs: 0.25rem;
    --spacing-sm: 0.5rem;
    --spacing-md: 1rem;
    --spacing-lg: 1.5rem;
    --spacing-xl: 2rem;

    /* Accessibility */
    --focus-color: var(--primary-color);
}

/* Reset */
*,
*::before,
*::after {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    line-height: var(--line-height-base);
}

/* Accessibility: Reduced motion */
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}

/* Screen reader only */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
`,
        description: 'Global CSS variables and styles',
        type: 'style',
    };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Convert string to PascalCase.
 */
export function toPascalCase(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
        .replace(/^[a-z]/, chr => chr.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Convert string to camelCase.
 */
export function toCamelCase(str: string): string {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Convert string to kebab-case.
 */
export function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .toLowerCase()
        .replace(/^-|-$/g, '');
}

/**
 * Get a description for a component based on its type.
 */
export function getComponentDescription(component: UIComponent): string {
    const descriptions: Record<ComponentType, string> = {
        page: 'A full page layout component',
        card: 'A card container for displaying content',
        form: 'A form for user input',
        list: 'A list of items',
        button: 'An interactive button element',
        input: 'An input field for user data',
        modal: 'A modal dialog overlay',
        navbar: 'Navigation bar component',
        sidebar: 'Side panel navigation',
        table: 'Data table component',
        section: 'A content section',
        container: 'A container wrapper',
    };

    return descriptions[component.type] || 'A UI component';
}

/**
 * Generate human-readable summary.
 */
export function generateSummary(
    components: string[],
    files: GeneratedFrontendFile[],
    config: FrontendConfig
): string {
    const format = config.outputFormat === 'react-tsx' ? 'React TypeScript' : 'HTML/CSS';
    return `Generated ${files.length} files for ${components.length} ${format} components: ${components.join(', ')}`;
}
