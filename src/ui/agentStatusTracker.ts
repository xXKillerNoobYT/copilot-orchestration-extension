import { logInfo } from '../logger';

/**
 * Represents the current status of an agent.
 * Used to display real-time feedback in the Agents sidebar.
 */
export interface AgentStatus {
  status: 'Idle' | 'Active' | 'Waiting' | 'Failed';
  lastResult?: string;
  timestamp?: number;
}

/**
 * AgentStatusTracker is a singleton that maintains in-memory state of all agents.
 * Agents can be Planning, Orchestrator, Answer, or Verification.
 *
 * **Simple explanation**: Think of this as a "scoreboard" showing what each agent is currently doing.
 * When planning starts, we set Planning to "Active". When it finishes, we set it to "Waiting".
 * The sidebar tree providers query this tracker to display live status.
 */
class AgentStatusTracker {
  private static instance: AgentStatusTracker;
  private _statusMap: Map<string, AgentStatus> = new Map();

  private constructor() {
    // Initialize all agents to Idle
    this._statusMap.set('Planning', { status: 'Idle' });
    this._statusMap.set('Orchestrator', { status: 'Idle' });
    this._statusMap.set('Answer', { status: 'Idle' });
    this._statusMap.set('Verification', { status: 'Idle' });
  }

  /**
   * Get the singleton instance of AgentStatusTracker.
   * Ensures only one tracker exists across the entire extension.
   */
  static getInstance(): AgentStatusTracker {
    if (!AgentStatusTracker.instance) {
      AgentStatusTracker.instance = new AgentStatusTracker();
    }
    return AgentStatusTracker.instance;
  }

  /**
   * Set the status of an agent.
   * Called when an agent starts working, completes, or fails.
   *
   * @param name - Agent name: 'Planning', 'Orchestrator', 'Answer', 'Verification'
   * @param status - Current status: 'Idle', 'Active', 'Waiting', 'Failed'
   * @param lastResult - Optional: Last result/plan/explanation (will be truncated in UI)
   */
  setAgentStatus(name: string, status: 'Idle' | 'Active' | 'Waiting' | 'Failed', lastResult?: string): void {
    const agentStatus: AgentStatus = {
      status,
      lastResult: lastResult || undefined,
      timestamp: Date.now(),
    };

    this._statusMap.set(name, agentStatus);
    logInfo(`[AgentTracker] ${name} → ${status}${lastResult ? ` (${lastResult.substring(0, 50)})` : ''}`);
  }

  /**
   * Get the status of an agent.
   *
   * @param name - Agent name to query
   * @returns AgentStatus object or undefined if agent not found
   */
  getAgentStatus(name: string): AgentStatus | undefined {
    return this._statusMap.get(name);
  }

  /**
   * Reset all agents to Idle state.
   * Called when a new ticket starts planning to clear old state.
   */
  resetAll(): void {
    this._statusMap.forEach((_, key) => {
      this._statusMap.set(key, { status: 'Idle' });
    });
    logInfo('[AgentTracker] All agents reset to Idle');
  }

  /**
   * Get all agent statuses (mainly for testing).
   */
  getAllStatuses(): Map<string, AgentStatus> {
    return new Map(this._statusMap);
  }
}

// Export singleton instance for use throughout the extension
export const agentStatusTracker = AgentStatusTracker.getInstance();
