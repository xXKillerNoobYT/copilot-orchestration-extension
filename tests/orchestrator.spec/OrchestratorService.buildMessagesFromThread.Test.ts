// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';

/** @aiContributed-2026-02-03 */
describe('OrchestratorService', () => {
    /** @aiContributed-2026-02-03 */
    describe('buildMessagesFromThread', () => {
        let orchestratorService: OrchestratorService;

        beforeEach(() => {
            orchestratorService = new OrchestratorService();
        });

        /** @aiContributed-2026-02-03 */
        it('should build messages with system prompt and filtered thread messages', () => {
            const thread: Array<{ role: string; content: string }> = [
                { role: 'user', content: 'User message 1' },
                { role: 'assistant', content: 'Assistant message 1' },
                { role: 'system', content: 'System message 1' },
                { role: 'user', content: 'User message 2' },
            ];
            const ANSWER_SYSTEM_PROMPT = 'System prompt content';
            (orchestratorService as unknown as { ANSWER_SYSTEM_PROMPT: string }).ANSWER_SYSTEM_PROMPT = ANSWER_SYSTEM_PROMPT;

            const result = (orchestratorService as unknown as { buildMessagesFromThread: (thread: typeof thread) => Array<{ role: string; content: string }> }).buildMessagesFromThread(thread);

            expect(result).toEqual([
                { role: 'system', content: ANSWER_SYSTEM_PROMPT },
                { role: 'user', content: 'User message 1' },
                { role: 'assistant', content: 'Assistant message 1' },
                { role: 'user', content: 'User message 2' },
            ]);
        });

        /** @aiContributed-2026-02-03 */
        it('should return only the system prompt if thread is empty', () => {
            const thread: Array<{ role: string; content: string }> = [];
            const ANSWER_SYSTEM_PROMPT = 'System prompt content';
            (orchestratorService as unknown as { ANSWER_SYSTEM_PROMPT: string }).ANSWER_SYSTEM_PROMPT = ANSWER_SYSTEM_PROMPT;

            const result = (orchestratorService as unknown as { buildMessagesFromThread: (thread: typeof thread) => Array<{ role: string; content: string }> }).buildMessagesFromThread(thread);

            expect(result).toEqual([{ role: 'system', content: ANSWER_SYSTEM_PROMPT }]);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle threads with no user or assistant messages', () => {
            const thread: Array<{ role: string; content: string }> = [
                { role: 'system', content: 'System message 1' },
                { role: 'other', content: 'Other message 1' },
            ];
            const ANSWER_SYSTEM_PROMPT = 'System prompt content';
            (orchestratorService as unknown as { ANSWER_SYSTEM_PROMPT: string }).ANSWER_SYSTEM_PROMPT = ANSWER_SYSTEM_PROMPT;

            const result = (orchestratorService as unknown as { buildMessagesFromThread: (thread: typeof thread) => Array<{ role: string; content: string }> }).buildMessagesFromThread(thread);

            expect(result).toEqual([{ role: 'system', content: ANSWER_SYSTEM_PROMPT }]);
        });

        /** @aiContributed-2026-02-03 */
        it('should throw an error if thread is null or undefined', () => {
            const ANSWER_SYSTEM_PROMPT = 'System prompt content';
            (orchestratorService as unknown as { ANSWER_SYSTEM_PROMPT: string }).ANSWER_SYSTEM_PROMPT = ANSWER_SYSTEM_PROMPT;

            expect(() => (orchestratorService as unknown as { buildMessagesFromThread: (thread: null | undefined) => void }).buildMessagesFromThread(null)).toThrow();
            expect(() => (orchestratorService as unknown as { buildMessagesFromThread: (thread: null | undefined) => void }).buildMessagesFromThread(undefined)).toThrow();
        });
    });
});