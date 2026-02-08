/**
 * Component Template Library (MT-033.22)
 *
 * **Simple explanation**: A library of pre-built UI component templates
 * (navbars, footers, cards, forms, buttons) that you can drag into
 * your canvas. Each template is customizable and categorized.
 *
 * @module ui/componentTemplates
 */

// ============================================================================
// Types
// ============================================================================

export type ComponentCategory = 'navigation' | 'content' | 'forms' | 'media' | 'layout' | 'feedback';

export interface ComponentProperty {
    /** Property name */
    name: string;
    /** Property type */
    type: 'string' | 'number' | 'boolean' | 'color' | 'select';
    /** Default value */
    defaultValue: string | number | boolean;
    /** Description */
    description: string;
    /** Options for select type */
    options?: string[];
}

export interface ComponentTemplate {
    /** Unique template ID */
    id: string;
    /** Display name */
    name: string;
    /** Category */
    category: ComponentCategory;
    /** Description */
    description: string;
    /** HTML template with {{property}} placeholders */
    html: string;
    /** CSS template */
    css: string;
    /** Configurable properties */
    properties: ComponentProperty[];
    /** Preview thumbnail (data URI or URL) */
    thumbnail: string;
    /** Tags for search */
    tags: string[];
    /** Whether this is a custom user template */
    isCustom: boolean;
}

export interface RenderedComponent {
    /** Rendered HTML */
    html: string;
    /** Rendered CSS */
    css: string;
}

export interface TemplateLibrary {
    /** All templates */
    templates: ComponentTemplate[];
    /** Custom templates saved by user */
    customTemplates: ComponentTemplate[];
}

// ============================================================================
// Built-in Templates
// ============================================================================

function createTemplate(
    id: string,
    name: string,
    category: ComponentCategory,
    description: string,
    html: string,
    css: string,
    properties: ComponentProperty[],
    tags: string[]
): ComponentTemplate {
    return { id, name, category, description, html, css, properties, thumbnail: '', tags, isCustom: false };
}

// --- Navigation Templates ---

const NAVBAR_TEMPLATE = createTemplate(
    'navbar-basic',
    'Navigation Bar',
    'navigation',
    'Horizontal navigation bar with logo and links',
    `<nav class="navbar" style="background-color: {{bgColor}}">
  <div class="navbar-brand">{{brandName}}</div>
  <ul class="navbar-links">
    <li><a href="#">Home</a></li>
    <li><a href="#">About</a></li>
    <li><a href="#">Contact</a></li>
  </ul>
</nav>`,
    `.navbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; }
.navbar-brand { font-size: 20px; font-weight: bold; }
.navbar-links { display: flex; list-style: none; gap: 16px; margin: 0; padding: 0; }
.navbar-links a { text-decoration: none; color: inherit; }`,
    [
        { name: 'brandName', type: 'string', defaultValue: 'My App', description: 'Brand/logo text' },
        { name: 'bgColor', type: 'color', defaultValue: '#ffffff', description: 'Background color' }
    ],
    ['nav', 'header', 'menu']
);

const SIDEBAR_TEMPLATE = createTemplate(
    'sidebar-basic',
    'Sidebar Navigation',
    'navigation',
    'Vertical sidebar with links and icons',
    `<aside class="sidebar" style="width: {{width}}px">
  <div class="sidebar-header">{{title}}</div>
  <ul class="sidebar-links">
    <li><a href="#">Dashboard</a></li>
    <li><a href="#">Settings</a></li>
    <li><a href="#">Profile</a></li>
  </ul>
</aside>`,
    `.sidebar { height: 100vh; background: #f8f9fa; border-right: 1px solid #dee2e6; }
.sidebar-header { padding: 16px; font-weight: bold; border-bottom: 1px solid #dee2e6; }
.sidebar-links { list-style: none; padding: 0; margin: 0; }
.sidebar-links li a { display: block; padding: 12px 16px; text-decoration: none; color: #333; }
.sidebar-links li a:hover { background: #e9ecef; }`,
    [
        { name: 'title', type: 'string', defaultValue: 'Menu', description: 'Sidebar title' },
        { name: 'width', type: 'number', defaultValue: 250, description: 'Sidebar width in pixels' }
    ],
    ['sidebar', 'menu', 'vertical']
);

// --- Content Templates ---

const CARD_TEMPLATE = createTemplate(
    'card-basic',
    'Content Card',
    'content',
    'Card with image, title, and description',
    `<div class="card" style="max-width: {{maxWidth}}px">
  <div class="card-body">
    <h3 class="card-title">{{title}}</h3>
    <p class="card-text">{{description}}</p>
    <button class="card-btn">{{buttonText}}</button>
  </div>
</div>`,
    `.card { border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden; }
.card-body { padding: 16px; }
.card-title { margin: 0 0 8px; font-size: 18px; }
.card-text { color: #6c757d; margin: 0 0 16px; }
.card-btn { padding: 8px 16px; background: #0d6efd; color: white; border: none; border-radius: 4px; cursor: pointer; }`,
    [
        { name: 'title', type: 'string', defaultValue: 'Card Title', description: 'Card heading' },
        { name: 'description', type: 'string', defaultValue: 'Card description text.', description: 'Card body text' },
        { name: 'buttonText', type: 'string', defaultValue: 'Learn More', description: 'Button label' },
        { name: 'maxWidth', type: 'number', defaultValue: 320, description: 'Maximum card width' }
    ],
    ['card', 'tile', 'content']
);

const HERO_TEMPLATE = createTemplate(
    'hero-section',
    'Hero Section',
    'content',
    'Full-width hero banner with headline and CTA',
    `<section class="hero" style="background-color: {{bgColor}}">
  <h1>{{headline}}</h1>
  <p>{{subheadline}}</p>
  <button class="hero-cta">{{ctaText}}</button>
</section>`,
    `.hero { text-align: center; padding: 80px 24px; }
.hero h1 { font-size: 48px; margin: 0 0 16px; }
.hero p { font-size: 20px; color: #6c757d; margin: 0 0 32px; }
.hero-cta { padding: 12px 32px; font-size: 18px; background: #0d6efd; color: white; border: none; border-radius: 4px; cursor: pointer; }`,
    [
        { name: 'headline', type: 'string', defaultValue: 'Welcome to Our App', description: 'Main headline' },
        { name: 'subheadline', type: 'string', defaultValue: 'Build something amazing today.', description: 'Sub-headline text' },
        { name: 'ctaText', type: 'string', defaultValue: 'Get Started', description: 'Call-to-action button text' },
        { name: 'bgColor', type: 'color', defaultValue: '#f8f9fa', description: 'Background color' }
    ],
    ['hero', 'banner', 'landing']
);

// --- Form Templates ---

const LOGIN_FORM_TEMPLATE = createTemplate(
    'form-login',
    'Login Form',
    'forms',
    'Email and password login form',
    `<form class="login-form" style="max-width: {{maxWidth}}px">
  <h2>{{title}}</h2>
  <div class="form-group">
    <label for="email">Email</label>
    <input type="email" id="email" placeholder="Enter your email" />
  </div>
  <div class="form-group">
    <label for="password">Password</label>
    <input type="password" id="password" placeholder="Enter your password" />
  </div>
  <button type="submit">{{submitText}}</button>
</form>`,
    `.login-form { padding: 24px; border: 1px solid #dee2e6; border-radius: 8px; margin: 0 auto; }
.login-form h2 { margin: 0 0 16px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 4px; font-weight: 500; }
.form-group input { width: 100%; padding: 8px 12px; border: 1px solid #ced4da; border-radius: 4px; box-sizing: border-box; }
.login-form button { width: 100%; padding: 10px; background: #0d6efd; color: white; border: none; border-radius: 4px; cursor: pointer; }`,
    [
        { name: 'title', type: 'string', defaultValue: 'Sign In', description: 'Form title' },
        { name: 'submitText', type: 'string', defaultValue: 'Sign In', description: 'Submit button text' },
        { name: 'maxWidth', type: 'number', defaultValue: 400, description: 'Maximum form width' }
    ],
    ['form', 'login', 'auth']
);

const CONTACT_FORM_TEMPLATE = createTemplate(
    'form-contact',
    'Contact Form',
    'forms',
    'Contact form with name, email, and message',
    `<form class="contact-form" style="max-width: {{maxWidth}}px">
  <h2>{{title}}</h2>
  <div class="form-group">
    <label for="name">Name</label>
    <input type="text" id="name" placeholder="Your name" />
  </div>
  <div class="form-group">
    <label for="email">Email</label>
    <input type="email" id="email" placeholder="Your email" />
  </div>
  <div class="form-group">
    <label for="message">Message</label>
    <textarea id="message" rows="5" placeholder="Your message"></textarea>
  </div>
  <button type="submit">{{submitText}}</button>
</form>`,
    `.contact-form { padding: 24px; border: 1px solid #dee2e6; border-radius: 8px; margin: 0 auto; }
.contact-form h2 { margin: 0 0 16px; }
.contact-form textarea { width: 100%; padding: 8px 12px; border: 1px solid #ced4da; border-radius: 4px; box-sizing: border-box; resize: vertical; }`,
    [
        { name: 'title', type: 'string', defaultValue: 'Contact Us', description: 'Form title' },
        { name: 'submitText', type: 'string', defaultValue: 'Send Message', description: 'Submit button text' },
        { name: 'maxWidth', type: 'number', defaultValue: 500, description: 'Maximum form width' }
    ],
    ['form', 'contact', 'feedback']
);

// --- Media Templates ---

const IMAGE_GALLERY_TEMPLATE = createTemplate(
    'media-gallery',
    'Image Gallery',
    'media',
    'Responsive image grid gallery',
    `<div class="gallery" style="--columns: {{columns}}">
  <div class="gallery-item"><div class="gallery-placeholder">Image 1</div></div>
  <div class="gallery-item"><div class="gallery-placeholder">Image 2</div></div>
  <div class="gallery-item"><div class="gallery-placeholder">Image 3</div></div>
  <div class="gallery-item"><div class="gallery-placeholder">Image 4</div></div>
</div>`,
    `.gallery { display: grid; grid-template-columns: repeat(var(--columns, 3), 1fr); gap: 12px; }
.gallery-item { border-radius: 4px; overflow: hidden; }
.gallery-placeholder { background: #e9ecef; height: 200px; display: flex; align-items: center; justify-content: center; color: #6c757d; }`,
    [
        { name: 'columns', type: 'number', defaultValue: 3, description: 'Number of columns' }
    ],
    ['gallery', 'images', 'grid']
);

// --- Layout Templates ---

const FOOTER_TEMPLATE = createTemplate(
    'layout-footer',
    'Footer',
    'layout',
    'Page footer with links and copyright',
    `<footer class="footer" style="background-color: {{bgColor}}">
  <div class="footer-content">
    <div class="footer-section">
      <h4>{{column1Title}}</h4>
      <ul><li><a href="#">Link 1</a></li><li><a href="#">Link 2</a></li></ul>
    </div>
    <div class="footer-section">
      <h4>{{column2Title}}</h4>
      <ul><li><a href="#">Link 3</a></li><li><a href="#">Link 4</a></li></ul>
    </div>
  </div>
  <div class="footer-bottom">
    <p>{{copyright}}</p>
  </div>
</footer>`,
    `.footer { padding: 32px 24px 16px; }
.footer-content { display: flex; gap: 48px; margin-bottom: 24px; }
.footer-section h4 { margin: 0 0 12px; }
.footer-section ul { list-style: none; padding: 0; margin: 0; }
.footer-section li { margin-bottom: 8px; }
.footer-section a { text-decoration: none; color: inherit; opacity: 0.8; }
.footer-bottom { border-top: 1px solid rgba(0,0,0,0.1); padding-top: 16px; text-align: center; font-size: 14px; opacity: 0.7; }`,
    [
        { name: 'column1Title', type: 'string', defaultValue: 'Product', description: 'First column title' },
        { name: 'column2Title', type: 'string', defaultValue: 'Company', description: 'Second column title' },
        { name: 'copyright', type: 'string', defaultValue: '© 2026 Your Company', description: 'Copyright text' },
        { name: 'bgColor', type: 'color', defaultValue: '#f8f9fa', description: 'Background color' }
    ],
    ['footer', 'bottom', 'links']
);

// --- Feedback Templates ---

const ALERT_TEMPLATE = createTemplate(
    'feedback-alert',
    'Alert Banner',
    'feedback',
    'Dismissible alert/notification banner',
    `<div class="alert alert-{{variant}}">
  <span class="alert-message">{{message}}</span>
  <button class="alert-close">×</button>
</div>`,
    `.alert { padding: 12px 16px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }
.alert-success { background: #d1e7dd; color: #0f5132; border: 1px solid #badbcc; }
.alert-warning { background: #fff3cd; color: #664d03; border: 1px solid #ffecb5; }
.alert-error { background: #f8d7da; color: #842029; border: 1px solid #f5c2c7; }
.alert-info { background: #cff4fc; color: #055160; border: 1px solid #b6effb; }
.alert-close { background: none; border: none; font-size: 20px; cursor: pointer; opacity: 0.5; }`,
    [
        { name: 'message', type: 'string', defaultValue: 'This is an alert message.', description: 'Alert message' },
        { name: 'variant', type: 'select', defaultValue: 'info', description: 'Alert type', options: ['success', 'warning', 'error', 'info'] }
    ],
    ['alert', 'notification', 'message', 'banner']
);

/** All built-in templates */
const BUILT_IN_TEMPLATES: ComponentTemplate[] = [
    NAVBAR_TEMPLATE,
    SIDEBAR_TEMPLATE,
    CARD_TEMPLATE,
    HERO_TEMPLATE,
    LOGIN_FORM_TEMPLATE,
    CONTACT_FORM_TEMPLATE,
    IMAGE_GALLERY_TEMPLATE,
    FOOTER_TEMPLATE,
    ALERT_TEMPLATE
];

// ============================================================================
// Template Library Management
// ============================================================================

/**
 * Create template library with all built-in templates.
 *
 * **Simple explanation**: Sets up a template library with all the pre-built components ready to use.
 */
export function createTemplateLibrary(): TemplateLibrary {
    return {
        templates: [...BUILT_IN_TEMPLATES],
        customTemplates: []
    };
}

/**
 * Get all templates, including custom ones.
 *
 * **Simple explanation**: Returns every template in the library — both built-in and custom.
 */
export function getAllTemplates(library: TemplateLibrary): ComponentTemplate[] {
    return [...library.templates, ...library.customTemplates];
}

/**
 * Get templates by category.
 *
 * **Simple explanation**: Filters templates to show only one category (like "forms" or "navigation").
 */
export function getTemplatesByCategory(library: TemplateLibrary, category: ComponentCategory): ComponentTemplate[] {
    return getAllTemplates(library).filter(t => t.category === category);
}

/**
 * Search templates by name or tags.
 *
 * **Simple explanation**: Searches all templates for ones matching your search text.
 */
export function searchTemplates(library: TemplateLibrary, query: string): ComponentTemplate[] {
    const lowerQuery = query.toLowerCase();
    return getAllTemplates(library).filter(t =>
        t.name.toLowerCase().includes(lowerQuery) ||
        t.description.toLowerCase().includes(lowerQuery) ||
        t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
}

/**
 * Get a specific template by ID.
 *
 * **Simple explanation**: Finds one specific template by its unique ID.
 */
export function getTemplateById(library: TemplateLibrary, id: string): ComponentTemplate | undefined {
    return getAllTemplates(library).find(t => t.id === id);
}

/**
 * Get all available categories with template counts.
 *
 * **Simple explanation**: Returns a list of categories and how many templates are in each.
 */
export function getCategoryCounts(library: TemplateLibrary): Record<ComponentCategory, number> {
    const all = getAllTemplates(library);
    const counts: Record<ComponentCategory, number> = {
        navigation: 0,
        content: 0,
        forms: 0,
        media: 0,
        layout: 0,
        feedback: 0
    };

    for (const t of all) {
        counts[t.category]++;
    }

    return counts;
}

// ============================================================================
// Template Rendering
// ============================================================================

/**
 * Render a template with given property values.
 *
 * **Simple explanation**: Takes a template and fills in its placeholders with your values
 * (like replacing {{title}} with "My App").
 */
export function renderTemplate(
    template: ComponentTemplate,
    propertyValues: Record<string, string | number | boolean>
): RenderedComponent {
    let html = template.html;
    let css = template.css;

    for (const prop of template.properties) {
        const value = propertyValues[prop.name] ?? prop.defaultValue;
        const placeholder = `{{${prop.name}}}`;
        const strValue = String(value);

        html = html.split(placeholder).join(strValue);
        css = css.split(placeholder).join(strValue);
    }

    return { html, css };
}

/**
 * Render a template with default values.
 *
 * **Simple explanation**: Renders the template using all its default settings.
 */
export function renderTemplateDefaults(template: ComponentTemplate): RenderedComponent {
    const defaults: Record<string, string | number | boolean> = {};
    for (const prop of template.properties) {
        defaults[prop.name] = prop.defaultValue;
    }
    return renderTemplate(template, defaults);
}

// ============================================================================
// Custom Template Management
// ============================================================================

/**
 * Save a custom template.
 *
 * **Simple explanation**: Saves a component you've designed as a reusable template.
 */
export function saveCustomTemplate(
    library: TemplateLibrary,
    name: string,
    category: ComponentCategory,
    description: string,
    html: string,
    css: string,
    properties: ComponentProperty[],
    tags: string[]
): { library: TemplateLibrary; template: ComponentTemplate } {
    const template: ComponentTemplate = {
        id: `custom-${Date.now()}`,
        name,
        category,
        description,
        html,
        css,
        properties,
        thumbnail: '',
        tags,
        isCustom: true
    };

    return {
        library: {
            ...library,
            customTemplates: [...library.customTemplates, template]
        },
        template
    };
}

/**
 * Remove a custom template.
 *
 * **Simple explanation**: Deletes a custom template you previously saved.
 */
export function removeCustomTemplate(library: TemplateLibrary, templateId: string): TemplateLibrary {
    return {
        ...library,
        customTemplates: library.customTemplates.filter(t => t.id !== templateId)
    };
}

// ============================================================================
// HTML Rendering for Library Panel
// ============================================================================

/**
 * Render the component template library panel.
 *
 * **Simple explanation**: Creates the visual interface showing all available component templates,
 * organized by category with search.
 */
export function renderTemplateLibraryPanel(library: TemplateLibrary): string {
    const categories = getCategoryCounts(library);
    const all = getAllTemplates(library);

    return `<div class="template-library">
  <div class="template-header">
    <h2>Component Templates</h2>
    <input type="text" class="template-search" placeholder="Search templates..." />
  </div>

  <div class="template-categories">
    ${Object.entries(categories).map(([cat, count]) =>
      `<button class="category-btn" data-category="${cat}">
        ${cat.charAt(0).toUpperCase() + cat.slice(1)} (${count})
      </button>`
    ).join('\n    ')}
  </div>

  <div class="template-grid">
    ${all.map(t => {
      const defaults = renderTemplateDefaults(t);
      return `<div class="template-card" data-id="${t.id}">
      <div class="template-preview">${defaults.html}</div>
      <div class="template-info">
        <span class="template-name">${t.name}</span>
        <span class="template-category">${t.category}</span>
        ${t.isCustom ? '<span class="template-custom-badge">Custom</span>' : ''}
      </div>
    </div>`;
    }).join('\n    ')}
  </div>
</div>`;
}

/**
 * Get template library styles.
 *
 * **Simple explanation**: Returns CSS for styling the template library panel.
 */
export function getTemplateLibraryStyles(): string {
    return `.template-library {
  font-family: var(--vscode-font-family);
  padding: 16px;
}
.template-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.template-search { padding: 6px 12px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; width: 200px; }
.template-categories { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.category-btn { padding: 4px 12px; border: 1px solid var(--vscode-button-border, #ccc); border-radius: 16px; cursor: pointer; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); font-size: 12px; }
.template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.template-card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; overflow: hidden; cursor: pointer; }
.template-card:hover { border-color: var(--vscode-focusBorder); }
.template-preview { height: 150px; overflow: hidden; background: white; padding: 8px; transform: scale(0.5); transform-origin: top left; width: 200%; }
.template-info { padding: 8px; background: var(--vscode-editor-background); }
.template-name { display: block; font-weight: bold; font-size: 13px; }
.template-category { font-size: 11px; color: var(--vscode-descriptionForeground); }
.template-custom-badge { font-size: 10px; padding: 2px 6px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
`;
}
