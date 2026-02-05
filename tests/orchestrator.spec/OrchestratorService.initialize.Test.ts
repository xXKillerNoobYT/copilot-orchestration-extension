// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { logWarn, logInfo } from '../../src/logger';

jest.mock('fs');
jest.mock('../../src/logger');

/** @aiContributed-2026-02-04 */
describe('OrchestratorService', () => {
  let orchestrator: OrchestratorService;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    mockContext = {
      extensionPath: '/mock/extension/path',
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
  describe('initialize', () => {
    /** @aiContributed-2026-02-04 */
    it('should initialize with default timeout when config file does not exist', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      await orchestrator.initialize(mockContext);

      expect(orchestrator['taskTimeoutSeconds']).toBe(30);
      expect(logWarn).not.toHaveBeenCalled();
      expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
    });

    /** @aiContributed-2026-02-04 */
    it('should initialize with timeout from orchestrator.taskTimeoutSeconds if valid', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ orchestrator: { taskTimeoutSeconds: 45 } })
      );

      await orchestrator.initialize(mockContext);

      expect(orchestrator['taskTimeoutSeconds']).toBe(45);
      expect(logWarn).not.toHaveBeenCalled();
      expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 45s');
    });

    /** @aiContributed-2026-02-04 */
    it('should fallback to llm.timeoutSeconds if orchestrator.taskTimeoutSeconds is invalid', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ orchestrator: { taskTimeoutSeconds: -10 }, llm: { timeoutSeconds: 50 } })
      );

      await orchestrator.initialize(mockContext);

      expect(orchestrator['taskTimeoutSeconds']).toBe(50);
      expect(logWarn).toHaveBeenCalledWith('Invalid taskTimeoutSeconds: -10. Must be > 0. Using default 30s');
      expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 50s');
    });

    /** @aiContributed-2026-02-04 */
    it('should use default timeout if both orchestrator and llm timeouts are invalid', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ orchestrator: { taskTimeoutSeconds: 'invalid' }, llm: { timeoutSeconds: -5 } })
      );

      await orchestrator.initialize(mockContext);

      expect(orchestrator['taskTimeoutSeconds']).toBe(30);
      expect(logWarn).toHaveBeenCalledWith('Invalid taskTimeoutSeconds: invalid. Must be > 0. Using default 30s');
      expect(logWarn).toHaveBeenCalledWith('Invalid llm.timeoutSeconds: -5. Must be > 0. Using default 30s');
      expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
    });

    /** @aiContributed-2026-02-04 */
    it('should handle errors when reading the config file', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('File read error');
      });

      await orchestrator.initialize(mockContext);

      expect(orchestrator['taskTimeoutSeconds']).toBe(30);
      expect(logWarn).toHaveBeenCalledWith('Failed to read orchestrator config: Error: File read error');
      expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
    });

    /** @aiContributed-2026-02-04 */
    it('should call all initialization steps', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const loadTasksFromTicketsSpy = jest.spyOn(orchestrator as unknown as { loadTasksFromTickets: () => Promise<void> }, 'loadTasksFromTickets').mockResolvedValue(undefined);
      const registerQueueRefreshListenerSpy = jest.spyOn(orchestrator as unknown as { registerQueueRefreshListener: () => void }, 'registerQueueRefreshListener').mockImplementation();
      const registerManualModeListenerSpy = jest.spyOn(orchestrator as unknown as { registerManualModeListener: () => void }, 'registerManualModeListener').mockImplementation();
      const initializeConversationThreadStateSpy = jest.spyOn(orchestrator as unknown as { initializeConversationThreadState: () => Promise<void> }, 'initializeConversationThreadState').mockResolvedValue(undefined);
      const registerConversationThreadListenerSpy = jest.spyOn(orchestrator as unknown as { registerConversationThreadListener: () => void }, 'registerConversationThreadListener').mockImplementation();

      await orchestrator.initialize(mockContext);

      expect(loadTasksFromTicketsSpy).toHaveBeenCalled();
      expect(registerQueueRefreshListenerSpy).toHaveBeenCalled();
      expect(registerManualModeListenerSpy).toHaveBeenCalled();
      expect(initializeConversationThreadStateSpy).toHaveBeenCalled();
      expect(registerConversationThreadListenerSpy).toHaveBeenCalled();
    });
  });
});