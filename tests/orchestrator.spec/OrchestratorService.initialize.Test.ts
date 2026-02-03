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
        .spyOn(orchestrator as unknown as { loadTasksFromTickets: () => Promise<void> }, 'loadTasksFromTickets')
        .mockResolvedValue();

      await orchestrator.initialize(mockContext);

      expect(loadTasksFromTicketsSpy).toHaveBeenCalled();
    });
  });
});