import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConfigSchema, Config, DEFAULT_CONFIG } from './schema';
import { logWarn, logInfo } from '../logger';

/**
 * Safely read and parse config file from .coe/config.json.
 *
 * **Simple explanation**: Like carefully opening a recipe card that might be
 * torn or messy, but you can always fall back to the standard recipe if needed.
 *
 * @param context VS Code extension context for path resolution
 * @returns Raw parsed config object (or empty object if file missing/invalid JSON)
 */
function readConfigFile(
  context: vscode.ExtensionContext
): Record<string, unknown> {
  const configPath = path.join(context.extensionPath, '.coe', 'config.json');

  try {
    if (!fs.existsSync(configPath)) {
      // File doesn't exist – return empty for merge with defaults
      return {};
    }

    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(fileContent);
    return parsed ?? {};
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logWarn(
      `Failed to read config file at .coe/config.json: ${errorMsg}. Using defaults.`
    );
    return {}; // Return empty to merge with defaults
  }
}

/**
 * Validate and transform raw config using Zod schema.
 * On validation error, logs warnings and applies defaults for invalid fields.
 *
 * **Simple explanation**: Like a customs officer checking your baggage.
 * If something is broken or wrong, they note it, give you a replacement from
 * the emergency kit, and let you pass through.
 *
 * @param rawConfig Unvalidated config object (from JSON file)
 * @returns Validated, type-safe Config object with defaults applied
 */
function validateAndTransform(
  rawConfig: Record<string, unknown>
): Config {
  try {
    // Try to parse the raw config directly
    return ConfigSchema.parse(rawConfig);
  } catch (error: unknown) {
    // Zod validation error: log and use defaults for invalid/missing fields
    if (error instanceof Error) {
      logWarn(
        `Config validation failed: ${error.message}. Using defaults for invalid/missing fields.`
      );
    }

    // Apply defaults by parsing an empty object (triggers all .default() values)
    const defaultConfig = ConfigSchema.parse({});

    // Merge: keep valid sections from rawConfig, replace invalid with defaults
    const mergedConfig = {
      debug:
        rawConfig.debug && typeof rawConfig.debug === 'object'
          ? { ...defaultConfig.debug, ...rawConfig.debug }
          : defaultConfig.debug,
      llm:
        rawConfig.llm && typeof rawConfig.llm === 'object'
          ? { ...defaultConfig.llm, ...rawConfig.llm }
          : defaultConfig.llm,
      orchestrator:
        rawConfig.orchestrator && typeof rawConfig.orchestrator === 'object'
          ? { ...defaultConfig.orchestrator, ...rawConfig.orchestrator }
          : defaultConfig.orchestrator,
      tickets:
        rawConfig.tickets && typeof rawConfig.tickets === 'object'
          ? { ...defaultConfig.tickets, ...rawConfig.tickets }
          : defaultConfig.tickets,
      githubIssues:
        rawConfig.githubIssues &&
        typeof rawConfig.githubIssues === 'object'
          ? { ...defaultConfig.githubIssues, ...rawConfig.githubIssues }
          : defaultConfig.githubIssues,
      lmStudioPolling:
        rawConfig.lmStudioPolling &&
        typeof rawConfig.lmStudioPolling === 'object'
          ? {
              ...defaultConfig.lmStudioPolling,
              ...rawConfig.lmStudioPolling,
            }
          : defaultConfig.lmStudioPolling,
      watcher:
        rawConfig.watcher && typeof rawConfig.watcher === 'object'
          ? { ...defaultConfig.watcher, ...rawConfig.watcher }
          : defaultConfig.watcher,
      auditLog:
        rawConfig.auditLog && typeof rawConfig.auditLog === 'object'
          ? { ...defaultConfig.auditLog, ...rawConfig.auditLog }
          : defaultConfig.auditLog,
    };

    // Re-parse merged config to ensure type correctness
    try {
      return ConfigSchema.parse(mergedConfig);
    } catch {
      // If merge still fails, return pure defaults as last resort
      logWarn(
        'Could not merge config; returning hardcoded defaults.'
      );
      return DEFAULT_CONFIG;
    }
  }
}

/**
 * Load, validate, and return config from .coe/config.json.
 *
 * **Simple explanation**: Read the config file (if it exists), check it's okay,
 * fill in any missing parts with safe defaults, and hand back a locked config
 * object that can't be modified.
 *
 * @param context VS Code extension context
 * @returns Validated, readonly Config object with all fields populated
 */
export async function loadConfigFromFile(
  context: vscode.ExtensionContext
): Promise<Config> {
  const rawConfig = readConfigFile(context);
  const validatedConfig = validateAndTransform(rawConfig);

  const source = Object.keys(rawConfig).length > 0 ? 'file' : 'default';
  logInfo(
    `Config loaded successfully. Using ${source} configuration.`
  );

  return validatedConfig;
}
