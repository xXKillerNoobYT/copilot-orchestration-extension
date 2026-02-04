// ./mcpServer.Test.ts
import { MCPServer } from '../../src/mcpServer/mcpServer';
import { logInfo } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('MCPServer', () => {
    let mockOutputStream: NodeJS.WritableStream;
    let server: MCPServer;

    beforeEach(() => {
        mockOutputStream = {
            write: jest.fn(),
        } as unknown as NodeJS.WritableStream;

        server = new MCPServer(process.stdin, mockOutputStream);
    });

    /** @aiContributed-2026-02-03 */
    describe('sendResponse', () => {
        /** @aiContributed-2026-02-03 */
        it('should write the correct response to the output stream', () => {
            const id = '123';
            const result = { success: true };

            (server as MCPServer).sendResponse(id, result);

            const expectedResponse = JSON.stringify({
                jsonrpc: '2.0',
                id,
                result,
            }) + '\n';

            expect(mockOutputStream.write).toHaveBeenCalledWith(expectedResponse);
            expect(logInfo).toHaveBeenCalledWith(`MCP sent response: id=${id}`);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle null id correctly', () => {
            const id = null;
            const result = { success: true };

            (server as MCPServer).sendResponse(id, result);

            const expectedResponse = JSON.stringify({
                jsonrpc: '2.0',
                id,
                result,
            }) + '\n';

            expect(mockOutputStream.write).toHaveBeenCalledWith(expectedResponse);
            expect(logInfo).toHaveBeenCalledWith(`MCP sent response: id=${id}`);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle undefined result correctly', () => {
            const id = '456';
            const result = undefined;

            (server as MCPServer).sendResponse(id, result);

            const expectedResponse = JSON.stringify({
                jsonrpc: '2.0',
                id,
                result,
            }) + '\n';

            expect(mockOutputStream.write).toHaveBeenCalledWith(expectedResponse);
            expect(logInfo).toHaveBeenCalledWith(`MCP sent response: id=${id}`);
        });

        /** @aiContributed-2026-02-03 */
        it('should throw an error if outputStream.write fails', () => {
            const id = '789';
            const result = { success: false };
            (mockOutputStream.write as jest.Mock).mockImplementation(() => {
                throw new Error('Write failed');
            });

            expect(() => (server as MCPServer).sendResponse(id, result)).toThrow('Write failed');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle numeric id correctly', () => {
            const id = 101;
            const result = { success: true };

            (server as MCPServer).sendResponse(id, result);

            const expectedResponse = JSON.stringify({
                jsonrpc: '2.0',
                id,
                result,
            }) + '\n';

            expect(mockOutputStream.write).toHaveBeenCalledWith(expectedResponse);
            expect(logInfo).toHaveBeenCalledWith(`MCP sent response: id=${id}`);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle empty result correctly', () => {
            const id = '202';
            const result = {};

            (server as MCPServer).sendResponse(id, result);

            const expectedResponse = JSON.stringify({
                jsonrpc: '2.0',
                id,
                result,
            }) + '\n';

            expect(mockOutputStream.write).toHaveBeenCalledWith(expectedResponse);
            expect(logInfo).toHaveBeenCalledWith(`MCP sent response: id=${id}`);
        });
    });
});