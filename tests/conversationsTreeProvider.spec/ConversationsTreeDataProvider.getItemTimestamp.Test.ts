// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    TreeItem: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('ConversationsTreeDataProvider', () => {
    let provider: ConversationsTreeDataProvider;

    beforeEach(() => {
        provider = new ConversationsTreeDataProvider();
    });

    /** @aiContributed-2026-02-04 */
    describe('getItemTimestamp', () => {
        /** @aiContributed-2026-02-04 */
        it('should return the timestamp if it is a number', () => {
            const mockItem: { timestamp: number } = { timestamp: 1627849200000 };
            const result = provider['getItemTimestamp'](mockItem);
            expect(result).toBe(1627849200000);
        });

        /** @aiContributed-2026-02-04 */
        it('should return 0 if the timestamp is not a number', () => {
            const mockItem: { timestamp: string } = { timestamp: 'invalid' };
            const result = provider['getItemTimestamp'](mockItem);
            expect(result).toBe(0);
        });

        /** @aiContributed-2026-02-04 */
        it('should return 0 if the timestamp is undefined', () => {
            const mockItem: { timestamp?: number } = {};
            const result = provider['getItemTimestamp'](mockItem);
            expect(result).toBe(0);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle items without a timestamp property gracefully', () => {
            const mockItem: Record<string, never> = {};
            const result = provider['getItemTimestamp'](mockItem);
            expect(result).toBe(0);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle items with a timestamp of 0 correctly', () => {
            const mockItem: { timestamp: number } = { timestamp: 0 };
            const result = provider['getItemTimestamp'](mockItem);
            expect(result).toBe(0);
        });

        /** @aiContributed-2026-02-04 */
        it('should log debug information during execution', () => {
            jest.spyOn(Logger, 'debug');
            const mockItem: { timestamp: number } = { timestamp: 1627849200000 };
            provider['getItemTimestamp'](mockItem);
            expect(Logger.debug).toHaveBeenCalled();
        });
    });
});