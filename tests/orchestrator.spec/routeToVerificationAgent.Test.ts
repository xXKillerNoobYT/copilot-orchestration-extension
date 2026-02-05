// ./orchestrator.Test.ts
import { routeToVerificationAgent } from '../../src/services/orchestrator';
import { agentStatusTracker } from '../../src/ui/agentStatusTracker';
import { llmStatusBar } from '../../src/ui/llmStatusBar';
import { createTicket } from '../../src/services/ticketDb';
import { completeLLM } from '../../src/services/llmService';
import { updateStatusBar } from '../../src/extension';
import { Logger } from '../../utils/logger';

jest.mock('../../src/ui/agentStatusTracker', () => ({
    ...jest.requireActual('../../src/ui/agentStatusTracker'),
    agentStatusTracker: {
    setAgentStatus: jest.fn(),
  },
}));

jest.mock('../../src/ui/llmStatusBar', () => ({
    ...jest.requireActual('../../src/ui/llmStatusBar'),
    llmStatusBar: {
    start: jest.fn(),
    end: jest.fn(),
  },
}));

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    createTicket: jest.fn(),
}));

jest.mock('../../src/services/llmService', () => ({
    ...jest.requireActual('../../src/services/llmService'),
    completeLLM: jest.fn(),
}));

jest.mock('../../src/extension', () => ({
    ...jest.requireActual('../../src/extension'),
    updateStatusBar: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

/** @aiContributed-2026-02-04 */
describe('routeToVerificationAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should return pass with explanation when LLM returns PASS', async () => {
    (completeLLM as jest.Mock).mockResolvedValue({
      content: 'PASS: All criteria met.',
    });

    const result = await routeToVerificationAgent('Test Task', 'code diff');

    expect(result).toEqual({ passed: true, explanation: 'All criteria met.' });
    expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith(
      'Verification',
      'Waiting',
      'PASS - All criteria met.'
    );
    expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) ✓ Verified');
    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should return fail with explanation when LLM returns FAIL', async () => {
    (completeLLM as jest.Mock).mockResolvedValue({
      content: 'FAIL: Criteria not met.',
    });

    const result = await routeToVerificationAgent('Test Task', 'code diff');

    expect(result).toEqual({ passed: false, explanation: 'Criteria not met.' });
    expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith(
      'Verification',
      'Waiting',
      'FAIL - Criteria not met.'
    );
    expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) ⚠ Needs Review');
    expect(createTicket).toHaveBeenCalledWith({
      title: 'VERIFICATION FAILED: Test Task',
      status: 'blocked',
      description: 'Explanation: Criteria not met.\n\nCode diff:\ncode diff',
    });
    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(llmStatusBar.end).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-04 */
    it('should handle ambiguous LLM response and default to fail', async () => {
    (completeLLM as jest.Mock).mockResolvedValue({
      content: 'Unclear response',
    });

    const result = await routeToVerificationAgent('Test Task', 'code diff');

    expect(result).toEqual({
      passed: false,
      explanation: 'Ambiguous response from verification - defaulting to FAIL.',
    });
    expect(Logger.warn).toHaveBeenCalledWith(
      'Verification response was ambiguous: Unclear response...'
    );
    expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith(
      'Verification',
      'Waiting',
      'FAIL - Ambiguous response from verification - defaulting to FAIL.'
    );
    expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) ⚠ Needs Review');
    expect(createTicket).toHaveBeenCalledWith({
      title: 'VERIFICATION FAILED: Test Task',
      status: 'blocked',
      description:
        'Explanation: Ambiguous response from verification - defaulting to FAIL.\n\nCode diff:\ncode diff',
    });
  });

  /** @aiContributed-2026-02-04 */
    it('should handle missing code diff and return fail', async () => {
    const result = await routeToVerificationAgent('Test Task', '');

    expect(result).toEqual({
      passed: false,
      explanation: 'No code diff provided for verification.',
    });
    expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith(
      'Verification',
      'Waiting',
      'FAIL - No diff'
    );
    expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
    expect(createTicket).toHaveBeenCalledWith({
      title: 'VERIFICATION FAILED: Test Task',
      status: 'blocked',
      description: 'Explanation: No code diff provided for verification.\n\nCode diff:\n',
    });
  });

  /** @aiContributed-2026-02-04 */
    it('should handle LLM errors gracefully', async () => {
    (completeLLM as jest.Mock).mockRejectedValue(new Error('LLM error'));

    const result = await routeToVerificationAgent('Test Task', 'code diff');

    expect(result).toEqual({
      passed: false,
      explanation: 'Verification failed due to an LLM error. See logs for details.',
    });
    expect(Logger.error).toHaveBeenCalledWith('Verification agent failed: LLM error');
    expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith(
      'Verification',
      'Failed',
      'LLM error'
    );
    expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
  });
});