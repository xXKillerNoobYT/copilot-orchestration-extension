// ./ticketDb.Test.ts
import { listTickets, initializeTicketDb, resetTicketDbForTests } from '../../src/services/ticketDb';
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
describe('listTickets', () => {
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
    it('should return an empty array when no tickets exist', async () => {
    const tickets = await listTickets();
    expect(tickets).toEqual([]);
    expect(Logger.info).toHaveBeenCalledWith('Ticket DB initialized: In-memory mode');
  });

  /** @aiContributed-2026-02-03 */
    it('should return all tickets in descending order of creation', async () => {
    const ticket1 = {
      title: 'Ticket 1',
      status: 'open',
    };
    const ticket2 = {
      title: 'Ticket 2',
      status: 'in-progress',
    };

    await createTicket(ticket1);
    await createTicket(ticket2);

    const tickets = await listTickets();
    expect(tickets.length).toBe(2);
    expect(tickets[0].title).toBe('Ticket 2');
    expect(tickets[1].title).toBe('Ticket 1');
  });

  /** @aiContributed-2026-02-03 */
    it('should handle in-memory mode gracefully', async () => {
    const ticket = {
      title: 'In-memory Ticket',
      status: 'done',
    };

    await createTicket(ticket);
    const tickets = await listTickets();

    expect(tickets).toHaveLength(1);
    expect(tickets[0].title).toBe('In-memory Ticket');
    expect(Logger.info).toHaveBeenCalledWith('Ticket DB initialized: In-memory mode');
  });

  /** @aiContributed-2026-02-03 */
    it('should throw an error if the database is not initialized', async () => {
    resetTicketDbForTests();
    await expect(listTickets()).rejects.toThrow('TicketDb not initialized');
  });
});