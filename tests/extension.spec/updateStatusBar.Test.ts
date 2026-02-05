// ./extension.Test.ts
import * as vscode from 'vscode';
import { updateStatusBar } from '../../src/extension';
import { Logger } from '../../../utils/logger';

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  StatusBarAlignment: { Right: 1 },
  window: {
    createStatusBarItem: jest.fn(() => ({
      text: '',
      tooltip: '',
      show: jest.fn(),
    })),
  },
}));

jest.mock('../../../utils/logger', () => ({
  ...jest.requireActual('../../../utils/logger'),
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-04 */
describe('updateStatusBar', () => {
  let statusBarItem: vscode.StatusBarItem;

  beforeEach(() => {
    statusBarItem = vscode.window.createStatusBarItem();
    (global as unknown as { statusBarItem: vscode.StatusBarItem }).statusBarItem = statusBarItem;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should update the status bar text and tooltip when both are provided', async () => {
    await updateStatusBar('Planning...', 'Currently planning tasks');
    expect(statusBarItem.text).toBe('Planning...');
    expect(statusBarItem.tooltip).toBe('Currently planning tasks');
  });

  /** @aiContributed-2026-02-04 */
    it('should update only the status bar text when tooltip is not provided', async () => {
    await updateStatusBar('Ready');
    expect(statusBarItem.text).toBe('Ready');
    expect(statusBarItem.tooltip).toBe('');
  });

  /** @aiContributed-2026-02-04 */
    it('should not throw an error if statusBarItem is null', async () => {
    (global as unknown as { statusBarItem: vscode.StatusBarItem | null }).statusBarItem = null;
    await expect(updateStatusBar('Verifying...')).resolves.not.toThrow();
  });

  /** @aiContributed-2026-02-04 */
    it('should not update tooltip if it is not provided', async () => {
    statusBarItem.tooltip = 'Existing tooltip';
    await updateStatusBar('Updated Text');
    expect(statusBarItem.text).toBe('Updated Text');
    expect(statusBarItem.tooltip).toBe('Existing tooltip');
  });

  /** @aiContributed-2026-02-04 */
    it('should not update the status bar if text is empty', async () => {
    await updateStatusBar('');
    expect(statusBarItem.text).toBe('');
    expect(statusBarItem.tooltip).toBe('');
  });

  /** @aiContributed-2026-02-04 */
    it('should log debug messages for updates', async () => {
    await updateStatusBar('Done', 'All tasks completed');
    expect(Logger.debug).toHaveBeenCalledWith('Status bar updated: Done');
    expect(Logger.debug).toHaveBeenCalledWith('Tooltip updated: All tasks completed');
  });

  /** @aiContributed-2026-02-04 */
    it('should not update the status bar if both text and tooltip are undefined', async () => {
    await updateStatusBar(undefined as unknown as string, undefined);
    expect(statusBarItem.text).toBe('');
    expect(statusBarItem.tooltip).toBe('');
  });

  /** @aiContributed-2026-02-04 */
    it('should handle updates when only tooltip is provided', async () => {
    await updateStatusBar('', 'Tooltip only');
    expect(statusBarItem.text).toBe('');
    expect(statusBarItem.tooltip).toBe('Tooltip only');
  });

  /** @aiContributed-2026-02-04 */
    it('should show the status bar item if it is hidden', async () => {
    const showSpy = jest.spyOn(statusBarItem, 'show');
    await updateStatusBar('Visible', 'Tooltip visible');
    expect(showSpy).toHaveBeenCalled();
  });
});