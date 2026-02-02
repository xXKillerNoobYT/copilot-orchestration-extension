/**
 * Tests for AgentsTreeDataProvider
 * 
 * Unit test = tests one class in isolation with no real dependencies
 * Mock = fake version for controlled testing
 * Jest spy = watches if function/event was called
 */

import { AgentsTreeDataProvider } from '../../src/ui/agentsTreeProvider';
import * as vscode from 'vscode';

// Mock vscode module (uses __mocks__/vscode.ts)
jest.mock('vscode');

describe('AgentsTreeDataProvider', () => {
    let provider: AgentsTreeDataProvider;

    beforeEach(() => {
        // Create fresh provider for each test
        provider = new AgentsTreeDataProvider();
    });

    describe('getChildren', () => {
        it('should return 4 agent items at root level', () => {
            const items = provider.getChildren();

            // Verify we get 4 agents
            expect(items).toHaveLength(4);

            // Verify agent names
            expect(items[0].label).toBe('Planning');
            expect(items[1].label).toBe('Orchestrator');
            expect(items[2].label).toBe('Answer');
            expect(items[3].label).toBe('Verification');
        });

        it('should set correct descriptions for each agent', () => {
            const items = provider.getChildren();

            expect(items[0].description).toBe('Active');
            expect(items[1].description).toBe('Ready');
            expect(items[2].description).toBe('Idle');
            expect(items[3].description).toBe('Waiting');
        });

        it('should have ThemeIcon for each agent', () => {
            const items = provider.getChildren();

            items.forEach(item => {
                expect(item.iconPath).toBeInstanceOf(vscode.ThemeIcon);
            });

            // Verify specific icon IDs
            expect((items[0].iconPath as vscode.ThemeIcon).id).toBe('pulse');
            expect((items[1].iconPath as vscode.ThemeIcon).id).toBe('gear');
            expect((items[2].iconPath as vscode.ThemeIcon).id).toBe('comment');
            expect((items[3].iconPath as vscode.ThemeIcon).id).toBe('check');
        });

        it('should have tooltips for each agent', () => {
            const items = provider.getChildren();

            items.forEach(item => {
                expect(item.tooltip).toBeDefined();
                expect(typeof item.tooltip).toBe('string');
            });
        });

        it('should return empty array when element is provided (no children)', () => {
            const dummyElement = new vscode.TreeItem('Dummy', vscode.TreeItemCollapsibleState.None);
            const items = provider.getChildren(dummyElement);

            expect(items).toEqual([]);
        });

        it('should set collapsibleState to None for all agents', () => {
            const items = provider.getChildren();

            items.forEach(item => {
                expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
            });
        });
    });

    describe('getTreeItem', () => {
        it('should return the element unchanged', () => {
            const testItem = new vscode.TreeItem('Test', vscode.TreeItemCollapsibleState.None);
            const result = provider.getTreeItem(testItem);

            expect(result).toBe(testItem);
        });
    });

    describe('refresh', () => {
        it('should fire onDidChangeTreeData event', () => {
            // Create spy to watch if fire() is called
            const fireSpy = jest.spyOn(provider['_onDidChangeTreeData'], 'fire');

            // Call refresh
            provider.refresh();

            // Verify fire was called once
            expect(fireSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('onDidChangeTreeData', () => {
        it('should expose event emitter', () => {
            expect(provider.onDidChangeTreeData).toBeDefined();
        });

        it('should trigger listeners when fired', () => {
            const listener = jest.fn();
            provider.onDidChangeTreeData(listener);

            provider.refresh();

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });
});
