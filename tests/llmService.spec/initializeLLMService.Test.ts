// ./llmService.Test.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import { initializeLLMService } from '../../src/services/llmService';
import { logInfo, logWarn, logError } from '../../src/logger';

jest.mock('fs');
jest.mock('../../src/logger');

/** @aiContributed-2026-02-04 */
describe('initializeLLMService', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = {
      extensionPath: '/mock/extension/path',
    } as unknown as vscode.ExtensionContext;

    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should initialize with default config if config file does not exist', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    await initializeLLMService(mockContext);

    expect(logWarn).toHaveBeenCalledWith(
      'Config file not found at /mock/extension/path/.coe/config.json. Using defaults.'
    );
    expect(logInfo).toHaveBeenCalledWith(
      'LLM service initialized: http://127.0.0.1:1234/v1 (model: ministral-3-14b-reasoning)'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should initialize with merged config if config file exists', async () => {
    const mockConfig = {
      llm: {
        endpoint: 'http://mock.endpoint',
        model: 'mock-model',
        timeoutSeconds: 30,
        maxTokens: 1024,
      },
    };
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

    await initializeLLMService(mockContext);

    expect(logInfo).toHaveBeenCalledWith(
      'LLM service initialized: http://mock.endpoint (model: mock-model)'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should use default values if config file is invalid', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid JSON');
    });

    await initializeLLMService(mockContext);

    expect(logWarn).toHaveBeenCalledWith(
      'Failed to read config file: Invalid JSON. Using defaults.'
    );
    expect(logInfo).toHaveBeenCalledWith(
      'LLM service initialized: http://127.0.0.1:1234/v1 (model: ministral-3-14b-reasoning)'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should validate and correct invalid timeoutSeconds', async () => {
    const mockConfig = {
      llm: {
        timeoutSeconds: -10,
      },
    };
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

    await initializeLLMService(mockContext);

    expect(logWarn).toHaveBeenCalledWith(
      'Invalid timeoutSeconds: -10, using default: 60'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should validate and correct invalid maxTokens', async () => {
    const mockConfig = {
      llm: {
        maxTokens: 0,
      },
    };
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

    await initializeLLMService(mockContext);

    expect(logWarn).toHaveBeenCalledWith(
      'Invalid maxTokens: 0, using default: 2048'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should validate and correct invalid startupTimeoutSeconds', async () => {
    const mockConfig = {
      llm: {
        startupTimeoutSeconds: -5,
      },
    };
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

    await initializeLLMService(mockContext);

    expect(logWarn).toHaveBeenCalledWith(
      'Invalid startupTimeoutSeconds: -5, using default: 300'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should throw an error if fetch is not supported', async () => {
    const originalFetch = global.fetch;
    // @ts-expect-error Node.js fetch is being deleted for testing purposes
    delete global.fetch;

    await expect(initializeLLMService(mockContext)).rejects.toThrow(
      'Node.js 18+ required for LLM integration. Please upgrade Node.js or install node-fetch as a polyfill.'
    );

    expect(logError).toHaveBeenCalledWith(
      'LLM service requires Node.js 18+ for native fetch support'
    );

    global.fetch = originalFetch;
  });

  /** @aiContributed-2026-02-04 */
    it('should log a warning if config file is missing required fields', async () => {
    const mockConfig = {
      llm: {
        endpoint: 'http://mock.endpoint',
      },
    };
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

    await initializeLLMService(mockContext);

    expect(logWarn).toHaveBeenCalledWith(
      'Invalid timeoutSeconds: undefined, using default: 60'
    );
    expect(logWarn).toHaveBeenCalledWith(
      'Invalid maxTokens: undefined, using default: 2048'
    );
    expect(logWarn).toHaveBeenCalledWith(
      'Invalid startupTimeoutSeconds: undefined, using default: 300'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should handle missing .coe directory gracefully', async () => {
    (fs.existsSync as jest.Mock).mockImplementation((path) => {
      if (path.includes('.coe')) return false;
      return true;
    });

    await initializeLLMService(mockContext);

    expect(logWarn).toHaveBeenCalledWith(
      'Config file not found at /mock/extension/path/.coe/config.json. Using defaults.'
    );
    expect(logInfo).toHaveBeenCalledWith(
      'LLM service initialized: http://127.0.0.1:1234/v1 (model: ministral-3-14b-reasoning)'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should log a warning if config file contains extra fields', async () => {
    const mockConfig = {
      llm: {
        endpoint: 'http://mock.endpoint',
        extraField: 'unexpected',
      },
    };
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

    await initializeLLMService(mockContext);

    expect(logWarn).toHaveBeenCalledWith(
      'Invalid timeoutSeconds: undefined, using default: 60'
    );
    expect(logWarn).toHaveBeenCalledWith(
      'Invalid maxTokens: undefined, using default: 2048'
    );
    expect(logWarn).toHaveBeenCalledWith(
      'Invalid startupTimeoutSeconds: undefined, using default: 300'
    );
  });
});