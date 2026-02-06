import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ConfigSchema, Config, DEFAULT_CONFIG } from './schema';
import { logWarn, logInfo } from '../logger';

/**
 * Safely read and parse config file from .coe/config.json.
 * Prompts user to create .coe directory if it doesn't exist.
 *
 * **Simple explanation**: Like carefully opening a recipe card that might be
 * torn or messy, but you can always fall back to the standard recipe if needed.
 *
 * @param context VS Code extension context for path resolution
 * @returns Raw parsed config object (or empty object if file missing/invalid JSON)
 */
async function readConfigFile(
  context: vscode.ExtensionContext
): Promise<Record<string, unknown>> {
  // Use workspace folder (where user's project is) NOT extension install path
  // The .coe/config.json file lives in the user's project root
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!workspaceFolder) {
    logWarn('No workspace folder found. Using default configuration.');
    return {};
  }

  const coeDir = path.join(workspaceFolder, '.coe');
  const configPath = path.join(coeDir, 'config.json');

  // Check if .coe directory exists, prompt to create if not
  if (!fs.existsSync(coeDir)) {
    const createDir = await vscode.window.showInformationMessage(
      `COE extension: No ".coe" directory found. Create it with config?`,
      { modal: false },
      'Yes, create .coe',
      'No, use defaults'
    );

    if (createDir === 'Yes, create .coe') {
      try {
        // Ask for LLM endpoint - this makes new workspace setup much easier
        const llmEndpoint = await vscode.window.showInputBox({
          title: 'LLM Server Endpoint',
          prompt: 'Enter your LLM server URL (OpenAI-compatible API). Press Enter to accept default.',
          value: 'http://127.0.0.1:1234/v1',
          placeHolder: 'http://127.0.0.1:1234/v1 or http://192.168.x.x:1234/v1',
          ignoreFocusOut: true,
          validateInput: (value) => {
            if (!value) {
              return 'Endpoint cannot be empty';
            }
            try {
              new URL(value);
              return null; // Valid
            } catch {
              return 'Please enter a valid URL (e.g., http://127.0.0.1:1234/v1)';
            }
          }
        });

        // If user cancelled the input box, fall back to defaults
        if (llmEndpoint === undefined) {
          logInfo('User cancelled LLM endpoint input. Using default configuration.');
          return {};
        }

        fs.mkdirSync(coeDir, { recursive: true });

        // Create a starter config.json with the user's endpoint
        const starterConfig = {
          llm: {
            endpoint: llmEndpoint,
            model: 'ministral-3-14b-reasoning',
            timeoutSeconds: 60,
            maxTokens: 2048
          },
          orchestrator: {
            taskTimeoutSeconds: 30
          },
          tickets: {
            dbPath: '.coe/tickets.db'
          }
        };

        fs.writeFileSync(configPath, JSON.stringify(starterConfig, null, 2), 'utf-8');
        logInfo(`Created .coe directory and config.json at ${coeDir}`);

        // Confirm to user
        vscode.window.showInformationMessage(
          `Created .coe/config.json with LLM endpoint: ${llmEndpoint}`
        );

        return starterConfig;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logWarn(`Failed to create .coe directory: ${errMsg}. Using defaults.`);
        return {};
      }
    } else {
      logInfo('User declined to create .coe directory. Using default configuration.');
      return {};
    }
  }

  try {
    if (!fs.existsSync(configPath)) {
      // Directory exists but no config file – return empty for merge with defaults
      logInfo(`Config file not found at ${configPath}, using defaults`);
      return {};
    }

    const fileContent = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(fileContent);
    logInfo('Config loaded successfully. Using file configuration.');
    return parsed ?? {};
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logWarn(
      `Failed to read config file at ${configPath}: ${errorMsg}. Using defaults.`
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
  const rawConfig = await readConfigFile(context);
  const validatedConfig = validateAndTransform(rawConfig);

  const source = Object.keys(rawConfig).length > 0 ? 'file' : 'default';
  logInfo(
    `Config loaded successfully. Using ${source} configuration.`
  );

  return validatedConfig;
}
