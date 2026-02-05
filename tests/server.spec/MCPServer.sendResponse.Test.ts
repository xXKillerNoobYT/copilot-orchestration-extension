// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-04 */
describe('MCPServer', () => {
    let mockOutputStream: { write: jest.Mock };
    let server: MCPServer;

    beforeEach(() => {
        mockOutputStream = { write: jest.fn() };
        server = new MCPServer(process.stdin, mockOutputStream as NodeJS.WritableStream);
    });

    /** @aiContributed-2026-02-04 */
    describe('sendResponse', () => {
        /** @aiContributed-2026-02-04 */
        it('should write a valid JSON-RPC response to the output stream', () => {
            const id = 1;
            const result = { success: true };

            (server as unknown as { sendResponse: (id: number, result: object) => void }).sendResponse(id, result);

            const expectedResponse = JSON.stringify({
                jsonrpc: '2.0',
                id,
                result,
            });

            expect(mockOutputStream.write).toHaveBeenCalledWith(expectedResponse);
            expect(Logger.info).toHaveBeenCalledWith(`MCP sent response: id=${id}`);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle null id correctly', () => {
            const id = null;
            const result = { success: true };

            (server as unknown as { sendResponse: (id: null, result: object) => void }).sendResponse(id, result);

            const expectedResponse = JSON.stringify({
                jsonrpc: '2.0',
                id,
                result,
            });

            expect(mockOutputStream.write).toHaveBeenCalledWith(expectedResponse);
            expect(Logger.info).toHaveBeenCalledWith(`MCP sent response: id=${id}`);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle undefined id by not writing to the output stream', () => {
            const id = undefined;
            const result = { success: true };

            (server as unknown as { sendResponse: (id: undefined, result: object) => void }).sendResponse(id, result);

            expect(mockOutputStream.write).not.toHaveBeenCalled();
            expect(Logger.info).not.toHaveBeenCalled();
        });

        /** @aiContributed-2026-02-04 */
        it('should handle string id and complex result', () => {
            const id = 'abc123';
            const result = { data: [1, 2, 3], message: 'Test' };

            (server as unknown as { sendResponse: (id: string, result: object) => void }).sendResponse(id, result);

            const expectedResponse = JSON.stringify({
                jsonrpc: '2.0',
                id,
                result,
            });

            expect(mockOutputStream.write).toHaveBeenCalledWith(expectedResponse);
            expect(Logger.info).toHaveBeenCalledWith(`MCP sent response: id=${id}`);
        });

        /** @aiContributed-2026-02-04 */
        it('should throw an error if outputStream.write fails', () => {
            mockOutputStream.write.mockImplementation(() => {
                throw new Error('Write failed');
            });

            const id = 3;
            const result = { success: false };

            expect(() => (server as unknown as { sendResponse: (id: number, result: object) => void }).sendResponse(id, result)).toThrow('Write failed');
            expect(Logger.info).toHaveBeenCalledWith(`MCP sent response: id=${id}`);
        });
    });
});