// ./answerAgent.Test.ts
import { resetAnswerAgentForTests } from '../../src/agents/answerAgent';

/** @aiContributed-2026-02-03 */
describe('resetAnswerAgentForTests', () => {
    /** @aiContributed-2026-02-03 */
    it('should set agentInstance to null', () => {
        // Arrange: Set a mock value for agentInstance
        interface MockAgentInstance {
            mockKey: string;
        }
        const mockAgentInstance: MockAgentInstance = { mockKey: 'mockValue' };
        (global as { agentInstance?: MockAgentInstance }).agentInstance = mockAgentInstance;

        // Act: Call the function
        resetAnswerAgentForTests();

        // Assert: Verify agentInstance is null
        expect((global as { agentInstance?: MockAgentInstance }).agentInstance).toBeNull();
    });
});