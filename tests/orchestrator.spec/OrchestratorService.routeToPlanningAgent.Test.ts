// ./orchestrator.Test.ts
import { OrchestratorService } from '../../src/services/orchestrator';
import { streamLLM } from '../../src/services/llmService';
import { agentStatusTracker } from '../../src/ui/agentStatusTracker';
import { updateStatusBar } from '../../src/extension';
import { llmStatusBar } from '../../src/ui/llmStatusBar';
import { logInfo, logWarn, logError } from '../../src/logger';

jest.mock('../../src/services/llmService');
jest.mock('../../src/ui/agentStatusTracker');
jest.mock('../../src/extension');
jest.mock('../../src/ui/llmStatusBar');
jest.mock('../../src/logger');

/** @aiContributed-2026-02-03 */
describe('OrchestratorService - routeToPlanningAgent', () => {
  let orchestrator: OrchestratorService;

  beforeEach(() => {
    orchestrator = new OrchestratorService();
    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle the happy path and return the full plan', async () => {
    const question = 'What is the plan?';
    const mockResponse = { content: 'This is the plan.' };
    (streamLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await orchestrator.routeToPlanningAgent(question);

    expect(logInfo).toHaveBeenCalledWith(`Routing request to Planning agent: ${question}`);
    expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Active', '');
    expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) Planning...');
    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(streamLLM).toHaveBeenCalledWith(
      question,
      expect.any(Function),
      { systemPrompt: expect.any(String) }
    );
    expect(logInfo).toHaveBeenCalledWith(`Full plan: ${mockResponse.content}`);
    expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Waiting', mockResponse.content.substring(0, 100));
    expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
    expect(llmStatusBar.end).toHaveBeenCalled();
    expect(result).toBe(mockResponse.content);
  });

  /** @aiContributed-2026-02-03 */
  it('should handle an empty response from the planning agent', async () => {
    const question = 'What is the plan?';
    const mockResponse = { content: '' };
    (streamLLM as jest.Mock).mockResolvedValue(mockResponse);

    const result = await orchestrator.routeToPlanningAgent(question);

    expect(logWarn).toHaveBeenCalledWith('Planning agent returned an empty response.');
    expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Failed', 'Empty response');
    expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
    expect(result).toBe('');
  });

  /** @aiContributed-2026-02-03 */
  it('should handle errors thrown by the planning agent', async () => {
    const question = 'What is the plan?';
    const errorMessage = 'Network error';
    (streamLLM as jest.Mock).mockRejectedValue(new Error(errorMessage));

    const result = await orchestrator.routeToPlanningAgent(question);

    expect(logError).toHaveBeenCalledWith(`Planning agent failed: ${errorMessage}`);
    expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Failed', errorMessage.substring(0, 100));
    expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) COE Ready');
    expect(llmStatusBar.end).toHaveBeenCalled();
    expect(result).toBe('Planning service is currently unavailable. A ticket has been created for manual review.');
  });

  /** @aiContributed-2026-02-03 */
  it('should handle undefined question input gracefully', async () => {
    await orchestrator.routeToPlanningAgent(undefined as unknown as string);

    expect(logInfo).toHaveBeenCalledWith('Routing request to Planning agent: undefined');
    expect(agentStatusTracker.setAgentStatus).toHaveBeenCalledWith('Planning', 'Active', '');
    expect(updateStatusBar).toHaveBeenCalledWith('$(rocket) Planning...');
    expect(llmStatusBar.start).toHaveBeenCalled();
    expect(streamLLM).toHaveBeenCalledWith(
      undefined,
      expect.any(Function),
      { systemPrompt: expect.any(String) }
    );
  });
});