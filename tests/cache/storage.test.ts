import * as fs from 'fs';
import { ExtensionContext } from '../__mocks__/vscode';
import {
    deletePayload,
    getPayloadSize,
    listAllPayloads,
    loadPayload,
    payloadExists,
    savePayload,
} from '../../src/services/cache/storage';

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logError: jest.fn(),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    statSync: jest.fn(),
    readdirSync: jest.fn(),
}));

describe('Cache Storage', () => {
    const fsMock = fs as jest.Mocked<typeof fs>;
    const readdirMock = fs.readdirSync as unknown as jest.Mock;
    let context: ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = new ExtensionContext('/mock/extension/path');
    });

    it('Test 1: should skip saving when payload already cached', async () => {
        fsMock.existsSync.mockReturnValue(true);

        const result = await savePayload(context, { data: 'test' }, 'test', 'response');

        expect(result.success).toBe(true);
        expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    });

    it('Test 2: should return error when save fails', async () => {
        fsMock.existsSync.mockReturnValue(false);
        fsMock.writeFileSync.mockImplementation(() => {
            throw new Error('write failed');
        });

        const result = await savePayload(context, { data: 'test' }, 'test', 'response');

        expect(result.success).toBe(false);
        expect(result.error).toContain('write failed');
    });

    it('Test 3: should return error when payload is missing', async () => {
        fsMock.existsSync.mockReturnValue(false);

        const result = await loadPayload(context, 'missing');

        expect(result.success).toBe(false);
        expect(result.payload).toBeNull();
    });

    it('Test 4: should load payload when present', async () => {
        fsMock.existsSync.mockReturnValue(true);
        fsMock.readFileSync.mockReturnValue(
            JSON.stringify({
                hash: 'hash',
                data: { value: 1 },
                source: 'test',
                type: 'response',
                cachedAt: new Date().toISOString(),
            })
        );

        const result = await loadPayload(context, 'hash');

        expect(result.success).toBe(true);
        expect(result.payload?.hash).toBe('hash');
    });

    it('Test 5: should return false when deleting missing payload', async () => {
        fsMock.existsSync.mockReturnValue(false);

        const result = await deletePayload(context, 'missing');

        expect(result).toBe(false);
    });

    it('Test 6: should handle delete errors', async () => {
        fsMock.existsSync.mockReturnValue(true);
        fsMock.unlinkSync.mockImplementation(() => {
            throw new Error('unlink failed');
        });

        const result = await deletePayload(context, 'hash');

        expect(result).toBe(false);
    });

    it('Test 7: should report payload existence', () => {
        fsMock.existsSync.mockReturnValue(true);

        expect(payloadExists(context, 'hash')).toBe(true);
    });

    it('Test 8: should return payload size when file exists', () => {
        fsMock.existsSync.mockReturnValue(true);
        fsMock.statSync.mockReturnValue({ size: 123 } as fs.Stats);

        expect(getPayloadSize(context, 'hash')).toBe(123);
    });

    it('Test 9: should return -1 when payload size is unavailable', () => {
        fsMock.existsSync.mockReturnValue(false);

        expect(getPayloadSize(context, 'hash')).toBe(-1);
    });

    it('Test 10: should list cached payload hashes', () => {
        fsMock.existsSync.mockReturnValue(true);
        readdirMock.mockReturnValue(['a.json', 'b.json', 'cache-index.json']);

        const result = listAllPayloads(context);

        expect(result).toEqual(['a', 'b']);
    });
});
