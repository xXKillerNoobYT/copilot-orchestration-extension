import * as vscode from 'vscode';
import { llmStatusBar } from '../../src/ui/llmStatusBar';

describe('LlmStatusBarManager', () => {
    const setStatusBarMessage = vscode.window.setStatusBarMessage as jest.Mock;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        (llmStatusBar as any).cancelHide();
        (llmStatusBar as any).refCount = 0;
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    it('shows spinner on first start and hides after debounce', () => {
        llmStatusBar.start();

        expect(setStatusBarMessage).toHaveBeenCalledWith('$(sync~spin) LLM running…');

        llmStatusBar.end();

        expect(setStatusBarMessage).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(500);
        expect(setStatusBarMessage).toHaveBeenCalledWith('');
    });

    it('keeps spinner for concurrent calls', () => {
        llmStatusBar.start();
        llmStatusBar.start();

        llmStatusBar.end();
        jest.advanceTimersByTime(500);

        expect(setStatusBarMessage).toHaveBeenCalledTimes(1);
        expect(setStatusBarMessage).toHaveBeenCalledWith('$(sync~spin) LLM running…');

        llmStatusBar.end();
        jest.advanceTimersByTime(500);

        expect(setStatusBarMessage).toHaveBeenCalledWith('');
    });

    it('cancels pending hide when a new call starts', () => {
        llmStatusBar.start();
        llmStatusBar.end();

        llmStatusBar.start();
        jest.advanceTimersByTime(500);

        expect(setStatusBarMessage).not.toHaveBeenCalledWith('');
    });
});
