import * as vscode from 'vscode';
import * as path from 'path';
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
    const configPath = path.join(context.extensionPath, '.coe', 'config.json');
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content);
            const levelFromConfig = config.debug?.logLevel?.toLowerCase();
            if (['info', 'warn', 'error'].includes(levelFromConfig)) {
                logLevel = levelFromConfig as any;
            }
        }
    } catch (err) {
        // silent fail – use default 'info'
    }
}

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
