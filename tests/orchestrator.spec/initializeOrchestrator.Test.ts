// ./orchestrator.Test.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import { initializeOrchestrator } from '../../src/services/orchestrator';
import { OrchestratorService } from '../../src/services/orchestrator';
import { logInfo, logWarn } from '../../src/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
    })),
  },
  EventEmitter: jest.fn(() => ({
    event: jest.fn(),
    fire: jest.fn(),
  })),
}));

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('initializeOrchestrator', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    context = {
      extensionPath: '/mock/extension/path',
    } as unknown as vscode.ExtensionContext;

    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should initialize orchestrator with default timeout if config file does not exist', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const orchestrator = await initializeOrchestrator(context);

    expect(orchestrator).toBeInstanceOf(OrchestratorService);
    expect(logWarn).toHaveBeenCalledWith('Failed to read orchestrator config: Error: ENOENT');
    expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
  });

  /** @aiContributed-2026-02-04 */
    it('should initialize orchestrator with timeout from config file', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ orchestrator: { taskTimeoutSeconds: 60 } })
    );

    const orchestrator = await initializeOrchestrator(context);

    expect(orchestrator).toBeInstanceOf(OrchestratorService);
    expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 60s');
  });

  /** @aiContributed-2026-02-04 */
    it('should fallback to default timeout if config value is invalid', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ orchestrator: { taskTimeoutSeconds: -10 } })
    );

    const orchestrator = await initializeOrchestrator(context);

    expect(orchestrator).toBeInstanceOf(OrchestratorService);
    expect(logWarn).toHaveBeenCalledWith(
      'Invalid taskTimeoutSeconds: -10. Must be > 0. Using default 30s'
    );
    expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
  });

  /** @aiContributed-2026-02-04 */
    it('should log a warning if orchestrator is already initialized', async () => {
    await initializeOrchestrator(context);
    await initializeOrchestrator(context);

    expect(logWarn).toHaveBeenCalledWith('Orchestrator already initialized');
  });
});