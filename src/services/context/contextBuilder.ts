/**
 * @file context/contextBuilder.ts
 * @module ContextBuilder
 * @description Builds context from multiple sections (MT-017.4)
 * 
 * Assembles context from system prompts, conversation history,
 * task context, and file content into a coherent whole.
 * 
 * **Simple explanation**: The recipe assembler for AI conversations.
 * Takes all the ingredients (system prompt, history, code, etc.)
 * and combines them in the right order for the AI to understand.
 */

import { ContentPriority } from './priorityTruncation';
import { logInfo } from '../../logger';

// ============================================================================
// Types
// ============================================================================

export type SectionType = 'system' | 'history' | 'task' | 'file' | 'documentation' | 'custom';

export interface ContextSection {
    id: string;
    content: string;
    priority: ContentPriority;
    type: SectionType;
    metadata?: Record<string, unknown>;
}

export interface ContextBuilderConfig {
    separator: string;          // Text between sections
    sectionHeaders: boolean;    // Include section headers
}

// ============================================================================
// ContextBuilder Class
// ============================================================================

/**
 * Builds context from multiple sections.
 * 
 * **Simple explanation**: The document composer.
 * Takes different pieces of context (prompts, code, history)
 * and arranges them into a well-organized document for the AI.
 */
export class ContextBuilder {
    private config: ContextBuilderConfig;
    private sections: Map<string, ContextSection> = new Map();

    constructor(config: Partial<ContextBuilderConfig> = {}) {
        this.config = {
            separator: config.separator ?? '\n\n---\n\n',
            sectionHeaders: config.sectionHeaders ?? false
        };
    }

    /**
     * Add or update a section
     */
    setSection(section: ContextSection): void {
        this.sections.set(section.id, section);
    }

    /**
     * Get a section by ID
     */
    getSection(id: string): ContextSection | undefined {
        return this.sections.get(id);
    }

    /**
     * Remove a section by ID
     */
    removeSection(id: string): boolean {
        return this.sections.delete(id);
    }

    /**
     * Get all sections in order
     */
    getSections(): ContextSection[] {
        // Order: system first, then by type, then by priority
        const typeOrder: Record<SectionType, number> = {
            system: 0,
            task: 1,
            file: 2,
            history: 3,
            documentation: 4,
            custom: 5
        };

        const priorityOrder: Record<ContentPriority, number> = {
            critical: 0,
            high: 1,
            normal: 2,
            low: 3,
            optional: 4
        };

        return Array.from(this.sections.values()).sort((a, b) => {
            // Sort by type first
            const typeCompare = typeOrder[a.type] - typeOrder[b.type];
            if (typeCompare !== 0) return typeCompare;

            // Then by priority
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }

    /**
     * Get sections by type
     */
    getSectionsByType(type: SectionType): ContextSection[] {
        return Array.from(this.sections.values()).filter(s => s.type === type);
    }

    /**
     * Build the final context string
     */
    build(): string {
        const sections = this.getSections();

        if (this.config.sectionHeaders) {
            return sections.map(s =>
                `## ${this.formatHeader(s.type)}\n\n${s.content}`
            ).join(this.config.separator);
        }

        return sections.map(s => s.content).join(this.config.separator);
    }

    /**
     * Format section header
     */
    private formatHeader(type: SectionType): string {
        const headers: Record<SectionType, string> = {
            system: 'System Instructions',
            task: 'Current Task',
            file: 'Code Context',
            history: 'Conversation History',
            documentation: 'Reference Documentation',
            custom: 'Additional Context'
        };
        return headers[type];
    }

    /**
     * Get total number of sections
     */
    count(): number {
        return this.sections.size;
    }

    /**
     * Check if a section exists
     */
    has(id: string): boolean {
        return this.sections.has(id);
    }

    /**
     * Clear all sections
     */
    clear(): void {
        this.sections.clear();
    }

    /**
     * Clone the builder
     */
    clone(): ContextBuilder {
        const newBuilder = new ContextBuilder(this.config);
        for (const section of this.sections.values()) {
            newBuilder.setSection({ ...section });
        }
        return newBuilder;
    }

    /**
     * Merge another builder's sections
     */
    merge(other: ContextBuilder, overwrite = false): void {
        for (const section of other.getSections()) {
            if (overwrite || !this.has(section.id)) {
                this.setSection(section);
            }
        }
    }

    /**
     * Get content summary (for debugging)
     */
    getSummary(): string {
        const sections = this.getSections();
        const lines = [
            `Context Builder Summary:`,
            `  Sections: ${this.count()}`,
            ``
        ];

        for (const section of sections) {
            const preview = section.content.substring(0, 50).replace(/\n/g, ' ');
            lines.push(`  [${section.type}] ${section.id} (${section.priority}): "${preview}..."`);
        }

        return lines.join('\n');
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ContextBuilder instance
 */
export function createContextBuilder(config?: Partial<ContextBuilderConfig>): ContextBuilder {
    return new ContextBuilder(config);
}
