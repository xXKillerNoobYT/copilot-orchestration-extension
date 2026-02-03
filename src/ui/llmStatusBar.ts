import * as vscode from 'vscode';

/**
 * LlmStatusBarManager shows a simple spinner while LLM calls run.
 *
 * Beginner explanation: The status bar is the bottom bar in VS Code.
 * We show a spinning icon so you know the AI is working.
 */
class LlmStatusBarManager {
  private refCount = 0;
  private hideTimeout: NodeJS.Timeout | null = null;

  /**
   * Start showing the spinner (shared across all LLM calls).
   */
  start(): void {
    this.cancelHide();
    this.refCount += 1;

    if (this.refCount === 1) {
      vscode.window.setStatusBarMessage('$(sync~spin) LLM running…');
    }
  }

  /**
   * Stop showing the spinner if no LLM calls are running.
   * Uses a short delay to avoid flicker on quick calls.
   */
  end(): void {
    this.refCount = Math.max(0, this.refCount - 1);

    if (this.refCount === 0) {
      this.hideTimeout = setTimeout(() => {
        vscode.window.setStatusBarMessage('');
        this.hideTimeout = null;
      }, 500);
    }
  }

  /**
   * Cancel a pending hide if a new LLM call starts quickly.
   */
  cancelHide(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }
}

// Shared singleton instance used across the extension.
export const llmStatusBar = new LlmStatusBarManager();
