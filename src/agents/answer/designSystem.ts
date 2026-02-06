/**
 * Design System Lookup for Answer Team
 * 
 * **Simple explanation**: Looks up design tokens (colors, typography, spacing)
 * from the project's design system to answer UI-related questions accurately.
 * Like having a design reference book that knows the exact shade of blue to use.
 * 
 * @module agents/answer/designSystem
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../../logger';

/**
 * Design token types
 */
export type TokenType = 'color' | 'spacing' | 'typography' | 'shadow' | 'border' | 'animation' | 'breakpoint' | 'other';

/**
 * Design token definition
 */
export interface DesignToken {
    /** Token name/key */
    name: string;
    /** Token value */
    value: string;
    /** Token type */
    type: TokenType;
    /** Human-readable description */
    description?: string;
    /** Usage examples */
    examples?: string[];
    /** Aliases for this token */
    aliases?: string[];
    /** CSS variable name if applicable */
    cssVar?: string;
}

/**
 * Design system definition
 */
export interface DesignSystem {
    /** Design system name */
    name: string;
    /** Version */
    version?: string;
    /** All tokens */
    tokens: Map<string, DesignToken>;
    /** Loaded from path */
    sourcePath?: string;
}

/**
 * Design token lookup result
 */
export interface TokenLookupResult {
    /** Whether token was found */
    found: boolean;
    /** Matched token */
    token?: DesignToken;
    /** Related tokens */
    related?: DesignToken[];
    /** Formatted answer */
    answer: string;
}

/**
 * Design System Lookup Service
 * 
 * **Simple explanation**: Loads design systems from various formats
 * (CSS variables, JSON, Tailwind config) and provides lookup functionality.
 */
export class DesignSystemLookup {
    private systems: Map<string, DesignSystem> = new Map();
    private loaded: boolean = false;

    /**
     * Initialize and load design systems
     */
    public async initialize(): Promise<void> {
        if (this.loaded) {
            return;
        }

        await this.discoverAndLoad();
        this.loaded = true;
    }

    /**
     * Discover and load design system files
     */
    private async discoverAndLoad(): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            logWarn('[DesignSystem] No workspace folder found');
            return;
        }

        // Try to find common design system file patterns
        const patterns = [
            'design-tokens.json',
            'tokens.json',
            'design-system/*.json',
            'styles/tokens.json',
            'src/styles/tokens.json',
            'src/design-system/**/*.json',
            'tailwind.config.js',
            'tailwind.config.ts',
            ':root', // CSS variables indicator
        ];

        // Check for JSON token files
        const tokenFiles = await vscode.workspace.findFiles(
            '**/design-tokens.json',
            '**/node_modules/**'
        );

        for (const file of tokenFiles) {
            await this.loadJsonTokens(file.fsPath);
        }

        // Check for style.css with :root variables
        const cssFiles = await vscode.workspace.findFiles(
            '**/styles.css',
            '**/node_modules/**'
        );

        for (const file of cssFiles) {
            await this.loadCssVariables(file.fsPath);
        }

        // Check for Tailwind config
        const tailwindConfigs = await vscode.workspace.findFiles(
            '**/tailwind.config.{js,ts}',
            '**/node_modules/**'
        );

        for (const file of tailwindConfigs) {
            await this.loadTailwindConfig(file.fsPath);
        }

        logInfo(`[DesignSystem] Loaded ${this.systems.size} design system(s)`);
    }

    /**
     * Load tokens from a JSON file
     */
    private async loadJsonTokens(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);

            const system: DesignSystem = {
                name: path.basename(filePath, '.json'),
                tokens: new Map(),
                sourcePath: filePath
            };

            this.parseJsonTokens(data, system.tokens, '');
            this.systems.set(system.name, system);

            logInfo(`[DesignSystem] Loaded ${system.tokens.size} tokens from ${filePath}`);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[DesignSystem] Failed to load ${filePath}: ${msg}`);
        }
    }

    /**
     * Recursively parse JSON token structure
     */
    private parseJsonTokens(
        obj: Record<string, unknown>,
        tokens: Map<string, DesignToken>,
        prefix: string
    ): void {
        for (const [key, value] of Object.entries(obj)) {
            const fullName = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'object' && value !== null) {
                // Check if this is a token (has $value or value property)
                const tokenObj = value as Record<string, unknown>;
                if ('$value' in tokenObj || 'value' in tokenObj) {
                    const tokenValue = (tokenObj.$value || tokenObj.value) as string;
                    const token: DesignToken = {
                        name: fullName,
                        value: tokenValue,
                        type: this.inferTokenType(key, tokenValue),
                        description: tokenObj.description as string | undefined,
                        cssVar: `--${fullName.replace(/\./g, '-')}`
                    };
                    tokens.set(fullName, token);
                    // Also add by short name
                    tokens.set(key, token);
                } else {
                    // Recurse into nested object
                    this.parseJsonTokens(tokenObj as Record<string, unknown>, tokens, fullName);
                }
            } else if (typeof value === 'string') {
                // Simple key-value token
                const token: DesignToken = {
                    name: fullName,
                    value: value,
                    type: this.inferTokenType(key, value),
                    cssVar: `--${fullName.replace(/\./g, '-')}`
                };
                tokens.set(fullName, token);
                tokens.set(key, token);
            }
        }
    }

    /**
     * Load CSS variables from a stylesheet
     */
    private async loadCssVariables(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');

            // Match :root { ... } block
            const rootMatch = content.match(/:root\s*\{([^}]+)\}/);
            if (!rootMatch) {
                return;
            }

            const system: DesignSystem = {
                name: `css-${path.basename(filePath, '.css')}`,
                tokens: new Map(),
                sourcePath: filePath
            };

            // Parse CSS variables
            const varRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
            let match;
            while ((match = varRegex.exec(rootMatch[1])) !== null) {
                const [, name, value] = match;
                const token: DesignToken = {
                    name: name,
                    value: value.trim(),
                    type: this.inferTokenType(name, value),
                    cssVar: `--${name}`
                };
                system.tokens.set(name, token);
            }

            if (system.tokens.size > 0) {
                this.systems.set(system.name, system);
                logInfo(`[DesignSystem] Loaded ${system.tokens.size} CSS variables from ${filePath}`);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[DesignSystem] Failed to load CSS from ${filePath}: ${msg}`);
        }
    }

    /**
     * Load Tailwind config (basic extraction)
     */
    private async loadTailwindConfig(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');

            const system: DesignSystem = {
                name: 'tailwind',
                tokens: new Map(),
                sourcePath: filePath
            };

            // Extract colors from theme.extend.colors
            const colorsMatch = content.match(/colors\s*:\s*\{([^}]+)\}/);
            if (colorsMatch) {
                // Simple extraction - won't catch nested objects perfectly
                const colorRegex = /['"]?([\w-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
                let match;
                while ((match = colorRegex.exec(colorsMatch[1])) !== null) {
                    const [, name, value] = match;
                    const token: DesignToken = {
                        name: `color.${name}`,
                        value,
                        type: 'color',
                        description: `Tailwind color: ${name}`
                    };
                    system.tokens.set(`color.${name}`, token);
                    system.tokens.set(name, token);
                }
            }

            if (system.tokens.size > 0) {
                this.systems.set(system.name, system);
                logInfo(`[DesignSystem] Loaded ${system.tokens.size} Tailwind tokens from ${filePath}`);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logError(`[DesignSystem] Failed to load Tailwind config: ${msg}`);
        }
    }

    /**
     * Infer token type from name and value
     */
    private inferTokenType(name: string, value: string): TokenType {
        const nameLower = name.toLowerCase();
        const valueLower = value.toLowerCase();

        if (nameLower.includes('color') || nameLower.includes('bg') ||
            valueLower.startsWith('#') || valueLower.startsWith('rgb') ||
            valueLower.startsWith('hsl')) {
            return 'color';
        }
        if (nameLower.includes('space') || nameLower.includes('padding') ||
            nameLower.includes('margin') || nameLower.includes('gap') ||
            /^\d+(\.\d+)?(px|rem|em)$/.test(value)) {
            return 'spacing';
        }
        if (nameLower.includes('font') || nameLower.includes('text') ||
            nameLower.includes('line-height') || nameLower.includes('letter')) {
            return 'typography';
        }
        if (nameLower.includes('shadow') || nameLower.includes('elevation')) {
            return 'shadow';
        }
        if (nameLower.includes('border') || nameLower.includes('radius')) {
            return 'border';
        }
        if (nameLower.includes('animation') || nameLower.includes('duration') ||
            nameLower.includes('transition')) {
            return 'animation';
        }
        if (nameLower.includes('break') || nameLower.includes('screen')) {
            return 'breakpoint';
        }

        return 'other';
    }

    /**
     * Look up a design token by name or description
     */
    public lookup(query: string): TokenLookupResult {
        const queryLower = query.toLowerCase();
        let bestMatch: DesignToken | undefined;
        const related: DesignToken[] = [];

        for (const system of this.systems.values()) {
            for (const token of system.tokens.values()) {
                const nameLower = token.name.toLowerCase();

                // Exact match
                if (nameLower === queryLower) {
                    bestMatch = token;
                }
                // Partial match
                else if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
                    if (!bestMatch) {
                        bestMatch = token;
                    } else {
                        related.push(token);
                    }
                }
                // Check aliases
                else if (token.aliases?.some(a => a.toLowerCase() === queryLower)) {
                    bestMatch = token;
                }
            }
        }

        if (bestMatch) {
            return {
                found: true,
                token: bestMatch,
                related: related.slice(0, 5), // Limit related results
                answer: this.formatAnswer(bestMatch, related)
            };
        }

        return {
            found: false,
            answer: `No design token found for "${query}". Try searching for common names like "primary", "background", "spacing", etc.`
        };
    }

    /**
     * Format a human-readable answer
     */
    private formatAnswer(token: DesignToken, related: DesignToken[]): string {
        let answer = `**${token.name}**: \`${token.value}\``;

        if (token.cssVar) {
            answer += `\n- CSS Variable: \`var(${token.cssVar})\``;
        }
        if (token.description) {
            answer += `\n- Description: ${token.description}`;
        }
        if (token.type) {
            answer += `\n- Type: ${token.type}`;
        }

        if (related.length > 0) {
            answer += '\n\n**Related tokens:**\n';
            for (const r of related) {
                answer += `- ${r.name}: \`${r.value}\`\n`;
            }
        }

        return answer;
    }

    /**
     * Get all tokens of a specific type
     */
    public getTokensByType(type: TokenType): DesignToken[] {
        const results: DesignToken[] = [];

        for (const system of this.systems.values()) {
            for (const token of system.tokens.values()) {
                if (token.type === type) {
                    results.push(token);
                }
            }
        }

        return results;
    }

    /**
     * Get all loaded design systems
     */
    public getSystems(): DesignSystem[] {
        return Array.from(this.systems.values());
    }

    /**
     * Check if any design system is loaded
     */
    public hasDesignSystem(): boolean {
        return this.systems.size > 0;
    }

    /**
     * Clear loaded systems (for testing/reload)
     */
    public clear(): void {
        this.systems.clear();
        this.loaded = false;
    }
}

// Singleton instance
let lookupInstance: DesignSystemLookup | null = null;

/**
 * Get the singleton DesignSystemLookup instance
 */
export function getDesignSystemLookup(): DesignSystemLookup {
    if (!lookupInstance) {
        lookupInstance = new DesignSystemLookup();
    }
    return lookupInstance;
}

/**
 * Initialize the design system lookup
 */
export async function initializeDesignSystem(): Promise<void> {
    const lookup = getDesignSystemLookup();
    await lookup.initialize();
}

/**
 * Reset for testing
 */
export function resetDesignSystemLookupForTests(): void {
    if (lookupInstance) {
        lookupInstance.clear();
    }
    lookupInstance = null;
}
