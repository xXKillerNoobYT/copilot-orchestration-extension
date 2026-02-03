// ./ticketDb.Test.ts
import { onTicketChange, resetTicketDbForTests } from '../../src/services/ticketDb';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-03 */
describe('onTicketChange', () => {
  let mockListener: jest.Mock;
  let mockEmitter: EventEmitter;

  beforeEach(() => {
    resetTicketDbForTests();
    mockListener = jest.fn();
    mockEmitter = new EventEmitter();
    jest.spyOn(mockEmitter, 'on');
    jest.spyOn(mockEmitter, 'emit');
  });

  /** @aiContributed-2026-02-03 */
    it('should register a listener for ticket changes', () => {
    onTicketChange(mockListener);
    expect(mockEmitter.on).toHaveBeenCalledWith('change', mockListener);
  });

  /** @aiContributed-2026-02-03 */
    it('should throw an error if the database is not initialized', () => {
    resetTicketDbForTests();
    expect(() => onTicketChange(mockListener)).toThrowError('TicketDb not initialized');
  });

  /** @aiContributed-2026-02-03 */
    it('should call the listener when a change event is emitted', () => {
    onTicketChange(mockListener);
    mockEmitter.emit('change');
    expect(mockListener).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
    it('should not call the listener if it is not registered', () => {
    mockEmitter.emit('change');
    expect(mockListener).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
    it('should log an error if the listener throws an exception', () => {
    const errorListener = jest.fn(() => {
      throw new Error('Listener error');
    });
    onTicketChange(errorListener);
    expect(() => mockEmitter.emit('change')).toThrow('Listener error');
    expect(Logger.error).toHaveBeenCalled();
  });
});