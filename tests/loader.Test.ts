import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { loadConfigFromFile } from '../../src/config/loader';
import { ConfigSchema, DEFAULT_CONFIG } from '../../src/config/schema';
import { logInfo, logWarn } from '../../src/logger';

jest.mock('fs');
jest.mock('path');
jest.mock('vscode');
jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
    logWarn: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('loadConfigFromFile', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = {
      extensionPath: '/mock/extension/path',
    } as unknown as vscode.ExtensionContext;

    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  it('should load and validate config from file successfully', async () => {
    const mockConfig = { debug: { enabled: true } };
    const mockConfigPath = '/mock/extension/path/.coe/config.json';

    (path.join as jest.Mock).mockReturnValue(mockConfigPath);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
    (ConfigSchema.parse as jest.Mock).mockImplementation((config) => config);

    const result = await loadConfigFromFile(mockContext);

    expect(path.join).toHaveBeenCalledWith(mockContext.extensionPath, '.coe', 'config.json');
    expect(fs.existsSync).toHaveBeenCalledWith(mockConfigPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
    expect(ConfigSchema.parse).toHaveBeenCalledWith(mockConfig);
    expect(logInfo).toHaveBeenCalledWith('Config loaded successfully. Using file configuration.');
    expect(result).toEqual(mockConfig);
  });

  /** @aiContributed-2026-02-04 */
  it('should return default config if file does not exist', async () => {
    const mockConfigPath = '/mock/extension/path/.coe/config.json';

    (path.join as jest.Mock).mockReturnValue(mockConfigPath);
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (ConfigSchema.parse as jest.Mock).mockReturnValue(DEFAULT_CONFIG);

    const result = await loadConfigFromFile(mockContext);

    expect(path.join).toHaveBeenCalledWith(mockContext.extensionPath, '.coe', 'config.json');
    expect(fs.existsSync).toHaveBeenCalledWith(mockConfigPath);
    expect(ConfigSchema.parse).toHaveBeenCalledWith({});
    expect(logInfo).toHaveBeenCalledWith('Config loaded successfully. Using default configuration.');
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  /** @aiContributed-2026-02-04 */
  it('should return default config if JSON parsing fails', async () => {
    const mockConfigPath = '/mock/extension/path/.coe/config.json';

    (path.join as jest.Mock).mockReturnValue(mockConfigPath);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid JSON');
    });
    (ConfigSchema.parse as jest.Mock).mockReturnValue(DEFAULT_CONFIG);

    const result = await loadConfigFromFile(mockContext);

    expect(path.join).toHaveBeenCalledWith(mockContext.extensionPath, '.coe', 'config.json');
    expect(fs.existsSync).toHaveBeenCalledWith(mockConfigPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
    expect(logWarn).toHaveBeenCalledWith(
      'Failed to read config file at .coe/config.json: Invalid JSON. Using defaults.'
    );
    expect(ConfigSchema.parse).toHaveBeenCalledWith({});
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  /** @aiContributed-2026-02-04 */
  it('should return default config if validation fails', async () => {
    const mockConfig = { invalidField: true };
    const mockConfigPath = '/mock/extension/path/.coe/config.json';

    (path.join as jest.Mock).mockReturnValue(mockConfigPath);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));
    (ConfigSchema.parse as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('Validation error');
      })
      .mockReturnValue(DEFAULT_CONFIG);

    const result = await loadConfigFromFile(mockContext);

    expect(path.join).toHaveBeenCalledWith(mockContext.extensionPath, '.coe', 'config.json');
    expect(fs.existsSync).toHaveBeenCalledWith(mockConfigPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
    expect(ConfigSchema.parse).toHaveBeenCalledTimes(2);
    expect(logWarn).toHaveBeenCalledWith(
      'Config validation failed: Validation error. Using defaults for invalid/missing fields.'
    );
    expect(result).toEqual(DEFAULT_CONFIG);
  });
});