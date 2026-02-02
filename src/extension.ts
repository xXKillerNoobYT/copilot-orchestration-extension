import * as vscode from 'vscode';

/**
 * This function is called when the extension is activated.
 * Activation happens when VS Code starts up (due to "onStartupFinished" event).
 */
export function activate(context: vscode.ExtensionContext) {
    // Create an output channel for COE logs
    const outputChannel = vscode.window.createOutputChannel('COE');

    // Display activation message
    outputChannel.appendLine('Copilot Orchestration Extension activated');
    outputChannel.show(true); // Show the output panel (true = preserve focus)

    // Log to console as well (visible in Extension Development Host console)
    console.log('Copilot Orchestration Extension is now active!');
}

/**
 * This function is called when the extension is deactivated.
 * Clean up resources here if needed.
 */
export function deactivate() {
    // Nothing to clean up yet
}
