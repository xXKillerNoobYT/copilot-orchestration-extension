// ./extension.Test.ts
import * as vscode from 'vscode';
import { activate } from '../../src/extension';
import { initializeLogger, logInfo, logError, logWarn } from '../../src/logger';
import { initializeTicketDb, listTickets, updateTicket } from '../../src/services/ticketDb';
import { initializeOrchestrator, getOrchestratorInstance } from '../../src/services/orchestrator';
import { initializeLLMService } from '../../src/services/llmService';
import { initializeMCPServer } from '../../src/mcpServer';
import { AgentsTreeDataProvider } from '../../src/ui/agentsTreeProvider';
import { TicketsTreeDataProvider } from '../../src/ui/ticketsTreeProvider';
import { ConversationsTreeDataProvider } from '../../src/ui/conversationsTreeProvider';

jest.mock('vscode');
jest.mock('../../src/logger');
jest.mock('../../src/services/ticketDb');
jest.mock('../../src/services/orchestrator');
jest.mock('../../src/services/llmService');
jest.mock('../../src/mcpServer');
jest.mock('../../src/ui/agentsTreeProvider');
jest.mock('../../src/ui/ticketsTreeProvider');
jest.mock('../../src/ui/conversationsTreeProvider');

/** @aiContributed-2026-02-03 */
describe('activate', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    context = {
      subscriptions: [],
      globalState: {
        update: jest.fn(),
        get: jest.fn(),
      },
    } as unknown as vscode.ExtensionContext;

    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should initialize logger, ticket DB, orchestrator, and LLM service', async () => {
    await activate(context);

    expect(initializeLogger).toHaveBeenCalledWith(context);
    expect(initializeTicketDb).toHaveBeenCalledWith(context);
    expect(initializeOrchestrator).toHaveBeenCalledWith(context);
    expect(initializeLLMService).toHaveBeenCalledWith(context);
    expect(initializeMCPServer).toHaveBeenCalled();
  });

  /** @aiContributed-2026-02-03 */
    it('should register tree data providers and commands', async () => {
    const registerTreeDataProviderSpy = jest.spyOn(vscode.window, 'registerTreeDataProvider');
    const registerCommandSpy = jest.spyOn(vscode.commands, 'registerCommand');

    await activate(context);

    expect(registerTreeDataProviderSpy).toHaveBeenCalledWith(
      'coe-agents',
      expect.any(AgentsTreeDataProvider)
    );
    expect(registerTreeDataProviderSpy).toHaveBeenCalledWith(
      'coe-tickets',
      expect.any(TicketsTreeDataProvider)
    );
    expect(registerTreeDataProviderSpy).toHaveBeenCalledWith(
      'coe-conversations',
      expect.any(ConversationsTreeDataProvider)
    );

    expect(registerCommandSpy).toHaveBeenCalledWith('coe.refreshAgents', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.refreshTickets', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.refreshConversations', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.planTask', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.verifyTask', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.verifyLastTicket', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.askAnswerAgent', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.askAnswerAgentContinue', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.openTicket', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.viewTicketProgress', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.updateTicketStatus', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.addTicketComment', expect.any(Function));
    expect(registerCommandSpy).toHaveBeenCalledWith('coe.researchWithAgent', expect.any(Function));
  });

  /** @aiContributed-2026-02-03 */
    it('should handle errors during activation gracefully', async () => {
    (initializeTicketDb as jest.Mock).mockRejectedValue(new Error('DB initialization failed'));
    (listTickets as jest.Mock).mockRejectedValue(new Error('Failed to list tickets'));

    await activate(context);

    expect(logWarn).toHaveBeenCalledWith(
      'Failed to load Answer Agent history on activate: Failed to list tickets'
    );
    expect(logError).toHaveBeenCalledWith('DB initialization failed');
  });

  /** @aiContributed-2026-02-03 */
    it('should restore conversation histories if available', async () => {
    const mockTickets = [
      { id: '1', conversationHistory: 'history1' },
      { id: '2', conversationHistory: 'history2' },
    ];
    (listTickets as jest.Mock).mockResolvedValue(mockTickets);

    const mockOrchestrator = {
      getAnswerAgent: jest.fn().mockReturnValue({
        deserializeHistory: jest.fn(),
        cleanupInactiveConversations: jest.fn(),
      }),
    };
    (getOrchestratorInstance as jest.Mock).mockReturnValue(mockOrchestrator);

    await activate(context);

    expect(mockOrchestrator.getAnswerAgent().deserializeHistory).toHaveBeenCalledWith({
      '1': 'history1',
      '2': 'history2',
    });
    expect(logInfo).toHaveBeenCalledWith('Restored 2 conversation histories on activate');
  });

  /** @aiContributed-2026-02-03 */
    it('should initialize and display the status bar item', async () => {
    const createStatusBarItemSpy = jest.spyOn(vscode.window, 'createStatusBarItem');

    await activate(context);

    expect(createStatusBarItemSpy).toHaveBeenCalledWith(
      vscode.StatusBarAlignment.Right,
      100
    );
    expect(logInfo).toHaveBeenCalledWith('Extension fully activated');
  });

  /** @aiContributed-2026-02-03 */
    it('should set up auto-planning listener', async () => {
    const onTicketChangeMock = jest.fn();
    (onTicketChange as jest.Mock).mockImplementation(onTicketChangeMock);

    await activate(context);

    expect(onTicketChangeMock).toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith('[Auto-Plan] Listener registered');
  });

  /** @aiContributed-2026-02-03 */
    it('should handle ticket updates during auto-planning', async () => {
    const mockTickets = [
      { id: '1', type: 'ai_to_human', status: 'open', title: 'Test Ticket' },
    ];
    (listTickets as jest.Mock).mockResolvedValue(mockTickets);

    const mockOrchestrator = {
      routeToPlanningAgent: jest.fn().mockResolvedValue('Generated Plan'),
    };
    (getOrchestratorInstance as jest.Mock).mockReturnValue(mockOrchestrator);

    const onTicketChangeCallback = jest.fn();
    (onTicketChange as jest.Mock).mockImplementation((callback) => {
      onTicketChangeCallback.mockImplementation(callback);
    });

    await activate(context);

    await onTicketChangeCallback();

    expect(mockOrchestrator.routeToPlanningAgent).toHaveBeenCalledWith('Test Ticket');
    expect(updateTicket).toHaveBeenCalledWith('1', { description: 'Generated Plan' });
    expect(logInfo).toHaveBeenCalledWith('[Auto-Plan] DONE - Plan stored in 1');
  });
});