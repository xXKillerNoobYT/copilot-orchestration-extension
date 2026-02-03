// ./orchestrator.Test.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import { initializeOrchestrator } from '../../src/services/orchestrator';
import { logInfo, logWarn } from '../../src/logger';
import { listTickets } from '../../src/services/ticketDb';

jest.mock('fs');
jest.mock('../../src/logger');
jest.mock('../../src/services/ticketDb');

/** @aiContributed-2026-02-03 */
describe('initializeOrchestrator', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = {
      extensionPath: '/mock/extension/path',
    } as unknown as vscode.ExtensionContext;

    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
  it('should initialize orchestrator with default timeout when config file does not exist', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const orchestrator = await initializeOrchestrator(mockContext);

    expect(fs.existsSync).toHaveBeenCalledWith('/mock/extension/path/.coe/config.json');
    expect(logWarn).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
    expect(orchestrator).toBeDefined();
  });

  /** @aiContributed-2026-02-03 */
  it('should initialize orchestrator with timeout from config file', async () => {
    const mockConfig = JSON.stringify({ orchestrator: { taskTimeoutSeconds: 60 } });
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(mockConfig);

    const orchestrator = await initializeOrchestrator(mockContext);

    expect(fs.existsSync).toHaveBeenCalledWith('/mock/extension/path/.coe/config.json');
    expect(fs.readFileSync).toHaveBeenCalledWith('/mock/extension/path/.coe/config.json', 'utf-8');
    expect(logWarn).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 60s');
    expect(orchestrator).toBeDefined();
  });

  /** @aiContributed-2026-02-03 */
  it('should fallback to default timeout if config file is invalid', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid JSON');
    });

    const orchestrator = await initializeOrchestrator(mockContext);

    expect(fs.existsSync).toHaveBeenCalledWith('/mock/extension/path/.coe/config.json');
    expect(fs.readFileSync).toHaveBeenCalledWith('/mock/extension/path/.coe/config.json', 'utf-8');
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to read orchestrator config'));
    expect(logInfo).toHaveBeenCalledWith('Orchestrator initialized with timeout: 30s');
    expect(orchestrator).toBeDefined();
  });

  /** @aiContributed-2026-02-03 */
  it('should load tasks from TicketDb during initialization', async () => {
    const mockTickets = [
      { id: 'TICKET-001', title: 'Test Ticket 1', status: 'open', createdAt: '2023-01-01T00:00:00Z' },
    ];
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (listTickets as jest.Mock).mockResolvedValue(mockTickets);

    const orchestrator = await initializeOrchestrator(mockContext);

    expect(listTickets).toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith('Loaded 1 tasks from tickets');
    expect(orchestrator).toBeDefined();
  });

  /** @aiContributed-2026-02-03 */
  it('should handle errors when loading tasks from TicketDb', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (listTickets as jest.Mock).mockRejectedValue(new Error('Database error'));

    const orchestrator = await initializeOrchestrator(mockContext);

    expect(listTickets).toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to load tasks from tickets'));
    expect(orchestrator).toBeDefined();
  });

  /** @aiContributed-2026-02-03 */
  it('should warn if orchestrator is already initialized', async () => {
    await initializeOrchestrator(mockContext);
    await initializeOrchestrator(mockContext);

    expect(logWarn).toHaveBeenCalledWith('Orchestrator already initialized');
  });
});