// ./answerAgent.Test.ts
import { initializeAnswerAgent, resetAnswerAgentForTests } from '../../src/agents/answerAgent';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-03 */
describe('initializeAnswerAgent', () => {
  beforeEach(() => {
    resetAnswerAgentForTests();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should initialize the AnswerAgent singleton and log the initialization', () => {
    initializeAnswerAgent();

    expect(Logger.info).toHaveBeenCalledWith('[Answer Agent] Singleton initialized');
  });

  /** @aiContributed-2026-02-03 */
    it('should not reinitialize the AnswerAgent singleton if already initialized', () => {
    initializeAnswerAgent();
    initializeAnswerAgent();

    expect(Logger.info).toHaveBeenCalledTimes(1);
  });
});