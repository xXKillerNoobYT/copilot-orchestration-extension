// ./ticketDb.Test.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { initializeTicketDb, runSQL } from '../../src/services/ticketDb';
import { Logger } from '../../utils/logger';
import sqlite3 from 'sqlite3';

jest.mock('fs');
jest.mock('path');
jest.mock('../../utils/logger');
jest.mock('sqlite3');

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

    jest.mocked(sqlite3).verbose.mockImplementation(() => {
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

  /** @aiContributed-2026-02-03 */
  it('should handle errors when reading the config file', async () => {
    (fs.existsSync as jest.Mock).mockReturnValueOnce(true);
    (fs.readFileSync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Failed to read config');
    });
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (path.resolve as jest.Mock).mockImplementation((...args) => args.join('/'));

    await initializeTicketDb(mockContext);

    expect(Logger.warn).toHaveBeenCalledWith('Failed to read config for dbPath: Error: Failed to read config');
    expect(Logger.info).toHaveBeenCalledWith('Ticket DB initialized: SQLite at /mock/extension/path/.coe/tickets.db');
  });

  /** @aiContributed-2026-02-03 */
  it('should create the .coe directory if it does not exist', async () => {
    (fs.existsSync as jest.Mock).mockImplementation((path) => path !== '/mock/extension/path/.coe');
    (fs.mkdirSync as jest.Mock).mockImplementation();
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (path.resolve as jest.Mock).mockImplementation((...args) => args.join('/'));

    await initializeTicketDb(mockContext);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/extension/path/.coe', { recursive: true });
    expect(Logger.info).toHaveBeenCalledWith('Ticket DB initialized: SQLite at /mock/extension/path/.coe/tickets.db');
  });

  /** @aiContributed-2026-02-03 */
  it('should log a warning if migration check fails', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
    (path.resolve as jest.Mock).mockImplementation((...args) => args.join('/'));

    const mockRunSQL = jest.fn().mockRejectedValue(new Error('Migration error'));
    jest.spyOn(runSQL, 'mockImplementation').mockImplementation(mockRunSQL);

    await initializeTicketDb(mockContext);

    expect(Logger.warn).toHaveBeenCalledWith('Migration check failed (Error: Migration error), continuing anyway');
  });
});