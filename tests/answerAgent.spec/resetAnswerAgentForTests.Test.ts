// ./answerAgent.Test.ts
import { resetAnswerAgentForTests } from '../../src/agents/answerAgent';

/** @aiContributed-2026-02-04 */
describe('resetAnswerAgentForTests', () => {
    /** @aiContributed-2026-02-04 */
    it('should reset agentInstance to null', () => {
        // Arrange: Set a mock value for agentInstance
        const mockAgentInstance = { mockKey: 'mockValue' };
        Object.defineProperty(global, 'agentInstance', {
            value: mockAgentInstance,
            writable: true,
        });

        // Act: Call the function
        resetAnswerAgentForTests();

        // Assert: Verify agentInstance is null
        expect(global.agentInstance).toBeNull();
    });

    /** @aiContributed-2026-02-04 */
    it('should not throw an error if agentInstance is already null', () => {
        // Arrange: Ensure agentInstance is null
        Object.defineProperty(global, 'agentInstance', {
            value: null,
            writable: true,
        });

        // Act & Assert: Call the function and ensure no errors are thrown
        expect(() => resetAnswerAgentForTests()).not.toThrow();
        expect(global.agentInstance).toBeNull();
    });
});