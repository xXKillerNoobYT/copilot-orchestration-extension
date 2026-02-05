// ./orchestrator.Test.ts
import { resetOrchestratorForTests, getOrchestratorInstance, initializeOrchestrator } from '../../src/services/orchestrator';
import * as vscode from 'vscode';

jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    workspace: {
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn(),
    }),
  },
}));

/** @aiContributed-2026-02-04 */
describe('resetOrchestratorForTests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-04 */
    it('should reset the orchestrator instance and its state', async () => {
    // Initialize the orchestrator
    const mockContext = {} as vscode.ExtensionContext;
    await initializeOrchestrator(mockContext);

    // Verify the orchestrator instance is initialized
    const orchestrator = getOrchestratorInstance();
    expect(orchestrator).not.toBeNull();

    // Call resetOrchestratorForTests
    resetOrchestratorForTests();

    // Verify the orchestrator instance is reset
    expect(() => getOrchestratorInstance()).toThrowError('Orchestrator not initialized');
  });

  /** @aiContributed-2026-02-04 */
    it('should not throw an error if called when orchestrator is not initialized', () => {
    // Ensure orchestrator is not initialized
    resetOrchestratorForTests();

    // Call resetOrchestratorForTests again
    expect(() => resetOrchestratorForTests()).not.toThrow();
  });
});