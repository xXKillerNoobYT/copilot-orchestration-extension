import * as vscode from 'vscode';
import { Config } from './schema';
import { loadConfigFromFile } from './loader';
import { logError } from '../logger';

/**
 * Singleton instance of validated config.
 * Initialized once during extension activation, never changed after.
 */
let configInstance: Config | null = null;

/**
 * Initialize the config singleton by loading and validating config file.
 * Must be called once during extension activation, before other services.
 *
 * **Simple explanation**: Like booting up a computer once at startup.
 * After initialization, you don't need to reboot – just ask for the data.
 *
 * @param context VS Code extension context
 * @throws Error if already initialized (safety check against double-init)
 * @throws Error if config loading fails
 */
export async function initializeConfig(
  context: vscode.ExtensionContext
): Promise<void> {
  if (configInstance !== null) {
    throw new Error(
      'Config already initialized. Do not call initializeConfig multiple times.'
    );
  }

  try {
    configInstance = await loadConfigFromFile(context);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logError(`Failed to initialize config: ${errorMsg}`);
    throw error; // Re-throw to prevent extension activation if config is critical
  }
}

/**
 * Get the singleton config instance.
 * Must be called only after initializeConfig() has completed.
 *
 * **Simple explanation**: Like asking "what's the current time?" – it's already
 * set, you just read it without any waiting or setup.
 *
 * @returns Validated readonly config object
 * @throws Error with helpful message if config not initialized
 */
export function getConfigInstance(): Readonly<Config> {
  if (configInstance === null) {
    throw new Error(
      'Config not initialized. Call initializeConfig(context) during extension activation first.'
    );
  }
  return configInstance;
}

/**
 * Reset config singleton for testing purposes.
 * DO NOT use in production code.
 *
 * **Simple explanation**: Like clearing a whiteboard so the next person
 * can write fresh information.
 *
 * @internal Testing only
 */
export function resetConfigForTests(): void {
  configInstance = null;
}
