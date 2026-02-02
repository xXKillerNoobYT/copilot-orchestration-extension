import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * This function is called when the extension is activated.
 * Activation happens when VS Code starts up (due to "onStartupFinished" event).
 */
export function activate(context: vscode.ExtensionContext) {
    // Create output channel (keep this line)
    const outputChannel = vscode.window.createOutputChannel('COE');
    outputChannel.appendLine('Copilot Orchestration Extension activated');

    // Try to read config (just for testing)
    const configPath = path.join(context.extensionPath, '.coe', 'config.json');
    let config: any = {};
    try {
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            config = JSON.parse(configContent);
            outputChannel.appendLine('Loaded .coe/config.json successfully');
            outputChannel.appendLine(`LLM endpoint: ${config.llm?.endpoint || 'not found'}`);
        } else {
            outputChannel.appendLine('.coe/config.json not found yet');
        }
    } catch (err) {
        outputChannel.appendLine(`Error reading config: ${err}`);
    }

    // ── NEW: Register the command ──
    const helloCommand = vscode.commands.registerCommand('coe.sayHello', () => {
        vscode.window.showInformationMessage('Hello from COE!');
        outputChannel.appendLine('User ran COE: Say Hello');
    });

    // ── NEW: Add status bar item ──
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100 // higher = more to the right
    );
    statusBarItem.text = '$(rocket) COE Ready';
    statusBarItem.command = 'coe.sayHello';
    statusBarItem.tooltip = 'Click to say hello from COE';
    statusBarItem.show();

    // Tell VS Code to clean up when extension deactivates
    context.subscriptions.push(helloCommand);
    context.subscriptions.push(statusBarItem);
}

/**
 * This function is called when the extension is deactivated.
 * Clean up resources here if needed.
 */
export function deactivate() {
    // Nothing to clean up yet
}
