// ./ticketDb.Test.ts
import { getTicket, initializeTicketDb, resetTicketDbForTests } from '../../src/services/ticketDb';
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
describe('getTicket', () => {
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
    it('should return the ticket when it exists in memory', async () => {
    const ticket = {
      title: 'Test Ticket',
      status: 'open',
    };

    const createdTicket = await createTicket(ticket);
    const result = await getTicket(createdTicket.id);

    expect(result).toEqual(createdTicket);
    expect(Logger.info).toHaveBeenCalledWith(`Created ticket: ${createdTicket.id}`);
  });

  /** @aiContributed-2026-02-03 */
    it('should return null when the ticket does not exist', async () => {
    const result = await getTicket('non-existent-id');
    expect(result).toBeNull();
    expect(Logger.warn).toHaveBeenCalledWith('Ticket non-existent-id not found');
  });

  /** @aiContributed-2026-02-03 */
    it('should throw an error if the database is not initialized', async () => {
    resetTicketDbForTests();

    await expect(getTicket('any-id')).rejects.toThrow('TicketDb not initialized');
  });
});