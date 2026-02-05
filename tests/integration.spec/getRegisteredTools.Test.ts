// ./integration.Test.ts
import { getRegisteredTools } from '../../src/mcpServer/integration';

/** @aiContributed-2026-02-04 */
describe('getRegisteredTools', () => {
    /** @aiContributed-2026-02-04 */
    it('should return a copy of the registered tools array', () => {
        const result1 = getRegisteredTools();
        const result2 = getRegisteredTools();
        expect(result1).toEqual([
            {
                name: 'getNextTask',
                description: 'Retrieve the next available task with optional filters',
            },
            {
                name: 'reportTaskDone',
                description: 'Report task completion status and trigger verification',
            },
            {
                name: 'askQuestion',
                description: 'Ask the Answer Agent a question with timeout handling',
            },
            {
                name: 'getErrors',
                description: 'Get quality gate diagnostics (TypeScript errors, skipped tests, coverage warnings)',
            },
        ]);
        expect(result1).not.toBe(result2); // Ensure it's a copy, not the original array
    });

    /** @aiContributed-2026-02-04 */
    it('should not allow modifications to the original registered tools', () => {
        const result = getRegisteredTools();
        result.push({
            name: 'newTool',
            description: 'A new tool for testing',
        });

        const originalResult = getRegisteredTools();
        expect(originalResult).not.toContainEqual({
            name: 'newTool',
            description: 'A new tool for testing',
        });
    });
});