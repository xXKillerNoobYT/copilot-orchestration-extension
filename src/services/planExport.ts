/**
 * Plan Export Service - Multi-format plan export
 *
 * **Simple explanation**: This service takes a plan and converts it into
 * different file formats (JSON, Markdown, YAML) so users can share, save,
 * or import their plans into other tools.
 *
 * @module services/planExport
 */

import {
    CompletePlan,
    FeatureBlock,
    UserStory,
    DeveloperStory,
    SuccessCriterion,
    BlockLink,
    ConditionalLogic,
    PriorityLevel
} from '../planning/types';

// ============================================================================
// Export Formats
// ============================================================================

export type ExportFormat = 'json' | 'markdown' | 'yaml';

export interface ExportOptions {
    /** Include metadata (id, dates, version) in export */
    includeMetadata?: boolean;
    /** Pretty-print output (indentation, line breaks) */
    prettyPrint?: boolean;
    /** Include empty arrays/sections */
    includeEmpty?: boolean;
}

export interface ExportResult {
    format: ExportFormat;
    content: string;
    filename: string;
    mimeType: string;
}

// ============================================================================
// JSON Export
// ============================================================================

/**
 * Export plan as JSON format.
 *
 * **Simple explanation**: Converts the plan to a JSON file that can be
 * re-imported later without losing any data.
 */
export function exportToJSON(plan: Partial<CompletePlan>, options: ExportOptions = {}): ExportResult {
    const { prettyPrint = true, includeMetadata = true, includeEmpty = false } = options;

    // Clone plan to avoid mutating original
    const exportPlan = { ...plan };

    // Remove metadata if not needed
    if (!includeMetadata && exportPlan.metadata) {
        const { metadata, ...rest } = exportPlan;
        Object.assign(exportPlan, rest);
        delete (exportPlan as Partial<CompletePlan>).metadata;
    }

    // Remove empty arrays if not including empty
    if (!includeEmpty) {
        if (exportPlan.featureBlocks?.length === 0) delete exportPlan.featureBlocks;
        if (exportPlan.blockLinks?.length === 0) delete exportPlan.blockLinks;
        if (exportPlan.conditionalLogic?.length === 0) delete exportPlan.conditionalLogic;
        if (exportPlan.userStories?.length === 0) delete exportPlan.userStories;
        if (exportPlan.developerStories?.length === 0) delete exportPlan.developerStories;
        if (exportPlan.successCriteria?.length === 0) delete exportPlan.successCriteria;
    }

    const content = prettyPrint
        ? JSON.stringify(exportPlan, null, 2)
        : JSON.stringify(exportPlan);

    const filename = sanitizeFilename(plan.overview?.name || 'plan') + '.json';

    return {
        format: 'json',
        content,
        filename,
        mimeType: 'application/json'
    };
}

// ============================================================================
// Markdown Export
// ============================================================================

/**
 * Export plan as Markdown format.
 *
 * **Simple explanation**: Creates a readable document with sections for
 * each part of the plan - like a project specification document.
 */
export function exportToMarkdown(plan: Partial<CompletePlan>, options: ExportOptions = {}): ExportResult {
    const { includeMetadata = true, includeEmpty = false } = options;
    const lines: string[] = [];

    // Title
    const projectName = plan.overview?.name || 'Untitled Project';
    lines.push(`# ${projectName}`);
    lines.push('');

    // Metadata
    if (includeMetadata && plan.metadata) {
        lines.push('## Metadata');
        lines.push('');
        lines.push(`- **Version**: ${plan.metadata.version || 1}`);
        if (plan.metadata.author) {
            lines.push(`- **Author**: ${plan.metadata.author}`);
        }
        if (plan.metadata.createdAt) {
            lines.push(`- **Created**: ${formatDate(plan.metadata.createdAt)}`);
        }
        if (plan.metadata.updatedAt) {
            lines.push(`- **Updated**: ${formatDate(plan.metadata.updatedAt)}`);
        }
        lines.push('');
    }

    // Overview
    if (plan.overview || includeEmpty) {
        lines.push('## Project Overview');
        lines.push('');
        if (plan.overview?.description) {
            lines.push(plan.overview.description);
            lines.push('');
        }
        if (plan.overview?.goals && plan.overview.goals.length > 0) {
            lines.push('### Goals');
            lines.push('');
            for (const goal of plan.overview.goals) {
                lines.push(`- ${goal}`);
            }
            lines.push('');
        }
    }

    // Feature Blocks
    if ((plan.featureBlocks && plan.featureBlocks.length > 0) || includeEmpty) {
        lines.push('## Feature Blocks');
        lines.push('');
        if (plan.featureBlocks) {
            for (const feature of plan.featureBlocks) {
                lines.push(...renderFeatureBlock(feature));
            }
        }
    }

    // Dependencies
    if ((plan.blockLinks && plan.blockLinks.length > 0) || includeEmpty) {
        lines.push('## Dependencies');
        lines.push('');
        if (plan.blockLinks) {
            for (const link of plan.blockLinks) {
                const sourceName = findFeatureName(plan.featureBlocks, link.sourceBlockId);
                const targetName = findFeatureName(plan.featureBlocks, link.targetBlockId);
                lines.push(`- **${sourceName}** ${link.dependencyType} **${targetName}**`);
            }
            lines.push('');
        }
    }

    // Conditional Logic
    if ((plan.conditionalLogic && plan.conditionalLogic.length > 0) || includeEmpty) {
        lines.push('## Conditional Logic');
        lines.push('');
        if (plan.conditionalLogic) {
            for (const cond of plan.conditionalLogic) {
                const sourceName = findFeatureName(plan.featureBlocks, cond.sourceBlockId);
                const targetName = findFeatureName(plan.featureBlocks, cond.targetBlockId);
                lines.push(`- When **${sourceName}** is ${cond.trigger} → **${targetName}** ${cond.action}`);
            }
            lines.push('');
        }
    }

    // User Stories
    if ((plan.userStories && plan.userStories.length > 0) || includeEmpty) {
        lines.push('## User Stories');
        lines.push('');
        if (plan.userStories) {
            for (const story of plan.userStories) {
                lines.push(...renderUserStory(story));
            }
        }
    }

    // Developer Stories
    if ((plan.developerStories && plan.developerStories.length > 0) || includeEmpty) {
        lines.push('## Developer Stories');
        lines.push('');
        if (plan.developerStories) {
            for (const story of plan.developerStories) {
                lines.push(...renderDevStory(story));
            }
        }
    }

    // Success Criteria
    if ((plan.successCriteria && plan.successCriteria.length > 0) || includeEmpty) {
        lines.push('## Success Criteria');
        lines.push('');
        if (plan.successCriteria) {
            for (const criterion of plan.successCriteria) {
                lines.push(...renderSuccessCriterion(criterion));
            }
        }
    }

    // Summary
    lines.push('---');
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Features**: ${plan.featureBlocks?.length || 0}`);
    lines.push(`- **User Stories**: ${plan.userStories?.length || 0}`);
    lines.push(`- **Developer Stories**: ${plan.developerStories?.length || 0}`);
    lines.push(`- **Success Criteria**: ${plan.successCriteria?.length || 0}`);
    lines.push('');

    const content = lines.join('\n');
    const filename = sanitizeFilename(projectName) + '.md';

    return {
        format: 'markdown',
        content,
        filename,
        mimeType: 'text/markdown'
    };
}

// ============================================================================
// YAML Export
// ============================================================================

/**
 * Export plan as YAML format.
 *
 * **Simple explanation**: Creates a YAML file that's easier to read than JSON
 * and commonly used for configuration files.
 */
export function exportToYAML(plan: Partial<CompletePlan>, options: ExportOptions = {}): ExportResult {
    const { includeMetadata = true, includeEmpty = false } = options;
    const lines: string[] = [];

    // Header comment
    lines.push('# Project Plan');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push('');

    // Metadata
    if (includeMetadata && plan.metadata) {
        lines.push('metadata:');
        lines.push(`  id: "${plan.metadata.id || ''}"`);
        lines.push(`  name: "${escapeYAML(plan.metadata.name || '')}"`);
        lines.push(`  version: ${plan.metadata.version || 1}`);
        if (plan.metadata.author) {
            lines.push(`  author: "${escapeYAML(plan.metadata.author)}"`);
        }
        if (plan.metadata.createdAt) {
            lines.push(`  createdAt: "${plan.metadata.createdAt instanceof Date ? plan.metadata.createdAt.toISOString() : plan.metadata.createdAt}"`);
        }
        if (plan.metadata.updatedAt) {
            lines.push(`  updatedAt: "${plan.metadata.updatedAt instanceof Date ? plan.metadata.updatedAt.toISOString() : plan.metadata.updatedAt}"`);
        }
        lines.push('');
    }

    // Overview
    if (plan.overview || includeEmpty) {
        lines.push('overview:');
        lines.push(`  name: "${escapeYAML(plan.overview?.name || '')}"`);
        lines.push(`  description: "${escapeYAML(plan.overview?.description || '')}"`);
        if (plan.overview?.goals && plan.overview.goals.length > 0) {
            lines.push('  goals:');
            for (const goal of plan.overview.goals) {
                lines.push(`    - "${escapeYAML(goal)}"`);
            }
        } else if (includeEmpty) {
            lines.push('  goals: []');
        }
        lines.push('');
    }

    // Feature Blocks
    if ((plan.featureBlocks && plan.featureBlocks.length > 0) || includeEmpty) {
        lines.push('featureBlocks:');
        if (plan.featureBlocks && plan.featureBlocks.length > 0) {
            for (const feature of plan.featureBlocks) {
                lines.push(`  - id: "${feature.id}"`);
                lines.push(`    name: "${escapeYAML(feature.name)}"`);
                lines.push(`    description: "${escapeYAML(feature.description)}"`);
                lines.push(`    purpose: "${escapeYAML(feature.purpose)}"`);
                lines.push(`    priority: ${feature.priority}`);
                if (feature.acceptanceCriteria && feature.acceptanceCriteria.length > 0) {
                    lines.push('    acceptanceCriteria:');
                    for (const ac of feature.acceptanceCriteria) {
                        lines.push(`      - "${escapeYAML(ac)}"`);
                    }
                }
            }
        } else {
            lines.push('  []');
        }
        lines.push('');
    }

    // Block Links
    if ((plan.blockLinks && plan.blockLinks.length > 0) || includeEmpty) {
        lines.push('blockLinks:');
        if (plan.blockLinks && plan.blockLinks.length > 0) {
            for (const link of plan.blockLinks) {
                lines.push(`  - id: "${link.id}"`);
                lines.push(`    sourceBlockId: "${link.sourceBlockId}"`);
                lines.push(`    targetBlockId: "${link.targetBlockId}"`);
                lines.push(`    dependencyType: ${link.dependencyType}`);
            }
        } else {
            lines.push('  []');
        }
        lines.push('');
    }

    // Conditional Logic
    if ((plan.conditionalLogic && plan.conditionalLogic.length > 0) || includeEmpty) {
        lines.push('conditionalLogic:');
        if (plan.conditionalLogic && plan.conditionalLogic.length > 0) {
            for (const cond of plan.conditionalLogic) {
                lines.push(`  - id: "${cond.id}"`);
                lines.push(`    sourceBlockId: "${cond.sourceBlockId}"`);
                lines.push(`    trigger: ${cond.trigger}`);
                lines.push(`    action: ${cond.action}`);
                lines.push(`    targetBlockId: "${cond.targetBlockId}"`);
            }
        } else {
            lines.push('  []');
        }
        lines.push('');
    }

    // User Stories
    if ((plan.userStories && plan.userStories.length > 0) || includeEmpty) {
        lines.push('userStories:');
        if (plan.userStories && plan.userStories.length > 0) {
            for (const story of plan.userStories) {
                lines.push(`  - id: "${story.id}"`);
                lines.push(`    userType: "${escapeYAML(story.userType)}"`);
                lines.push(`    action: "${escapeYAML(story.action)}"`);
                lines.push(`    benefit: "${escapeYAML(story.benefit)}"`);
                lines.push(`    priority: ${story.priority}`);
                if (story.relatedBlockIds && story.relatedBlockIds.length > 0) {
                    lines.push('    relatedBlockIds:');
                    for (const id of story.relatedBlockIds) {
                        lines.push(`      - "${id}"`);
                    }
                }
            }
        } else {
            lines.push('  []');
        }
        lines.push('');
    }

    // Developer Stories
    if ((plan.developerStories && plan.developerStories.length > 0) || includeEmpty) {
        lines.push('developerStories:');
        if (plan.developerStories && plan.developerStories.length > 0) {
            for (const story of plan.developerStories) {
                lines.push(`  - id: "${story.id}"`);
                lines.push(`    action: "${escapeYAML(story.action)}"`);
                lines.push(`    benefit: "${escapeYAML(story.benefit)}"`);
                lines.push(`    estimatedHours: ${story.estimatedHours}`);
                if (story.apiNotes) {
                    lines.push(`    apiNotes: "${escapeYAML(story.apiNotes)}"`);
                }
                if (story.databaseNotes) {
                    lines.push(`    databaseNotes: "${escapeYAML(story.databaseNotes)}"`);
                }
                if (story.technicalRequirements && story.technicalRequirements.length > 0) {
                    lines.push('    technicalRequirements:');
                    for (const req of story.technicalRequirements) {
                        lines.push(`      - "${escapeYAML(req)}"`);
                    }
                }
            }
        } else {
            lines.push('  []');
        }
        lines.push('');
    }

    // Success Criteria
    if ((plan.successCriteria && plan.successCriteria.length > 0) || includeEmpty) {
        lines.push('successCriteria:');
        if (plan.successCriteria && plan.successCriteria.length > 0) {
            for (const criterion of plan.successCriteria) {
                lines.push(`  - id: "${criterion.id}"`);
                lines.push(`    description: "${escapeYAML(criterion.description)}"`);
                lines.push(`    testable: ${criterion.testable}`);
                lines.push(`    priority: ${criterion.priority}`);
                lines.push('    smartAttributes:');
                lines.push(`      specific: ${criterion.smartAttributes.specific}`);
                lines.push(`      measurable: ${criterion.smartAttributes.measurable}`);
                lines.push(`      achievable: ${criterion.smartAttributes.achievable}`);
                lines.push(`      relevant: ${criterion.smartAttributes.relevant}`);
                lines.push(`      timeBound: ${criterion.smartAttributes.timeBound}`);
            }
        } else {
            lines.push('  []');
        }
        lines.push('');
    }

    const content = lines.join('\n');
    const filename = sanitizeFilename(plan.overview?.name || 'plan') + '.yaml';

    return {
        format: 'yaml',
        content,
        filename,
        mimeType: 'text/yaml'
    };
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Export plan in the specified format.
 *
 * **Simple explanation**: One function that can export to any format -
 * just tell it which format you want.
 */
export function exportPlan(
    plan: Partial<CompletePlan>,
    format: ExportFormat,
    options: ExportOptions = {}
): ExportResult {
    switch (format) {
        case 'json':
            return exportToJSON(plan, options);
        case 'markdown':
            return exportToMarkdown(plan, options);
        case 'yaml':
            return exportToYAML(plan, options);
        default:
            throw new Error(`Unsupported export format: ${format}`);
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

function sanitizeFilename(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50) || 'plan';
}

function formatDate(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function escapeYAML(str: string): string {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

function findFeatureName(features: FeatureBlock[] | undefined, id: string): string {
    if (!features) return id;
    const feature = features.find(f => f.id === id);
    return feature?.name || id;
}

function getPriorityEmoji(priority: PriorityLevel): string {
    switch (priority) {
        case 'critical': return '🔴';
        case 'high': return '🟠';
        case 'medium': return '🟡';
        case 'low': return '🔵';
        default: return '⚪';
    }
}

function renderFeatureBlock(feature: FeatureBlock): string[] {
    const lines: string[] = [];
    lines.push(`### ${getPriorityEmoji(feature.priority)} ${feature.name}`);
    lines.push('');
    if (feature.description) {
        lines.push(feature.description);
        lines.push('');
    }
    if (feature.purpose) {
        lines.push(`**Purpose**: ${feature.purpose}`);
        lines.push('');
    }
    if (feature.acceptanceCriteria && feature.acceptanceCriteria.length > 0) {
        lines.push('**Acceptance Criteria**:');
        for (const ac of feature.acceptanceCriteria) {
            lines.push(`- [ ] ${ac}`);
        }
        lines.push('');
    }
    if (feature.technicalNotes) {
        lines.push('> **Technical Notes**: ' + feature.technicalNotes);
        lines.push('');
    }
    return lines;
}

function renderUserStory(story: UserStory): string[] {
    const lines: string[] = [];
    lines.push(`### ${getPriorityEmoji(story.priority)} User Story`);
    lines.push('');
    lines.push(`> As a **${story.userType}**, I want to **${story.action}** so that **${story.benefit}**.`);
    lines.push('');
    if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
        lines.push('**Acceptance Criteria**:');
        for (const ac of story.acceptanceCriteria) {
            lines.push(`- [ ] ${ac}`);
        }
        lines.push('');
    }
    return lines;
}

function renderDevStory(story: DeveloperStory): string[] {
    const lines: string[] = [];
    lines.push(`### 👨‍💻 ${story.action}`);
    lines.push('');
    lines.push(`**Benefit**: ${story.benefit}`);
    lines.push(`**Estimated Hours**: ${story.estimatedHours || 'TBD'}`);
    lines.push('');
    if (story.technicalRequirements && story.technicalRequirements.length > 0) {
        lines.push('**Technical Requirements**:');
        for (const req of story.technicalRequirements) {
            lines.push(`- ${req}`);
        }
        lines.push('');
    }
    if (story.apiNotes) {
        lines.push(`**API Notes**: ${story.apiNotes}`);
        lines.push('');
    }
    if (story.databaseNotes) {
        lines.push(`**Database Notes**: ${story.databaseNotes}`);
        lines.push('');
    }
    return lines;
}

function renderSuccessCriterion(criterion: SuccessCriterion): string[] {
    const lines: string[] = [];
    const smartChecks = [
        criterion.smartAttributes.specific ? '✅' : '❌',
        criterion.smartAttributes.measurable ? '✅' : '❌',
        criterion.smartAttributes.achievable ? '✅' : '❌',
        criterion.smartAttributes.relevant ? '✅' : '❌',
        criterion.smartAttributes.timeBound ? '✅' : '❌'
    ].join('');

    lines.push(`### ${getPriorityEmoji(criterion.priority)} ${criterion.description}`);
    lines.push('');
    lines.push(`**SMART**: [${smartChecks}] (S/M/A/R/T)`);
    lines.push(`**Testable**: ${criterion.testable ? 'Yes ✅' : 'No ❌'}`);
    lines.push('');
    return lines;
}

// ============================================================================
// Singleton Pattern
// ============================================================================

let exportServiceInstance: PlanExportService | null = null;

export class PlanExportService {
    export(plan: Partial<CompletePlan>, format: ExportFormat, options?: ExportOptions): ExportResult {
        return exportPlan(plan, format, options);
    }

    exportToJSON(plan: Partial<CompletePlan>, options?: ExportOptions): ExportResult {
        return exportToJSON(plan, options);
    }

    exportToMarkdown(plan: Partial<CompletePlan>, options?: ExportOptions): ExportResult {
        return exportToMarkdown(plan, options);
    }

    exportToYAML(plan: Partial<CompletePlan>, options?: ExportOptions): ExportResult {
        return exportToYAML(plan, options);
    }
}

export function getPlanExportService(): PlanExportService {
    if (!exportServiceInstance) {
        exportServiceInstance = new PlanExportService();
    }
    return exportServiceInstance;
}

export function resetPlanExportServiceForTests(): void {
    exportServiceInstance = null;
}
