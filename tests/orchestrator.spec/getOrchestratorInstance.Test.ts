// ./orchestrator.Test.ts
import { getOrchestratorInstance, resetOrchestratorForTests, initializeOrchestrator } from '../../src/services/orchestrator';
import { OrchestratorService } from '../../src/services/orchestrator';
import * as vscode from 'vscode';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    ExtensionContext: jest.fn(),
}));

/** @aiContributed-2026-02-03 */
describe('getOrchestratorInstance', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    resetOrchestratorForTests();
    mockContext = { extensionPath: '/mock/path' } as unknown as vscode.ExtensionContext;
  });

  /** @aiContributed-2026-02-03 */
    it('should return an instance of OrchestratorService after initialization', async () => {
    await initializeOrchestrator(mockContext);
    const instance = getOrchestratorInstance();
    expect(instance).toBeInstanceOf(OrchestratorService);
  });

  /** @aiContributed-2026-02-03 */
    it('should throw an error if the orchestrator is not initialized', () => {
    expect(() => getOrchestratorInstance()).toThrowError('Orchestrator not initialized');
  });

  /** @aiContributed-2026-02-03 */
    it('should return the same instance on multiple calls after initialization', async () => {
    await initializeOrchestrator(mockContext);
    const instance1 = getOrchestratorInstance();
    const instance2 = getOrchestratorInstance();
    expect(instance1).toBe(instance2);
  });

  /** @aiContributed-2026-02-03 */
    it('should log a warning if initializeOrchestrator is called multiple times', async () => {
    const logWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    await initializeOrchestrator(mockContext);
    await initializeOrchestrator(mockContext);
    expect(logWarnSpy).toHaveBeenCalledWith('Orchestrator already initialized');
    logWarnSpy.mockRestore();
  });
});