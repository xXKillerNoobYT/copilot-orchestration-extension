// ./index.Test.ts
import { resetConfigForTests, getConfigInstance, initializeConfig } from '../../src/config/index';
import * as vscode from 'vscode';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    ExtensionContext: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
    ...jest.requireActual('../../utils/logger'),
    Logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
    },
}));

/** @aiContributed-2026-02-04 */
describe('resetConfigForTests', () => {
    afterEach(() => {
        jest.clearAllMocks();
        resetConfigForTests();
    });

    /** @aiContributed-2026-02-04 */
    it('should reset the configInstance to null', async () => {
        // Arrange
        const mockContext = {} as vscode.ExtensionContext;
        const mockConfig = { key: 'value' };
        jest.spyOn(vscode, 'ExtensionContext').mockReturnValue(mockContext);
        const loadConfigFromFile = jest.fn().mockResolvedValue(mockConfig);
        jest.mock('../../src/config/loader', () => ({
            loadConfigFromFile,
        }));

        // Act
        await initializeConfig(mockContext);
        resetConfigForTests();

        // Assert
        expect(() => getConfigInstance()).toThrow(
            'Config not initialized. Call initializeConfig(context) during extension activation first.'
        );
    });

    /** @aiContributed-2026-02-04 */
    it('should not throw an error when called multiple times', () => {
        // Act & Assert
        expect(() => {
            resetConfigForTests();
            resetConfigForTests();
        }).not.toThrow();
    });
});