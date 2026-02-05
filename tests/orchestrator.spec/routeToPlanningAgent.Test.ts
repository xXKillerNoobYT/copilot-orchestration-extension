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

/** @aiContributed-2026-02-04 */
describe('routeToPlanningAgent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    it('should return a valid plan on success', async () => {
        const mockPlan = 'Step 1: Do something\nStep 2: Do something else';
        (streamLLM as jest.Mock).mockResolvedValue({ content: mockPlan });

        const result = await routeToPlanningAgent('How do I implement feature X?');

        expect(streamLLM).toHaveBeenCalledWith(
            'How do I implement feature X?',
            expect.any(Function),
            { systemPrompt: expect.stringContaining('Break coding tasks into small atomic steps') }
        );
        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Waiting', mockPlan.substring(0, 100));
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
        expect(result).toBe(mockPlan);
    });

    /** @aiContributed-2026-02-04 */
    it('should handle empty response from the LLM', async () => {
        (streamLLM as jest.Mock).mockResolvedValue({ content: '' });

        const result = await routeToPlanningAgent('How do I implement feature X?');

        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Failed', 'Empty response');
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
        expect(result).toBe('');
    });

    /** @aiContributed-2026-02-04 */
    it('should handle LLM errors gracefully', async () => {
        const mockError = new Error('LLM service unavailable');
        (streamLLM as jest.Mock).mockRejectedValue(mockError);

        const result = await routeToPlanningAgent('How do I implement feature X?');

        expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Failed', 'LLM service unavailable');
        expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
        expect(result).toBe('Planning service is currently unavailable. A ticket has been created for manual review.');
        expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Planning agent failed'));
    });

    /** @aiContributed-2026-02-04 */
    it('should log chunks during streaming', async () => {
        const mockPlan = 'Step 1: Do something\nStep 2: Do something else';
        const mockChunkLogger = jest.fn();
        (streamLLM as jest.Mock).mockImplementation(async (_, onChunk) => {
            onChunk('Step 1: Do something');
            onChunk('Step 2: Do something else');
            return { content: mockPlan };
        });

        const result = await routeToPlanningAgent('How do I implement feature X?');

        expect(mockChunkLogger).not.toHaveBeenCalled(); // Ensure no external logger is used
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('LLM: Step 1: Do something'));
        expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('LLM: Step 2: Do something else'));
        expect(result).toBe(mockPlan);
    });
});