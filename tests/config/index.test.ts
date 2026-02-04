import * as vscode from 'vscode';
import {
  initializeConfig,
  getConfigInstance,
  resetConfigForTests,
} from '../../src/config/index';
import * as loader from '../../src/config/loader';
import { logError } from '../../src/logger';

jest.mock('../../src/config/loader');
jest.mock('../../src/logger');

describe('Config Singleton Service Tests', () => {
  const mockContext: Partial<vscode.ExtensionContext> = {
    extensionPath: '/test/path',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetConfigForTests();
  });

  describe('Initialization', () => {
    it('Test 1: should initialize config on first call', async () => {
      const mockConfig = {
        debug: { logLevel: 'info' },
        llm: {
          endpoint: 'http://test:1234/v1',
          model: 'test',
          timeoutSeconds: 60,
          maxTokens: 1024,
          startupTimeoutSeconds: 300,
        },
        orchestrator: { taskTimeoutSeconds: 30 },
        tickets: { dbPath: './.coe/tickets.db' },
        githubIssues: { path: 'github-issues' },
        lmStudioPolling: { tokenPollIntervalSeconds: 30 },
        watcher: { debounceMs: 500 },
        auditLog: { enabled: true },
      } as any;

      (loader.loadConfigFromFile as jest.Mock).mockResolvedValue(mockConfig);

      await initializeConfig(mockContext as vscode.ExtensionContext);

      expect(loader.loadConfigFromFile).toHaveBeenCalledWith(mockContext);
      expect(getConfigInstance()).toEqual(mockConfig);
    });

    it('Test 2: should prevent re-initialization (singleton contract)', async () => {
      const mockConfig = {
        debug: { logLevel: 'info' },
        llm: {
          endpoint: 'http://test:1234/v1',
          model: 'test',
          timeoutSeconds: 60,
          maxTokens: 1024,
          startupTimeoutSeconds: 300,
        },
        orchestrator: { taskTimeoutSeconds: 30 },
        tickets: { dbPath: './.coe/tickets.db' },
        githubIssues: { path: 'github-issues' },
        lmStudioPolling: { tokenPollIntervalSeconds: 30 },
        watcher: { debounceMs: 500 },
        auditLog: { enabled: true },
      } as any;
      (loader.loadConfigFromFile as jest.Mock).mockResolvedValue(mockConfig);

      await initializeConfig(mockContext as vscode.ExtensionContext);

      // Attempt second init should throw
      await expect(
        initializeConfig(mockContext as vscode.ExtensionContext)
      ).rejects.toThrow('Config already initialized');
    });

    it('Test 3: should propagate loader errors', async () => {
      (loader.loadConfigFromFile as jest.Mock).mockRejectedValue(
        new Error('Failed to load')
      );

      await expect(
        initializeConfig(mockContext as vscode.ExtensionContext)
      ).rejects.toThrow('Failed to load');

      expect(logError).toHaveBeenCalled();
    });
  });

  describe('Access & Retrieval', () => {
    it('Test 4: should throw if getConfigInstance called before init', () => {
      resetConfigForTests(); // Ensure not initialized

      expect(() => getConfigInstance()).toThrow('Config not initialized');
    });

    it('Test 5: should return config instance after init', async () => {
      const mockConfig = {
        debug: { logLevel: 'info' },
        llm: {
          endpoint: 'http://test:1234/v1',
          model: 'test',
          timeoutSeconds: 60,
          maxTokens: 1024,
          startupTimeoutSeconds: 300,
        },
        orchestrator: { taskTimeoutSeconds: 30 },
        tickets: { dbPath: './.coe/tickets.db' },
        githubIssues: { path: 'github-issues' },
        lmStudioPolling: { tokenPollIntervalSeconds: 30 },
        watcher: { debounceMs: 500 },
        auditLog: { enabled: true },
      } as any;
      (loader.loadConfigFromFile as jest.Mock).mockResolvedValue(mockConfig);

      await initializeConfig(mockContext as vscode.ExtensionContext);

      const instance = getConfigInstance();
      expect(instance).toBe(mockConfig);
    });

    it('Test 6: should return same instance on multiple calls (singleton)', async () => {
      const mockConfig = {
        debug: { logLevel: 'info' },
        llm: {
          endpoint: 'http://test:1234/v1',
          model: 'test',
          timeoutSeconds: 60,
          maxTokens: 1024,
          startupTimeoutSeconds: 300,
        },
        orchestrator: { taskTimeoutSeconds: 30 },
        tickets: { dbPath: './.coe/tickets.db' },
        githubIssues: { path: 'github-issues' },
        lmStudioPolling: { tokenPollIntervalSeconds: 30 },
        watcher: { debounceMs: 500 },
        auditLog: { enabled: true },
      } as any;
      (loader.loadConfigFromFile as jest.Mock).mockResolvedValue(mockConfig);

      await initializeConfig(mockContext as vscode.ExtensionContext);

      const instance1 = getConfigInstance();
      const instance2 = getConfigInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Test Reset for Isolation', () => {
    it('Test 7: should allow re-initialization after reset', async () => {
      const mockConfig1 = {
        debug: { logLevel: 'info' },
        llm: {
          endpoint: 'http://test1:1234/v1',
          model: 'test',
          timeoutSeconds: 60,
          maxTokens: 1024,
          startupTimeoutSeconds: 300,
        },
        orchestrator: { taskTimeoutSeconds: 30 },
        tickets: { dbPath: './.coe/tickets.db' },
        githubIssues: { path: 'github-issues' },
        lmStudioPolling: { tokenPollIntervalSeconds: 30 },
        watcher: { debounceMs: 500 },
        auditLog: { enabled: true },
      } as any;
      const mockConfig2 = {
        debug: { logLevel: 'info' },
        llm: {
          endpoint: 'http://test2:1234/v1',
          model: 'test',
          timeoutSeconds: 60,
          maxTokens: 1024,
          startupTimeoutSeconds: 300,
        },
        orchestrator: { taskTimeoutSeconds: 30 },
        tickets: { dbPath: './.coe/tickets.db' },
        githubIssues: { path: 'github-issues' },
        lmStudioPolling: { tokenPollIntervalSeconds: 30 },
        watcher: { debounceMs: 500 },
        auditLog: { enabled: true },
      } as any;

      (loader.loadConfigFromFile as jest.Mock)
        .mockResolvedValueOnce(mockConfig1)
        .mockResolvedValueOnce(mockConfig2);

      await initializeConfig(mockContext as vscode.ExtensionContext);
      expect(getConfigInstance()).toBe(mockConfig1);

      resetConfigForTests();

      await initializeConfig(mockContext as vscode.ExtensionContext);
      expect(getConfigInstance()).toBe(mockConfig2);
    });
  });
});
