// ./ticketDb.Test.ts
import { updateTicket, initializeTicketDb, createTicket, resetTicketDbForTests } from '../../src/services/ticketDb';
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
describe('updateTicket', () => {
  let context: vscode.ExtensionContext;

  beforeEach(async () => {
    context = { extensionPath: '/mock/path' } as vscode.ExtensionContext;
    await initializeTicketDb(context);
  });

  afterEach(() => {
    resetTicketDbForTests();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should update an existing ticket successfully', async () => {
    const ticket = await createTicket({
      title: 'Test Ticket',
      status: 'open',
    });

    const updatedTicket = await updateTicket(ticket.id, { status: 'in-progress' });

    expect(updatedTicket).toEqual({
      ...ticket,
      status: 'in-progress',
      updatedAt: expect.any(String),
    });
    expect(Logger.info).toHaveBeenCalledWith(`Updated ticket: ${ticket.id}`);
  });

  /** @aiContributed-2026-02-03 */
    it('should return null if the ticket does not exist', async () => {
    const result = await updateTicket('non-existent-id', { status: 'done' });

    expect(result).toBeNull();
    expect(Logger.warn).toHaveBeenCalledWith('Ticket non-existent-id not found for update');
  });

  /** @aiContributed-2026-02-03 */
    it('should handle updates with partial fields', async () => {
    const ticket = await createTicket({
      title: 'Partial Update Ticket',
      status: 'open',
    });

    const updatedTicket = await updateTicket(ticket.id, { description: 'Updated description' });

    expect(updatedTicket).toEqual({
      ...ticket,
      description: 'Updated description',
      updatedAt: expect.any(String),
    });
  });

  /** @aiContributed-2026-02-03 */
    it('should throw an error if the database is not initialized', async () => {
    resetTicketDbForTests();

    await expect(updateTicket('some-id', { status: 'done' })).rejects.toThrow(
      'TicketDb not initialized'
    );
  });

  /** @aiContributed-2026-02-03 */
    it('should handle in-memory mode updates', async () => {
    const ticket = await createTicket({
      title: 'In-Memory Ticket',
      status: 'open',
    });

    const updatedTicket = await updateTicket(ticket.id, { status: 'blocked' });

    expect(updatedTicket).toEqual({
      ...ticket,
      status: 'blocked',
      updatedAt: expect.any(String),
    });
  });
});