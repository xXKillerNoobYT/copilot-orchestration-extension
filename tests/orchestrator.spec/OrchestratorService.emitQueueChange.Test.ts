// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { EventEmitter } from 'events';
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
describe('OrchestratorService', () => {
  let orchestratorService: OrchestratorService;
  let mockQueueChangeEmitter: EventEmitter;

  beforeEach(() => {
    mockQueueChangeEmitter = new EventEmitter();
    orchestratorService = new OrchestratorService();
    (orchestratorService as unknown as { queueChangeEmitter: EventEmitter }).queueChangeEmitter = mockQueueChangeEmitter;
  });

  /** @aiContributed-2026-02-04 */
  describe('emitQueueChange', () => {
    /** @aiContributed-2026-02-04 */
    it('should fire the queueChangeEmitter event', () => {
      const fireSpy = jest.spyOn(mockQueueChangeEmitter, 'emit');
      (orchestratorService as unknown as { emitQueueChange: () => void }).emitQueueChange();
      expect(fireSpy).toHaveBeenCalledWith();
    });

    /** @aiContributed-2026-02-04 */
    it('should log debug information when the event is fired', () => {
      (orchestratorService as unknown as { emitQueueChange: () => void }).emitQueueChange();
      expect(Logger.debug).toHaveBeenCalledWith('Queue change event emitted');
    });
  });
});