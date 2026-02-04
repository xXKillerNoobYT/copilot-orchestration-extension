// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import * as vscode from 'vscode';
import { listTickets, updateTicket } from '../../src/services/ticketDb';
import { logInfo, logError } from '../../src/logger';

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  workspace: {
    getConfiguration: jest.fn(),
  },
}));

jest.mock('../../src/services/ticketDb', () => ({
  ...jest.requireActual('../../src/services/ticketDb'),
  listTickets: jest.fn(),
  updateTicket: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  ...jest.requireActual('../../src/logger'),
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService', () => {
  let orchestratorService: OrchestratorService;

  beforeEach(() => {
    orchestratorService = new OrchestratorService();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  describe('handleManualModeTicketChange', () => {
    /** @aiContributed-2026-02-03 */
    it('should return early if autoProcessTickets is enabled', async () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue(true),
      });

      await (orchestratorService as unknown as { handleManualModeTicketChange: () => Promise<void> }).handleManualModeTicketChange();

      expect(listTickets).not.toHaveBeenCalled();
      expect(updateTicket).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should return early if there are no tickets', async () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue(false),
      });
      (listTickets as jest.Mock).mockResolvedValue([]);

      await (orchestratorService as unknown as { handleManualModeTicketChange: () => Promise<void> }).handleManualModeTicketChange();

      expect(listTickets).toHaveBeenCalled();
      expect(updateTicket).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should return early if the latest ticket is not of type "ai_to_human" or status is not "open"', async () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue(false),
      });
      (listTickets as jest.Mock).mockResolvedValue([
        { id: '1', type: 'human_to_ai', status: 'closed' },
      ]);

      await (orchestratorService as unknown as { handleManualModeTicketChange: () => Promise<void> }).handleManualModeTicketChange();

      expect(listTickets).toHaveBeenCalled();
      expect(updateTicket).not.toHaveBeenCalled();
    });

    /** @aiContributed-2026-02-03 */
    it('should update the ticket status to "pending" for valid tickets', async () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue(false),
      });
      (listTickets as jest.Mock).mockResolvedValue([
        { id: '1', type: 'ai_to_human', status: 'open' },
      ]);
      (updateTicket as jest.Mock).mockResolvedValue(null);

      await (orchestratorService as unknown as { handleManualModeTicketChange: () => Promise<void> }).handleManualModeTicketChange();

      expect(listTickets).toHaveBeenCalled();
      expect(updateTicket).toHaveBeenCalledWith('1', { status: 'pending' });
      expect(logInfo).toHaveBeenCalledWith(
        'Manual mode: Ticket pending approval (1)'
      );
    });

    /** @aiContributed-2026-02-03 */
    it('should log an error if an exception occurs', async () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockImplementation(() => {
        throw new Error('Configuration error');
      });

      await (orchestratorService as unknown as { handleManualModeTicketChange: () => Promise<void> }).handleManualModeTicketChange();

      expect(logError).toHaveBeenCalledWith(
        'Manual mode pending update failed: Configuration error'
      );
    });
  });
});