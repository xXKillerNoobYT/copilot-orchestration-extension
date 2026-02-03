// ./ticketsTreeProvider.Test.ts
import { TicketsTreeDataProvider } from '../../src/ui/ticketsTreeProvider';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    ThemeIcon: jest.fn().mockImplementation((id: string) => ({ id })),
}));

/** @aiContributed-2026-02-03 */
describe('TicketsTreeDataProvider', () => {
    let provider: TicketsTreeDataProvider;

    beforeEach(() => {
        provider = new TicketsTreeDataProvider();
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    describe('getIconForStatus', () => {
        /** @aiContributed-2026-02-03 */
        it('should return "issue-opened" icon for "open" status', () => {
            const result = provider['getIconForStatus']('open');
            expect(result).toEqual({ id: 'issue-opened' });
        });

        /** @aiContributed-2026-02-03 */
        it('should return "sync~spin" icon for "in-progress" status', () => {
            const result = provider['getIconForStatus']('in-progress');
            expect(result).toEqual({ id: 'sync~spin' });
        });

        /** @aiContributed-2026-02-03 */
        it('should return "warning" icon for "blocked" status', () => {
            const result = provider['getIconForStatus']('blocked');
            expect(result).toEqual({ id: 'warning' });
        });

        /** @aiContributed-2026-02-03 */
        it('should return "circle-outline" icon for unknown status', () => {
            const result = provider['getIconForStatus']('unknown');
            expect(result).toEqual({ id: 'circle-outline' });
        });

        /** @aiContributed-2026-02-03 */
        it('should return "circle-outline" icon for null status', () => {
            const result = provider['getIconForStatus'](null as unknown as string);
            expect(result).toEqual({ id: 'circle-outline' });
        });

        /** @aiContributed-2026-02-03 */
        it('should return "circle-outline" icon for undefined status', () => {
            const result = provider['getIconForStatus'](undefined as unknown as string);
            expect(result).toEqual({ id: 'circle-outline' });
        });
    });
});