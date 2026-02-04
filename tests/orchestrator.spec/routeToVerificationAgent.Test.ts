// ./orchestrator.Test.ts
import { routeToVerificationAgent } from '../../src/services/orchestrator';
import { completeLLM } from '../../src/services/llmService';
import { createTicket } from '../../src/services/ticketDb';
import { agentStatusTracker } from '../../src/ui/agentStatusTracker';
import { llmStatusBar } from '../../src/ui/llmStatusBar';
import { updateStatusBar } from '../../src/extension';
import { Logger } from '../../utils/logger';

jest.mock('../../src/services/llmService', () => ({
    ...jest.requireActual('../../src/services/llmService'),
    completeLLM: jest.fn(),
}));

jest.mock('../../src/services/ticketDb', () => ({
    ...jest.requireActual('../../src/services/ticketDb'),
    createTicket: jest.fn(),
}));

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

/** @aiContributed-2026-02-03 */
describe('routeToVerificationAgent', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should return pass with explanation when LLM returns PASS', async () => {
        (completeLLM as jest.Mock).mockResolvedValue({
            content: 'PASS: All criteria met.',
        });

        const result = await routeToVerificationAgent('Test task', 'diff content');

        expect(result).toEqual({ passed: true, explanation: 'All criteria met.' });
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Active', '');
        expect(llmStatusBar.start).toHaveBeenCalled();
        expect(llmStatusBar.end).toHaveBeenCalled();
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) ✓ Verified');
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('PASS'));
    });

    /** @aiContributed-2026-02-03 */
    it('should return fail with explanation when LLM returns FAIL', async () => {
        (completeLLM as jest.Mock).mockResolvedValue({
            content: 'FAIL: Criteria not met.',
        });

        const result = await routeToVerificationAgent('Test task', 'diff content');

        expect(result).toEqual({ passed: false, explanation: 'Criteria not met.' });
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Active', '');
        expect(llmStatusBar.start).toHaveBeenCalled();
        expect(llmStatusBar.end).toHaveBeenCalled();
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) ⚠ Needs Review');
        expect(createTicket).toHaveBeenCalledWith({
            title: 'VERIFICATION FAILED: Test task',
            status: 'blocked',
            description: expect.stringContaining('Criteria not met.'),
        });
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('FAIL'));
    });

    /** @aiContributed-2026-02-03 */
    it('should handle ambiguous LLM response and default to fail', async () => {
        (completeLLM as jest.Mock).mockResolvedValue({
            content: 'Unclear response.',
        });

        const result = await routeToVerificationAgent('Test task', 'diff content');

        expect(result).toEqual({
            passed: false,
            explanation: 'Ambiguous response from verification - defaulting to FAIL.',
        });
        expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Ambiguous response'));
    });

    /** @aiContributed-2026-02-03 */
    it('should handle empty code diff and return fail', async () => {
        const result = await routeToVerificationAgent('Test task', '');

        expect(result).toEqual({
            passed: false,
            explanation: 'No code diff provided for verification.',
        });
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Waiting', 'FAIL - No diff');
        expect(createTicket).toHaveBeenCalledWith({
            title: 'VERIFICATION FAILED: Test task',
            status: 'blocked',
            description: expect.stringContaining('No code diff provided'),
        });
        expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('No code diff provided'));
    });

    /** @aiContributed-2026-02-03 */
    it('should handle LLM errors gracefully', async () => {
        (completeLLM as jest.Mock).mockRejectedValue(new Error('LLM error'));

        const result = await routeToVerificationAgent('Test task', 'diff content');

        expect(result).toEqual({
            passed: false,
            explanation: 'Verification failed due to an LLM error. See logs for details.',
        });
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Failed', expect.any(String));
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('LLM error'));
    });

    /** @aiContributed-2026-02-03 */
    it('should handle long explanations and truncate logs', async () => {
        const longExplanation = 'PASS: ' + 'A'.repeat(300);
        (completeLLM as jest.Mock).mockResolvedValue({
            content: longExplanation,
        });

        const result = await routeToVerificationAgent('Test task', 'diff content');

        expect(result).toEqual({ passed: true, explanation: 'A'.repeat(300) });
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('PASS'));
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('A'.repeat(200)));
    });

    /** @aiContributed-2026-02-03 */
    it('should handle missing explanation in LLM response and default to generic message', async () => {
        (completeLLM as jest.Mock).mockResolvedValue({
            content: 'PASS',
        });

        const result = await routeToVerificationAgent('Test task', 'diff content');

        expect(result).toEqual({ passed: true, explanation: 'All criteria met.' });
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('PASS'));
    });

    /** @aiContributed-2026-02-03 */
    it('should handle invalid LLM response and log a warning', async () => {
        (completeLLM as jest.Mock).mockResolvedValue({
            content: '',
        });

        const result = await routeToVerificationAgent('Test task', 'diff content');

        expect(result).toEqual({
            passed: false,
            explanation: 'Ambiguous response from verification - defaulting to FAIL.',
        });
        expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Ambiguous response'));
    });
});