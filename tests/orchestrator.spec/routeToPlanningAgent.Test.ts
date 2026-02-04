// ./orchestrator.Test.ts
import { routeToPlanningAgent } from '../../src/services/orchestrator';
import { streamLLM } from '../../src/services/llmService';
import { agentStatusTracker } from '../../src/ui/agentStatusTracker';
import { updateStatusBar } from '../../src/extension';
import { Logger } from '../../utils/logger';

jest.mock('../../src/services/llmService', () => ({
    ...jest.requireActual('../../src/services/llmService'),
    streamLLM: jest.fn(),
}));

jest.mock('../../src/ui/agentStatusTracker', () => ({
    ...jest.requireActual('../../src/ui/agentStatusTracker'),
    agentStatusTracker: {
        setAgentStatus: jest.fn(),
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
describe('routeToPlanningAgent', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    it('should return the full plan on success', async () => {
        const mockResponse = { content: 'Plan generated successfully.' };
        (streamLLM as jest.Mock).mockResolvedValue(mockResponse);

        const result = await routeToPlanningAgent('Test question');

        expect(streamLLM).toHaveBeenCalledWith(
            'Test question',
            expect.any(Function),
            { systemPrompt: expect.any(String) }
        );
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Waiting', 'Plan generated successfully.');
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
        expect(result).toBe('Plan generated successfully.');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle empty response from the LLM', async () => {
        const mockResponse = { content: '' };
        (streamLLM as jest.Mock).mockResolvedValue(mockResponse);

        const result = await routeToPlanningAgent('Test question');

        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Failed', 'Empty response');
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
        expect(result).toBe('');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle errors from the LLM', async () => {
        (streamLLM as jest.Mock).mockRejectedValue(new Error('LLM error'));

        const result = await routeToPlanningAgent('Test question');

        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Failed', 'LLM error');
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
        expect(result).toBe('Planning service is currently unavailable. A ticket has been created for manual review.');
    });

    /** @aiContributed-2026-02-03 */
    it('should log chunks during streaming', async () => {
        const mockResponse = { content: 'Plan generated successfully.' };
        (streamLLM as jest.Mock).mockImplementation(async (_question, onChunk) => {
            onChunk('Chunk 1');
            onChunk('Chunk 2');
            return mockResponse;
        });

        const result = await routeToPlanningAgent('Test question');

        expect(Logger.info).toHaveBeenCalledWith('LLM: Chunk 1');
        expect(Logger.info).toHaveBeenCalledWith('LLM: Chunk 2');
        expect(result).toBe('Plan generated successfully.');
    });

    /** @aiContributed-2026-02-03 */
    it('should truncate and log long plans', async () => {
        const longPlan = 'A'.repeat(1500);
        const mockResponse = { content: longPlan };
        (streamLLM as jest.Mock).mockResolvedValue(mockResponse);

        const result = await routeToPlanningAgent('Test question');

        expect(Logger.info).toHaveBeenCalledWith(`Full plan (truncated): ${longPlan.substring(0, 1000)}...`);
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Waiting', longPlan.substring(0, 100));
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
        expect(result).toBe(longPlan);
    });

    /** @aiContributed-2026-02-03 */
    it('should handle short plans without truncation', async () => {
        const shortPlan = 'Short plan content.';
        const mockResponse = { content: shortPlan };
        (streamLLM as jest.Mock).mockResolvedValue(mockResponse);

        const result = await routeToPlanningAgent('Test question');

        expect(Logger.info).toHaveBeenCalledWith(`Full plan: ${shortPlan}`);
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Waiting', shortPlan.substring(0, 100));
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
        expect(result).toBe(shortPlan);
    });

    /** @aiContributed-2026-02-03 */
    it('should handle UI updates for active and failed states', async () => {
        const mockResponse = { content: 'Plan generated successfully.' };
        (streamLLM as jest.Mock).mockResolvedValue(mockResponse);

        await routeToPlanningAgent('Test question');

        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Active', '');
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Waiting', 'Plan generated successfully.');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle UI updates for empty responses', async () => {
        const mockResponse = { content: '' };
        (streamLLM as jest.Mock).mockResolvedValue(mockResponse);

        await routeToPlanningAgent('Test question');

        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Active', '');
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Failed', 'Empty response');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle UI updates for errors', async () => {
        (streamLLM as jest.Mock).mockRejectedValue(new Error('LLM error'));

        await routeToPlanningAgent('Test question');

        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Active', '');
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Failed', 'LLM error');
    });
});