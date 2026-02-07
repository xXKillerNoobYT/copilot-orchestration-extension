import * as fs from 'fs';
import * as vscode from 'vscode';
import { ExtensionContext } from '../__mocks__/vscode';
import {
    createExampleConfig,
    isFirstRun,
    promptForOnboarding,
    runOnboarding,
    showOnboardingTips,
    validateConfigSetup,
} from '../../src/config/onboarding';

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logWarn: jest.fn(),
}));

describe('Config Onboarding', () => {
    const fsMock = fs as jest.Mocked<typeof fs>;
    let context: ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        context = new ExtensionContext('/mock/extension/path');
    });

    it('Test 1: should detect first run when config missing', () => {
        fsMock.existsSync.mockReturnValue(false);

        expect(isFirstRun(context)).toBe(true);
    });

    it('Test 2: should detect non-first run when config exists', () => {
        fsMock.existsSync.mockReturnValue(true);

        expect(isFirstRun(context)).toBe(false);
    });

    it('Test 3: should run onboarding without opening config', async () => {
        fsMock.existsSync.mockReturnValue(false);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Later');

        const result = await runOnboarding(context);

        expect(result.success).toBe(true);
        expect(result.configCreated).toBe(true);
        expect(result.configPath).toContain('config.json');
        expect(vscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    it('Test 4: should open config when user selects Open Config', async () => {
        fsMock.existsSync.mockReturnValue(false);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Open Config');
        (vscode as unknown as { Uri: { file: jest.Mock } }).Uri = {
            file: jest.fn().mockReturnValue({ fsPath: '/mock/extension/path/.coe/config.json' }),
        };

        const result = await runOnboarding(context);

        expect(result.success).toBe(true);
        expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('Test 5: should create example config file', () => {
        fsMock.existsSync.mockReturnValue(false);

        const result = createExampleConfig(context);

        expect(result).toContain('config.json.example');
        expect(fsMock.writeFileSync).toHaveBeenCalled();
    });

    it('Test 6: should validate config setup when files exist', () => {
        fsMock.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(true);

        expect(validateConfigSetup(context)).toBe(true);
    });

    it('Test 7: should report invalid config setup when directory missing', () => {
        fsMock.existsSync.mockReturnValue(false);

        expect(validateConfigSetup(context)).toBe(false);
    });

    it('Test 8: should show onboarding tips', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Ok');

        await showOnboardingTips(context);

        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('Test 9: should report invalid config setup when config file missing', () => {
        // Directory exists but config file doesn't
        fsMock.existsSync
            .mockReturnValueOnce(true)  // coeDir exists
            .mockReturnValueOnce(false); // configPath does not exist

        expect(validateConfigSetup(context)).toBe(false);
    });

    it('Test 10: promptForOnboarding should return true when user selects Yes', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Yes');

        const result = await promptForOnboarding();

        expect(result).toBe(true);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Copilot Orchestration Extension needs to be configured. ' +
            'Would you like to set it up now?',
            'Yes',
            'Not Now'
        );
    });

    it('Test 11: promptForOnboarding should return false when user selects Not Now', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Not Now');

        const result = await promptForOnboarding();

        expect(result).toBe(false);
    });

    it('Test 12: promptForOnboarding should return false when user dismisses dialog', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

        const result = await promptForOnboarding();

        expect(result).toBe(false);
    });

    it('Test 13: createExampleConfig should return null when write fails', () => {
        fsMock.existsSync.mockReturnValue(false);
        fsMock.writeFileSync.mockImplementation(() => {
            throw new Error('Permission denied');
        });

        const result = createExampleConfig(context);

        expect(result).toBeNull();
    });

    it('Test 14: createExampleConfig should return null when non-Error thrown', () => {
        fsMock.existsSync.mockReturnValue(false);
        fsMock.writeFileSync.mockImplementation(() => {
            throw 'String error'; // Non-Error type
        });

        const result = createExampleConfig(context);

        expect(result).toBeNull();
    });

    it('Test 15: runOnboarding should handle createDefaultConfigFile failure', async () => {
        // Make writeFileSync throw to simulate createDefaultConfigFile returning null
        fsMock.existsSync.mockReturnValue(false);
        fsMock.writeFileSync.mockImplementationOnce(() => {
            throw new Error('Write failed');
        });

        const result = await runOnboarding(context);

        expect(result.success).toBe(false);
        expect(result.configCreated).toBe(false);
    });

    it('Test 16: runOnboarding should handle exception during execution', async () => {
        fsMock.existsSync.mockReturnValue(false);
        // writeFileSync succeeds (for config creation)
        fsMock.writeFileSync.mockImplementation(() => { /* success */ });
        // But showInformationMessage throws after config is created
        (vscode.window.showInformationMessage as jest.Mock).mockImplementation(() => {
            throw new Error('VS Code error');
        });

        const result = await runOnboarding(context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('VS Code error');
    });

    it('Test 17: runOnboarding should handle non-Error exception', async () => {
        fsMock.existsSync.mockReturnValue(false);
        // writeFileSync succeeds
        fsMock.writeFileSync.mockImplementation(() => { /* success */ });
        // Throw a non-Error object
        (vscode.window.showInformationMessage as jest.Mock).mockImplementation(() => {
            throw 'String error thrown';
        });

        const result = await runOnboarding(context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('String error thrown');
    });
});
