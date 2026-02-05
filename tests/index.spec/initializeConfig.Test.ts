// ./index.Test.ts
import * as vscode from 'vscode';
import { initializeConfig, resetConfigForTests, getConfigInstance } from '../../src/config/index';
import { loadConfigFromFile } from '../../src/config/loader';
import { logError } from '../../src/logger';

jest.mock('../../src/config/loader', () => ({
    ...jest.requireActual('../../src/config/loader'),
    loadConfigFromFile: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('initializeConfig', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = {} as vscode.ExtensionContext;
    resetConfigForTests();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should initialize config successfully', async () => {
    const mockConfig = { debug: { logLevel: 'info' } };
    (loadConfigFromFile as jest.Mock).mockResolvedValue(mockConfig);

    await expect(initializeConfig(mockContext)).resolves.not.toThrow();
    expect(loadConfigFromFile).toHaveBeenCalledWith(mockContext);
    expect(getConfigInstance()).toEqual(mockConfig);
  });

  /** @aiContributed-2026-02-04 */
    it('should throw an error if initializeConfig is called multiple times', async () => {
    const mockConfig = { debug: { logLevel: 'info' } };
    (loadConfigFromFile as jest.Mock).mockResolvedValue(mockConfig);

    await initializeConfig(mockContext);

    await expect(initializeConfig(mockContext)).rejects.toThrow(
      'Config already initialized. Do not call initializeConfig multiple times.'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should log and rethrow error if config loading fails', async () => {
    const mockError = new Error('Failed to load config');
    (loadConfigFromFile as jest.Mock).mockRejectedValue(mockError);

    await expect(initializeConfig(mockContext)).rejects.toThrow(mockError);
    expect(logError).toHaveBeenCalledWith('Failed to initialize config: Failed to load config');
  });

  /** @aiContributed-2026-02-04 */
    it('should handle non-Error objects thrown during config loading', async () => {
    const mockError = 'Unexpected error';
    (loadConfigFromFile as jest.Mock).mockRejectedValue(mockError);

    await expect(initializeConfig(mockContext)).rejects.toThrow(mockError);
    expect(logError).toHaveBeenCalledWith('Failed to initialize config: Unexpected error');
  });
});