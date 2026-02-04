// ./ticketsTreeProvider.Test.ts
import { EventEmitter } from 'vscode';
import { TicketsTreeDataProvider } from '../../src/ui/ticketsTreeProvider';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    EventEmitter: jest.fn().mockImplementation(() => ({
        fire: jest.fn(),
    })),
}));

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('TicketsTreeDataProvider', () => {
    let dataProvider: TicketsTreeDataProvider;
    let mockEventEmitter: EventEmitter<void>;

    beforeEach(() => {
        mockEventEmitter = new EventEmitter<void>();
        (EventEmitter as jest.Mock).mockImplementation(() => mockEventEmitter);
        dataProvider = new TicketsTreeDataProvider();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    describe('refresh', () => {
        /** @aiContributed-2026-02-03 */
        it('should fire the onDidChangeTreeData event', () => {
            dataProvider.refresh();
            expect(mockEventEmitter.fire).toHaveBeenCalledTimes(1);
        });

        /** @aiContributed-2026-02-03 */
        it('should log a debug message when refresh is called', () => {
            dataProvider.refresh();
            expect(Logger.debug).toHaveBeenCalledWith('Refresh method called, onDidChangeTreeData event fired.');
        });
    });
});