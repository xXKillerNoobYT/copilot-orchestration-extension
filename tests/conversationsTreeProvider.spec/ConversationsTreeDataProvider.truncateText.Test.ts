// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';

/** @aiContributed-2026-02-03 */
describe('ConversationsTreeDataProvider - truncateText', () => {
    let provider: ConversationsTreeDataProvider;

    beforeEach(() => {
        provider = new ConversationsTreeDataProvider();
    });

    /** @aiContributed-2026-02-03 */
    it('should return the original text if its length is less than or equal to maxLength', () => {
        const text = 'Short text';
        const maxLength = 20;
        const result = provider['truncateText'](text, maxLength);
        expect(result).toBe(text);
    });

    /** @aiContributed-2026-02-03 */
    it('should truncate the text and append "..." if its length exceeds maxLength', () => {
        const text = 'This is a very long text that needs to be truncated';
        const maxLength = 10;
        const result = provider['truncateText'](text, maxLength);
        expect(result).toBe('This is a ...');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle empty text input', () => {
        const text = '';
        const maxLength = 10;
        const result = provider['truncateText'](text, maxLength);
        expect(result).toBe('');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle maxLength of 0', () => {
        const text = 'Non-empty text';
        const maxLength = 0;
        const result = provider['truncateText'](text, maxLength);
        expect(result).toBe('...');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle maxLength less than 0', () => {
        const text = 'Negative maxLength';
        const maxLength = -5;
        const result = provider['truncateText'](text, maxLength);
        expect(result).toBe('...');
    });

    /** @aiContributed-2026-02-03 */
    it('should throw an error if text is null', () => {
        expect(() => provider['truncateText'](null as unknown as string, 10)).toThrow();
    });

    /** @aiContributed-2026-02-03 */
    it('should throw an error if text is undefined', () => {
        expect(() => provider['truncateText'](undefined as unknown as string, 10)).toThrow();
    });

    /** @aiContributed-2026-02-03 */
    it('should handle text with special characters', () => {
        const text = 'Special!@#$%^&*()_+';
        const maxLength = 10;
        const result = provider['truncateText'](text, maxLength);
        expect(result).toBe('Special!@#...');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle text with whitespace only', () => {
        const text = '          ';
        const maxLength = 5;
        const result = provider['truncateText'](text, maxLength);
        expect(result).toBe('     ...');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle text with multibyte characters', () => {
        const text = 'こんにちは世界'; // "Hello World" in Japanese
        const maxLength = 5;
        const result = provider['truncateText'](text, maxLength);
        expect(result).toBe('こん...');
    });
});