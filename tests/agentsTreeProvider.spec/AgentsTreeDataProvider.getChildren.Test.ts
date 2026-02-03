// ./agentsTreeProvider.Test.ts
import * as vscode from 'vscode';
import { AgentsTreeDataProvider } from '../../src/ui/agentsTreeProvider';
import { agentStatusTracker } from '../../src/ui/agentStatusTracker';

jest.mock('../../src/ui/agentStatusTracker', () => ({
  ...jest.requireActual('../../src/ui/agentStatusTracker'),
  agentStatusTracker: {
    getAgentStatus: jest.fn(),
  },
}));

/** @aiContributed-2026-02-03 */
describe('AgentsTreeDataProvider', () => {
  let dataProvider: AgentsTreeDataProvider;

  beforeEach(() => {
    dataProvider = new AgentsTreeDataProvider();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  describe('getChildren', () => {
    /** @aiContributed-2026-02-03 */
    it('should return an empty array when element is provided', () => {
      const result = dataProvider.getChildren({} as vscode.TreeItem);
      expect(result).toEqual([]);
    });

    /** @aiContributed-2026-02-03 */
    it('should return agent items with correct properties for root level', () => {
      const mockStatuses = {
        Planning: { status: 'Active', currentTask: 'Planning requirements...', lastResult: '', timestamp: Date.now() },
        Orchestrator: { status: 'Waiting', currentTask: '', lastResult: 'Step 1 completed', timestamp: Date.now() },
        Answer: { status: 'Failed', currentTask: '', lastResult: '', timestamp: Date.now() },
        Verification: { status: 'Idle', currentTask: '', lastResult: '', timestamp: Date.now() },
      };

      (agentStatusTracker.getAgentStatus as jest.Mock).mockImplementation((name: string) => mockStatuses[name]);

      const result = dataProvider.getChildren();

      expect(result).toHaveLength(4);
      expect(result[0].label).toBe('Planning');
      expect(result[0].description).toContain('Active, Task: Planning requirements...');
      expect(result[0].tooltip).toContain('Planning: Active');
      expect(result[0].iconPath.id).toBe('loading~spin');

      expect(result[1].label).toBe('Orchestrator');
      expect(result[1].description).toContain('Waiting, Last: Step 1 completed');
      expect(result[1].tooltip).toContain('Orchestrator: Waiting');
      expect(result[1].iconPath.id).toBe('check');

      expect(result[2].label).toBe('Answer');
      expect(result[2].description).toContain('Failed');
      expect(result[2].tooltip).toContain('Answer: Failed');
      expect(result[2].iconPath.id).toBe('error');

      expect(result[3].label).toBe('Verification');
      expect(result[3].description).toContain('Idle');
      expect(result[3].tooltip).toContain('Verification: Idle');
      expect(result[3].iconPath.id).toBe('circle-outline');
    });

    /** @aiContributed-2026-02-03 */
    it('should handle missing status gracefully', () => {
      (agentStatusTracker.getAgentStatus as jest.Mock).mockReturnValue(null);

      const result = dataProvider.getChildren();

      expect(result).toHaveLength(4);
      result.forEach((item) => {
        expect(item.description).toBe('Idle');
        expect(item.iconPath.id).toBe('circle-outline');
      });
    });

    /** @aiContributed-2026-02-03 */
    it('should truncate long currentTask and lastResult descriptions', () => {
      const longTask = 'A'.repeat(100);
      const longResult = 'B'.repeat(100);

      (agentStatusTracker.getAgentStatus as jest.Mock).mockReturnValue({
        status: 'Active',
        currentTask: longTask,
        lastResult: longResult,
        timestamp: Date.now(),
      });

      const result = dataProvider.getChildren();

      expect(result[0].description).toContain(`Task: ${longTask.substring(0, 50)}...`);
    });
  });
});