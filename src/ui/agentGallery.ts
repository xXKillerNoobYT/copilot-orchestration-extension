/**
 * Agent Gallery Webview Panel
 *
 * A marketplace-like interface for browsing, searching, and installing custom agents
 * from the built-in library or community agents.
 *
 * **Simple explanation**: Like an app store for AI agents - browse available agents,
 * search by tags or keywords, see ratings and stats, and install ones you like.
 *
 * @module ui/agentGallery
 */

import * as vscode from 'vscode';
import { logInfo, logError } from '../logger';
import { listCustomAgents, AgentListItem } from '../agents/custom/storage';

/**
 * Agent item in gallery
 */
export interface GalleryAgent {
    id: string;
    name: string;
    author: string;
    version: string;
    description: string;
    category: string;
    tags: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    rating?: number;
    downloads?: number;
    isInstalled: boolean;
}

/**
 * Built-in agent templates
 */
const BUILTIN_AGENTS: GalleryAgent[] = [
    {
        id: 'research-assistant',
        name: 'Research Assistant',
        author: 'COE Team',
        version: '1.0.0',
        description: 'Gathers and analyzes information to answer complex questions',
        category: 'Research',
        tags: ['research', 'analysis', 'information-gathering'],
        difficulty: 'beginner',
        rating: 4.8,
        downloads: 1250,
        isInstalled: false
    },
    {
        id: 'code-reviewer',
        name: 'Code Reviewer',
        author: 'COE Team',
        version: '1.0.0',
        description: 'Reviews code for quality, security, and performance',
        category: 'Code Quality',
        tags: ['code-review', 'quality', 'security'],
        difficulty: 'intermediate',
        rating: 4.6,
        downloads: 890,
        isInstalled: false
    },
    {
        id: 'doc-writer',
        name: 'Documentation Writer',
        author: 'COE Team',
        version: '1.0.0',
        description: 'Creates comprehensive technical documentation',
        category: 'Documentation',
        tags: ['documentation', 'writing', 'api-docs'],
        difficulty: 'intermediate',
        rating: 4.7,
        downloads: 650,
        isInstalled: false
    },
    {
        id: 'test-generator',
        name: 'Test Case Generator',
        author: 'COE Team',
        version: '1.0.0',
        description: 'Generates comprehensive test scenarios and cases',
        category: 'Testing',
        tags: ['testing', 'qa', 'test-cases'],
        difficulty: 'advanced',
        rating: 4.5,
        downloads: 440,
        isInstalled: false
    },
    {
        id: 'bug-analyzer',
        name: 'Bug Analyzer',
        author: 'COE Team',
        version: '1.0.0',
        description: 'Analyzes error messages and suggests solutions',
        category: 'Debugging',
        tags: ['debugging', 'error-analysis', 'troubleshooting'],
        difficulty: 'intermediate',
        rating: 4.4,
        downloads: 720,
        isInstalled: false
    }
];

/**
 * Create and show agent gallery webview
 */
export async function showAgentGallery(context: vscode.ExtensionContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'agentGallery',
        '🔍 Agent Gallery',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    // Load installed agents
    const customAgents = await listCustomAgents(workspaceFolder);
    const installed = new Set(customAgents.map(a => a.name));

    // Combine built-in and custom agents
    const builtinWithStatus = BUILTIN_AGENTS.map(agent => ({
        ...agent,
        isInstalled: installed.has(agent.id)
    }));

    panel.webview.html = getGalleryHtml(builtinWithStatus);

    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.type) {
            case 'installAgent':
                vscode.commands.executeCommand('extension.createCustomAgent', {
                    templateId: message.agentId
                });
                break;

            case 'viewDetails':
                vscode.window.showInformationMessage(
                    `Agent: ${message.agentName}\n\nTags: ${message.tags.join(', ')}\n\nRating: ${message.rating || 'N/A'}`
                );
                break;

            case 'search': {
                // Filter and re-render based on search term
                const filtered = filterAgents(builtinWithStatus, message.query);
                panel.webview.postMessage({
                    type: 'updateGallery',
                    agents: filtered
                });
                break;
            }
        }
    });
}

/**
 * Filter agents by search query
 */
function filterAgents(agents: GalleryAgent[], query: string): GalleryAgent[] {
    const lower = query.toLowerCase();
    return agents.filter(agent =>
        agent.name.toLowerCase().includes(lower) ||
        agent.description.toLowerCase().includes(lower) ||
        agent.tags.some(tag => tag.toLowerCase().includes(lower)) ||
        agent.category.toLowerCase().includes(lower)
    );
}

/**
 * Generate gallery HTML
 */
function getGalleryHtml(agents: GalleryAgent[]): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Agent Gallery</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    line-height: 1.6;
                    padding: 20px;
                }

                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 30px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 20px;
                }

                .header h1 {
                    font-size: 28px;
                    font-weight: 600;
                }

                .search-box {
                    width: 300px;
                }

                .search-box input {
                    width: 100%;
                    padding: 8px 12px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    font-size: 13px;
                }

                .search-box input:focus {
                    outline: none;
                    border-color: var(--vscode-inputValidation-infoBorder);
                }

                .filter-tags {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }

                .filter-tag {
                    background-color: var(--vscode-textCodeBlock-background);
                    color: var(--vscode-textCodeBlock-foreground);
                    padding: 4px 12px;
                    border-radius: 20px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.2s ease;
                }

                .filter-tag:hover {
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                }

                .agents-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                    gap: 20px;
                    margin-top: 20px;
                }

                .agent-card {
                    background-color: var(--vscode-editorWidget-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    transition: all 0.2s ease;
                    cursor: pointer;
                }

                .agent-card:hover {
                    border-color: var(--vscode-textLink-foreground);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                    transform: translateY(-2px);
                }

                .agent-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 12px;
                }

                .agent-title {
                    display: flex;
                    flex-direction: column;
                }

                .agent-name {
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 4px;
                }

                .agent-author {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }

                .agent-badge {
                    display: inline-block;
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 2px 8px;
                    border-radius: 3px;
                    font-size: 11px;
                    font-weight: 500;
                }

                .agent-difficulty-beginner {
                    background-color: rgba(76, 175, 80, 0.2);
                    color: #4CAF50;
                }

                .agent-difficulty-intermediate {
                    background-color: rgba(255, 193, 7, 0.2);
                    color: #FFC107;
                }

                .agent-difficulty-advanced {
                    background-color: rgba(244, 67, 54, 0.2);
                    color: #F44336;
                }

                .agent-description {
                    color: var(--vscode-descriptionForeground);
                    font-size: 13px;
                    margin-bottom: 12px;
                    line-height: 1.5;
                }

                .agent-stats {
                    display: flex;
                    gap: 16px;
                    font-size: 12px;
                    margin-bottom: 12px;
                    color: var(--vscode-descriptionForeground);
                }

                .agent-stat {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .agent-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 16px;
                }

                .agent-tag {
                    background-color: var(--vscode-textCodeBlock-background);
                    color: var(--vscode-textCodeBlock-foreground);
                    padding: 2px 8px;
                    border-radius: 3px;
                    font-size: 11px;
                }

                .agent-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: auto;
                }

                .btn {
                    flex: 1;
                    padding: 8px 12px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.2s ease;
                }

                .btn-primary {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }

                .btn-primary:hover:not(:disabled) {
                    background-color: var(--vscode-button-hoverBackground);
                }

                .btn-secondary {
                    background-color: transparent;
                    color: var(--vscode-textLink-foreground);
                    border: 1px solid var(--vscode-panel-border);
                }

                .btn-secondary:hover {
                    background-color: var(--vscode-editor-background);
                }

                .btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .empty-state {
                    text-align: center;
                    padding: 60px 20px;
                    color: var(--vscode-descriptionForeground);
                }

                .empty-state-icon {
                    font-size: 48px;
                    margin-bottom: 20px;
                }

                .rating {
                    color: #FFC107;
                    font-weight: 500;
                }

                .installed-badge {
                    background-color: rgba(76, 175, 80, 0.2);
                    color: #4CAF50;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-size: 11px;
                    margin-top: 8px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div>
                        <h1>🔍 Agent Gallery</h1>
                        <p style="color: var(--vscode-descriptionForeground); font-size: 13px; margin-top: 4px;">
                            Browse and install custom AI agents
                        </p>
                    </div>
                    <div class="search-box">
                        <input type="text" id="search-input" placeholder="Search agents...">
                    </div>
                </div>

                <div class="filter-tags">
                    <span class="filter-tag" data-filter="all">All</span>
                    <span class="filter-tag" data-filter="Research">Research</span>
                    <span class="filter-tag" data-filter="Code Quality">Code Quality</span>
                    <span class="filter-tag" data-filter="Documentation">Documentation</span>
                    <span class="filter-tag" data-filter="Testing">Testing</span>
                    <span class="filter-tag" data-filter="Debugging">Debugging</span>
                </div>

                <div class="agents-grid" id="agents-grid">
                    ${agents.map(agent => renderAgentCard(agent)).join('')}
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let allAgents = ${JSON.stringify(agents)};
                let displayAgents = allAgents;

                // Search functionality
                document.getElementById('search-input').addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase();
                    displayAgents = allAgents.filter(agent =>
                        agent.name.toLowerCase().includes(query) ||
                        agent.description.toLowerCase().includes(query) ||
                        agent.tags.some(tag => tag.toLowerCase().includes(query))
                    );
                    renderGallery();
                });

                // Category filter
                document.querySelectorAll('.filter-tag').forEach(tag => {
                    tag.addEventListener('click', () => {
                        const filter = tag.dataset.filter;
                        document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
                        tag.classList.add('active');

                        if (filter === 'all') {
                            displayAgents = allAgents;
                        } else {
                            displayAgents = allAgents.filter(a => a.category === filter);
                        }
                        renderGallery();
                    });
                });

                // Agent action handlers
                function installAgent(agentId) {
                    vscode.postMessage({
                        type: 'installAgent',
                        agentId: agentId
                    });
                }

                function viewDetails(agent) {
                    vscode.postMessage({
                        type: 'viewDetails',
                        agentId: agent.id,
                        agentName: agent.name,
                        tags: agent.tags,
                        rating: agent.rating
                    });
                }

                function renderGallery() {
                    const grid = document.getElementById('agents-grid');
                    if (displayAgents.length === 0) {
                        grid.innerHTML = \`
                            <div class="empty-state" style="grid-column: 1/-1;">
                                <div class="empty-state-icon">🔍</div>
                                <h3>No agents found</h3>
                                <p style="margin-top: 8px;">Try adjusting your search filters</p>
                            </div>
                        \`;
                        return;
                    }

                    grid.innerHTML = displayAgents.map(agent => \`
                        <div class="agent-card">
                            <div class="agent-header">
                                <div class="agent-title">
                                    <div class="agent-name">\${agent.name}</div>
                                    <div class="agent-author">by \${agent.author}</div>
                                </div>
                                <span class="agent-badge agent-difficulty-\${agent.difficulty}">\${agent.difficulty}</span>
                            </div>
                            <p class="agent-description">\${agent.description}</p>
                            <div class="agent-stats">
                                \${agent.rating ? \`<div class="agent-stat"><span class="rating">★</span> \${agent.rating}</div>\` : ''}
                                \${agent.downloads ? \`<div class="agent-stat">⬇️ \${agent.downloads.toLocaleString()}</div>\` : ''}
                                <div class="agent-stat">v\${agent.version}</div>
                            </div>
                            <div class="agent-tags">
                                \${agent.tags.map(tag => \`<span class="agent-tag">\${tag}</span>\`).join('')}
                            </div>
                            \${agent.isInstalled ? '<div class="installed-badge">✓ Installed</div>' : ''}
                            <div class="agent-actions">
                                <button class="btn btn-primary" onclick="installAgent('\${agent.id}')" \${agent.isInstalled ? 'disabled' : ''}>
                                    \${agent.isInstalled ? 'Installed' : 'Install'}
                                </button>
                                <button class="btn btn-secondary" onclick="viewDetails(\${JSON.stringify(agent).replaceAll('"', '&quot;')})">
                                    Info
                                </button>
                            </div>
                        </div>
                    \`).join('');
                }
            </script>
        </body>
        </html>
    `;
}

/**
 * Render agent card HTML
 */
function renderAgentCard(agent: GalleryAgent): string {
    return `
        <div class="agent-card">
            <div class="agent-header">
                <div class="agent-title">
                    <div class="agent-name">${agent.name}</div>
                    <div class="agent-author">by ${agent.author}</div>
                </div>
                <span class="agent-badge agent-difficulty-${agent.difficulty}">${agent.difficulty}</span>
            </div>
            <p class="agent-description">${agent.description}</p>
            <div class="agent-stats">
                ${agent.rating ? `<div class="agent-stat"><span class="rating">★</span> ${agent.rating}</div>` : ''}
                ${agent.downloads ? `<div class="agent-stat">⬇️ ${agent.downloads.toLocaleString()}</div>` : ''}
                <div class="agent-stat">v${agent.version}</div>
            </div>
            <div class="agent-tags">
                ${agent.tags.map(tag => `<span class="agent-tag">${tag}</span>`).join('')}
            </div>
            ${agent.isInstalled ? '<div class="installed-badge">✓ Installed</div>' : ''}
        </div>
    `;
}
