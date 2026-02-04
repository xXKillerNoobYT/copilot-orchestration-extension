// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import { Logger } from '../../utils/logger';

/** @aiContributed-2026-02-03 */
describe('ConversationsTreeDataProvider', () => {
    let provider: ConversationsTreeDataProvider;

    beforeEach(() => {
        provider = new ConversationsTreeDataProvider();
        jest.spyOn(Logger, 'debug').mockImplementation(() => {});
        jest.spyOn(Logger, 'info').mockImplementation(() => {});
        jest.spyOn(Logger, 'error').mockImplementation(() => {});
    });

    /** @aiContributed-2026-02-03 */
    describe('formatRelativeTime', () => {
        /** @aiContributed-2026-02-03 */
        it('should return "Unknown time" for null timestamp', () => {
            const result = (provider as unknown as { formatRelativeTime: (timestamp: number | null) => string }).formatRelativeTime(null);
            expect(result).toBe('Unknown time');
        });

        /** @aiContributed-2026-02-03 */
        it('should return "Unknown time" for undefined timestamp', () => {
            const result = (provider as unknown as { formatRelativeTime: (timestamp: number | undefined) => string }).formatRelativeTime(undefined);
            expect(result).toBe('Unknown time');
        });

        /** @aiContributed-2026-02-03 */
        it('should return "just now" for timestamps within the last 60 seconds', () => {
            const now = 1672531200000; // Mocked current time
            jest.spyOn(Date, 'now').mockReturnValue(now);
            const result = (provider as unknown as { formatRelativeTime: (timestamp: number) => string }).formatRelativeTime(now - 30 * 1000);
            expect(result).toBe('just now');
        });

        /** @aiContributed-2026-02-03 */
        it('should return "1 minute ago" for timestamps 1 minute ago', () => {
            const now = 1672531200000; // Mocked current time
            jest.spyOn(Date, 'now').mockReturnValue(now);
            const result = (provider as unknown as { formatRelativeTime: (timestamp: number) => string }).formatRelativeTime(now - 60 * 1000);
            expect(result).toBe('1 minute ago');
        });

        /** @aiContributed-2026-02-03 */
        it('should return "5 minutes ago" for timestamps 5 minutes ago', () => {
            const now = 1672531200000; // Mocked current time
            jest.spyOn(Date, 'now').mockReturnValue(now);
            const result = (provider as unknown as { formatRelativeTime: (timestamp: number) => string }).formatRelativeTime(now - 5 * 60 * 1000);
            expect(result).toBe('5 minutes ago');
        });

        /** @aiContributed-2026-02-03 */
        it('should return "1 hour ago" for timestamps 1 hour ago', () => {
            const now = 1672531200000; // Mocked current time
            jest.spyOn(Date, 'now').mockReturnValue(now);
            const result = (provider as unknown as { formatRelativeTime: (timestamp: number) => string }).formatRelativeTime(now - 60 * 60 * 1000);
            expect(result).toBe('1 hour ago');
        });

        /** @aiContributed-2026-02-03 */
        it('should return "3 hours ago" for timestamps 3 hours ago', () => {
            const now = 1672531200000; // Mocked current time
            jest.spyOn(Date, 'now').mockReturnValue(now);
            const result = (provider as unknown as { formatRelativeTime: (timestamp: number) => string }).formatRelativeTime(now - 3 * 60 * 60 * 1000);
            expect(result).toBe('3 hours ago');
        });

        /** @aiContributed-2026-02-03 */
        it('should return "1 day ago" for timestamps 1 day ago', () => {
            const now = 1672531200000; // Mocked current time
            jest.spyOn(Date, 'now').mockReturnValue(now);
            const result = (provider as unknown as { formatRelativeTime: (timestamp: number) => string }).formatRelativeTime(now - 24 * 60 * 60 * 1000);
            expect(result).toBe('1 day ago');
        });

        /** @aiContributed-2026-02-03 */
        it('should return "7 days ago" for timestamps 7 days ago', () => {
            const now = 1672531200000; // Mocked current time
            jest.spyOn(Date, 'now').mockReturnValue(now);
            const result = (provider as unknown as { formatRelativeTime: (timestamp: number) => string }).formatRelativeTime(now - 7 * 24 * 60 * 60 * 1000);
            expect(result).toBe('7 days ago');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle future timestamps gracefully', () => {
            const now = 1672531200000; // Mocked current time
            jest.spyOn(Date, 'now').mockReturnValue(now);
            const result = (provider as unknown as { formatRelativeTime: (timestamp: number) => string }).formatRelativeTime(now + 1000);
            expect(result).toBe('just now');
        });
    });
});