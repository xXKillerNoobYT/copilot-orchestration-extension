// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { completeLLM } from '../../src/services/llmService';
import { agentStatusTracker } from '../../src/ui/agentStatusTracker';
import { updateStatusBar } from '../../src/extension';
import { llmStatusBar } from '../../src/ui/llmStatusBar';
import { createTicket } from '../../src/services/ticketDb';
import { logWarn, logInfo, logError } from '../../src/logger';

jest.mock('../../src/services/llmService');
jest.mock('../../src/ui/agentStatusTracker');
jest.mock('../../src/extension');
jest.mock('../../src/ui/llmStatusBar');
jest.mock('../../src/services/ticketDb');
jest.mock('../../src/logger');

/** @aiContributed-2026-02-03 */
describe('OrchestratorService - routeToVerificationAgent', () => {
    let orchestratorService: OrchestratorService;

    beforeEach(() => {
        orchestratorService = new OrchestratorService();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle empty codeDiff and create a ticket', async () => {
        const taskDescription = 'Test Task';
        const codeDiff = '   ';

        const result = await orchestratorService.routeToVerificationAgent(taskDescription, codeDiff);

        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Active', '');
        expect(logWarn).toHaveBeenCalledWith('No code diff provided for verification.');
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Waiting', 'FAIL - No diff');
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
        expect(createTicket).toHaveBeenCalledWith({
            title: `VERIFICATION FAILED: ${taskDescription}`,
            status: 'blocked',
            description: `Explanation: No code diff provided for verification.\n\nCode diff:\n${codeDiff}`
        });
        expect(result).toEqual({ passed: false, explanation: 'No code diff provided for verification.' });
    });

    /** @aiContributed-2026-02-03 */
    it('should handle a successful verification', async () => {
        const taskDescription = 'Test Task';
        const codeDiff = 'Some code diff';
        (completeLLM as jest.Mock).mockResolvedValue({ content: 'PASS: All criteria met.' });

        const result = await orchestratorService.routeToVerificationAgent(taskDescription, codeDiff);

        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Active', '');
        expect(llmStatusBar.start).toHaveBeenCalled();
        expect(completeLLM).toHaveBeenCalledWith(`Task: ${taskDescription}\nCode diff: ${codeDiff}`, {
            systemPrompt: expect.any(String),
            temperature: 0.3
        });
        expect(logInfo).toHaveBeenCalledWith('Verification: PASS - All criteria met.');
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Waiting', 'PASS - All criteria met.');
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) ✓ Verified');
        expect(result).toEqual({ passed: true, explanation: 'All criteria met.' });
    });

    /** @aiContributed-2026-02-03 */
    it('should handle an ambiguous LLM response', async () => {
        const taskDescription = 'Test Task';
        const codeDiff = 'Some code diff';
        (completeLLM as jest.Mock).mockResolvedValue({ content: 'Unclear response' });

        const result = await orchestratorService.routeToVerificationAgent(taskDescription, codeDiff);

        expect(logWarn).toHaveBeenCalledWith('Verification response was ambiguous: Unclear response...');
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Waiting', 'FAIL - Ambiguous response from verification - defaulting to FAIL.');
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) ⚠ Needs Review');
        expect(result).toEqual({ passed: false, explanation: 'Ambiguous response from verification - defaulting to FAIL.' });
    });

    /** @aiContributed-2026-02-03 */
    it('should handle an LLM error', async () => {
        const taskDescription = 'Test Task';
        const codeDiff = 'Some code diff';
        (completeLLM as jest.Mock).mockRejectedValue(new Error('LLM error'));

        const result = await orchestratorService.routeToVerificationAgent(taskDescription, codeDiff);

        expect(logError).toHaveBeenCalledWith('Verification agent failed: LLM error');
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Failed', 'LLM error');
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
        expect(result).toEqual({
            passed: false,
            explanation: 'Verification failed due to an LLM error. See logs for details.'
        });
    });

    /** @aiContributed-2026-02-03 */
    it('should handle missing explanation in LLM response', async () => {
        const taskDescription = 'Test Task';
        const codeDiff = 'Some code diff';
        (completeLLM as jest.Mock).mockResolvedValue({ content: 'PASS' });

        const result = await orchestratorService.routeToVerificationAgent(taskDescription, codeDiff);

        expect(logInfo).toHaveBeenCalledWith('Verification: PASS - All criteria met.');
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Waiting', 'PASS - All criteria met.');
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) ✓ Verified');
        expect(result).toEqual({ passed: true, explanation: 'All criteria met.' });
    });

    /** @aiContributed-2026-02-03 */
    it('should truncate long explanations in logs', async () => {
        const taskDescription = 'Test Task';
        const codeDiff = 'Some code diff';
        const longExplanation = 'PASS: ' + 'A'.repeat(300);
        (completeLLM as jest.Mock).mockResolvedValue({ content: longExplanation });

        const result = await orchestratorService.routeToVerificationAgent(taskDescription, codeDiff);

        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Verification: PASS - '));
        expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('A'.repeat(200) + '...'));
        expect(result).toEqual({ passed: true, explanation: 'A'.repeat(300) });
    });

    /** @aiContributed-2026-02-03 */
    it('should handle a failed verification and create a ticket', async () => {
        const taskDescription = 'Test Task';
        const codeDiff = 'Some code diff';
        (completeLLM as jest.Mock).mockResolvedValue({ content: 'FAIL: Criteria not met.' });

        const result = await orchestratorService.routeToVerificationAgent(taskDescription, codeDiff);

        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Active', '');
        expect(llmStatusBar.start).toHaveBeenCalled();
        expect(completeLLM).toHaveBeenCalledWith(`Task: ${taskDescription}\nCode diff: ${codeDiff}`, {
            systemPrompt: expect.any(String),
            temperature: 0.3
        });
        expect(logInfo).toHaveBeenCalledWith('Verification: FAIL - Criteria not met.');
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Verification', 'Waiting', 'FAIL - Criteria not met.');
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) ⚠ Needs Review');
        expect(createTicket).toHaveBeenCalledWith({
            title: `VERIFICATION FAILED: ${taskDescription}`,
            status: 'blocked',
            description: `Explanation: Criteria not met.\n\nCode diff:\n${codeDiff}`
        });
        expect(result).toEqual({ passed: false, explanation: 'Criteria not met.' });
    });
});