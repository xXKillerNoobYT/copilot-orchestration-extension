// ./askQuestion.Test.ts
import { validateAskQuestionParams } from '../../src/mcpServer/tools/askQuestion';

/** @aiContributed-2026-02-04 */
describe('validateAskQuestionParams', () => {
    /** @aiContributed-2026-02-04 */
    it('should return isValid: true for valid parameters', () => {
        const params = { question: 'What is the capital of France?', chatId: '12345' };
        const result = validateAskQuestionParams(params);
        expect(result).toEqual({ isValid: true });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid: false and error for null parameters', () => {
        const result = validateAskQuestionParams(null);
        expect(result).toEqual({ isValid: false, error: 'Parameters must be an object' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid: false and error for undefined parameters', () => {
        const result = validateAskQuestionParams(undefined);
        expect(result).toEqual({ isValid: false, error: 'Parameters must be an object' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid: false and error for non-object parameters', () => {
        const result = validateAskQuestionParams('invalid');
        expect(result).toEqual({ isValid: false, error: 'Parameters must be an object' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid: false and error for missing question', () => {
        const params = { chatId: '12345' };
        const result = validateAskQuestionParams(params);
        expect(result).toEqual({ isValid: false, error: 'question is required and must be a non-empty string' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid: false and error for empty question', () => {
        const params = { question: '', chatId: '12345' };
        const result = validateAskQuestionParams(params);
        expect(result).toEqual({ isValid: false, error: 'question is required and must be a non-empty string' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid: false and error for non-string question', () => {
        const params = { question: 12345, chatId: '12345' };
        const result = validateAskQuestionParams(params);
        expect(result).toEqual({ isValid: false, error: 'question is required and must be a non-empty string' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid: false and error for non-string chatId', () => {
        const params = { question: 'What is the capital of France?', chatId: 12345 };
        const result = validateAskQuestionParams(params);
        expect(result).toEqual({ isValid: false, error: 'chatId must be a string if provided' });
    });

    /** @aiContributed-2026-02-04 */
    it('should return isValid: true for valid parameters without chatId', () => {
        const params = { question: 'What is the capital of France?' };
        const result = validateAskQuestionParams(params);
        expect(result).toEqual({ isValid: true });
    });
});