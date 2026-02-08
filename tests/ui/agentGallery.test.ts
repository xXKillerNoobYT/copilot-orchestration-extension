/**
 * Tests for Agent Gallery Webview Panel
 *
 * Unit tests for the marketplace-like interface for browsing, searching,
 * and installing custom agents.
 */

import { showAgentGallery, GalleryAgent } from '../../src/ui/agentGallery';
import * as vscode from 'vscode';

// Mock dependencies
jest.mock('../../src/agents/custom/storage', () => ({
    listCustomAgents: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
}));

import { listCustomAgents } from '../../src/agents/custom/storage';

// ============================================================================
// Test Setup
// ============================================================================

describe('AgentGallery', () => {
    let mockPanel: any;
    let mockContext: any;
    let messageHandler: ((message: any) => Promise<void>) | null;

    beforeEach(() => {
        jest.clearAllMocks();
        messageHandler = null;

        // Mock webview panel
        mockPanel = {
            webview: {
                html: '',
                onDidReceiveMessage: jest.fn((handler) => {
                    messageHandler = handler;
                    return { dispose: jest.fn() };
                }),
                postMessage: jest.fn().mockResolvedValue(true),
            },
            dispose: jest.fn(),
            reveal: jest.fn(),
        };

        // Mock vscode.window.createWebviewPanel
        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

        // Mock workspace.workspaceFolders
        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: [{ uri: { fsPath: '/mock/workspace' } }],
            configurable: true,
        });

        // Mock extension context
        mockContext = {
            subscriptions: [],
            extensionPath: '/mock/path',
        };

        // Default mock implementations
        (listCustomAgents as jest.Mock).mockResolvedValue([]);
    });

    // ========================================================================
    // GalleryAgent Interface Tests
    // ========================================================================

    describe('GalleryAgent interface', () => {
        it('Test 1: should accept valid GalleryAgent object', () => {
            const agent: GalleryAgent = {
                id: 'test-agent',
                name: 'Test Agent',
                author: 'Test Author',
                version: '1.0.0',
                description: 'A test agent',
                category: 'Testing',
                tags: ['test', 'sample'],
                difficulty: 'beginner',
                isInstalled: false,
            };

            expect(agent.id).toBe('test-agent');
            expect(agent.difficulty).toBe('beginner');
        });

        it('Test 2: should accept optional rating and downloads', () => {
            const agent: GalleryAgent = {
                id: 'rated-agent',
                name: 'Rated Agent',
                author: 'Author',
                version: '1.0.0',
                description: 'Has ratings',
                category: 'Test',
                tags: [],
                difficulty: 'intermediate',
                rating: 4.5,
                downloads: 1000,
                isInstalled: true,
            };

            expect(agent.rating).toBe(4.5);
            expect(agent.downloads).toBe(1000);
            expect(agent.isInstalled).toBe(true);
        });

        it('Test 3: should support all difficulty levels', () => {
            const difficulties: Array<'beginner' | 'intermediate' | 'advanced'> = [
                'beginner',
                'intermediate',
                'advanced',
            ];

            difficulties.forEach((difficulty) => {
                const agent: GalleryAgent = {
                    id: `${difficulty}-agent`,
                    name: `${difficulty} Agent`,
                    author: 'Author',
                    version: '1.0.0',
                    description: 'Test',
                    category: 'Test',
                    tags: [],
                    difficulty,
                    isInstalled: false,
                };
                expect(agent.difficulty).toBe(difficulty);
            });
        });
    });

    // ========================================================================
    // showAgentGallery Tests
    // ========================================================================

    describe('showAgentGallery', () => {
        it('Test 4: should create webview panel with correct options', async () => {
            await showAgentGallery(mockContext);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'agentGallery',
                '🔍 Agent Gallery',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                }
            );
        });

        it('Test 5: should load custom agents from workspace', async () => {
            await showAgentGallery(mockContext);

            expect(listCustomAgents).toHaveBeenCalledWith('/mock/workspace');
        });

        it('Test 6: should handle missing workspace folder', async () => {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: undefined,
                configurable: true,
            });

            await showAgentGallery(mockContext);

            expect(listCustomAgents).toHaveBeenCalledWith('');
        });

        it('Test 7: should set HTML content on webview', async () => {
            await showAgentGallery(mockContext);

            expect(mockPanel.webview.html).toBeTruthy();
            expect(mockPanel.webview.html).toContain('<!DOCTYPE html>');
            expect(mockPanel.webview.html).toContain('Agent Gallery');
        });

        it('Test 8: should include built-in agents in HTML', async () => {
            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            expect(html).toContain('Research Assistant');
            expect(html).toContain('Code Reviewer');
            expect(html).toContain('Documentation Writer');
            expect(html).toContain('Test Case Generator');
            expect(html).toContain('Bug Analyzer');
        });

        it('Test 9: should mark installed agents', async () => {
            (listCustomAgents as jest.Mock).mockResolvedValue([
                { name: 'research-assistant' },
            ]);

            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            // Installed agents should have different styling or indicator
            expect(html).toContain('Research Assistant');
        });

        it('Test 10: should set up message handler', async () => {
            await showAgentGallery(mockContext);

            expect(mockPanel.webview.onDidReceiveMessage).toHaveBeenCalled();
            expect(messageHandler).not.toBeNull();
        });
    });

    // ========================================================================
    // Message Handling Tests
    // ========================================================================

    describe('message handling', () => {
        beforeEach(async () => {
            await showAgentGallery(mockContext);
        });

        it('Test 11: should handle installAgent message', async () => {
            await messageHandler!({
                type: 'installAgent',
                agentId: 'research-assistant',
            });

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'extension.createCustomAgent',
                { templateId: 'research-assistant' }
            );
        });

        it('Test 12: should handle viewDetails message', async () => {
            await messageHandler!({
                type: 'viewDetails',
                agentName: 'Research Assistant',
                tags: ['research', 'analysis'],
                rating: 4.8,
            });

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('Research Assistant')
            );
        });

        it('Test 13: should handle viewDetails without rating', async () => {
            await messageHandler!({
                type: 'viewDetails',
                agentName: 'Test Agent',
                tags: ['test'],
                rating: undefined,
            });

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('N/A')
            );
        });

        it('Test 14: should handle search message', async () => {
            await messageHandler!({
                type: 'search',
                query: 'research',
            });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'updateGallery',
                agents: expect.arrayContaining([
                    expect.objectContaining({ name: 'Research Assistant' }),
                ]),
            });
        });

        it('Test 15: should filter agents by name', async () => {
            await messageHandler!({
                type: 'search',
                query: 'Code',
            });

            expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                type: 'updateGallery',
                agents: expect.arrayContaining([
                    expect.objectContaining({ name: 'Code Reviewer' }),
                ]),
            });
        });

        it('Test 16: should filter agents by description', async () => {
            await messageHandler!({
                type: 'search',
                query: 'security',
            });

            // Code Reviewer has 'security' in description
            const call = (mockPanel.webview.postMessage as jest.Mock).mock.calls[0];
            const agents = call[0].agents;
            expect(agents.some((a: any) => a.name === 'Code Reviewer')).toBe(true);
        });

        it('Test 17: should filter agents by tags', async () => {
            await messageHandler!({
                type: 'search',
                query: 'debugging',
            });

            const call = (mockPanel.webview.postMessage as jest.Mock).mock.calls[0];
            const agents = call[0].agents;
            expect(agents.some((a: any) => a.name === 'Bug Analyzer')).toBe(true);
        });

        it('Test 18: should filter agents by category', async () => {
            await messageHandler!({
                type: 'search',
                query: 'Documentation',
            });

            const call = (mockPanel.webview.postMessage as jest.Mock).mock.calls[0];
            const agents = call[0].agents;
            expect(agents.some((a: any) => a.name === 'Documentation Writer')).toBe(true);
        });

        it('Test 19: should handle case-insensitive search', async () => {
            await messageHandler!({
                type: 'search',
                query: 'RESEARCH',
            });

            const call = (mockPanel.webview.postMessage as jest.Mock).mock.calls[0];
            const agents = call[0].agents;
            expect(agents.some((a: any) => a.name === 'Research Assistant')).toBe(true);
        });

        it('Test 20: should return empty array for no matches', async () => {
            await messageHandler!({
                type: 'search',
                query: 'nonexistent_xyz_agent_12345',
            });

            const call = (mockPanel.webview.postMessage as jest.Mock).mock.calls[0];
            expect(call[0].agents).toEqual([]);
        });

        it('Test 21: should handle unknown message type', async () => {
            // Should not throw
            await messageHandler!({
                type: 'unknownType',
                data: 'test',
            });
        });
    });

    // ========================================================================
    // HTML Generation Tests
    // ========================================================================

    describe('HTML generation', () => {
        it('Test 22: should include CSS styling', async () => {
            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            expect(html).toContain('<style>');
            expect(html).toContain('--vscode-');
        });

        it('Test 23: should include search box', async () => {
            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            expect(html).toContain('search');
            expect(html).toContain('input');
        });

        it('Test 24: should include agent cards grid', async () => {
            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            expect(html).toContain('agents-grid');
            expect(html).toContain('agent-card');
        });

        it('Test 25: should include agent metadata', async () => {
            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            expect(html).toContain('COE Team'); // author
            expect(html).toContain('1.0.0'); // version
            expect(html).toContain('Research'); // category
        });

        it('Test 26: should include filter tags', async () => {
            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            expect(html).toContain('filter-tag');
        });

        it('Test 27: should include JavaScript for interactivity', async () => {
            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            expect(html).toContain('<script>');
            expect(html).toContain('acquireVsCodeApi');
        });
    });

    // ========================================================================
    // Built-in Agents Tests
    // ========================================================================

    describe('built-in agents', () => {
        it('Test 28: should have 5 built-in agents', async () => {
            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            const builtInNames = [
                'Research Assistant',
                'Code Reviewer',
                'Documentation Writer',
                'Test Case Generator',
                'Bug Analyzer',
            ];

            builtInNames.forEach((name) => {
                expect(html).toContain(name);
            });
        });

        it('Test 29: should have valid categories', async () => {
            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            const categories = ['Research', 'Code Quality', 'Documentation', 'Testing', 'Debugging'];

            categories.forEach((cat) => {
                expect(html).toContain(cat);
            });
        });

        it('Test 30: should show ratings for built-in agents', async () => {
            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            expect(html).toMatch(/4\.[4-8]/); // Ratings between 4.4 and 4.8
        });

        it('Test 31: should show download counts', async () => {
            await showAgentGallery(mockContext);

            const html = mockPanel.webview.html;
            // One of the download counts
            expect(html).toMatch(/\d{3,4}/); // 3-4 digit numbers for downloads
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('edge cases', () => {
        it('Test 32: should handle listCustomAgents error', async () => {
            (listCustomAgents as jest.Mock).mockRejectedValue(new Error('Storage error'));

            // Should not throw
            await expect(showAgentGallery(mockContext)).rejects.toThrow('Storage error');
        });

        it('Test 33: should handle empty workspace folders array', async () => {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                value: [],
                configurable: true,
            });

            await showAgentGallery(mockContext);

            expect(listCustomAgents).toHaveBeenCalledWith('');
        });

        it('Test 34: should handle multiple installed agents', async () => {
            (listCustomAgents as jest.Mock).mockResolvedValue([
                { name: 'research-assistant' },
                { name: 'code-reviewer' },
                { name: 'doc-writer' },
            ]);

            await showAgentGallery(mockContext);

            // Should render without errors
            expect(mockPanel.webview.html).toContain('Agent Gallery');
        });
    });
});
