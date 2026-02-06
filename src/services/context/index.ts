/**
 * @file context/index.ts
 * @module ContextManager
 * @description Context management with token limits and priority truncation (MT-017)
 * 
 * Manages context windows for LLM calls, ensuring we stay within token limits
 * while preserving the most important information.
 * 
 * **Simple explanation**: Like packing a suitcase with a weight limit.
 * We can't fit everything, so we prioritize the essentials and leave out
 * less important items when space runs low.
 */

import { EventEmitter } from 'events';
import { logInfo, logWarn, logError } from '../../logger';

// Re-export submodules
export * from './tokenCounter';
export * from './priorityTruncation';
export * from './contextBuilder';

import { TokenCounter, createTokenCounter, estimateTokens } from './tokenCounter';
import { PriorityTruncator, createPriorityTruncator, ContentPriority } from './priorityTruncation';
import { ContextBuilder, createContextBuilder, ContextSection } from './contextBuilder';

// ============================================================================
// Types
// ============================================================================

export interface ContextConfig {
    maxTokens: number;               // Maximum context window size
    reservedTokens: number;          // Tokens reserved for response
    warningThreshold: number;        // Percentage to trigger warning (0-1)
    systemPromptPriority: ContentPriority;
    defaultPriority: ContentPriority;
}

export interface ContextStats {
    totalTokens: number;
    usedTokens: number;
    availableTokens: number;
    utilizationPercent: number;
    sectionCount: number;
    truncated: boolean;
}

// ============================================================================
// ContextManager Class
// ============================================================================

/**
 * Manages context windows for LLM calls with priority-based truncation.
 * 
 * **Simple explanation**: The packing expert for AI conversations.
 * Keeps track of how much "space" we have for context and intelligently
 * cuts less important content when we're running low.
 * 
 * @emits 'context-warning' - When approaching token limit
 * @emits 'context-truncated' - When content was removed to fit
 * @emits 'context-built' - When context is ready for LLM
 */
export class ContextManager extends EventEmitter {
    private config: ContextConfig;
    private tokenCounter: TokenCounter;
    private truncator: PriorityTruncator;
    private builder: ContextBuilder;

    constructor(config: Partial<ContextConfig> = {}) {
        super();
        this.config = {
            maxTokens: config.maxTokens ?? 8192,
            reservedTokens: config.reservedTokens ?? 2048,
            warningThreshold: config.warningThreshold ?? 0.8,
            systemPromptPriority: config.systemPromptPriority ?? 'critical',
            defaultPriority: config.defaultPriority ?? 'normal'
        };
        this.tokenCounter = createTokenCounter();
        this.truncator = createPriorityTruncator({
            maxTokens: this.effectiveLimit
        });
        this.builder = createContextBuilder();
    }

    /**
     * Get the effective token limit (max minus reserved)
     */
    get effectiveLimit(): number {
        return this.config.maxTokens - this.config.reservedTokens;
    }

    /**
     * Add a system prompt (highest priority, never truncated)
     */
    setSystemPrompt(content: string): void {
        this.builder.setSection({
            id: 'system',
            content,
            priority: 'critical',
            type: 'system'
        });
    }

    /**
     * Add conversation history
     */
    addConversationHistory(messages: Array<{ role: string; content: string }>): void {
        // Older messages have lower priority
        messages.forEach((msg, index) => {
            const isRecent = index >= messages.length - 5;
            this.builder.setSection({
                id: `history-${index}`,
                content: `${msg.role}: ${msg.content}`,
                priority: isRecent ? 'high' : 'low',
                type: 'history',
                metadata: { role: msg.role, index }
            });
        });
    }

    /**
     * Add task context (current task being worked on)
     */
    addTaskContext(taskId: string, taskContent: string): void {
        this.builder.setSection({
            id: `task-${taskId}`,
            content: taskContent,
            priority: 'high',
            type: 'task',
            metadata: { taskId }
        });
    }

    /**
     * Add file context (code files being referenced)
     */
    addFileContext(filePath: string, content: string, priority: ContentPriority = 'normal'): void {
        this.builder.setSection({
            id: `file-${filePath}`,
            content: `// File: ${filePath}\n${content}`,
            priority,
            type: 'file',
            metadata: { filePath }
        });
    }

    /**
     * Add documentation context
     */
    addDocumentation(docId: string, content: string, priority: ContentPriority = 'low'): void {
        this.builder.setSection({
            id: `doc-${docId}`,
            content,
            priority,
            type: 'documentation',
            metadata: { docId }
        });
    }

    /**
     * Add arbitrary context section
     */
    addSection(section: ContextSection): void {
        this.builder.setSection(section);
    }

    /**
     * Remove a section by ID
     */
    removeSection(sectionId: string): void {
        this.builder.removeSection(sectionId);
    }

    /**
     * Build the final context, truncating as needed
     */
    buildContext(): string {
        const rawSections = this.builder.getSections();

        // Count tokens for each section
        const sectionsWithTokens = rawSections.map(section => ({
            ...section,
            tokens: this.tokenCounter.count(section.content)
        }));

        const totalTokens = sectionsWithTokens.reduce((sum, s) => sum + s.tokens, 0);

        // Check if truncation needed
        if (totalTokens > this.effectiveLimit) {
            logWarn(`[ContextManager] Token limit exceeded (${totalTokens}/${this.effectiveLimit}), truncating...`);

            const truncated = this.truncator.truncate(sectionsWithTokens, this.effectiveLimit);
            this.emit('context-truncated', {
                before: totalTokens,
                after: truncated.reduce((sum, s) => sum + s.tokens, 0),
                removed: sectionsWithTokens.length - truncated.length
            });

            return truncated.map(s => s.content).join('\n\n');
        }

        // Check warning threshold
        const utilization = totalTokens / this.effectiveLimit;
        if (utilization >= this.config.warningThreshold) {
            this.emit('context-warning', {
                tokens: totalTokens,
                limit: this.effectiveLimit,
                utilization
            });
        }

        this.emit('context-built', { tokens: totalTokens });
        return rawSections.map(s => s.content).join('\n\n');
    }

    /**
     * Get current stats
     */
    getStats(): ContextStats {
        const sections = this.builder.getSections();
        const usedTokens = sections.reduce((sum, s) =>
            sum + this.tokenCounter.count(s.content), 0);

        return {
            totalTokens: this.effectiveLimit,
            usedTokens,
            availableTokens: Math.max(0, this.effectiveLimit - usedTokens),
            utilizationPercent: (usedTokens / this.effectiveLimit) * 100,
            sectionCount: sections.length,
            truncated: usedTokens > this.effectiveLimit
        };
    }

    /**
     * Clear all context
     */
    clear(): void {
        this.builder.clear();
        logInfo('[ContextManager] Context cleared');
    }

    /**
     * Estimate tokens for a string
     */
    estimateTokens(text: string): number {
        return this.tokenCounter.count(text);
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: ContextManager | null = null;

export function initializeContextManager(config?: Partial<ContextConfig>): ContextManager {
    if (instance) {
        throw new Error('ContextManager already initialized');
    }
    instance = new ContextManager(config);
    return instance;
}

export function getContextManagerInstance(): ContextManager {
    if (!instance) {
        throw new Error('ContextManager not initialized');
    }
    return instance;
}

export function resetContextManagerForTests(): void {
    instance = null;
}
