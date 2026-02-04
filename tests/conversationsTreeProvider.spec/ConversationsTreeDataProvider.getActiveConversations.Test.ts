// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import { getOrchestratorInstance } from '../../src/services/orchestrator';
import { logWarn } from '../../src/logger';

jest.mock('../../src/services/orchestrator', () => ({
    ...jest.requireActual('../../src/services/orchestrator'),
    getOrchestratorInstance: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logWarn: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('ConversationsTreeDataProvider', () => {
    /** @aiContributed-2026-02-03 */
    describe('getActiveConversations', () => {
        let provider: ConversationsTreeDataProvider;

        beforeEach(() => {
            provider = new ConversationsTreeDataProvider();
            jest.clearAllMocks();
        });

        /** @aiContributed-2026-02-03 */
        it('should return active conversations when orchestrator returns data', () => {
            const mockConversations = [
                { id: '1', name: 'Conversation 1' },
                { id: '2', name: 'Conversation 2' },
            ];
            const mockAnswerAgent = {
                getActiveConversations: jest.fn().mockReturnValue(mockConversations),
            };
            (getOrchestratorInstance as jest.Mock).mockReturnValue({
                getAnswerAgent: jest.fn().mockReturnValue(mockAnswerAgent),
            });

            const result = (provider as unknown as { getActiveConversations: () => typeof mockConversations }).getActiveConversations();

            expect(result).toEqual(mockConversations);
            expect(getOrchestratorInstance).toHaveBeenCalledTimes(1);
            expect(mockAnswerAgent.getActiveConversations).toHaveBeenCalledTimes(1);
        });

        /** @aiContributed-2026-02-03 */
        it('should return an empty array and log a warning when orchestrator throws an error', () => {
            const mockError = new Error('Orchestrator error');
            (getOrchestratorInstance as jest.Mock).mockImplementation(() => {
                throw mockError;
            });

            const result = (provider as unknown as { getActiveConversations: () => [] }).getActiveConversations();

            expect(result).toEqual([]);
            expect(getOrchestratorInstance).toHaveBeenCalledTimes(1);
            expect(logWarn).toHaveBeenCalledWith(
                `[ConversationsTreeProvider] Unable to read active conversations: ${mockError}`
            );
        });

        /** @aiContributed-2026-02-03 */
        it('should return an empty array and log a warning when getActiveConversations throws an error', () => {
            const mockAnswerAgent = {
                getActiveConversations: jest.fn().mockImplementation(() => {
                    throw new Error('getActiveConversations error');
                }),
            };
            (getOrchestratorInstance as jest.Mock).mockReturnValue({
                getAnswerAgent: jest.fn().mockReturnValue(mockAnswerAgent),
            });

            const result = (provider as unknown as { getActiveConversations: () => [] }).getActiveConversations();

            expect(result).toEqual([]);
            expect(getOrchestratorInstance).toHaveBeenCalledTimes(1);
            expect(mockAnswerAgent.getActiveConversations).toHaveBeenCalledTimes(1);
            expect(logWarn).toHaveBeenCalledWith(
                `[ConversationsTreeProvider] Unable to read active conversations: Error: getActiveConversations error`
            );
        });
    });
});