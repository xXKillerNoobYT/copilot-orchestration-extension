import * as fs from 'fs';
import * as vscode from 'vscode';
import { ExtensionContext } from '../__mocks__/vscode';
import {
    createExampleConfig,
    isFirstRun,
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
});
