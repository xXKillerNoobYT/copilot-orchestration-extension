// ./ticketDb.Test.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { initializeTicketDb } from '../../src/services/ticketDb';
import { Logger } from '../../utils/logger';

jest.mock('fs');
jest.mock('path');
jest.mock('../../utils/logger');

/** @aiContributed-2026-02-03 */
describe('initializeTicketDb', () => {
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    mockContext = {
      extensionPath: '/mock/extension/path',
    } as unknown as vscode.ExtensionContext;

    jest.clearAllMocks();
  });

  /** @aiContributed-2026-02-03 */
    it('should initialize the database with default path when config file does not exist', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (path.resolve as jest.Mock).mockImplementation((...args) => args.join('/'));

    await initializeTicketDb(mockContext);

    expect(fs.existsSync).toHaveBeenCalledWith('/mock/extension/path/.coe/config.json');
    expect(Logger.info).toHaveBeenCalledWith('Ticket DB initialized: SQLite at /mock/extension/path/.coe/tickets.db');
  });

  /** @aiContributed-2026-02-03 */
    it('should initialize the database with custom path from config file', async () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    (fs.readFileSync as jest.Mock).mockReturnValueOnce(JSON.stringify({ tickets: { dbPath: './custom/path.db' } }));
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (path.resolve as jest.Mock).mockImplementation((...args) => args.join('/'));

    await initializeTicketDb(mockContext);

    expect(fs.readFileSync).toHaveBeenCalledWith('/mock/extension/path/.coe/config.json', 'utf-8');
    expect(Logger.info).toHaveBeenCalledWith('Ticket DB initialized: SQLite at /mock/extension/path/custom/path.db');
  });

  /** @aiContributed-2026-02-03 */
    it('should fallback to in-memory mode if SQLite initialization fails', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (path.resolve as jest.Mock).mockImplementation((...args) => args.join('/'));

    jest.mock('sqlite3', () => {
      throw new Error('SQLite initialization error');
    });

    await initializeTicketDb(mockContext);

    expect(Logger.warn).toHaveBeenCalledWith('SQLite init failed (Error: SQLite initialization error), using in-memory fallback');
    expect(Logger.info).toHaveBeenCalledWith('Ticket DB initialized: In-memory mode');
  });

  /** @aiContributed-2026-02-03 */
    it('should not reinitialize if the database is already initialized', async () => {
    await initializeTicketDb(mockContext);
    await initializeTicketDb(mockContext);

    expect(Logger.warn).toHaveBeenCalledWith('TicketDb already initialized');
  });
});