// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import { Logger } from '../../utils/logger';

/** @aiContributed-2026-02-04 */
describe('ConversationsTreeDataProvider', () => {
    let provider: ConversationsTreeDataProvider;

    beforeEach(() => {
        provider = new ConversationsTreeDataProvider();
    });

    /** @aiContributed-2026-02-04 */
    describe('buildEmptyHistory', () => {
        /** @aiContributed-2026-02-04 */
        it('should return an empty messages array when ticket type is "answer_agent"', () => {
            const ticket = { type: 'answer_agent' };
            const result = (provider as unknown as { buildEmptyHistory: (ticket: { type: string }) => { messages: [] } }).buildEmptyHistory(ticket);
            expect(result).toEqual({ messages: [] });
        });

        /** @aiContributed-2026-02-04 */
        it('should return an empty messages array when ticket type is "human_to_ai"', () => {
            const ticket = { type: 'human_to_ai' };
            const result = (provider as unknown as { buildEmptyHistory: (ticket: { type: string }) => { messages: [] } }).buildEmptyHistory(ticket);
            expect(result).toEqual({ messages: [] });
        });

        /** @aiContributed-2026-02-04 */
        it('should return null when ticket type is not "answer_agent" or "human_to_ai"', () => {
            const ticket = { type: 'other_type' };
            const result = (provider as unknown as { buildEmptyHistory: (ticket: { type: string }) => null }).buildEmptyHistory(ticket);
            expect(result).toBeNull();
        });

        /** @aiContributed-2026-02-04 */
        it('should return null when ticket type is undefined', () => {
            const ticket = { type: undefined };
            const result = (provider as unknown as { buildEmptyHistory: (ticket: { type: string | undefined }) => null }).buildEmptyHistory(ticket);
            expect(result).toBeNull();
        });

        /** @aiContributed-2026-02-04 */
        it('should return null when ticket is null', () => {
            const ticket = null;
            const result = (provider as unknown as { buildEmptyHistory: (ticket: null) => null }).buildEmptyHistory(ticket);
            expect(result).toBeNull();
        });

        /** @aiContributed-2026-02-04 */
        it('should log debug information during execution', () => {
            const ticket = { type: 'answer_agent' };
            const debugSpy = jest.spyOn(Logger, 'debug');
            (provider as unknown as { buildEmptyHistory: (ticket: { type: string }) => void }).buildEmptyHistory(ticket);
            expect(debugSpy).toHaveBeenCalledWith('Building empty history for ticket type: answer_agent');
        });
    });
});