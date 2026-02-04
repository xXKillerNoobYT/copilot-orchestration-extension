// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';

jest.mock('../../utils/logger', () => ({
  ...jest.requireActual('../../utils/logger'),
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

type Ticket = {
  id: string;
  thread: { role: string; content: string }[];
};

/** @aiContributed-2026-02-03 */
describe('OrchestratorService', () => {
  let orchestrator: OrchestratorService;
  let mockAppendThreadMessage: jest.SpyInstance;
  let mockDetermineConversationAgent: jest.SpyInstance;
  let mockHandlePlanningConversation: jest.SpyInstance;
  let mockHandleVerificationConversation: jest.SpyInstance;
  let mockHandleAnswerConversation: jest.SpyInstance;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    orchestrator['conversationThreadLengths'] = new Map();

    mockAppendThreadMessage = jest.spyOn(
      orchestrator as unknown as Record<string, unknown>,
      'appendThreadMessage'
    ).mockResolvedValue(undefined);
    mockDetermineConversationAgent = jest.spyOn(
      orchestrator as unknown as Record<string, unknown>,
      'determineConversationAgent'
    ).mockResolvedValue('answer');
    mockHandlePlanningConversation = jest.spyOn(
      orchestrator as unknown as Record<string, unknown>,
      'handlePlanningConversation'
    ).mockResolvedValue(undefined);
    mockHandleVerificationConversation = jest.spyOn(
      orchestrator as unknown as Record<string, unknown>,
      'handleVerificationConversation'
    ).mockResolvedValue(undefined);
    mockHandleAnswerConversation = jest.spyOn(
      orchestrator as unknown as Record<string, unknown>,
      'handleAnswerConversation'
    ).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  it('should return early if the thread is empty', async () => {
    const ticket: Ticket = { id: '1', thread: [] };

    await (orchestrator as unknown as Record<string, unknown>).processConversationTicketInternal(ticket);

    expect(mockAppendThreadMessage).not.toHaveBeenCalled();
    expect(mockDetermineConversationAgent).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should return early if the thread length is less than or equal to last processed', async () => {
    const ticket: Ticket = { id: '1', thread: [{ role: 'user', content: 'test' }] };
    orchestrator['conversationThreadLengths'].set('1', 1);

    await (orchestrator as unknown as Record<string, unknown>).processConversationTicketInternal(ticket);

    expect(mockAppendThreadMessage).not.toHaveBeenCalled();
    expect(mockDetermineConversationAgent).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should return early if the last message role is not user', async () => {
    const ticket: Ticket = { id: '1', thread: [{ role: 'system', content: 'test' }] };

    await (orchestrator as unknown as Record<string, unknown>).processConversationTicketInternal(ticket);

    expect(mockAppendThreadMessage).not.toHaveBeenCalled();
    expect(mockDetermineConversationAgent).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
  it('should append a system message and handle planning conversation', async () => {
    const ticket: Ticket = { id: '1', thread: [{ role: 'user', content: 'test' }] };
    mockDetermineConversationAgent.mockResolvedValue('planning');

    await (orchestrator as unknown as Record<string, unknown>).processConversationTicketInternal(ticket);

    expect(mockAppendThreadMessage).toHaveBeenCalledWith(ticket, {
      role: 'system',
      content: 'Status: Reviewing request...',
    });
    expect(mockDetermineConversationAgent).toHaveBeenCalledWith(ticket, 'test');
    expect(mockHandlePlanningConversation).toHaveBeenCalledWith(ticket, 'test');
  });

  /** @aiContributed-2026-02-03 */
  it('should append a system message and handle verification conversation', async () => {
    const ticket: Ticket = { id: '1', thread: [{ role: 'user', content: 'test' }] };
    mockDetermineConversationAgent.mockResolvedValue('verification');

    await (orchestrator as unknown as Record<string, unknown>).processConversationTicketInternal(ticket);

    expect(mockAppendThreadMessage).toHaveBeenCalledWith(ticket, {
      role: 'system',
      content: 'Status: Reviewing request...',
    });
    expect(mockDetermineConversationAgent).toHaveBeenCalledWith(ticket, 'test');
    expect(mockHandleVerificationConversation).toHaveBeenCalledWith(ticket, 'test');
  });

  /** @aiContributed-2026-02-03 */
  it('should append a system message and handle answer conversation', async () => {
    const ticket: Ticket = { id: '1', thread: [{ role: 'user', content: 'test' }] };

    await (orchestrator as unknown as Record<string, unknown>).processConversationTicketInternal(ticket);

    expect(mockAppendThreadMessage).toHaveBeenCalledWith(ticket, {
      role: 'system',
      content: 'Status: Reviewing request...',
    });
    expect(mockDetermineConversationAgent).toHaveBeenCalledWith(ticket, 'test');
    expect(mockHandleAnswerConversation).toHaveBeenCalledWith(ticket, 'test');
  });
});