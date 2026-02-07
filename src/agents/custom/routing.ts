/**
 * Custom Agent Routing Module - Routes tasks to appropriate custom agents.
 *
 * **Simple explanation**: This is the "traffic controller" that decides which
 * custom agent should handle a task. It matches based on keywords, patterns,
 * tags, and ticket types, then picks the best candidate.
 *
 * @see CUSTOM-AGENT-TEMPLATE.md for routing configuration documentation
 */

import { logInfo, logWarn } from '../../logger';
import {
    CustomAgent,
    RoutingRule,
    type AgentPriorityType
} from './schema';
import {
    listCustomAgents,
    loadCustomAgent,
    getWorkspaceFolder
} from './storage';
import { isAgentActive } from './executor';

// ============================================================================
// Section 1: Type Definitions
// ============================================================================

/**
 * Task context for routing decisions.
 *
 * **Simple explanation**: Information about a task that helps decide
 * which agent should handle it.
 */
export interface TaskContext {
    /** The task query/description */
    query: string;
    /** Optional ticket ID if this task is from a ticket */
    ticketId?: string;
    /** Optional ticket type (ai_to_human, human_to_ai, internal) */
    ticketType?: 'ai_to_human' | 'human_to_ai' | 'internal';
    /** Optional tags associated with the task/ticket */
    tags?: string[];
    /** Optional explicit agent name (manual override) */
    agentOverride?: string;
}

/**
 * Result of matching an agent against a task.
 *
 * **Simple explanation**: Shows how well an agent matches a task,
 * including which rules matched and the final score.
 */
export interface RoutingMatch {
    /** The matching agent */
    agent: CustomAgent;
    /** Base priority score (from agent priority level) */
    basePriority: number;
    /** Priority boost from routing rules */
    priorityBoost: number;
    /** Final combined score (higher = better) */
    score: number;
    /** Which keywords matched */
    matchedKeywords: string[];
    /** Which patterns matched */
    matchedPatterns: string[];
    /** Which tags matched */
    matchedTags: string[];
    /** Whether ticket type matched */
    ticketTypeMatched: boolean;
    /** Whether this was a manual override */
    isOverride: boolean;
}

/**
 * Result of routing a task to agents.
 *
 * **Simple explanation**: The final decision about which agent(s) can
 * handle a task, sorted from best to worst match.
 */
export interface RoutingResult {
    /** Whether any matching agents were found */
    success: boolean;
    /** Best matching agent (if any) */
    bestMatch?: RoutingMatch;
    /** All matching agents, sorted by score */
    candidates: RoutingMatch[];
    /** Error message if routing failed */
    error?: string;
    /** Whether the result was from a manual override */
    wasOverride: boolean;
}

/**
 * Options for routing behavior.
 */
export interface RoutingOptions {
    /** Minimum score required to be considered a match (default: 0) */
    minScore?: number;
    /** Maximum number of candidates to return (default: all) */
    maxCandidates?: number;
    /** Whether to include inactive agents (default: false) */
    includeInactive?: boolean;
    /** Use fuzzy keyword matching (default: false) */
    fuzzyMatch?: boolean;
}

// ============================================================================
// Section 2: Priority Scoring
// ============================================================================

/**
 * Get numeric priority score from agent priority level.
 *
 * **Simple explanation**: Convert P0/P1/P2/P3 to a number so we can
 * compare and sort agents by priority.
 *
 * @param priority - Agent priority level
 * @returns Numeric score (higher = more important)
 */
export function getPriorityScore(priority: AgentPriorityType): number {
    // P0 = highest priority (4), P3 = lowest (1)
    const priorityMap: Record<AgentPriorityType, number> = {
        'P0': 4,
        'P1': 3,
        'P2': 2,
        'P3': 1,
    };
    return priorityMap[priority] ?? 2;
}

/**
 * Calculate final routing score for an agent match.
 *
 * **Simple explanation**: Combine the base priority with bonuses
 * for matching keywords, patterns, tags, and ticket type.
 *
 * @param match - The routing match to score
 * @returns Final score
 */
export function calculateScore(match: Omit<RoutingMatch, 'score'>): number {
    let score = match.basePriority;

    // Add priority boost from routing rules
    score += match.priorityBoost;

    // Bonus for each matched keyword
    score += match.matchedKeywords.length * 0.5;

    // Bonus for each matched pattern (patterns are more specific)
    score += match.matchedPatterns.length * 0.8;

    // Bonus for each matched tag
    score += match.matchedTags.length * 0.3;

    // Bonus for ticket type match
    if (match.ticketTypeMatched) {
        score += 0.5;
    }

    // Override gets maximum priority
    if (match.isOverride) {
        score = 100;
    }

    return score;
}

// ============================================================================
// Section 3: Matching Functions
// ============================================================================

/**
 * Check if a keyword matches in the query.
 *
 * **Simple explanation**: See if a word appears in the task description.
 * Uses case-insensitive matching.
 *
 * @param query - The task query
 * @param keyword - Keyword to look for
 * @param fuzzy - Use fuzzy matching
 * @returns True if keyword found
 */
export function matchKeyword(query: string, keyword: string, fuzzy = false): boolean {
    const normalizedQuery = query.toLowerCase();
    const normalizedKeyword = keyword.toLowerCase();

    if (fuzzy) {
        // Fuzzy match: keyword letters appear in order
        let keywordIndex = 0;
        for (let i = 0; i < normalizedQuery.length && keywordIndex < normalizedKeyword.length; i++) {
            if (normalizedQuery[i] === normalizedKeyword[keywordIndex]) {
                keywordIndex++;
            }
        }
        return keywordIndex === normalizedKeyword.length;
    }

    // Word boundary match
    // Match whole word or at word boundaries
    const wordPattern = new RegExp(`\\b${escapeRegex(normalizedKeyword)}\\b`, 'i');
    return wordPattern.test(query);
}

/**
 * Check if a pattern matches the query.
 *
 * **Simple explanation**: Test a regex pattern against the task.
 * Invalid patterns are safely ignored.
 *
 * @param query - The task query
 * @param pattern - Regex pattern string
 * @returns True if pattern matches
 */
export function matchPattern(query: string, pattern: string): boolean {
    try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(query);
    } catch {
        // Invalid regex - log warning and return no match
        logWarn(`[Routing] Invalid regex pattern ignored: ${pattern}`);
        return false;
    }
}

/**
 * Check if a tag matches.
 *
 * **Simple explanation**: See if a tag is in the list of tags.
 * Case-insensitive comparison.
 *
 * @param taskTags - Tags on the task
 * @param agentTag - Tag to look for
 * @returns True if tag found
 */
export function matchTag(taskTags: string[], agentTag: string): boolean {
    const normalizedAgentTag = agentTag.toLowerCase();
    return taskTags.some(tag => tag.toLowerCase() === normalizedAgentTag);
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Section 4: Agent Matching
// ============================================================================

/**
 * Match a single agent against a task context.
 *
 * **Simple explanation**: Check all the routing rules for one agent
 * and see how well it matches the task.
 *
 * @param agent - The agent to check
 * @param context - The task context
 * @param options - Routing options
 * @returns Match result with details
 */
export function matchAgent(
    agent: CustomAgent,
    context: TaskContext,
    options: RoutingOptions = {}
): RoutingMatch {
    const routing = agent.routing;
    const fuzzy = options.fuzzyMatch ?? false;

    // Check for manual override
    const isOverride = context.agentOverride?.toLowerCase() === agent.name.toLowerCase();

    // Find matching keywords
    const matchedKeywords = routing.keywords.filter(keyword =>
        matchKeyword(context.query, keyword, fuzzy)
    );

    // Find matching patterns
    const matchedPatterns = routing.patterns.filter(pattern =>
        matchPattern(context.query, pattern)
    );

    // Find matching tags
    const taskTags = context.tags ?? [];
    const matchedTags = routing.tags.filter(tag =>
        matchTag(taskTags, tag)
    );

    // Check ticket type
    const ticketTypeMatched = context.ticketType !== undefined &&
        routing.ticketTypes.includes(context.ticketType);

    // Build match object (without final score)
    const baseMatch: Omit<RoutingMatch, 'score'> = {
        agent,
        basePriority: getPriorityScore(agent.priority),
        priorityBoost: routing.priorityBoost,
        matchedKeywords,
        matchedPatterns,
        matchedTags,
        ticketTypeMatched,
        isOverride,
    };

    // Calculate final score
    const score = calculateScore(baseMatch);

    return {
        ...baseMatch,
        score,
    };
}

/**
 * Check if a match has any routing rules triggered.
 *
 * **Simple explanation**: Did this agent match any keywords, patterns,
 * tags, or ticket type? Overrides always count as a match.
 *
 * @param match - The match to check
 * @returns True if any rules matched
 */
export function hasAnyMatch(match: RoutingMatch): boolean {
    return match.isOverride ||
        match.matchedKeywords.length > 0 ||
        match.matchedPatterns.length > 0 ||
        match.matchedTags.length > 0 ||
        match.ticketTypeMatched;
}

// ============================================================================
// Section 5: Core Routing Function
// ============================================================================

/**
 * Route a task to the best matching custom agent(s).
 *
 * **Simple explanation**: The main function! Give it a task, and it
 * finds which custom agents are best suited to handle it.
 *
 * @param context - Task context with query, tags, etc.
 * @param options - Routing options
 * @returns Routing result with candidates
 */
export function routeTask(
    context: TaskContext,
    options: RoutingOptions = {}
): RoutingResult {
    const workspaceFolder = getWorkspaceFolder();

    if (!workspaceFolder) {
        return {
            success: false,
            candidates: [],
            error: 'No workspace folder open',
            wasOverride: false,
        };
    }

    // Get all valid custom agents
    const agentList = listCustomAgents(workspaceFolder, { validOnly: true });

    if (agentList.length === 0) {
        return {
            success: false,
            candidates: [],
            error: 'No custom agents found',
            wasOverride: false,
        };
    }

    const includeInactive = options.includeInactive ?? false;
    const minScore = options.minScore ?? 0;
    const maxCandidates = options.maxCandidates;

    // Match each agent
    const matches: RoutingMatch[] = [];

    for (const item of agentList) {
        const agent = item.agent;
        if (!agent) continue;

        // Skip inactive agents unless explicitly included
        if (!includeInactive && !agent.isActive) {
            continue;
        }

        // Match the agent
        const match = matchAgent(agent, context, options);

        // Only include if has any match or meets minimum score
        if (hasAnyMatch(match) && match.score >= minScore) {
            matches.push(match);
        }
    }

    // Sort by score (highest first)
    matches.sort((a, b) => b.score - a.score);

    // Limit candidates if requested
    const candidates = maxCandidates ? matches.slice(0, maxCandidates) : matches;

    const wasOverride = candidates.length > 0 && candidates[0].isOverride;

    logInfo(`[Routing] Found ${candidates.length} matching agents for query: ${context.query.slice(0, 50)}...`);

    return {
        success: candidates.length > 0,
        bestMatch: candidates[0],
        candidates,
        wasOverride,
    };
}

/**
 * Find the best agent for a task (convenience function).
 *
 * **Simple explanation**: Quick way to get just the best matching agent
 * without all the extra details.
 *
 * @param query - The task query
 * @param tags - Optional tags
 * @returns Best matching agent or null
 */
export function findBestAgent(
    query: string,
    tags?: string[]
): CustomAgent | null {
    const result = routeTask({ query, tags });
    return result.bestMatch?.agent ?? null;
}

/**
 * Get all agents that can handle a specific ticket type.
 *
 * **Simple explanation**: Filter agents by what kind of tickets
 * they're configured to handle.
 *
 * @param ticketType - The ticket type to filter by
 * @returns Matching agents sorted by priority
 */
export function getAgentsForTicketType(
    ticketType: 'ai_to_human' | 'human_to_ai' | 'internal'
): CustomAgent[] {
    const workspaceFolder = getWorkspaceFolder();

    if (!workspaceFolder) {
        return [];
    }

    const agentList = listCustomAgents(workspaceFolder, {
        validOnly: true,
        activeOnly: true
    });

    return agentList
        .map(item => item.agent!)
        .filter(agent => agent && agent.routing.ticketTypes.includes(ticketType))
        .sort((a, b) => getPriorityScore(b.priority) - getPriorityScore(a.priority));
}

/**
 * Get all agents that match a specific keyword.
 *
 * **Simple explanation**: Find agents configured to respond to
 * a particular keyword.
 *
 * @param keyword - The keyword to search for
 * @returns Matching agents
 */
export function getAgentsByKeyword(keyword: string): CustomAgent[] {
    const workspaceFolder = getWorkspaceFolder();

    if (!workspaceFolder) {
        return [];
    }

    const normalizedKeyword = keyword.toLowerCase();
    const agentList = listCustomAgents(workspaceFolder, {
        validOnly: true,
        activeOnly: true
    });

    return agentList
        .map(item => item.agent!)
        .filter(agent => agent &&
            agent.routing.keywords.some(k => k.toLowerCase() === normalizedKeyword)
        );
}

/**
 * Get all agents that match a specific tag.
 *
 * **Simple explanation**: Find agents configured to respond to
 * tasks with a particular tag.
 *
 * @param tag - The tag to search for
 * @returns Matching agents
 */
export function getAgentsByTag(tag: string): CustomAgent[] {
    const workspaceFolder = getWorkspaceFolder();

    if (!workspaceFolder) {
        return [];
    }

    const normalizedTag = tag.toLowerCase();
    const agentList = listCustomAgents(workspaceFolder, {
        validOnly: true,
        activeOnly: true
    });

    return agentList
        .map(item => item.agent!)
        .filter(agent => agent &&
            agent.routing.tags.some(t => t.toLowerCase() === normalizedTag)
        );
}

// ============================================================================
// Section 6: Routing Analysis
// ============================================================================

/**
 * Analyze why a specific agent was or wasn't selected.
 *
 * **Simple explanation**: Debugging tool to understand routing decisions.
 * Shows exactly which rules matched or didn't match.
 *
 * @param agentName - Agent to analyze
 * @param context - Task context
 * @returns Detailed analysis or null if agent not found
 */
export function analyzeRouting(
    agentName: string,
    context: TaskContext
): RoutingMatch | null {
    const workspaceFolder = getWorkspaceFolder();

    if (!workspaceFolder) {
        return null;
    }

    try {
        const agent = loadCustomAgent(workspaceFolder, agentName);
        return matchAgent(agent, context);
    } catch {
        return null;
    }
}

/**
 * Get a summary of all routing rules across all agents.
 *
 * **Simple explanation**: See all the keywords, patterns, and tags
 * configured across all custom agents.
 */
export interface RoutingSummary {
    /** Total number of custom agents */
    totalAgents: number;
    /** Number of active agents */
    activeAgents: number;
    /** All unique keywords across agents */
    allKeywords: string[];
    /** All unique tags across agents */
    allTags: string[];
    /** All unique ticket types configured */
    ticketTypesCovered: string[];
    /** Agents with no routing rules configured */
    agentsWithoutRules: string[];
}

/**
 * Get a summary of routing configuration.
 *
 * **Simple explanation**: Overview of what routing rules exist
 * across all custom agents.
 *
 * @returns Routing summary
 */
export function getRoutingSummary(): RoutingSummary {
    const workspaceFolder = getWorkspaceFolder();

    const emptySummary: RoutingSummary = {
        totalAgents: 0,
        activeAgents: 0,
        allKeywords: [],
        allTags: [],
        ticketTypesCovered: [],
        agentsWithoutRules: [],
    };

    if (!workspaceFolder) {
        return emptySummary;
    }

    const agentList = listCustomAgents(workspaceFolder, { validOnly: true });

    const keywordsSet = new Set<string>();
    const tagsSet = new Set<string>();
    const ticketTypesSet = new Set<string>();
    const agentsWithoutRules: string[] = [];
    let activeCount = 0;

    for (const item of agentList) {
        const agent = item.agent;
        if (!agent) continue;

        if (agent.isActive) {
            activeCount++;
        }

        const routing = agent.routing;

        // Check if agent has any routing rules
        const hasRules = routing.keywords.length > 0 ||
            routing.patterns.length > 0 ||
            routing.tags.length > 0 ||
            routing.ticketTypes.length > 0;

        if (!hasRules) {
            agentsWithoutRules.push(agent.name);
        }

        // Collect all keywords, tags, ticket types
        routing.keywords.forEach(k => keywordsSet.add(k.toLowerCase()));
        routing.tags.forEach(t => tagsSet.add(t.toLowerCase()));
        routing.ticketTypes.forEach(tt => ticketTypesSet.add(tt));
    }

    return {
        totalAgents: agentList.length,
        activeAgents: activeCount,
        allKeywords: Array.from(keywordsSet).sort(),
        allTags: Array.from(tagsSet).sort(),
        ticketTypesCovered: Array.from(ticketTypesSet).sort(),
        agentsWithoutRules,
    };
}

/**
 * Validate that routing keywords don't conflict between agents.
 *
 * **Simple explanation**: Check if any keywords are used by multiple
 * agents, which might cause confusing routing behavior.
 */
export interface RoutingConflict {
    keyword: string;
    agents: string[];
}

/**
 * Find routing conflicts (keywords used by multiple agents).
 *
 * **Simple explanation**: Identify keywords that might cause ambiguous
 * routing because multiple agents use them.
 *
 * @returns Array of conflicts
 */
export function findRoutingConflicts(): RoutingConflict[] {
    const workspaceFolder = getWorkspaceFolder();

    if (!workspaceFolder) {
        return [];
    }

    const agentList = listCustomAgents(workspaceFolder, {
        validOnly: true,
        activeOnly: true
    });

    // Map keywords to agents that use them
    const keywordToAgents = new Map<string, string[]>();

    for (const item of agentList) {
        const agent = item.agent;
        if (!agent) continue;

        for (const keyword of agent.routing.keywords) {
            const normalizedKeyword = keyword.toLowerCase();
            const agents = keywordToAgents.get(normalizedKeyword) ?? [];
            agents.push(agent.name);
            keywordToAgents.set(normalizedKeyword, agents);
        }
    }

    // Find keywords with multiple agents
    const conflicts: RoutingConflict[] = [];

    for (const [keyword, agents] of keywordToAgents) {
        if (agents.length > 1) {
            conflicts.push({ keyword, agents });
        }
    }

    return conflicts;
}
