// ./index.Test.ts
import * as vscode from 'vscode';
import { getConfigInstance, initializeConfig, resetConfigForTests } from '../../src/config/index';
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
describe('getConfigInstance', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    resetConfigForTests();
    mockContext = {} as vscode.ExtensionContext;
  });

  /** @aiContributed-2026-02-04 */
    it('should return the config instance after initialization', async () => {
    const mockConfig = { key: 'value' };
    (loadConfigFromFile as jest.Mock).mockResolvedValue(mockConfig);

    await initializeConfig(mockContext);
    const config = getConfigInstance();

    expect(config).toEqual(mockConfig);
  });

  /** @aiContributed-2026-02-04 */
    it('should throw an error if called before initialization', () => {
    expect(() => getConfigInstance()).toThrowError(
      'Config not initialized. Call initializeConfig(context) during extension activation first.'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should throw an error if initializeConfig is called multiple times', async () => {
    const mockConfig = { key: 'value' };
    (loadConfigFromFile as jest.Mock).mockResolvedValue(mockConfig);

    await initializeConfig(mockContext);

    await expect(initializeConfig(mockContext)).rejects.toThrowError(
      'Config already initialized. Do not call initializeConfig multiple times.'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should log an error and rethrow if config loading fails', async () => {
    const mockError = new Error('Failed to load config');
    (loadConfigFromFile as jest.Mock).mockRejectedValue(mockError);

    await expect(initializeConfig(mockContext)).rejects.toThrowError('Failed to load config');
    expect(logError).toHaveBeenCalledWith('Failed to initialize config: Failed to load config');
  });
});