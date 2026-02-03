// ./orchestrator.Test.ts
import { getOrchestratorInstance, resetOrchestratorForTests } from '../../src/services/orchestrator';
import { OrchestratorService } from '../../src/services/orchestrator';

/** @aiContributed-2026-02-03 */
describe('getOrchestratorInstance', () => {
  beforeEach(() => {
    resetOrchestratorForTests();
  });

  /** @aiContributed-2026-02-03 */
    it('should return an instance of OrchestratorService', () => {
    const instance = getOrchestratorInstance();
    expect(instance).toBeInstanceOf(OrchestratorService);
  });

  /** @aiContributed-2026-02-03 */
    it('should throw an error if the orchestrator is not initialized', () => {
    resetOrchestratorForTests();
    expect(() => getOrchestratorInstance()).toThrowError('Orchestrator not initialized');
  });

  /** @aiContributed-2026-02-03 */
    it('should return the same instance on multiple calls', () => {
    const instance1 = getOrchestratorInstance();
    const instance2 = getOrchestratorInstance();
    expect(instance1).toBe(instance2);
  });
});