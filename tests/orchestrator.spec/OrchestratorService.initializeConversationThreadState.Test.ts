// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { listTickets } from '../../src/services/ticketDb';
import { logError } from '../../src/logger';

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    listTickets: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logError: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('OrchestratorService - initializeConversationThreadState', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    orchestrator.conversationThreadLengths = new Map<string, number>();
  });

  /** @aiContributed-2026-02-04 */
  it('should populate conversationThreadLengths with thread lengths from tickets', async () => {
    const mockTickets = [
      { id: '1', thread: [{}, {}, {}] },
      { id: '2', thread: [{}] },
      { id: '3', thread: [] },
    ];
    (listTickets as jest.Mock).mockResolvedValue(mockTickets);

    await orchestrator.initializeConversationThreadState();

    expect(orchestrator.conversationThreadLengths.get('1')).toBe(3);
    expect(orchestrator.conversationThreadLengths.get('2')).toBe(1);
    expect(orchestrator.conversationThreadLengths.get('3')).toBe(0);
  });

  /** @aiContributed-2026-02-04 */
  it('should handle tickets with undefined threads', async () => {
    const mockTickets = [
      { id: '1', thread: undefined },
      { id: '2', thread: null },
    ];
    (listTickets as jest.Mock).mockResolvedValue(mockTickets);

    await orchestrator.initializeConversationThreadState();

    expect(orchestrator.conversationThreadLengths.get('1')).toBe(0);
    expect(orchestrator.conversationThreadLengths.get('2')).toBe(0);
  });

  /** @aiContributed-2026-02-04 */
  it('should log an error if listTickets throws', async () => {
    const mockError = new Error('Database error');
    (listTickets as jest.Mock).mockRejectedValue(mockError);

    await orchestrator.initializeConversationThreadState();

    expect(logError).toHaveBeenCalledWith(
      'Failed to initialize conversation thread state: Database error'
    );
  });

  /** @aiContributed-2026-02-04 */
  it('should handle non-Error exceptions gracefully', async () => {
    (listTickets as jest.Mock).mockRejectedValue('Unknown error');

    await orchestrator.initializeConversationThreadState();

    expect(logError).toHaveBeenCalledWith(
      'Failed to initialize conversation thread state: Unknown error'
    );
  });
});