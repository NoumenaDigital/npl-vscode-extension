import * as vscode from 'vscode';

/**
 * Creates a mock ExtensionContext for testing
 */
export function createMockExtensionContext(extensionPath: string = '/mock/extension/path'): vscode.ExtensionContext {
  // Create a minimal implementation with the properties we actually use
  const mockContext = {
    extensionPath,
    asAbsolutePath: (relativePath: string) => `${extensionPath}/${relativePath}`,
    // Add an EventEmitter for the secrets.onDidChange property
    secrets: {
      store: () => Promise.resolve(),
      get: () => Promise.resolve(''),
      delete: () => Promise.resolve(),
      onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
    },
    // Basic implementations that satisfy Memento
    workspaceState: {
      get: () => undefined,
      update: () => Promise.resolve(),
      keys: () => []
    },
    globalState: {
      get: () => undefined,
      update: () => Promise.resolve(),
      keys: () => []
    }
  };

  // Cast to the full interface to satisfy TypeScript
  return mockContext as unknown as vscode.ExtensionContext;
}
