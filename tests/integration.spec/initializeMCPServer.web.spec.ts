/**
 * Integration test for MCP tool registration
 */

import { getRegisteredTools } from '../../src/mcpServer/integration';

describe('MCP Tool Registration', () => {
    it('Test 1: should register at least three MCP tools', () => {
        const tools = getRegisteredTools();
        expect(tools.length).toBeGreaterThanOrEqual(3);
    });

    it('Test 2: should include required tool names', () => {
        const toolNames = getRegisteredTools().map((tool) => tool.name);
        expect(toolNames).toEqual(expect.arrayContaining([
            'getNextTask',
            'reportTaskDone',
            'askQuestion'
        ]));
    });
});
