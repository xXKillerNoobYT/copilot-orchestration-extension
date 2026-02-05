// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

jest.mock('vscode', () => ({
  ...jest.requireActual('vscode'),
  EventEmitter: jest.fn().mockImplementation(() => ({
    event: jest.fn(),
  })),
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
describe('OrchestratorService - onQueueChange', () => {
  let orchestratorService: OrchestratorService;
  let mockEventEmitter: vscode.EventEmitter<void>;

  beforeEach(() => {
    mockEventEmitter = new vscode.EventEmitter<void>();
    orchestratorService = new OrchestratorService() as unknown as OrchestratorService;
    (orchestratorService as unknown as { queueChangeEmitter: vscode.EventEmitter<void> }).queueChangeEmitter = mockEventEmitter;
  });

  /** @aiContributed-2026-02-04 */
  it('should register a listener and return a disposable', () => {
    const listener = jest.fn();
    const disposable = orchestratorService.onQueueChange(listener);

    expect(mockEventEmitter.event).toHaveBeenCalledWith(listener);
    expect(disposable).toBeDefined();
    expect(typeof disposable.dispose).toBe('function');
  });

  /** @aiContributed-2026-02-04 */
  it('should handle null listener gracefully', () => {
    expect(() => orchestratorService.onQueueChange(null as unknown as (e: void) => void)).not.toThrow();
    Logger.error('Null listener passed to onQueueChange');
  });

  /** @aiContributed-2026-02-04 */
  it('should handle undefined listener gracefully', () => {
    expect(() => orchestratorService.onQueueChange(undefined as unknown as (e: void) => void)).not.toThrow();
    Logger.error('Undefined listener passed to onQueueChange');
  });
});