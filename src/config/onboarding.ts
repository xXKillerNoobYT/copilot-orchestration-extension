/**
 * Configuration Onboarding Flow
 *
 * Guides users through first-time configuration setup.
 *
 * **Simple explanation**: Like a welcome wizard when you install new software -
 * helps users set up their preferences and creates the config file for them.
 *
 * @module config/onboarding
 * @since MT-003.6
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { logInfo, logWarn } from '../logger';
import { DEFAULT_CONFIG } from './schema';

/**
 * Result of onboarding process.
 */
export interface OnboardingResult {
    /** Whether onboarding was successful */
    success: boolean;
    /** Whether config file was created */
    configCreated: boolean;
    /** Path to created config file */
    configPath: string | null;
    /** Error message if failed */
    error?: string;
}

/**
 * Check if this is the first run (no config file exists).
 *
 * @param context - VS Code extension context
 * @returns true if config file doesn't exist
 */
export function isFirstRun(context: vscode.ExtensionContext): boolean {
    const configPath = path.join(context.extensionPath, '.coe', 'config.json');
    return !fs.existsSync(configPath);
}

/**
 * Create the config file with default values.
 *
 * **Simple explanation**: Creates the .coe/config.json file with sensible
 * defaults so the extension can start working immediately.
 *
 * @param context - VS Code extension context
 * @returns Path to created config file, or null if failed
 */
function createDefaultConfigFile(
    context: vscode.ExtensionContext
): string | null {
    try {
        const coeDir = path.join(context.extensionPath, '.coe');
        const configPath = path.join(coeDir, 'config.json');

        // Create .coe directory if it doesn't exist
        if (!fs.existsSync(coeDir)) {
            fs.mkdirSync(coeDir, { recursive: true });
            logInfo('Created .coe directory');
        }

        // Write default config with helpful comments
        const configContent = {
            $schema: './config.schema.json',
            _comment: 'Copilot Orchestration Extension Configuration',
            _note: 'Edit these values to customize extension behavior',
            ...DEFAULT_CONFIG,
        };

        fs.writeFileSync(
            configPath,
            JSON.stringify(configContent, null, 2),
            'utf-8'
        );

        logInfo(`Created default config file at ${configPath}`);
        return configPath;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to create default config file: ${msg}`);
        return null;
    }
}

/**
 * Run the first-time onboarding flow.
 *
 * **Simple explanation**: Guides the user through initial setup by:
 * 1. Creating a default config file
 * 2. Showing a welcome message
 * 3. Offering to open the config file for review
 *
 * @param context - VS Code extension context
 * @returns Result object with onboarding status
 */
export async function runOnboarding(
    context: vscode.ExtensionContext
): Promise<OnboardingResult> {
    const result: OnboardingResult = {
        success: false,
        configCreated: false,
        configPath: null,
    };

    try {
        logInfo('Starting first-time onboarding');

        // Create default config file
        const configPath = createDefaultConfigFile(context);
        if (!configPath) {
            result.error = 'Failed to create config file';
            return result;
        }

        result.configCreated = true;
        result.configPath = configPath;

        // Show welcome notification
        const action = await vscode.window.showInformationMessage(
            '🎉 Welcome to Copilot Orchestration Extension! ' +
            'A default configuration file has been created. ' +
            'Would you like to review it?',
            'Open Config',
            'Later'
        );

        if (action === 'Open Config') {
            // Open config file in editor
            const uri = vscode.Uri.file(configPath);
            await vscode.window.showTextDocument(uri, {
                preview: false,
                viewColumn: vscode.ViewColumn.One,
            });
            logInfo('Opened config file for user review');
        }

        result.success = true;
        logInfo('Onboarding completed successfully');
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        result.error = `Onboarding failed: ${msg}`;
        logWarn(result.error);
    }

    return result;
}

/**
 * Create example config file (separate from default config).
 *
 * **Simple explanation**: Creates a .coe/config.json.example file that
 * users can copy and customize. Like a template.
 *
 * @param context - VS Code extension context
 * @returns Path to example file, or null if failed
 */
export function createExampleConfig(
    context: vscode.ExtensionContext
): string | null {
    try {
        const coeDir = path.join(context.extensionPath, '.coe');
        const examplePath = path.join(coeDir, 'config.json.example');

        // Create .coe directory if needed
        if (!fs.existsSync(coeDir)) {
            fs.mkdirSync(coeDir, { recursive: true });
        }

        const exampleContent = {
            $schema: './config.schema.json',
            _comment: 'Example configuration - copy this to config.json and customize',
            debug: {
                logLevel: 'info',
                _note: 'Options: info, warn, error',
            },
            llm: {
                endpoint: 'http://127.0.0.1:1234/v1',
                model: 'ministral-3-14b-reasoning',
                timeoutSeconds: 120,
                maxTokens: 2048,
                startupTimeoutSeconds: 300,
                _note: 'Configure your LLM server connection here',
            },
            orchestrator: {
                taskTimeoutSeconds: 30,
                _note: 'How long to wait for agent tasks',
            },
            tickets: {
                dbPath: './.coe/tickets.db',
                _note: 'SQLite database path for tickets',
            },
            githubIssues: {
                path: 'github-issues',
                _note: 'Where to sync GitHub issues',
            },
            lmStudioPolling: {
                tokenPollIntervalSeconds: 30,
                _note: 'How often to poll the LLM server (10-120 seconds)',
            },
            watcher: {
                debounceMs: 500,
                _note: 'Delay before reloading config file changes',
            },
            auditLog: {
                enabled: true,
                _note: 'Enable audit logging for debugging',
            },
        };

        fs.writeFileSync(
            examplePath,
            JSON.stringify(exampleContent, null, 2),
            'utf-8'
        );

        logInfo(`Created example config at ${examplePath}`);
        return examplePath;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logWarn(`Failed to create example config: ${msg}`);
        return null;
    }
}

/**
 * Check if user wants to run onboarding.
 *
 * **Simple explanation**: Asks the user if they want to set up the config
 * now or skip it. Lets them postpone if they're busy.
 *
 * @returns true if user wants to run onboarding
 */
export async function promptForOnboarding(): Promise<boolean> {
    const action = await vscode.window.showInformationMessage(
        'Copilot Orchestration Extension needs to be configured. ' +
        'Would you like to set it up now?',
        'Yes',
        'Not Now'
    );

    return action === 'Yes';
}

/**
 * Show onboarding tips after setup.
 *
 * @param context - VS Code extension context
 */
export async function showOnboardingTips(
    context: vscode.ExtensionContext
): Promise<void> {
    const tips = [
        '💡 Tip: You can change the log level in .coe/config.json',
        '💡 Tip: Configure your LLM server endpoint in the config file',
        '💡 Tip: The config file will reload automatically when you edit it',
    ];

    // Show a random tip
    const tip = tips[Math.floor(Math.random() * tips.length)];
    await vscode.window.showInformationMessage(tip);
}

/**
 * Validate that required config directories exist.
 *
 * @param context - VS Code extension context
 * @returns true if all directories are set up
 */
export function validateConfigSetup(
    context: vscode.ExtensionContext
): boolean {
    const coeDir = path.join(context.extensionPath, '.coe');
    const configPath = path.join(coeDir, 'config.json');

    if (!fs.existsSync(coeDir)) {
        logWarn('.coe directory does not exist');
        return false;
    }

    if (!fs.existsSync(configPath)) {
        logWarn('config.json does not exist');
        return false;
    }

    return true;
}
