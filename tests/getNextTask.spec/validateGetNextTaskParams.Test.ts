// ./getNextTask.Test.ts
import { validateGetNextTaskParams } from '../../src/mcpServer/tools/getNextTask';

/** @aiContributed-2026-02-03 */
describe('validateGetNextTaskParams', () => {
    /** @aiContributed-2026-02-03 */
    it('should return isValid: true when params is undefined', () => {
        const result = validateGetNextTaskParams(undefined);
        expect(result).toEqual({ isValid: true });
    });

    /** @aiContributed-2026-02-03 */
    it('should return isValid: true when params is null', () => {
        const result = validateGetNextTaskParams(null);
        expect(result).toEqual({ isValid: true });
    });

    /** @aiContributed-2026-02-03 */
    it('should return isValid: false when params is not an object', () => {
        const result = validateGetNextTaskParams('invalid');
        expect(result).toEqual({
            isValid: false,
            error: 'Parameters must be an object',
        });
    });

    /** @aiContributed-2026-02-03 */
    it('should return isValid: true when params is an empty object', () => {
        const result = validateGetNextTaskParams({});
        expect(result).toEqual({ isValid: true });
    });

    /** @aiContributed-2026-02-03 */
    it('should return isValid: true when filter is valid', () => {
        const result = validateGetNextTaskParams({ filter: 'ready' });
        expect(result).toEqual({ isValid: true });
    });

    /** @aiContributed-2026-02-03 */
    it('should return isValid: false when filter is invalid', () => {
        const result = validateGetNextTaskParams({ filter: 'invalid' });
        expect(result).toEqual({
            isValid: false,
            error: "Invalid filter 'invalid'. Valid options: ready, blocked, all",
        });
    });

    /** @aiContributed-2026-02-03 */
    it('should return isValid: true when includeContext is a boolean', () => {
        const result = validateGetNextTaskParams({ includeContext: true });
        expect(result).toEqual({ isValid: true });
    });

    /** @aiContributed-2026-02-03 */
    it('should return isValid: false when includeContext is not a boolean', () => {
        const result = validateGetNextTaskParams({ includeContext: 'invalid' });
        expect(result).toEqual({
            isValid: false,
            error: 'includeContext must be a boolean',
        });
    });

    /** @aiContributed-2026-02-03 */
    it('should return isValid: true when both filter and includeContext are valid', () => {
        const result = validateGetNextTaskParams({
            filter: 'blocked',
            includeContext: false,
        });
        expect(result).toEqual({ isValid: true });
    });
});