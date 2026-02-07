/**
 * Simple reusable logger for the COE extension.
 *
 * Features:
 * - Logs to dedicated VS Code Output channel "COE Logs" + console
 * - Supports levels: info / warn / error
 * - Reads initial logLevel from .coe/config.json (debug.logLevel)
 * - Must be initialized once by calling initializeLogger(context) during extension activation
 *
 * Usage:
 * 1. In extension.ts activate():
 *    initializeLogger(context);
 * 2. Then use:
 *    logInfo("message")
 *    logWarn("warning")
 *    logError("error or Error object")
 *
 * Why separate init function?
 * → Needs ExtensionContext to build correct config path
 * → Only called once to avoid duplicate channels
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { getConfigInstance } from './config';
import * as fs from 'fs';

let outputChannel: vscode.OutputChannel | undefined;
let logLevel: 'info' | 'warn' | 'error' = 'info'; // default

// Lazy init output channel
function getOutputChannel() {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('COE Logs');
    }
    return outputChannel;
}

// Read log level from config once on init
function initLogger(context: vscode.ExtensionContext) {
    // Try workspace folder first (project-specific config), fall back to extensionPath
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const configPaths: string[] = [];

    // Priority 1: Workspace folder .coe/config.json
    if (workspaceFolders && workspaceFolders.length > 0) {
        configPaths.push(path.join(workspaceFolders[0].uri.fsPath, '.coe', 'config.json'));
    }

    // Priority 2: Extension path (fallback, shouldn't normally have config)
    configPaths.push(path.join(context.extensionPath, '.coe', 'config.json'));

    for (const configPath of configPaths) {
        try {
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(content);
                const levelFromConfig = config.debug?.logLevel?.toLowerCase();
                if (['info', 'warn', 'error'].includes(levelFromConfig)) {
                    logLevel = levelFromConfig as any;
                    return; // Found valid config, stop searching
                }
            }
        } catch (err) {
            // silent fail – try next path or use default
        }
    }
}

/**
 * Initializes the logger by reading config and creating the output channel.
 * Must be called exactly once during extension activation.
 * @param context The VS Code ExtensionContext
 */
export function initializeLogger(context: vscode.ExtensionContext) {
    initLogger(context);
    getOutputChannel().appendLine(`[INFO] Logger initialized – level: ${logLevel}`);
}

export function logInfo(message: string) {
    if (logLevel === 'info' || logLevel === 'warn' || logLevel === 'error') {
        const line = `[INFO] ${new Date().toISOString()} ${message}`;
        getOutputChannel().appendLine(line);
        console.log(line);
    }
}

export function logWarn(message: string) {
    if (logLevel === 'warn' || logLevel === 'error') {
        const line = `[WARN] ${new Date().toISOString()} ${message}`;
        getOutputChannel().appendLine(line);
        console.warn(line);
    }
}

export function logError(message: string | Error) {
    const msg = message instanceof Error ? message.message : message;
    const line = `[ERROR] ${new Date().toISOString()} ${msg}`;
    getOutputChannel().appendLine(line);
    console.error(line);
}
