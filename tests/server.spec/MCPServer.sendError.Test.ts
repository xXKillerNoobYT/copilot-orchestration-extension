// ./server.Test.ts
import { MCPServer } from '../../src/mcpServer/server';
import { logWarn } from '../../src/logger';

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logWarn: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('MCPServer', () => {
    let mockOutputStream: { write: jest.Mock };
    let server: MCPServer;

    beforeEach(() => {
        mockOutputStream = { write: jest.fn() };
        server = new MCPServer(process.stdin, mockOutputStream);
    });

    /** @aiContributed-2026-02-03 */
    describe('sendError', () => {
        /** @aiContributed-2026-02-03 */
        it('should write the correct error response to the output stream', () => {
            const id = 1;
            const code = 500;
            const message = 'Internal Server Error';

            server.sendError(id, code, message);

            const expectedResponse = JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code, message },
            }) + '\n';

            expect(mockOutputStream.write).toHaveBeenCalledWith(expectedResponse);
        });

        /** @aiContributed-2026-02-03 */
        it('should log a warning with the correct message', () => {
            const id = null;
            const code = 404;
            const message = 'Not Found';

            server.sendError(id, code, message);

            expect(logWarn).toHaveBeenCalledWith(
                `MCP sent error: id=${id}, code=${code}, message=${message}`
            );
        });

        /** @aiContributed-2026-02-03 */
        it('should handle undefined id gracefully', () => {
            const id = undefined;
            const code = 400;
            const message = 'Bad Request';

            server.sendError(id, code, message);

            const expectedResponse = JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code, message },
            }) + '\n';

            expect(mockOutputStream.write).toHaveBeenCalledWith(expectedResponse);
            expect(logWarn).toHaveBeenCalledWith(
                `MCP sent error: id=${id}, code=${code}, message=${message}`
            );
        });

        /** @aiContributed-2026-02-03 */
        it('should handle null message gracefully', () => {
            const id = 123;
            const code = 401;
            const message = null;

            server.sendError(id, code, message);

            const expectedResponse = JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code, message },
            }) + '\n';

            expect(mockOutputStream.write).toHaveBeenCalledWith(expectedResponse);
            expect(logWarn).toHaveBeenCalledWith(
                `MCP sent error: id=${id}, code=${code}, message=${message}`
            );
        });
    });
});