// ./jsonrpc.Test.ts
import { createErrorResponse } from '../../src/mcpServer/jsonrpc';

/** @aiContributed-2026-02-04 */
describe('createErrorResponse', () => {
    /** @aiContributed-2026-02-04 */
    it('should create a valid JSON-RPC error response with all fields', () => {
        const id = 1;
        const code = -32600;
        const message = 'Invalid Request';
        const response = createErrorResponse(id, code, message);

        expect(response).toEqual({
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message,
            },
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should handle null id correctly', () => {
        const id = null;
        const code = -32700;
        const message = 'Parse error';
        const response = createErrorResponse(id, code, message);

        expect(response).toEqual({
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message,
            },
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should handle undefined id correctly', () => {
        const id = undefined;
        const code = -32000;
        const message = 'Server error';
        const response = createErrorResponse(id, code, message);

        expect(response).toEqual({
            jsonrpc: '2.0',
            id: null,
            error: {
                code,
                message,
            },
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should handle string id correctly', () => {
        const id = 'abc123';
        const code = -32601;
        const message = 'Method not found';
        const response = createErrorResponse(id, code, message);

        expect(response).toEqual({
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message,
            },
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should handle negative error codes', () => {
        const id = 42;
        const code = -12345;
        const message = 'Custom error';
        const response = createErrorResponse(id, code, message);

        expect(response).toEqual({
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message,
            },
        });
    });

    /** @aiContributed-2026-02-04 */
    it('should handle empty message', () => {
        const id = 99;
        const code = -32001;
        const message = '';
        const response = createErrorResponse(id, code, message);

        expect(response).toEqual({
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message,
            },
        });
    });
});