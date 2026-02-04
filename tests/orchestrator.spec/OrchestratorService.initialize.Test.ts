// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { logWarn, logInfo } from '../../src/logger';

jest.mock('fs');
jest.mock('../../src/logger');
jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    listTickets: jest.fn().mockResolvedValue([]),
}));

/** @aiContributed-2026-02-03 */
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

  /** @aiContributed-2026-02-03 */
  describe('initialize', () => {
    /** @aiContributed-2026-02-03 */
    it('should initialize with default timeout if config file does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await orchestrator.initialize(mockContext);

      expect(orchestrator['taskTimeoutSeconds']).toBe(30);
      expect(logWarn).not.toHaveBeenCalled();
      expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
    });

    /** @aiContributed-2026-02-03 */
    it('should initialize with orchestrator.taskTimeoutSeconds if present in config', async () => {
      const mockConfig = {
        orchestrator: { taskTimeoutSeconds: 45 },
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      await orchestrator.initialize(mockContext);

      expect(orchestrator['taskTimeoutSeconds']).toBe(45);
      expect(logWarn).not.toHaveBeenCalled();
      expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 45s');
    });

    /** @aiContributed-2026-02-03 */
    it('should fallback to llm.timeoutSeconds if orchestrator.taskTimeoutSeconds is not present', async () => {
      const mockConfig = {
        llm: { timeoutSeconds: 60 },
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      await orchestrator.initialize(mockContext);

      expect(orchestrator['taskTimeoutSeconds']).toBe(60);
      expect(logWarn).not.toHaveBeenCalled();
      expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 60s');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle invalid orchestrator.taskTimeoutSeconds gracefully', async () => {
      const mockConfig = {
        orchestrator: { taskTimeoutSeconds: -10 },
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      await orchestrator.initialize(mockContext);

      expect(orchestrator['taskTimeoutSeconds']).toBe(30);
      expect(logWarn).toHaveBeenCalledWith('Invalid taskTimeoutSeconds: -10. Must be > 0. Using default 30s');
      expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle JSON parsing errors gracefully', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      await orchestrator.initialize(mockContext);

      expect(orchestrator['taskTimeoutSeconds']).toBe(30);
      expect(logWarn).toHaveBeenCalledWith('Failed to read orchestrator config: Error: Invalid JSON');
      expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
    });

    /** @aiContributed-2026-02-03 */
    it('should call loadTasksFromTickets during initialization', async () => {
      const loadTasksFromTicketsSpy = jest
        .spyOn(orchestrator as OrchestratorService, 'loadTasksFromTickets')
        .mockResolvedValue();

      await orchestrator.initialize(mockContext);

      expect(loadTasksFromTicketsSpy).toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle errors during loadTasksFromTickets gracefully', async () => {
      const loadTasksFromTicketsSpy = jest
        .spyOn(orchestrator as OrchestratorService, 'loadTasksFromTickets')
        .mockRejectedValue(new Error('Failed to load tasks'));

      await orchestrator.initialize(mockContext);

      expect(loadTasksFromTicketsSpy).toHaveBeenCalled();
      expect(logWarn).toHaveBeenCalledWith('Failed to read orchestrator config: Error: Failed to load tasks');
    });

    /** @aiContributed-2026-02-03 */
    it('should call initializeConversationThreadState and registerConversationThreadListener', async () => {
      const initializeConversationThreadStateSpy = jest
        .spyOn(orchestrator as OrchestratorService, 'initializeConversationThreadState')
        .mockResolvedValue();
      const registerConversationThreadListenerSpy = jest
        .spyOn(orchestrator as OrchestratorService, 'registerConversationThreadListener')
        .mockImplementation();

      await orchestrator.initialize(mockContext);

      expect(initializeConversationThreadStateSpy).toHaveBeenCalled();
      expect(registerConversationThreadListenerSpy).toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should call registerManualModeListener during initialization', async () => {
      const registerManualModeListenerSpy = jest
        .spyOn(orchestrator as OrchestratorService, 'registerManualModeListener')
        .mockImplementation();

      await orchestrator.initialize(mockContext);

      expect(registerManualModeListenerSpy).toHaveBeenCalled();
    });
  });
});