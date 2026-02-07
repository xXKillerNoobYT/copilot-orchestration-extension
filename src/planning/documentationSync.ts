/**
 * Documentation Sync (MT-033.41-45)
 *
 * **Simple explanation**: Keeps your plan synchronized with project documentation.
 * Generates documentation from the plan and detects when docs are out of date.
 *
 * @module planning/documentationSync
 */

import { CompletePlan, FeatureBlock, UserStory, DeveloperStory, SuccessCriterion } from './types';

// ============================================================================
// Types
// ============================================================================

export interface DocumentationConfig {
    /** Output format */
    format: 'markdown' | 'html' | 'json';
    /** Include table of contents */
    includeToc: boolean;
    /** Include feature details */
    includeFeatureDetails: boolean;
    /** Include user stories */
    includeUserStories: boolean;
    /** Include developer stories */
    includeDeveloperStories: boolean;
    /** Include success criteria */
    includeSuccessCriteria: boolean;
    /** Include dependency graph */
    includeDependencyGraph: boolean;
    /** Include timeline estimates */
    includeTimeline: boolean;
    /** Custom header content */
    headerContent?: string;
    /** Custom footer content */
    footerContent?: string;
}

export interface GeneratedDoc {
    /** Document name */
    name: string;
    /** File path (relative) */
    path: string;
    /** Document content */
    content: string;
    /** Format */
    format: 'markdown' | 'html' | 'json';
    /** When generated */
    generatedAt: string;
}

export interface SyncStatus {
    /** Whether docs are in sync */
    inSync: boolean;
    /** Last sync time */
    lastSync?: string;
    /** Documents that need updating */
    outdatedDocs: string[];
    /** Missing documents */
    missingDocs: string[];
    /** Sync warnings */
    warnings: string[];
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_DOC_CONFIG: DocumentationConfig = {
    format: 'markdown',
    includeToc: true,
    includeFeatureDetails: true,
    includeUserStories: true,
    includeDeveloperStories: true,
    includeSuccessCriteria: true,
    includeDependencyGraph: true,
    includeTimeline: true,
};

// ============================================================================
// Documentation Generation
// ============================================================================

/**
 * Generate all documentation from a plan.
 *
 * **Simple explanation**: Creates documentation files based on your plan,
 * so you don't have to write them manually.
 */
export function generateDocumentation(
    plan: CompletePlan,
    config: DocumentationConfig = DEFAULT_DOC_CONFIG
): GeneratedDoc[] {
    const docs: GeneratedDoc[] = [];
    const timestamp = new Date().toISOString();

    // Main plan document
    docs.push({
        name: 'Plan Overview',
        path: 'docs/PLAN.md',
        content: generatePlanOverview(plan, config),
        format: 'markdown',
        generatedAt: timestamp,
    });

    // Features document
    if (config.includeFeatureDetails && plan.featureBlocks.length > 0) {
        docs.push({
            name: 'Feature Specifications',
            path: 'docs/FEATURES.md',
            content: generateFeaturesDoc(plan, config),
            format: 'markdown',
            generatedAt: timestamp,
        });
    }

    // User stories document
    if (config.includeUserStories && plan.userStories.length > 0) {
        docs.push({
            name: 'User Stories',
            path: 'docs/USER_STORIES.md',
            content: generateUserStoriesDoc(plan, config),
            format: 'markdown',
            generatedAt: timestamp,
        });
    }

    // Developer stories document
    if (config.includeDeveloperStories && plan.developerStories.length > 0) {
        docs.push({
            name: 'Developer Stories',
            path: 'docs/DEVELOPER_STORIES.md',
            content: generateDeveloperStoriesDoc(plan, config),
            format: 'markdown',
            generatedAt: timestamp,
        });
    }

    // Success criteria document
    if (config.includeSuccessCriteria && plan.successCriteria.length > 0) {
        docs.push({
            name: 'Success Criteria',
            path: 'docs/SUCCESS_CRITERIA.md',
            content: generateSuccessCriteriaDoc(plan, config),
            format: 'markdown',
            generatedAt: timestamp,
        });
    }

    // Architecture document
    docs.push({
        name: 'Architecture',
        path: 'docs/ARCHITECTURE.md',
        content: generateArchitectureDoc(plan, config),
        format: 'markdown',
        generatedAt: timestamp,
    });

    // README update suggestion
    docs.push({
        name: 'README Template',
        path: 'README_TEMPLATE.md',
        content: generateReadmeTemplate(plan, config),
        format: 'markdown',
        generatedAt: timestamp,
    });

    // JSON export
    docs.push({
        name: 'Plan JSON',
        path: 'docs/plan.json',
        content: JSON.stringify(plan, null, 2),
        format: 'json',
        generatedAt: timestamp,
    });

    return docs;
}

// ============================================================================
// Document Generators
// ============================================================================

function generatePlanOverview(plan: CompletePlan, config: DocumentationConfig): string {
    const sections: string[] = [];

    // Header
    sections.push(`# ${plan.overview.name}`);
    sections.push('');
    if (config.headerContent) {
        sections.push(config.headerContent);
        sections.push('');
    }

    // Description
    sections.push('## Overview');
    sections.push('');
    sections.push(plan.overview.description || '*No description provided*');
    sections.push('');

    // Table of Contents
    if (config.includeToc) {
        sections.push('## Table of Contents');
        sections.push('');
        sections.push('- [Overview](#overview)');
        sections.push('- [Goals](#goals)');
        sections.push('- [Features](#features)');
        if (config.includeTimeline) sections.push('- [Timeline](#timeline)');
        if (config.includeDependencyGraph) sections.push('- [Dependencies](#dependencies)');
        sections.push('');
    }

    // Goals
    sections.push('## Goals');
    sections.push('');
    if (plan.overview.goals.length > 0) {
        plan.overview.goals.forEach((goal, i) => {
            sections.push(`${i + 1}. ${goal}`);
        });
    } else {
        sections.push('*No goals defined*');
    }
    sections.push('');

    // Features summary
    sections.push('## Features');
    sections.push('');
    sections.push('| Priority | Feature | Description | Criteria |');
    sections.push('|----------|---------|-------------|----------|');
    for (const feature of plan.featureBlocks.sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority))) {
        const desc = (feature.description || '').slice(0, 50) + (feature.description && feature.description.length > 50 ? '...' : '');
        sections.push(`| ${priorityBadge(feature.priority)} | **${feature.name}** | ${desc} | ${feature.acceptanceCriteria.length} |`);
    }
    sections.push('');

    // Timeline estimates
    if (config.includeTimeline) {
        sections.push('## Timeline');
        sections.push('');
        const estimates = calculateTimelineEstimates(plan);
        sections.push(`- **Total Features**: ${plan.featureBlocks.length}`);
        sections.push(`- **Estimated Total Hours**: ${estimates.totalHours}`);
        sections.push(`- **Estimated Duration**: ${estimates.estimatedWeeks} weeks`);
        sections.push('');
        sections.push('### By Priority');
        sections.push('');
        sections.push(`- 🔴 Critical: ${estimates.byPriority.critical.count} features (${estimates.byPriority.critical.hours}h)`);
        sections.push(`- 🟠 High: ${estimates.byPriority.high.count} features (${estimates.byPriority.high.hours}h)`);
        sections.push(`- 🔵 Medium: ${estimates.byPriority.medium.count} features (${estimates.byPriority.medium.hours}h)`);
        sections.push(`- ⚪ Low: ${estimates.byPriority.low.count} features (${estimates.byPriority.low.hours}h)`);
        sections.push('');
    }

    // Dependencies overview
    if (config.includeDependencyGraph && plan.blockLinks.length > 0) {
        sections.push('## Dependencies');
        sections.push('');
        sections.push('```mermaid');
        sections.push('graph LR');
        const featureMap = new Map(plan.featureBlocks.map(f => [f.id, f.name]));
        for (const link of plan.blockLinks) {
            const source = featureMap.get(link.sourceBlockId) || link.sourceBlockId;
            const target = featureMap.get(link.targetBlockId) || link.targetBlockId;
            const arrow = link.dependencyType === 'requires' ? '-->' :
                link.dependencyType === 'blocks' ? '-.->' : '-.->';
            sections.push(`    ${sanitizeMermaidId(source)}[${source}] ${arrow} ${sanitizeMermaidId(target)}[${target}]`);
        }
        sections.push('```');
        sections.push('');
    }

    // Footer
    if (config.footerContent) {
        sections.push('---');
        sections.push(config.footerContent);
        sections.push('');
    }

    sections.push('---');
    sections.push(`*Generated from plan on ${new Date().toLocaleDateString()}*`);

    return sections.join('\n');
}

function generateFeaturesDoc(plan: CompletePlan, config: DocumentationConfig): string {
    const sections: string[] = [];

    sections.push('# Feature Specifications');
    sections.push('');
    sections.push(`> ${plan.overview.name}`);
    sections.push('');

    // Group by priority
    const byPriority = {
        critical: plan.featureBlocks.filter(f => f.priority === 'critical'),
        high: plan.featureBlocks.filter(f => f.priority === 'high'),
        medium: plan.featureBlocks.filter(f => f.priority === 'medium'),
        low: plan.featureBlocks.filter(f => f.priority === 'low'),
    };

    for (const [priority, features] of Object.entries(byPriority)) {
        if (features.length === 0) continue;

        sections.push(`## ${priorityBadge(priority as 'critical' | 'high' | 'medium' | 'low')} ${priority.charAt(0).toUpperCase() + priority.slice(1)} Priority`);
        sections.push('');

        for (const feature of features) {
            sections.push(`### ${feature.name}`);
            sections.push('');
            sections.push(`**ID**: \`${feature.id}\``);
            sections.push('');
            sections.push('**Description**:');
            sections.push('');
            sections.push(feature.description || '*No description provided*');
            sections.push('');
            sections.push('**Acceptance Criteria**:');
            sections.push('');
            if (feature.acceptanceCriteria.length > 0) {
                feature.acceptanceCriteria.forEach((criterion, i) => {
                    sections.push(`- [ ] ${criterion}`);
                });
            } else {
                sections.push('*No acceptance criteria defined*');
            }
            sections.push('');

            // Dependencies
            const deps = plan.blockLinks.filter(l => l.sourceBlockId === feature.id);
            if (deps.length > 0) {
                sections.push('**Dependencies**:');
                sections.push('');
                for (const dep of deps) {
                    const target = plan.featureBlocks.find(f => f.id === dep.targetBlockId);
                    sections.push(`- ${dep.dependencyType}: ${target?.name || dep.targetBlockId}`);
                }
                sections.push('');
            }

            // Related stories
            const relatedStories = plan.developerStories.filter(s => s.relatedBlockIds.includes(feature.id));
            if (relatedStories.length > 0) {
                sections.push('**Related Developer Stories**:');
                sections.push('');
                relatedStories.forEach(story => {
                    sections.push(`- ${story.action} - ${story.benefit}`);
                });
                sections.push('');
            }

            sections.push('---');
            sections.push('');
        }
    }

    return sections.join('\n');
}

function generateUserStoriesDoc(plan: CompletePlan, config: DocumentationConfig): string {
    const sections: string[] = [];

    sections.push('# User Stories');
    sections.push('');
    sections.push(`> ${plan.overview.name}`);
    sections.push('');

    // Group by userType
    const byUserType = new Map<string, UserStory[]>();
    for (const story of plan.userStories) {
        const stories = byUserType.get(story.userType) || [];
        stories.push(story);
        byUserType.set(story.userType, stories);
    }

    for (const [userType, stories] of byUserType) {
        sections.push(`## As a ${userType}`);
        sections.push('');

        for (const story of stories) {
            sections.push(`### ${story.action}`);
            sections.push('');
            sections.push(`**Benefit**: ${story.benefit}`);
            sections.push('');
            sections.push('**Acceptance Criteria**:');
            sections.push('');
            if (story.acceptanceCriteria.length > 0) {
                story.acceptanceCriteria.forEach(criterion => {
                    sections.push(`- [ ] ${criterion}`);
                });
            } else {
                sections.push('*No acceptance criteria defined*');
            }
            sections.push('');
        }
    }

    return sections.join('\n');
}

function generateDeveloperStoriesDoc(plan: CompletePlan, config: DocumentationConfig): string {
    const sections: string[] = [];

    sections.push('# Developer Stories');
    sections.push('');
    sections.push(`> ${plan.overview.name}`);
    sections.push('');

    // Group by feature
    const byFeature = new Map<string, DeveloperStory[]>();
    for (const story of plan.developerStories) {
        const featureId = story.relatedBlockIds[0] || 'unassigned';
        const stories = byFeature.get(featureId) || [];
        stories.push(story);
        byFeature.set(featureId, stories);
    }

    for (const [featureId, stories] of byFeature) {
        const feature = plan.featureBlocks.find(f => f.id === featureId);
        sections.push(`## ${feature?.name || featureId}`);
        sections.push('');

        for (const story of stories) {
            sections.push(`### ${story.action}`);
            sections.push('');
            sections.push(`**Benefit**: ${story.benefit}`);
            sections.push('');
            sections.push('**Technical Requirements**:');
            sections.push('');
            if (story.technicalRequirements.length > 0) {
                story.technicalRequirements.forEach(requirement => {
                    sections.push(`- [ ] ${requirement}`);
                });
            } else {
                sections.push('*No technical requirements defined*');
            }
            if (story.apiNotes) {
                sections.push('');
                sections.push(`**API Notes**: ${story.apiNotes}`);
            }
            if (story.databaseNotes) {
                sections.push(`**Database Notes**: ${story.databaseNotes}`);
            }
            sections.push('');
        }
    }

    return sections.join('\n');
}

function generateSuccessCriteriaDoc(plan: CompletePlan, config: DocumentationConfig): string {
    const sections: string[] = [];

    sections.push('# Success Criteria');
    sections.push('');
    sections.push(`> ${plan.overview.name}`);
    sections.push('');
    sections.push('These criteria define what success looks like for this project.');
    sections.push('');

    // Group by priority
    const byPriority = new Map<string, SuccessCriterion[]>();
    for (const criterion of plan.successCriteria) {
        const criteria = byPriority.get(criterion.priority) || [];
        criteria.push(criterion);
        byPriority.set(criterion.priority, criteria);
    }

    const priorityOrder = ['critical', 'high', 'medium', 'low'];
    for (const priority of priorityOrder) {
        const criteria = byPriority.get(priority);
        if (!criteria || criteria.length === 0) continue;

        sections.push(`## ${priority.charAt(0).toUpperCase() + priority.slice(1)} Priority`);
        sections.push('');

        for (const criterion of criteria) {
            sections.push(`### ${criterion.description}`);
            sections.push('');
            sections.push(`- **Testable**: ${criterion.testable ? 'Yes' : 'No'}`);
            const smartScore = Object.values(criterion.smartAttributes).filter(Boolean).length;
            sections.push(`- **SMART Score**: ${smartScore}/5`);
            sections.push('');
        }
    }

    return sections.join('\n');
}

function generateArchitectureDoc(plan: CompletePlan, config: DocumentationConfig): string {
    const sections: string[] = [];

    sections.push('# Architecture');
    sections.push('');
    sections.push(`> ${plan.overview.name}`);
    sections.push('');

    sections.push('## System Overview');
    sections.push('');
    sections.push(plan.overview.description || '*No description provided*');
    sections.push('');

    sections.push('## Components');
    sections.push('');
    sections.push('The system consists of the following major components:');
    sections.push('');
    for (const feature of plan.featureBlocks.filter(f => f.priority === 'critical' || f.priority === 'high')) {
        sections.push(`- **${feature.name}**: ${feature.description?.split('.')[0] || 'No description'}`);
    }
    sections.push('');

    if (plan.blockLinks.length > 0) {
        sections.push('## Component Dependencies');
        sections.push('');
        sections.push('```mermaid');
        sections.push('graph TD');
        const featureMap = new Map(plan.featureBlocks.map(f => [f.id, f.name]));
        for (const link of plan.blockLinks) {
            const source = featureMap.get(link.sourceBlockId) || link.sourceBlockId;
            const target = featureMap.get(link.targetBlockId) || link.targetBlockId;
            sections.push(`    ${sanitizeMermaidId(source)} --> ${sanitizeMermaidId(target)}`);
        }
        sections.push('```');
        sections.push('');
    }

    sections.push('## Technical Decisions');
    sections.push('');
    sections.push('*Document key technical decisions here*');
    sections.push('');

    return sections.join('\n');
}

function generateReadmeTemplate(plan: CompletePlan, config: DocumentationConfig): string {
    const sections: string[] = [];

    sections.push(`# ${plan.overview.name}`);
    sections.push('');
    sections.push(plan.overview.description || '*Add project description*');
    sections.push('');

    sections.push('## Features');
    sections.push('');
    for (const feature of plan.featureBlocks.slice(0, 5)) {
        sections.push(`- **${feature.name}**: ${feature.description?.split('.')[0] || 'No description'}`);
    }
    if (plan.featureBlocks.length > 5) {
        sections.push(`- *...and ${plan.featureBlocks.length - 5} more*`);
    }
    sections.push('');

    sections.push('## Getting Started');
    sections.push('');
    sections.push('### Prerequisites');
    sections.push('');
    sections.push('- Node.js >= 18');
    sections.push('- npm or yarn');
    sections.push('');

    sections.push('### Installation');
    sections.push('');
    sections.push('```bash');
    sections.push('npm install');
    sections.push('```');
    sections.push('');

    sections.push('### Usage');
    sections.push('');
    sections.push('```bash');
    sections.push('npm start');
    sections.push('```');
    sections.push('');

    sections.push('## Documentation');
    sections.push('');
    sections.push('- [Plan Overview](docs/PLAN.md)');
    sections.push('- [Feature Specifications](docs/FEATURES.md)');
    sections.push('- [Architecture](docs/ARCHITECTURE.md)');
    sections.push('');

    sections.push('## License');
    sections.push('');
    sections.push('MIT');
    sections.push('');

    return sections.join('\n');
}

// ============================================================================
// Sync Status
// ============================================================================

/**
 * Check documentation sync status.
 */
export function checkDocumentationSync(
    plan: CompletePlan,
    existingDocs: Map<string, { lastModified: string; content: string }>
): SyncStatus {
    const expectedDocs = generateDocumentation(plan);
    const outdatedDocs: string[] = [];
    const missingDocs: string[] = [];
    const warnings: string[] = [];

    for (const doc of expectedDocs) {
        const existing = existingDocs.get(doc.path);

        if (!existing) {
            missingDocs.push(doc.path);
        } else {
            // Simple content comparison (in real implementation, would be smarter)
            if (existing.content !== doc.content) {
                outdatedDocs.push(doc.path);
            }
        }
    }

    // Check for extra docs not in plan
    for (const [path] of existingDocs) {
        if (!expectedDocs.some(d => d.path === path)) {
            warnings.push(`Document "${path}" exists but is not generated from plan`);
        }
    }

    return {
        inSync: outdatedDocs.length === 0 && missingDocs.length === 0,
        outdatedDocs,
        missingDocs,
        warnings,
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

function priorityOrder(priority: string): number {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[priority] ?? 4;
}

function priorityBadge(priority: 'critical' | 'high' | 'medium' | 'low'): string {
    const badges: Record<string, string> = {
        critical: '🔴',
        high: '🟠',
        medium: '🔵',
        low: '⚪',
    };
    return badges[priority] || '⚪';
}

function sanitizeMermaidId(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
}

interface TimelineEstimates {
    totalHours: number;
    estimatedWeeks: number;
    byPriority: {
        critical: { count: number; hours: number };
        high: { count: number; hours: number };
        medium: { count: number; hours: number };
        low: { count: number; hours: number };
    };
}

function calculateTimelineEstimates(plan: CompletePlan): TimelineEstimates {
    const hoursPerCriterion = 2;
    const baseHours = 4;

    const byPriority = {
        critical: { count: 0, hours: 0 },
        high: { count: 0, hours: 0 },
        medium: { count: 0, hours: 0 },
        low: { count: 0, hours: 0 },
    };

    let totalHours = 0;

    for (const feature of plan.featureBlocks) {
        const priorityMultiplier = feature.priority === 'critical' ? 1.5 :
            feature.priority === 'high' ? 1.25 : 1;
        const hours = Math.ceil((baseHours + feature.acceptanceCriteria.length * hoursPerCriterion) * priorityMultiplier);

        totalHours += hours;
        byPriority[feature.priority].count++;
        byPriority[feature.priority].hours += hours;
    }

    // Assuming 40 hour weeks
    const estimatedWeeks = Math.ceil(totalHours / 40);

    return { totalHours, estimatedWeeks, byPriority };
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Render documentation sync status.
 */
export function renderSyncStatus(status: SyncStatus): string {
    return `
    <div class="sync-status ${status.inSync ? 'in-sync' : 'out-of-sync'}">
      <div class="sync-header">
        <span class="sync-icon">${status.inSync ? '✓' : '⚠️'}</span>
        <span class="sync-label">${status.inSync ? 'Documentation In Sync' : 'Documentation Out of Sync'}</span>
      </div>
      
      ${status.missingDocs.length > 0 ? `
        <div class="sync-section">
          <h4>Missing Documents</h4>
          <ul>
            ${status.missingDocs.map(doc => `<li>${doc}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${status.outdatedDocs.length > 0 ? `
        <div class="sync-section">
          <h4>Outdated Documents</h4>
          <ul>
            ${status.outdatedDocs.map(doc => `<li>${doc}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${status.warnings.length > 0 ? `
        <div class="sync-section warnings">
          <h4>Warnings</h4>
          <ul>
            ${status.warnings.map(w => `<li>${w}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${!status.inSync ? `
        <button class="btn-primary" onclick="regenerateDocumentation()">
          🔄 Regenerate Documentation
        </button>
      ` : ''}
    </div>
  `;
}
