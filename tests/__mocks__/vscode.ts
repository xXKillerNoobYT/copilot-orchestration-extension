/**
 * Mock implementation of the VS Code API for testing.
 * This allows tests to run without the real VS Code extension host.
 */

// Mock OutputChannel class
class MockOutputChannel {
  private lines: string[] = [];
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  appendLine(value: string): void {
    this.lines.push(value);
  }

  append(value: string): void {
    if (this.lines.length === 0) {
      this.lines.push(value);
    } else {
      this.lines[this.lines.length - 1] += value;
    }
  }

  clear(): void {
    this.lines = [];
  }

  show(): void {
    // No-op in tests
  }

  hide(): void {
    // No-op in tests
  }

  dispose(): void {
    this.lines = [];
  }

  // Helper for tests to inspect logged content
  getLines(): string[] {
    return this.lines;
  }
}

// Mock window namespace
export const window = {
  createOutputChannel(name: string): MockOutputChannel {
    return new MockOutputChannel(name);
  },
  showInformationMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  registerTreeDataProvider: jest.fn(),
};

// Mock TreeItemCollapsibleState enum
export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

// Mock TreeItem class
export class TreeItem {
  label?: string;
  description?: string;
  tooltip?: string;
  iconPath?: any;
  command?: any;
  collapsibleState: TreeItemCollapsibleState;

  constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState ?? TreeItemCollapsibleState.None;
  }
}

// Mock ThemeIcon class
export class ThemeIcon {
  id: string;
  color?: ThemeColor;

  constructor(id: string, color?: ThemeColor) {
    this.id = id;
    this.color = color;
  }
}

// Mock ThemeColor class
export class ThemeColor {
  id: string;

  constructor(id: string) {
    this.id = id;
  }
}

// Mock EventEmitter class
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  get event() {
    return (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => { } };
    };
  }

  fire(data?: T): void {
    this.listeners.forEach(listener => listener(data as T));
  }
}

// Mock ExtensionContext
export class ExtensionContext {
  extensionPath: string = '/mock/extension/path';
  subscriptions: any[] = [];
  workspaceState: any = {
    get: jest.fn(),
    update: jest.fn(),
  };
  globalState: any = {
    get: jest.fn(),
    update: jest.fn(),
    setKeysForSync: jest.fn(),
  };
  secrets: any = {
    get: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
  };
  extensionUri: any = { fsPath: '/mock/extension/path' };
  environmentVariableCollection: any = {
    persistent: true,
    description: '',
    replace: jest.fn(),
    append: jest.fn(),
    prepend: jest.fn(),
    get: jest.fn(),
    forEach: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
  };
  extensionMode: any = 3; // Production mode
  storageUri: any = { fsPath: '/mock/storage' };
  globalStorageUri: any = { fsPath: '/mock/global-storage' };
  logUri: any = { fsPath: '/mock/logs' };
  storagePath: string | undefined = '/mock/storage'; // Deprecated but still required
  globalStoragePath: string = '/mock/global-storage'; // Deprecated but still required
  logPath: string = '/mock/logs'; // Deprecated but still required
  extension: any = {
    id: 'test.extension',
    extensionUri: { fsPath: '/mock/extension/path' },
    extensionPath: '/mock/extension/path',
    isActive: true,
    packageJSON: {},
    exports: undefined,
    activate: jest.fn(),
  };
  languageModelAccessInformation: any = {
    onDidChange: jest.fn(),
    canSendRequest: jest.fn(),
  };

  asAbsolutePath(relativePath: string): string {
    return `/mock/extension/path/${relativePath}`;
  }

  constructor(extensionPath?: string) {
    if (extensionPath) {
      this.extensionPath = extensionPath;
    }
  }
}
