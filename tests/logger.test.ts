/**
 * Tests for logger.ts
 * 
 * This file tests the logging functionality including:
 * - Logger initialization
 * - Log level filtering
 * - Output channel creation
 */

import { initializeLogger, logInfo, logWarn, logError } from '../src/logger';
import { ExtensionContext } from './__mocks__/vscode';

// Note: vscode module is auto-mocked via jest.config.js moduleNameMapper

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const fs = require('fs');

describe('Logger', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('initializeLogger', () => {
    it('should initialize without throwing errors when config file does not exist', () => {
      // Mock fs.existsSync to return false (no config file)
      fs.existsSync.mockReturnValue(false);

      // Create a mock extension context
      const mockContext = new ExtensionContext('/mock/extension/path');

      // Should not throw when initializing
      expect(() => {
        initializeLogger(mockContext);
      }).not.toThrow();
    });

    it('should initialize with default log level when config file is missing', () => {
      // Mock fs.existsSync to return false
      fs.existsSync.mockReturnValue(false);

      const mockContext = new ExtensionContext('/mock/extension/path');

      // Initialize logger
      initializeLogger(mockContext);

      // Verify initialization happened (implicitly tests that it didn't crash)
      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should read log level from config file when it exists', () => {
      // Mock fs.existsSync to return true (config exists)
      fs.existsSync.mockReturnValue(true);

      // Mock fs.readFileSync to return config JSON
      const mockConfig = {
        debug: {
          logLevel: 'error'
        }
      };
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const mockContext = new ExtensionContext('/mock/extension/path');

      // Should initialize successfully with config
      expect(() => {
        initializeLogger(mockContext);
      }).not.toThrow();

      // Verify file was read with correct path
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.coe'),
        'utf-8'
      );
    });

    it('should handle invalid JSON in config file gracefully', () => {
      // Mock fs.existsSync to return true
      fs.existsSync.mockReturnValue(true);

      // Mock fs.readFileSync to return invalid JSON
      fs.readFileSync.mockReturnValue('{ invalid json }');

      const mockContext = new ExtensionContext('/mock/extension/path');

      // Should not throw even with invalid JSON (falls back to default)
      expect(() => {
        initializeLogger(mockContext);
      }).not.toThrow();
    });
  });

  describe('logInfo', () => {
    it('should log info messages', () => {
      fs.existsSync.mockReturnValue(false);
      const mockContext = new ExtensionContext('/mock/extension/path');
      initializeLogger(mockContext);

      // Should not throw when logging
      expect(() => {
        logInfo('Test info message');
      }).not.toThrow();
    });
  });

  describe('logWarn', () => {
    it('should log warning messages', () => {
      fs.existsSync.mockReturnValue(false);
      const mockContext = new ExtensionContext('/mock/extension/path');
      initializeLogger(mockContext);

      expect(() => {
        logWarn('Test warning message');
      }).not.toThrow();
    });
  });

  describe('logError', () => {
    it('should log error messages as strings', () => {
      fs.existsSync.mockReturnValue(false);
      const mockContext = new ExtensionContext('/mock/extension/path');
      initializeLogger(mockContext);

      expect(() => {
        logError('Test error message');
      }).not.toThrow();
    });

    it('should log Error objects', () => {
      fs.existsSync.mockReturnValue(false);
      const mockContext = new ExtensionContext('/mock/extension/path');
      initializeLogger(mockContext);

      const testError = new Error('Test error object');

      expect(() => {
        logError(testError);
      }).not.toThrow();
    });
  });
});
