// jsonrpc.ts
// JSON-RPC 2.0 parsing and validation helpers

/**
 * JSON-RPC 2.0 request structure
 */
export interface JsonRpcRequest {
    jsonrpc: string;
    method: string;
    params?: any;
    id?: string | number | null;
}

/**
 * JSON-RPC 2.0 response structure
 */
export interface JsonRpcResponse {
    jsonrpc: string;
    id: string | number | null;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}

/**
 * Result of parsing a JSON-RPC message
 */
export interface JsonRpcParseResult {
    requests: JsonRpcRequest[];
    errors: JsonRpcResponse[];
    isBatch: boolean;
}

/**
 * Create a JSON-RPC error response
 * 
 * **Simple explanation**: Builds the standard error message shape when something goes wrong.
 */
export function createErrorResponse(id: string | number | null, code: number, message: string): JsonRpcResponse {
    return {
        jsonrpc: '2.0',
        id,
        error: {
            code,
            message
        }
    };
}

/**
 * Parse and validate a JSON-RPC message
 * 
 * **Simple explanation**: Turns raw text into validated JSON-RPC requests (or errors).
 */
export function parseJsonRpcMessage(raw: string): JsonRpcParseResult {
    try {
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
            if (parsed.length === 0) {
                return {
                    requests: [],
                    errors: [createErrorResponse(null, -32600, 'Invalid Request: empty batch')],
                    isBatch: true
                };
            }

            const requests: JsonRpcRequest[] = [];
            const errors: JsonRpcResponse[] = [];

            parsed.forEach((item) => {
                const validation = validateRequest(item);
                if (validation.isValid && validation.request) {
                    requests.push(validation.request);
                } else if (validation.errorResponse) {
                    errors.push(validation.errorResponse);
                }
            });

            return {
                requests,
                errors,
                isBatch: true
            };
        }

        const validation = validateRequest(parsed);
        if (validation.isValid && validation.request) {
            return {
                requests: [validation.request],
                errors: [],
                isBatch: false
            };
        }

        return {
            requests: [],
            errors: validation.errorResponse ? [validation.errorResponse] : [],
            isBatch: false
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            requests: [],
            errors: [createErrorResponse(null, -32700, `Parse error: ${message}`)],
            isBatch: false
        };
    }
}

function validateRequest(payload: any): { isValid: boolean; request?: JsonRpcRequest; errorResponse?: JsonRpcResponse } {
    if (!payload || typeof payload !== 'object') {
        return {
            isValid: false,
            errorResponse: createErrorResponse(null, -32600, 'Invalid Request: request must be an object')
        };
    }

    if (payload.jsonrpc !== '2.0') {
        return {
            isValid: false,
            errorResponse: createErrorResponse(payload.id ?? null, -32600, 'Invalid Request: jsonrpc must be "2.0"')
        };
    }

    if (!payload.method || typeof payload.method !== 'string') {
        return {
            isValid: false,
            errorResponse: createErrorResponse(payload.id ?? null, -32600, 'Invalid Request: method must be a string')
        };
    }

    return {
        isValid: true,
        request: payload as JsonRpcRequest
    };
}
