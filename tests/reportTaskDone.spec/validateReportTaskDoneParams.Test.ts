// ./reportTaskDone.Test.ts
import { validateReportTaskDoneParams } from '../../src/mcpServer/tools/reportTaskDone';

/** @aiContributed-2026-02-04 */
describe('validateReportTaskDoneParams', () => {
    /** @aiContributed-2026-02-04 */
    it('should return isValid true for valid parameters', () => {
        const params = {
            taskId: '123',
            status: 'done',
            taskDescription: 'Task description',
            codeDiff: 'Code diff',
            notes: 'Some notes',
        };
        const result = validateReportTaskDoneParams(params);
        expect(result).toEqual({ isValid: true });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid false if params is null', () => {
        const result = validateReportTaskDoneParams(null);
        expect(result).toEqual({ isValid: false, error: 'Parameters must be an object' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid false if params is not an object', () => {
        const result = validateReportTaskDoneParams('invalid');
        expect(result).toEqual({ isValid: false, error: 'Parameters must be an object' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid false if taskId is missing', () => {
        const params = { status: 'done' };
        const result = validateReportTaskDoneParams(params);
        expect(result).toEqual({ isValid: false, error: 'taskId is required and must be a string' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid false if taskId is not a string', () => {
        const params = { taskId: 123, status: 'done' };
        const result = validateReportTaskDoneParams(params);
        expect(result).toEqual({ isValid: false, error: 'taskId is required and must be a string' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid false if status is missing', () => {
        const params = { taskId: '123' };
        const result = validateReportTaskDoneParams(params);
        expect(result).toEqual({ isValid: false, error: 'status must be one of: done, failed, blocked, partial' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid false if status is invalid', () => {
        const params = { taskId: '123', status: 'invalid' };
        const result = validateReportTaskDoneParams(params);
        expect(result).toEqual({ isValid: false, error: 'status must be one of: done, failed, blocked, partial' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid false if codeDiff is not a string', () => {
        const params = { taskId: '123', status: 'done', codeDiff: 123 };
        const result = validateReportTaskDoneParams(params);
        expect(result).toEqual({ isValid: false, error: 'codeDiff must be a string if provided' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid false if taskDescription is not a string', () => {
        const params = { taskId: '123', status: 'done', taskDescription: 123 };
        const result = validateReportTaskDoneParams(params);
        expect(result).toEqual({ isValid: false, error: 'taskDescription must be a string if provided' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid false if notes is not a string', () => {
        const params = { taskId: '123', status: 'done', notes: 123 };
        const result = validateReportTaskDoneParams(params);
        expect(result).toEqual({ isValid: false, error: 'notes must be a string if provided' });
    });
});