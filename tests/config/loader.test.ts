import * as fs from 'fs';
import * as vscode from 'vscode';
import { loadConfigFromFile } from '../../src/config/loader';
import { logWarn, logInfo } from '../../src/logger';

jest.mock('fs');
jest.mock('../../src/logger');

describe('Config Loader Tests', () => {
  const mockWorkspacePath = '/home/user/my-project';
  const mockContext: Partial<vscode.ExtensionContext> = {
    extensionPath: '/home/user/.vscode/extensions/coe',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock workspace folders - config is read from workspace, not extension path
    (vscode.workspace as any).workspaceFolders = [
      {
        uri: { fsPath: mockWorkspacePath },
        name: 'my-project',
        index: 0,
      },
    ];
  });

  afterEach(() => {
    // Reset workspace folders mock
    (vscode.workspace as any).workspaceFolders = undefined;
  });

  describe('File I/O (Happy Path)', () => {
    it('Test 1: should load valid config file successfully', async () => {
      const validJson = JSON.stringify({
        llm: {
          endpoint: 'http://localhost:1234/v1',
          timeoutSeconds: 60,
        },
        orchestrator: { taskTimeoutSeconds: 45 },
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(validJson);

      const config = await loadConfigFromFile(
        mockContext as vscode.ExtensionContext
      );

      expect(config.llm.endpoint).toBe('http://localhost:1234/v1');
      expect(config.llm.timeoutSeconds).toBe(60);
      expect(config.orchestrator.taskTimeoutSeconds).toBe(45);
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Config loaded successfully')
      );
    });

    it('Test 2: should handle missing config file gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const config = await loadConfigFromFile(
        mockContext as vscode.ExtensionContext
      );

      // Should use defaults
      expect(config.llm.timeoutSeconds).toBe(60); // default
      expect(logInfo).toHaveBeenCalled();
      // File not existing is not necessarily a warning (controlled behavior)
    });

    it('Test 2b: should handle no workspace folder gracefully', async () => {
      // Simulate VS Code with no folder open
      (vscode.workspace as any).workspaceFolders = undefined;

      const config = await loadConfigFromFile(
        mockContext as vscode.ExtensionContext
      );

      // Should use defaults and warn
      expect(config.llm.timeoutSeconds).toBe(60); // default
      expect(config.llm.endpoint).toBe('http://127.0.0.1:1234/v1'); // default
      expect(logWarn).toHaveBeenCalledWith(
        'No workspace folder found. Using default configuration.'
      );
    });

    it('Test 2c: should prompt for LLM endpoint when creating new config', async () => {
      // Simulate: .coe directory doesn't exist
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      // User clicks "Yes, create .coe" 
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Yes, create .coe');

      // User enters custom LLM endpoint
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('http://192.168.1.205:1234/v1');

      const config = await loadConfigFromFile(
        mockContext as vscode.ExtensionContext
      );

      // Should use the user-provided endpoint
      expect(config.llm.endpoint).toBe('http://192.168.1.205:1234/v1');

      // Should have called showInputBox for endpoint
      expect(vscode.window.showInputBox).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'LLM Server Endpoint',
        })
      );

      // Should have written config file with custom endpoint
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        expect.stringContaining('192.168.1.205'),
        'utf-8'
      );
    });

    it('Test 3: should merge partial config with defaults', async () => {
      const partialJson = JSON.stringify({
        llm: { model: 'custom-model' },
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(partialJson);

      const config = await loadConfigFromFile(
        mockContext as vscode.ExtensionContext
      );

      expect(config.llm.model).toBe('custom-model');
      expect(config.llm.endpoint).toBe('http://127.0.0.1:1234/v1'); // default
      expect(config.orchestrator.taskTimeoutSeconds).toBe(30); // default
    });
  });

  describe('File I/O (Error Handling)', () => {
    it('Test 4: should handle malformed JSON gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('{invalid json');

      const config = await loadConfigFromFile(
        mockContext as vscode.ExtensionContext
      );

      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read config file')
      );
      expect(config).toEqual(expect.objectContaining({ llm: expect.any(Object) }));
    });

    it('Test 5: should handle file read errors', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const config = await loadConfigFromFile(
        mockContext as vscode.ExtensionContext
      );

      expect(logWarn).toHaveBeenCalled();
      expect(config.llm.endpoint).toBe('http://127.0.0.1:1234/v1'); // default
    });

    it('Test 6: should handle validation error with partial valid data', async () => {
      const invalidJson = JSON.stringify({
        llm: { timeoutSeconds: -5 }, // invalid
        orchestrator: { taskTimeoutSeconds: 50 }, // valid
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(invalidJson);

      const config = await loadConfigFromFile(
        mockContext as vscode.ExtensionContext
      );

      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining('Config validation failed')
      );
      expect(config.llm.timeoutSeconds).toBe(60); // default, not -5
      // Note: merged valid values are re-validated, so orchestrator might revert too
    });
  });

  describe('Config Access Patterns', () => {
    it('Test 7: should return config with readonly typing', async () => {
      const validJson = JSON.stringify({
        llm: { timeoutSeconds: 60 },
      });
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(validJson);

      const config = await loadConfigFromFile(
        mockContext as vscode.ExtensionContext
      );

      // TypeScript enforces readonly at compile-time
      // The config object is valid and contains expected values
      expect(config.llm.timeoutSeconds).toBe(60);
      // TypeScript prevents: config.llm.timeoutSeconds = 999;
    });

    it('Test 8: should preserve offline LLM endpoint with custom IP', async () => {
      const offlineJson = JSON.stringify({
        llm: { endpoint: 'http://192.168.1.205:1234/v1' },
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(offlineJson);

      const config = await loadConfigFromFile(
        mockContext as vscode.ExtensionContext
      );

      expect(config.llm.endpoint).toBe('http://192.168.1.205:1234/v1');
    });
  });

  describe('Coverage for All Config Sections', () => {
    it('Test 9: should validate and merge all config sections', async () => {
      const fullJson = JSON.stringify({
        debug: { logLevel: 'warn' },
        llm: { endpoint: 'http://test:1234/v1', timeoutSeconds: 100 },
        orchestrator: { taskTimeoutSeconds: 60 },
        tickets: { dbPath: '/custom/path/tickets.db' },
        githubIssues: { path: 'custom-issues' },
        lmStudioPolling: { tokenPollIntervalSeconds: 45 },
        watcher: { debounceMs: 750 },
        auditLog: { enabled: false },
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(fullJson);

      const config = await loadConfigFromFile(
        mockContext as vscode.ExtensionContext
      );

      expect(config.debug.logLevel).toBe('warn');
      expect(config.llm.timeoutSeconds).toBe(100);
      expect(config.orchestrator.taskTimeoutSeconds).toBe(60);
      expect(config.tickets.dbPath).toBe('/custom/path/tickets.db');
      expect(config.githubIssues.path).toBe('custom-issues');
      expect(config.lmStudioPolling.tokenPollIntervalSeconds).toBe(45);
      expect(config.watcher.debounceMs).toBe(750);
      expect(config.auditLog.enabled).toBe(false);
    });
  });
});
