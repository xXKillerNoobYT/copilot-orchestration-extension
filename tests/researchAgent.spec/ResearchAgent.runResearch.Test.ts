// ./researchAgent.Test.ts
import { ResearchAgent } from '../../src/agents/researchAgent';
import { completeLLM } from '../../src/services/llmService';
import { logInfo, logError } from '../../src/logger';

jest.mock('../../src/services/llmService');
jest.mock('../../src/logger');

/** @aiContributed-2026-02-02 */
describe('ResearchAgent', () => {
    let researchAgent: ResearchAgent;

    beforeEach(() => {
        researchAgent = new ResearchAgent();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-02 */
    describe('runResearch', () => {
        /** @aiContributed-2026-02-02 */
        it('should return a formatted report on successful research', async () => {
            const query = 'Test query';
            const mockResponse = { content: 'Generated content' };
            (completeLLM as jest.Mock).mockResolvedValue(mockResponse);

            const result = await researchAgent.runResearch(query);

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Starting research for query'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Simulating research delay'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Delay complete, generating research report'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Research complete'));
            expect(completeLLM).toHaveBeenCalledWith(query, {
                systemPrompt: expect.any(String),
                temperature: 0.7,
            });
            expect(result).toContain('Generated content');
        });

        /** @aiContributed-2026-02-02 */
        it('should return an error report if completeLLM throws an error', async () => {
            const query = 'Test query';
            const errorMessage = 'LLM error';
            (completeLLM as jest.Mock).mockRejectedValue(new Error(errorMessage));

            const result = await researchAgent.runResearch(query);

            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Starting research for query'));
            expect(logError).toHaveBeenCalledWith(expect.stringContaining(`Research failed: ${errorMessage}`));
            expect(result).toContain(errorMessage);
        });

        /** @aiContributed-2026-02-02 */
        it('should handle null or undefined query gracefully', async () => {
            const query = null as unknown as string;

            const result = await researchAgent.runResearch(query);

            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Research failed'));
            expect(result).toContain('query is null or undefined');
        });

        /** @aiContributed-2026-02-02 */
        it('should handle timeouts gracefully', async () => {
            const query = 'Test query';
            jest.useFakeTimers();
            (completeLLM as jest.Mock).mockImplementation(() => new Promise(() => {}));

            const promise = researchAgent.runResearch(query);
            jest.advanceTimersByTime(600000);

            await expect(promise).resolves.toContain('query timed out');
            jest.useRealTimers();
        });
    });
});