// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { onTicketChange } from '../../src/services/ticketDb';
import { logInfo, logError } from '../../src/logger';

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    onTicketChange: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
  logError: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('OrchestratorService - registerManualModeListener', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    orchestrator['handleManualModeTicketChange'] = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should register the manual mode listener and log success', () => {
    orchestrator['registerManualModeListener']();

    expect(onTicketChange).toHaveBeenCalledTimes(1);
    expect(onTicketChange).toHaveBeenCalledWith(expect.any(Function));
    expect(logInfo).toHaveBeenCalledWith('Manual mode listener registered');
  });

  /** @aiContributed-2026-02-03 */
    it('should handle errors during listener registration and log the error', () => {
    const errorMessage = 'Listener registration failed';
    (onTicketChange as jest.Mock).mockImplementationOnce(() => {
      throw new Error(errorMessage);
    });

    orchestrator['registerManualModeListener']();

    expect(onTicketChange).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      `Failed to register manual mode listener: ${errorMessage}`
    );
  });

  /** @aiContributed-2026-02-03 */
    it('should call handleManualModeTicketChange when the listener is triggered', () => {
    orchestrator['registerManualModeListener']();

    const listener = (onTicketChange as jest.Mock).mock.calls[0][0];
    listener();

    expect(orchestrator['handleManualModeTicketChange']).toHaveBeenCalledTimes(1);
  });
});