// ./ticketDb.Test.ts
import { createTicket, initializeTicketDb, resetTicketDbForTests } from '../../src/services/ticketDb';
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    ExtensionContext: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-03 */
describe('createTicket', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(async () => {
    mockContext = {
      extensionPath: '/mock/extension/path',
    } as unknown as vscode.ExtensionContext;

    await initializeTicketDb(mockContext);
  });

  afterEach(() => {
    resetTicketDbForTests();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should create a ticket successfully in in-memory mode', async () => {
    const ticketData = {
      title: 'Test Ticket',
      status: 'open',
      type: 'ai_to_human',
      description: 'This is a test ticket',
    };

    const ticket = await createTicket(ticketData);

    expect(ticket).toMatchObject({
      title: 'Test Ticket',
      status: 'open',
      type: 'ai_to_human',
      description: 'This is a test ticket',
    });
    expect(ticket.id).toMatch(/^TICKET-\d+$/);
    expect(ticket.createdAt).toBeDefined();
    expect(ticket.updatedAt).toBeDefined();
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Created ticket:'));
  });

  /** @aiContributed-2026-02-03 */
    it('should throw an error if TicketDb is not initialized', async () => {
    resetTicketDbForTests();

    const ticketData = {
      title: 'Test Ticket',
      status: 'open',
      type: 'ai_to_human',
      description: 'This is a test ticket',
    };

    await expect(createTicket(ticketData)).rejects.toThrow('TicketDb not initialized. Call initializeTicketDb() first.');
  });

  /** @aiContributed-2026-02-03 */
    it('should handle undefined optional fields gracefully', async () => {
    const ticketData = {
      title: 'Test Ticket',
      status: 'open',
    };

    const ticket = await createTicket(ticketData);

    expect(ticket).toMatchObject({
      title: 'Test Ticket',
      status: 'open',
      type: undefined,
      description: undefined,
    });
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Created ticket:'));
  });

  /** @aiContributed-2026-02-03 */
    it('should handle concurrent ticket creation', async () => {
    const ticketData1 = {
      title: 'Ticket 1',
      status: 'open',
    };

    const ticketData2 = {
      title: 'Ticket 2',
      status: 'in-progress',
    };

    const [ticket1, ticket2] = await Promise.all([createTicket(ticketData1), createTicket(ticketData2)]);

    expect(ticket1.title).toBe('Ticket 1');
    expect(ticket2.title).toBe('Ticket 2');
    expect(ticket1.id).not.toBe(ticket2.id);
  });
});