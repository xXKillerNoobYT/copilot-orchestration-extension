// ./validateGetErrorsParams.Test.ts
import { validateGetErrorsParams } from '../../src/mcpServer/tools/getErrors';

/** @aiContributed-2026-02-04 */
describe('validateGetErrorsParams', () => {
    /** @aiContributed-2026-02-04 */
    it('Test 1: should validate undefined params as valid', () => {
        const result = validateGetErrorsParams(undefined);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
    });

    /** @aiContributed-2026-02-04 */
    it('Test 2: should validate null params as valid', () => {
        const result = validateGetErrorsParams(null);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
    });

    /** @aiContributed-2026-02-04 */
    it('Test 3: should validate empty object as valid', () => {
        const result = validateGetErrorsParams({});
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
    });

    /** @aiContributed-2026-02-04 */
    it('Test 4: should validate object with properties as valid', () => {
        const result = validateGetErrorsParams({ someProperty: 'value' });
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
    });

    /** @aiContributed-2026-02-04 */
    it('Test 5: should reject non-object params (string)', () => {
        const result = validateGetErrorsParams('invalid');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Parameters must be an object or undefined');
    });

    /** @aiContributed-2026-02-04 */
    it('Test 6: should reject non-object params (number)', () => {
        const result = validateGetErrorsParams(42);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Parameters must be an object or undefined');
    });

    /** @aiContributed-2026-02-04 */
    it('Test 7: should reject non-object params (boolean)', () => {
        const result = validateGetErrorsParams(true);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Parameters must be an object or undefined');
    });

    /** @aiContributed-2026-02-04 */
    it('Test 8: should reject non-object params (array)', () => {
        const result = validateGetErrorsParams([1, 2, 3]);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Parameters must be an object or undefined');
    });
});
