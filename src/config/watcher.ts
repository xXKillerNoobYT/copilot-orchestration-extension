/**
 * Configuration File Watcher
 *
 * Watches .coe/config.json for changes and reloads configuration.
 *
 * **Simple explanation**: Like setting up a notification that tells you
 * when someone edits a document, so you can reload the latest version.
 * Includes a delay (debouncing) to avoid reloading too frequently.
 *
 * @module config/watcher
 * @since MT-003.5
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logInfo, logWarn, logError } from '../logger';
import { loadConfigFromFile } from './loader';

/**
 * Configuration watcher state.
 */
export interface ConfigWatcher {
    /** File system watcher instance */
    watcher: fs.FSWatcher | null;
    /** Debounce timer */
    debounceTimer: NodeJS.Timeout | null;
    /** Whether watcher is active */
    isActive: boolean;
    /** Callback to invoke on config change */
    onChange: (config: unknown) => void;
}

/**
 * Global watcher instance (singleton).
 */
let watcherInstance: ConfigWatcher | null = null;

/**
 * Start watching the configuration file for changes.
 *
 * **Simple explanation**: Sets up a file monitor that will call the provided
 * callback whenever .coe/config.json is modified. Debounces changes to avoid
 * rapid-fire reloads if the file is being edited.
 *
 * @param context - VS Code extension context
 * @param onChange - Callback to invoke when config changes (receives new config)
 * @param debounceMs - Milliseconds to wait before reloading (default: 500ms)
 * @returns Watcher instance (can be used to stop watching)
 */
export function startConfigWatcher(
    context: vscode.ExtensionContext,
    onChange: (config: unknown) => void,
    debounceMs: number = 500
): ConfigWatcher {
    // Stop existing watcher if present
    if (watcherInstance) {
        stopConfigWatcher();
    }

    const configPath = path.join(context.extensionPath, '.coe', 'config.json');

    logInfo(`Starting config watcher for ${configPath} (debounce: ${debounceMs}ms)`);

    const watcher: ConfigWatcher = {
        watcher: null,
        debounceTimer: null,
        isActive: false,
        onChange,
    };

    try {
        // Create file watcher
        const fsWatcher = fs.watch(
            configPath,
            { persistent: false },
            (eventType, filename) => {
                if (eventType === 'change') {
                    logInfo(`Config file changed: ${filename || 'config.json'}`);

                    // Clear existing debounce timer
                    if (watcher.debounceTimer) {
                        clearTimeout(watcher.debounceTimer);
                    }

                    // Set new debounce timer
                    watcher.debounceTimer = setTimeout(async () => {
                        try {
                            logInfo('Debounce complete, reloading config');
                            const newConfig = await loadConfigFromFile(context);
                            onChange(newConfig);
                            logInfo('Config reloaded successfully');
                        } catch (error: unknown) {
                            const msg =
                                error instanceof Error ? error.message : String(error);
                            logError(`Failed to reload config: ${msg}`);
                        }
                        watcher.debounceTimer = null;
                    }, debounceMs);
                }
            }
        );

        watcher.watcher = fsWatcher;
        watcher.isActive = true;

        // Handle watcher errors
        fsWatcher.on('error', (error: Error) => {
            if (error.message.includes('ENOENT')) {
                logWarn(
                    'Config file not found, stopping watcher. Create .coe/config.json to re-enable watching.'
                );
            } else if (error.message.includes('EPERM')) {
                logWarn(
                    'Permission denied accessing config file. Check file permissions.'
                );
            } else {
                logError(`Config watcher error: ${error.message}`);
            }

            // Stop watcher on persistent errors
            stopConfigWatcher();
        });

        watcherInstance = watcher;
        logInfo('Config watcher started successfully');
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to start config watcher: ${msg}`);

        if (msg.includes('ENOENT')) {
            logWarn(
                'Config file does not exist. Watcher will not start. Create .coe/config.json to enable watching.'
            );
        }
    }

    return watcher;
}

/**
 * Stop the configuration file watcher.
 *
 * **Simple explanation**: Turns off the file monitor and cleans up resources.
 * Always call this when shutting down or deactivating the extension.
 *
 * @returns true if watcher was stopped, false if no watcher was active
 */
export function stopConfigWatcher(): boolean {
    if (!watcherInstance) {
        return false;
    }

    logInfo('Stopping config watcher');

    try {
        // Clear any pending debounce timer
        if (watcherInstance.debounceTimer) {
            clearTimeout(watcherInstance.debounceTimer);
            watcherInstance.debounceTimer = null;
        }

        // Close file system watcher
        if (watcherInstance.watcher) {
            watcherInstance.watcher.close();
            watcherInstance.watcher = null;
        }

        watcherInstance.isActive = false;
        watcherInstance = null;

        logInfo('Config watcher stopped');
        return true;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Error stopping config watcher: ${msg}`);
        return false;
    }
}

/**
 * Check if the config watcher is currently active.
 *
 * @returns true if watcher is running
 */
export function isWatcherActive(): boolean {
    return watcherInstance?.isActive ?? false;
}

/**
 * Get the current watcher instance (for testing).
 *
 * @returns Current watcher instance or null
 */
export function getWatcherInstance(): ConfigWatcher | null {
    return watcherInstance;
}

/**
 * Reset the watcher instance (for testing).
 */
export function resetWatcherForTests(): void {
    stopConfigWatcher();
    watcherInstance = null;
}
