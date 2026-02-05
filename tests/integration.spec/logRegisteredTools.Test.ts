// ./integration.Test.ts
import { logRegisteredTools } from '../../src/mcpServer/integration';
import { logInfo } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('logRegisteredTools', () => {
  /** @aiContributed-2026-02-04 */
  it('should log the names of all registered tools', () => {
    logRegisteredTools();
    expect(logInfo).toHaveBeenCalledWith(
      'MCP registered tools: getNextTask, reportTaskDone, askQuestion, getErrors'
    );
  });
});