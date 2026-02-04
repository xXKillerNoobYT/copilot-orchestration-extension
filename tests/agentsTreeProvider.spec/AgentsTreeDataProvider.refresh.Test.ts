// ./agentsTreeProvider.Test.ts
import * as vscode from 'vscode';
import { AgentsTreeDataProvider } from '../../src/ui/agentsTreeProvider';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => {
    const EventEmitter = jest.fn(() => ({
        ...jest.requireActual('vscode'),
        fire: jest.fn(),
    }));
    return {
        EventEmitter,
    };
});

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-03 */
describe('AgentsTreeDataProvider', () => {
    let dataProvider: AgentsTreeDataProvider;
    let mockEventEmitter: vscode.EventEmitter<void>;

    beforeEach(() => {
        mockEventEmitter = new vscode.EventEmitter<void>();
        jest.spyOn(vscode, 'EventEmitter').mockImplementation(() => mockEventEmitter);
        dataProvider = new AgentsTreeDataProvider();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-03 */
    describe('refresh', () => {
        /** @aiContributed-2026-02-03 */
        it('should fire the onDidChangeTreeData event', () => {
            const fireSpy = jest.spyOn(mockEventEmitter, 'fire');
            dataProvider.refresh();
            expect(fireSpy).toHaveBeenCalledTimes(1);
            expect(Logger.debug).toHaveBeenCalledWith('refresh() called, onDidChangeTreeData event fired');
        });

        /** @aiContributed-2026-02-03 */
        it('should not throw any errors when called', () => {
            expect(() => dataProvider.refresh()).not.toThrow();
        });
    });
});