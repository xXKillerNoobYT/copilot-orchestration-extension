/**
 * Auto Mode State Management
 * 
 * Provides a centralized runtime state for Auto/Manual ticket processing mode.
 * This is a SESSION-ONLY override - clicking the sidebar toggle changes this state
 * but does NOT persist to VS Code settings. On extension reload, reverts to setting.
 * 
 * **Simple explanation**: Like a light switch that resets when you restart.
 * The setting (in VS Code settings) is the default position on startup,
 * but the user can flip it temporarily for the current session.
 * 
 * @module autoModeState
 */

import * as vscode from 'vscode';
import { logInfo } from '../logger';

// ========================================================================
// Module State
// ========================================================================

/**
 * Runtime override for auto mode. When null, uses the setting value.
 * When true/false, overrides the setting for the current session only.
 * 
 * **Why separate from settings?** Users wanted the sidebar button to be a
 * quick temporary toggle without permanently changing their preferences.
 */
let runtimeOverride: boolean | null = null;

/**
 * Set of ticket IDs that have already been processed by auto-planning.
 * Prevents infinite loop where updateTicket() re-triggers onTicketChange().
 * 
 * **Simple explanation**: Like a "do not call again" list for tickets.
 */
const processedTickets = new Set<string>();

/**
 * Debounce timer for auto-planning to prevent rapid-fire triggers.
 */
let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Debounce delay in milliseconds (matches config watcher pattern).
 */
export const AUTO_PLAN_DEBOUNCE_MS = 500;

// ========================================================================
// Public API
// ========================================================================

/**
 * Get the effective auto mode state (runtime override or setting).
 * This is the single source of truth for whether auto mode is enabled.
 * 
 * **Simple explanation**: Check if we're in Auto mode right now.
 * First checks the temporary override, then falls back to the setting.
 * 
 * @returns true if Auto mode is enabled, false if Manual mode
 */
export function getAutoModeEnabled(): boolean {
    // If runtime override is set, use it
    if (runtimeOverride !== null) {
        return runtimeOverride;
    }
    // Otherwise, read from VS Code settings (default is now true)
    const config = vscode.workspace.getConfiguration('coe');
    return config.get<boolean>('autoProcessTickets', true);
}

/**
 * Set the runtime override for auto mode.
 * Called by the toggle command - does NOT persist to settings.
 * 
 * @param enabled - true for Auto mode, false for Manual mode
 */
export function setAutoModeOverride(enabled: boolean): void {
    runtimeOverride = enabled;
    logInfo(`[AutoModeState] Runtime override set to: ${enabled ? 'Auto' : 'Manual'}`);
}

/**
 * Check if a ticket has already been processed by auto-planning.
 * 
 * @param ticketId - The ticket ID to check
 * @returns true if already processed
 */
export function isTicketProcessed(ticketId: string): boolean {
    return processedTickets.has(ticketId);
}

/**
 * Mark a ticket as processed by auto-planning.
 * Prevents re-entry when updateTicket triggers onTicketChange.
 * 
 * @param ticketId - The ticket ID to mark
 */
export function markTicketProcessed(ticketId: string): void {
    processedTickets.add(ticketId);
}

/**
 * Get the debounce timer.
 * 
 * @returns The current timer or null
 */
export function getDebounceTimer(): NodeJS.Timeout | null {
    return debounceTimer;
}

/**
 * Set the debounce timer.
 * 
 * @param timer - The new timer or null to clear
 */
export function setDebounceTimer(timer: NodeJS.Timeout | null): void {
    debounceTimer = timer;
}

/**
 * Clear the debounce timer if set.
 */
export function clearDebounceTimer(): void {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
}

/**
 * Reset all auto mode state (for tests and extension deactivation).
 * Clears the runtime override, processed tickets set, and debounce timer.
 */
export function resetAutoModeState(): void {
    runtimeOverride = null;
    processedTickets.clear();
    clearDebounceTimer();
    logInfo('[AutoModeState] State reset');
}

/**
 * Get the processed tickets count (for debugging/testing).
 * 
 * @returns Number of tickets marked as processed
 */
export function getProcessedTicketsCount(): number {
    return processedTickets.size;
}
