// index.ts
// MCP Server initialization and exports

import { logInfo, logWarn } from '../logger';
import { MCPServer } from './server';

/**
 * Global MCP server instance (singleton pattern)
 * 
 * **Simple explanation**: Only one MCP server can exist at a time, like having one front door to your house
 */
let mcpServerInstance: MCPServer | null = null;

/**
 * Initialize and start the MCP server
 * 
 * **Simple explanation**: This creates and turns on the MCP server (like plugging in and turning on a router)
 */
export function initializeMCPServer(): void {
    if (mcpServerInstance) {
        logWarn('MCP server already exists, not creating a new instance');
        return;
    }

    logInfo('Initializing MCP server...');
    mcpServerInstance = new MCPServer();
    mcpServerInstance.start();
    logInfo('MCP server initialized and started');
}

/**
 * Get the current MCP server instance
 * 
 * **Simple explanation**: Get access to the running server (for testing or monitoring)
 * @returns The MCP server instance, or null if not initialized
 */
export function getMCPServerInstance(): MCPServer | null {
    return mcpServerInstance;
}

/**
 * Stop and reset the MCP server (used for testing)
 * 
 * **Simple explanation**: Turn off the server and forget it exists (like unplugging the router)
 */
export function resetMCPServerForTests(): void {
    if (mcpServerInstance) {
        mcpServerInstance.stop();
        mcpServerInstance = null;
    }
}

/**
 * Re-export MCPServer class for direct usage if needed
 */
export { MCPServer } from './server';

/**
 * Standalone mode detection
 * **Simple explanation**: Check if someone ran this file directly (like `node index.js`)
 */
if (require.main === module) {
    // Running standalone (not imported by another file)
    logInfo('MCP server starting in standalone mode...');
    logInfo('Note: In standalone mode, ensure orchestrator services are initialized separately');
    
    initializeMCPServer();
    
    logInfo('MCP server is now listening on stdin for JSON-RPC 2.0 requests');
    logInfo('Send JSON-RPC requests via stdin to interact with the server');
    logInfo('Press Ctrl+C to stop the server');
    
    // Handle graceful shutdown on Ctrl+C
    process.on('SIGINT', () => {
        logInfo('Received SIGINT signal, shutting down gracefully...');
        resetMCPServerForTests();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        logInfo('Received SIGTERM signal, shutting down gracefully...');
        resetMCPServerForTests();
        process.exit(0);
    });
}
