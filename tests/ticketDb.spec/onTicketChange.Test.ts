// ./ticketDb.Test.ts
import { onTicketChange, resetTicketDbForTests, initializeTicketDb } from '../../src/services/ticketDb';
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { EventEmitter } from 'events';

jest.mock('../../utils/logger', () => ({
  ...jest.requireActual('../../utils/logger'),
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  ExtensionContext: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('onTicketChange', () => {
  let mockListener: jest.Mock;
  let mockContext: vscode.ExtensionContext;

  beforeEach(async () => {
    resetTicketDbForTests();
    mockListener = jest.fn();
    mockContext = {
      extensionPath: '/mock/path',
    } as unknown as vscode.ExtensionContext;
    await initializeTicketDb(mockContext);
  });

  /** @aiContributed-2026-02-04 */
    it('should register a listener for ticket changes', () => {
    onTicketChange(mockListener);
    expect(mockListener).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should throw an error if the database is not initialized', () => {
    resetTicketDbForTests();
    expect(() => onTicketChange(mockListener)).toThrowError('TicketDb not initialized');
  });

  /** @aiContributed-2026-02-04 */
    it('should call the listener when a change event is emitted', async () => {
    onTicketChange(mockListener);
    const { createTicket } = await import('../../src/services/ticketDb');
    await createTicket({ title: 'Test Ticket', status: 'open' });
    expect(mockListener).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should not call the listener if it is not registered', async () => {
    const { createTicket } = await import('../../src/services/ticketDb');
    await createTicket({ title: 'Test Ticket', status: 'open' });
    expect(mockListener).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should log an error if the listener throws an exception', async () => {
    const errorListener = jest.fn(() => {
      throw new Error('Listener error');
    });
    onTicketChange(errorListener);
    const { createTicket } = await import('../../src/services/ticketDb');
    await createTicket({ title: 'Test Ticket', status: 'open' });
    expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Listener error'));
  });

  /** @aiContributed-2026-02-04 */
    it('should allow multiple listeners to be registered and called', async () => {
    const secondListener = jest.fn();
    onTicketChange(mockListener);
    onTicketChange(secondListener);
    const { createTicket } = await import('../../src/services/ticketDb');
    await createTicket({ title: 'Test Ticket', status: 'open' });
    expect(mockListener).toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should not call removed listeners', async () => {
    const { createTicket } = await import('../../src/services/ticketDb');
    const removeListener = jest.fn();
    onTicketChange(mockListener);
    onTicketChange(removeListener);
    const emitter = EventEmitter.prototype;
    emitter.removeListener('change', removeListener);
    await createTicket({ title: 'Test Ticket', status: 'open' });
    expect(mockListener).toHaveBeenCalled();
    expect(removeListener).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should handle listeners being added during an event emission', async () => {
    const dynamicListener = jest.fn(() => onTicketChange(mockListener));
    onTicketChange(dynamicListener);
    const { createTicket } = await import('../../src/services/ticketDb');
    await createTicket({ title: 'Test Ticket', status: 'open' });
    expect(dynamicListener).toHaveBeenCalled();
    expect(mockListener).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should not emit events after resetTicketDbForTests is called', async () => {
    onTicketChange(mockListener);
    resetTicketDbForTests();
    const { createTicket } = await import('../../src/services/ticketDb');
    await expect(createTicket({ title: 'Test Ticket', status: 'open' })).rejects.toThrowError(
      'TicketDb not initialized. Call initializeTicketDb() first.'
    );
    expect(mockListener).not.toHaveBeenCalled();
  });
});