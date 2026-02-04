// ./ticketDb.Test.ts
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
describe('resetTicketDbForTests', () => {
  let mockDbInstance: { resetForTests: jest.Mock };

  beforeEach(() => {
    mockDbInstance = {
      resetForTests: jest.fn(),
    };
    jest.resetModules();
    jest.doMock('./ticketDb', () => {
      const actual = jest.requireActual('../../src/services/ticketDb');
      return {
        ...actual,
        dbInstance: mockDbInstance,
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should reset the database instance and call resetForTests', async () => {
    const { resetTicketDbForTests } = await import('../../src/services/ticketDb');
    resetTicketDbForTests();

    expect(mockDbInstance.resetForTests).toHaveBeenCalledTimes(1);
    expect(Logger.info).toHaveBeenCalledWith('Database reset for tests');
  });

  /** @aiContributed-2026-02-03 */
    it('should set dbInstance to null after resetting', async () => {
    const { resetTicketDbForTests, dbInstance } = await import('../../src/services/ticketDb');
    resetTicketDbForTests();

    expect(dbInstance).toBeNull();
  });

  /** @aiContributed-2026-02-03 */
    it('should handle the case where dbInstance is null', async () => {
    jest.doMock('./ticketDb', () => {
      const actual = jest.requireActual('../../src/services/ticketDb');
      return {
        ...actual,
        dbInstance: null,
      };
    });
    const { resetTicketDbForTests } = await import('../../src/services/ticketDb');
    expect(() => resetTicketDbForTests()).not.toThrow();
    expect(Logger.info).not.toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
    it('should not call resetForTests if dbInstance is null', async () => {
    jest.doMock('./ticketDb', () => {
      const actual = jest.requireActual('../../src/services/ticketDb');
      return {
        ...actual,
        dbInstance: null,
      };
    });
    const { resetTicketDbForTests } = await import('../../src/services/ticketDb');
    resetTicketDbForTests();

    expect(mockDbInstance.resetForTests).not.toHaveBeenCalled();
  });
});