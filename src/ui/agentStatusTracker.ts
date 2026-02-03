import { logInfo } from '../logger';
import { EventEmitter } from 'vscode';

/**
 * Represents the current status of an agent.
 * Used to display real-time feedback in the Agents sidebar.
 */
export interface AgentStatus {
  status: 'Idle' | 'Active' | 'Waiting' | 'Failed';
  lastResult?: string;
  currentTask?: string; // Current task description (e.g., "Planning task X", "Verifying step 2")
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
  private _onStatusChange = new EventEmitter<{ agentName: string; status: AgentStatus }>();
  readonly onStatusChange = this._onStatusChange.event;

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
    const currentStatus = this._statusMap.get(name);
    const agentStatus: AgentStatus = {
      status,
      lastResult: lastResult || undefined,
      currentTask: currentStatus?.currentTask, // Preserve currentTask if not explicitly cleared
      timestamp: Date.now(),
    };

    this._statusMap.set(name, agentStatus);
    logInfo(`[AgentTracker] ${name} → ${status}${lastResult ? ` (${lastResult.substring(0, 50)})` : ''}`);

    // Emit event for real-time UI updates
    this._onStatusChange.fire({ agentName: name, status: agentStatus });
  }

  /**
   * Set the current task for an agent (what it's working on right now).
   * Useful for showing "Planning task X" or "Verifying step 2" in the sidebar.
   *
   * @param name - Agent name
   * @param task - Description of current task (e.g., "Generating requirements...")
   */
  setAgentTask(name: string, task: string | undefined): void {
    const currentStatus = this._statusMap.get(name);
    if (currentStatus) {
      const agentStatus: AgentStatus = {
        ...currentStatus,
        currentTask: task,
        timestamp: Date.now(),
      };
      this._statusMap.set(name, agentStatus);
      logInfo(`[AgentTracker] ${name} task: ${task ? task.substring(0, 50) : 'cleared'}`);

      // Emit event for real-time UI updates
      this._onStatusChange.fire({ agentName: name, status: agentStatus });
    }
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
      const agentStatus: AgentStatus = { status: 'Idle', timestamp: Date.now() };
      this._statusMap.set(key, agentStatus);
      // Emit event for each agent reset
      this._onStatusChange.fire({ agentName: key, status: agentStatus });
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
