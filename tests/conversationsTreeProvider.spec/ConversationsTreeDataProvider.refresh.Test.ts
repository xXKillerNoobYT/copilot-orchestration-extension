// ./conversationsTreeProvider.Test.ts
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';
import * as vscode from 'vscode';
import { logInfo } from '../../src/logger';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    EventEmitter: jest.fn().mockImplementation(() => ({
        fire: jest.fn(),
    })),
}));

jest.mock('../../src/logger', () => ({
    ...jest.requireActual('../../src/logger'),
    logInfo: jest.fn(),
}));

/** @aiContributed-2026-02-04 */
describe('ConversationsTreeDataProvider', () => {
    let provider: ConversationsTreeDataProvider;
    let mockEventEmitter: vscode.EventEmitter<void>;

    beforeEach(() => {
        mockEventEmitter = new vscode.EventEmitter<void>();
        jest.spyOn(vscode, 'EventEmitter').mockImplementation(() => mockEventEmitter);
        provider = new ConversationsTreeDataProvider();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /** @aiContributed-2026-02-04 */
    describe('refresh', () => {
        /** @aiContributed-2026-02-04 */
        it('should log a refresh message and fire the onDidChangeTreeData event', () => {
            provider.refresh();

            expect(logInfo).toHaveBeenCalledWith('[ConversationsTreeProvider] Refreshing...');
            expect(mockEventEmitter.fire).toHaveBeenCalledTimes(1);
        });

        /** @aiContributed-2026-02-04 */
        it('should handle multiple refresh calls gracefully', () => {
            provider.refresh();
            provider.refresh();

            expect(logInfo).toHaveBeenCalledTimes(2);
            expect(mockEventEmitter.fire).toHaveBeenCalledTimes(2);
        });

        /** @aiContributed-2026-02-04 */
        it('should not throw an error if the event emitter is undefined', () => {
            (provider as unknown as { _onDidChangeTreeData: vscode.EventEmitter<void> | undefined })._onDidChangeTreeData = undefined;

            expect(() => provider.refresh()).not.toThrow();
            expect(logInfo).toHaveBeenCalledWith('[ConversationsTreeProvider] Refreshing...');
        });

        /** @aiContributed-2026-02-04 */
        it('should not log or fire events if refresh is called on an uninitialized provider', () => {
            provider = undefined as unknown as ConversationsTreeDataProvider;

            expect(() => provider.refresh()).toThrow();
            expect(logInfo).not.toHaveBeenCalled();
            expect(mockEventEmitter.fire).not.toHaveBeenCalled();
        });
    });
});