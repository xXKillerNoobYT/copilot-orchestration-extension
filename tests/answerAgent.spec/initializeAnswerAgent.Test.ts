// ./answerAgent.Test.ts
import { initializeAnswerAgent, resetAnswerAgentForTests, getAnswerAgent } from '../../src/agents/answerAgent';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
  ...jest.requireActual('../../utils/logger'),
  Logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-04 */
describe('initializeAnswerAgent', () => {
  beforeEach(() => {
    resetAnswerAgentForTests();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should initialize the AnswerAgent singleton and log the initialization', () => {
    initializeAnswerAgent();

    expect(Logger.info).toHaveBeenCalledWith('[Answer Agent] Singleton initialized');
  });

  /** @aiContributed-2026-02-04 */
    it('should not reinitialize the AnswerAgent singleton if already initialized', () => {
    initializeAnswerAgent();
    initializeAnswerAgent();

    expect(Logger.info).toHaveBeenCalledTimes(1);
  });

  /** @aiContributed-2026-02-04 */
    it('should throw an error if getAnswerAgent is called before initialization', () => {
    expect(() => getAnswerAgent()).toThrowError(
      'AnswerAgent not initialized. Call initializeAnswerAgent() first.'
    );
  });

  /** @aiContributed-2026-02-04 */
    it('should return the same instance of AnswerAgent after initialization', () => {
    initializeAnswerAgent();
    const instance1 = getAnswerAgent();
    const instance2 = getAnswerAgent();

    expect(instance1).toBe(instance2);
  });
});