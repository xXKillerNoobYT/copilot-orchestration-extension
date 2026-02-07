/**
 * Plan Export Module (MT-033.11)
 *
 * **Simple explanation**: Exports plans in multiple formats (JSON, Markdown, YAML).
 * Like "Save As" in word processors - choose the format that works for your needs.
 *
 * @module ui/planExport
 */

import * as vscode from 'vscode';
import { CompletePlan, FeatureBlock, UserStory, DeveloperStory, SuccessCriterion, BlockLink } from '../planning/types';
import { logInfo, logError } from '../logger';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'json' | 'markdown' | 'yaml';

export interface ExportOptions {
    /** Export format */
    format: ExportFormat;
    /** Include metadata (id, timestamps) */
    includeMetadata?: boolean;
    /** Include dependency graph as mermaid */
    includeDependencyGraph?: boolean;
    /** Pretty print output */
    prettyPrint?: boolean;
}

export interface ExportResult {
    /** Success flag */
    success: boolean;
    /** Exported content */
    content: string;
    /** File extension */
    extension: string;
    /** MIME type */
    mimeType: string;
    /** Error message if failed */
    error?: string;
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export a plan in the specified format.
 *
 * **Simple explanation**: Converts your plan into text format (JSON, Markdown, or YAML)
 * so you can save it, share it, or use it in other tools.
 *
 * @param plan - The plan to export
 * @param options - Export options
 * @returns Export result with content and metadata
 */
export function exportPlan(plan: CompletePlan, options: ExportOptions): ExportResult {
    try {
        switch (options.format) {
            case 'json':
                return exportToJson(plan, options);
            case 'markdown':
                return exportToMarkdown(plan, options);
            case 'yaml':
                return exportToYaml(plan, options);
            default:
                return {
                    success: false,
                    content: '',
                    extension: '',
                    mimeType: '',
                    error: `Unknown format: ${options.format}`,
                };
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logError(`Failed to export plan: ${errorMessage}`);
        return {
            success: false,
            content: '',
            extension: '',
            mimeType: '',
            error: errorMessage,
        };
    }
}

/**
 * Export plan to JSON format.
 */
function exportToJson(plan: CompletePlan, options: ExportOptions): ExportResult {
    const exportData = options.includeMetadata !== false ? plan : stripMetadata(plan);
    const indent = options.prettyPrint !== false ? 2 : 0;

    return {
        success: true,
        content: JSON.stringify(exportData, null, indent),
        extension: '.json',
        mimeType: 'application/json',
    };
}

/**
 * Export plan to Markdown format.
 */
function exportToMarkdown(plan: CompletePlan, options: ExportOptions): ExportResult {
    const lines: string[] = [];

    // Title
    lines.push(`# ${plan.metadata.name || 'Project Plan'}`);
    lines.push('');

    // Metadata
    if (options.includeMetadata !== false) {
        lines.push(`> Created: ${formatDate(plan.metadata.createdAt)}`);
        lines.push(`> Updated: ${formatDate(plan.metadata.updatedAt)}`);
        lines.push(`> Version: ${plan.metadata.version}`);
        lines.push('');
    }

    // Overview
    lines.push('## 📋 Project Overview');
    lines.push('');
    if (plan.overview.description) {
        lines.push(plan.overview.description);
        lines.push('');
    }

    // Goals
    if (plan.overview.goals.length > 0) {
        lines.push('### Goals');
        lines.push('');
        plan.overview.goals.forEach((goal, i) => {
            lines.push(`${i + 1}. ${goal}`);
        });
        lines.push('');
    }

    // Feature Blocks
    if (plan.featureBlocks.length > 0) {
        lines.push('## 🎯 Feature Blocks');
        lines.push('');

        plan.featureBlocks.forEach((feature, i) => {
            lines.push(`### ${i + 1}. ${feature.name}`);
            lines.push('');
            lines.push(`**Priority:** ${feature.priority}`);
            lines.push('');

            if (feature.description) {
                lines.push(feature.description);
                lines.push('');
            }

            if (feature.purpose) {
                lines.push(`**Purpose:** ${feature.purpose}`);
                lines.push('');
            }

            if (feature.acceptanceCriteria.length > 0) {
                lines.push('**Acceptance Criteria:**');
                feature.acceptanceCriteria.forEach(c => {
                    lines.push(`- [ ] ${c}`);
                });
                lines.push('');
            }

            if (feature.technicalNotes) {
                lines.push(`**Technical Notes:** ${feature.technicalNotes}`);
                lines.push('');
            }
        });
    }

    // Block Links / Dependencies
    if (plan.blockLinks.length > 0 && options.includeDependencyGraph !== false) {
        lines.push('## 🔗 Dependencies');
        lines.push('');
        lines.push('```mermaid');
        lines.push('graph TD');
        plan.blockLinks.forEach(link => {
            const source = plan.featureBlocks.find(f => f.id === link.sourceBlockId);
            const target = plan.featureBlocks.find(f => f.id === link.targetBlockId);
            if (source && target) {
                const arrow = link.dependencyType === 'blocks' ? '-.->|blocks|' : '-->|' + link.dependencyType + '|';
                lines.push(`    ${sanitizeMermaidId(source.name)} ${arrow} ${sanitizeMermaidId(target.name)}`);
            }
        });
        lines.push('```');
        lines.push('');
    }

    // User Stories
    if (plan.userStories.length > 0) {
        lines.push('## 👤 User Stories');
        lines.push('');

        plan.userStories.forEach((story, i) => {
            lines.push(`### US-${String(i + 1).padStart(3, '0')}`);
            lines.push('');
            lines.push(`> As a **${story.userType}**, I want to **${story.action}**, so that **${story.benefit}**.`);
            lines.push('');

            if (story.acceptanceCriteria.length > 0) {
                lines.push('**Acceptance Criteria:**');
                story.acceptanceCriteria.forEach(c => {
                    lines.push(`- [ ] ${c}`);
                });
                lines.push('');
            }
        });
    }

    // Developer Stories
    if (plan.developerStories.length > 0) {
        lines.push('## 🔧 Developer Stories');
        lines.push('');

        plan.developerStories.forEach((story, i) => {
            lines.push(`### DS-${String(i + 1).padStart(3, '0')}`);
            lines.push('');
            lines.push(`> As a developer, I need to **${story.action}**, so that **${story.benefit}**.`);
            lines.push('');

            if (story.estimatedHours > 0) {
                lines.push(`**Estimated Time:** ${story.estimatedHours} hours`);
                lines.push('');
            }

            if (story.technicalRequirements.length > 0) {
                lines.push('**Technical Requirements:**');
                story.technicalRequirements.forEach(r => {
                    lines.push(`- ${r}`);
                });
                lines.push('');
            }

            if (story.apiNotes) {
                lines.push(`**API Notes:** ${story.apiNotes}`);
                lines.push('');
            }

            if (story.databaseNotes) {
                lines.push(`**Database Notes:** ${story.databaseNotes}`);
                lines.push('');
            }
        });
    }

    // Success Criteria
    if (plan.successCriteria.length > 0) {
        lines.push('## ✅ Success Criteria');
        lines.push('');

        plan.successCriteria.forEach((criterion, i) => {
            const smartBadges = getSmartBadges(criterion.smartAttributes);
            lines.push(`${i + 1}. ${criterion.description}`);
            lines.push(`   - Priority: ${criterion.priority}`);
            lines.push(`   - SMART: ${smartBadges}`);
            lines.push('');
        });
    }

    return {
        success: true,
        content: lines.join('\n'),
        extension: '.md',
        mimeType: 'text/markdown',
    };
}

/**
 * Export plan to YAML format.
 */
function exportToYaml(plan: CompletePlan, options: ExportOptions): ExportResult {
    const lines: string[] = [];

    // Header
    lines.push('# Project Plan');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push('---');
    lines.push('');

    // Metadata
    if (options.includeMetadata !== false) {
        lines.push('metadata:');
        lines.push(`  id: ${plan.metadata.id}`);
        lines.push(`  name: "${escapeYamlString(plan.metadata.name)}"`);
        lines.push(`  createdAt: ${plan.metadata.createdAt instanceof Date ? plan.metadata.createdAt.toISOString() : plan.metadata.createdAt}`);
        lines.push(`  updatedAt: ${plan.metadata.updatedAt instanceof Date ? plan.metadata.updatedAt.toISOString() : plan.metadata.updatedAt}`);
        lines.push(`  version: ${plan.metadata.version}`);
        lines.push('');
    }

    // Overview
    lines.push('overview:');
    lines.push(`  name: "${escapeYamlString(plan.overview.name)}"`);
    lines.push(`  description: "${escapeYamlString(plan.overview.description)}"`);
    if (plan.overview.goals.length > 0) {
        lines.push('  goals:');
        plan.overview.goals.forEach(goal => {
            lines.push(`    - "${escapeYamlString(goal)}"`);
        });
    }
    lines.push('');

    // Feature Blocks
    if (plan.featureBlocks.length > 0) {
        lines.push('featureBlocks:');
        plan.featureBlocks.forEach(feature => {
            lines.push(`  - id: ${feature.id}`);
            lines.push(`    name: "${escapeYamlString(feature.name)}"`);
            lines.push(`    description: "${escapeYamlString(feature.description)}"`);
            lines.push(`    purpose: "${escapeYamlString(feature.purpose)}"`);
            lines.push(`    priority: ${feature.priority}`);
            lines.push(`    order: ${feature.order}`);
            if (feature.acceptanceCriteria.length > 0) {
                lines.push('    acceptanceCriteria:');
                feature.acceptanceCriteria.forEach(c => {
                    lines.push(`      - "${escapeYamlString(c)}"`);
                });
            }
            if (feature.technicalNotes) {
                lines.push(`    technicalNotes: "${escapeYamlString(feature.technicalNotes)}"`);
            }
        });
        lines.push('');
    }

    // Block Links
    if (plan.blockLinks.length > 0) {
        lines.push('blockLinks:');
        plan.blockLinks.forEach(link => {
            lines.push(`  - id: ${link.id}`);
            lines.push(`    sourceBlockId: ${link.sourceBlockId}`);
            lines.push(`    targetBlockId: ${link.targetBlockId}`);
            lines.push(`    dependencyType: ${link.dependencyType}`);
        });
        lines.push('');
    }

    // User Stories
    if (plan.userStories.length > 0) {
        lines.push('userStories:');
        plan.userStories.forEach(story => {
            lines.push(`  - id: ${story.id}`);
            lines.push(`    userType: "${escapeYamlString(story.userType)}"`);
            lines.push(`    action: "${escapeYamlString(story.action)}"`);
            lines.push(`    benefit: "${escapeYamlString(story.benefit)}"`);
            lines.push(`    priority: ${story.priority}`);
            if (story.acceptanceCriteria.length > 0) {
                lines.push('    acceptanceCriteria:');
                story.acceptanceCriteria.forEach(c => {
                    lines.push(`      - "${escapeYamlString(c)}"`);
                });
            }
        });
        lines.push('');
    }

    // Developer Stories
    if (plan.developerStories.length > 0) {
        lines.push('developerStories:');
        plan.developerStories.forEach(story => {
            lines.push(`  - id: ${story.id}`);
            lines.push(`    action: "${escapeYamlString(story.action)}"`);
            lines.push(`    benefit: "${escapeYamlString(story.benefit)}"`);
            lines.push(`    estimatedHours: ${story.estimatedHours}`);
            if (story.technicalRequirements.length > 0) {
                lines.push('    technicalRequirements:');
                story.technicalRequirements.forEach(r => {
                    lines.push(`      - "${escapeYamlString(r)}"`);
                });
            }
            if (story.apiNotes) {
                lines.push(`    apiNotes: "${escapeYamlString(story.apiNotes)}"`);
            }
            if (story.databaseNotes) {
                lines.push(`    databaseNotes: "${escapeYamlString(story.databaseNotes)}"`);
            }
        });
        lines.push('');
    }

    // Success Criteria
    if (plan.successCriteria.length > 0) {
        lines.push('successCriteria:');
        plan.successCriteria.forEach(criterion => {
            lines.push(`  - id: ${criterion.id}`);
            lines.push(`    description: "${escapeYamlString(criterion.description)}"`);
            lines.push(`    priority: ${criterion.priority}`);
            lines.push(`    testable: ${criterion.testable}`);
            lines.push('    smartAttributes:');
            lines.push(`      specific: ${criterion.smartAttributes.specific}`);
            lines.push(`      measurable: ${criterion.smartAttributes.measurable}`);
            lines.push(`      achievable: ${criterion.smartAttributes.achievable}`);
            lines.push(`      relevant: ${criterion.smartAttributes.relevant}`);
            lines.push(`      timeBound: ${criterion.smartAttributes.timeBound}`);
        });
        lines.push('');
    }

    return {
        success: true,
        content: lines.join('\n'),
        extension: '.yaml',
        mimeType: 'text/yaml',
    };
}

// ============================================================================
// Save to File
// ============================================================================

/**
 * Export plan and save to file via VS Code dialog.
 *
 * **Simple explanation**: Opens a "Save As" dialog and writes the exported
 * plan to the selected file.
 *
 * @param plan - The plan to export
 * @param options - Export options
 * @returns True if saved successfully
 */
export async function exportPlanToFile(plan: CompletePlan, options: ExportOptions): Promise<boolean> {
    const result = exportPlan(plan, options);

    if (!result.success) {
        vscode.window.showErrorMessage(`Export failed: ${result.error}`);
        return false;
    }

    const defaultName = `${sanitizeFilename(plan.metadata.name || 'plan')}${result.extension}`;

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultName),
        filters: {
            [getFormatLabel(options.format)]: [result.extension.slice(1)],
            'All Files': ['*'],
        },
    });

    if (!uri) {
        return false; // User cancelled
    }

    try {
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(result.content));
        logInfo(`Exported plan to ${uri.fsPath}`);
        vscode.window.showInformationMessage(`Plan exported to ${uri.fsPath}`);
        return true;
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logError(`Failed to save export: ${errorMessage}`);
        vscode.window.showErrorMessage(`Failed to save: ${errorMessage}`);
        return false;
    }
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Renders export dropdown HTML.
 */
export function renderExportDropdown(): string {
    return `
    <div class="export-dropdown">
      <button type="button" class="btn-primary export-btn" onclick="toggleExportMenu()">
        📤 Export Plan
      </button>
      <div class="export-menu hidden" id="exportMenu">
        <button type="button" class="export-option" onclick="exportAs('json')">
          <span class="export-icon">{ }</span>
          <span class="export-label">JSON</span>
          <span class="export-desc">Raw data format</span>
        </button>
        <button type="button" class="export-option" onclick="exportAs('markdown')">
          <span class="export-icon">📝</span>
          <span class="export-label">Markdown</span>
          <span class="export-desc">Human-readable docs</span>
        </button>
        <button type="button" class="export-option" onclick="exportAs('yaml')">
          <span class="export-icon">📋</span>
          <span class="export-label">YAML</span>
          <span class="export-desc">Config-friendly format</span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Get CSS styles for export dropdown.
 */
export function getExportDropdownStyles(): string {
    return `
    .export-dropdown {
      position: relative;
      display: inline-block;
    }

    .export-btn {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .export-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      min-width: 200px;
      z-index: 100;
      overflow: hidden;
    }

    .export-menu.hidden {
      display: none;
    }

    .export-option {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      width: 100%;
      padding: 10px 14px;
      background: none;
      border: none;
      color: var(--vscode-dropdown-foreground);
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
    }

    .export-option:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .export-option:not(:last-child) {
      border-bottom: 1px solid var(--vscode-dropdown-border);
    }

    .export-icon {
      font-size: 16px;
      margin-bottom: 2px;
    }

    .export-label {
      font-weight: 600;
      font-size: 13px;
    }

    .export-desc {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
  `;
}

/**
 * Get JavaScript for export dropdown.
 */
export function getExportDropdownScript(): string {
    return `
    function toggleExportMenu() {
      const menu = document.getElementById('exportMenu');
      menu.classList.toggle('hidden');
    }

    function exportAs(format) {
      document.getElementById('exportMenu').classList.add('hidden');
      vscode.postMessage({ command: 'export', format });
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.querySelector('.export-dropdown');
      if (dropdown && !dropdown.contains(e.target)) {
        document.getElementById('exportMenu')?.classList.add('hidden');
      }
    });
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function stripMetadata(plan: CompletePlan): Omit<CompletePlan, 'metadata'> & { metadata: { name: string } } {
    return {
        ...plan,
        metadata: { name: plan.metadata.name },
    };
}

function formatDate(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

function sanitizeMermaidId(text: string): string {
    return text.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
}

function escapeYamlString(text: string): string {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
}

function sanitizeFilename(text: string): string {
    return text
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 50)
        .toLowerCase();
}

function getFormatLabel(format: ExportFormat): string {
    switch (format) {
        case 'json': return 'JSON';
        case 'markdown': return 'Markdown';
        case 'yaml': return 'YAML';
        default: return 'File';
    }
}

function getSmartBadges(attrs: SuccessCriterion['smartAttributes']): string {
    const badges: string[] = [];
    if (attrs.specific) badges.push('S');
    if (attrs.measurable) badges.push('M');
    if (attrs.achievable) badges.push('A');
    if (attrs.relevant) badges.push('R');
    if (attrs.timeBound) badges.push('T');
    return badges.length === 5 ? '✅ SMART' : badges.join('');
}
