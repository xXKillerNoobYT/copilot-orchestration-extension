// ./orchestratorStatusTreeProvider.Test.ts
import { EventEmitter } from 'vscode';
import { OrchestratorStatusTreeDataProvider } from '../../src/ui/orchestratorStatusTreeProvider';
import { Logger } from '../../utils/logger';

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-04 */
describe('OrchestratorStatusTreeDataProvider', () => {
    let provider: OrchestratorStatusTreeDataProvider;
    let fireMock: jest.Mock;

    beforeEach(() => {
        fireMock = jest.fn();
        provider = new OrchestratorStatusTreeDataProvider();
        (provider as unknown as { _onDidChangeTreeData: EventEmitter<void> })._onDidChangeTreeData = { fire: fireMock } as EventEmitter<void>;
    });

    /** @aiContributed-2026-02-04 */
    describe('refresh', () => {
        /** @aiContributed-2026-02-04 */
        it('should fire the onDidChangeTreeData event', () => {
            provider.refresh();
            expect(fireMock).toHaveBeenCalledTimes(1);
            expect(Logger.debug).toHaveBeenCalledWith('refresh() called');
        });

        /** @aiContributed-2026-02-04 */
        it('should handle multiple calls gracefully', () => {
            provider.refresh();
            provider.refresh();
            expect(fireMock).toHaveBeenCalledTimes(2);
        });

        /** @aiContributed-2026-02-04 */
        it('should not throw an error if _onDidChangeTreeData is undefined', () => {
            (provider as unknown as { _onDidChangeTreeData?: EventEmitter<void> })._onDidChangeTreeData = undefined;
            expect(() => provider.refresh()).not.toThrow();
        });
    });
});