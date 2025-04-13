import * as assert from 'assert';
import * as vscode from 'vscode';
import { CredentialManager } from '../../../deployment/CredentialManager';
import { Logger } from '../../../utils/Logger';

// Implement a test double for SecretStorage instead of mocking
class TestSecretStorage implements vscode.SecretStorage {
  private storage: Map<string, string> = new Map();
  private changeEmitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();

  public onDidChange = this.changeEmitter.event;

  async get(key: string): Promise<string | undefined> {
    return this.storage.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
    this.changeEmitter.fire({ key });
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
    this.changeEmitter.fire({ key });
  }
}

// Simplified Logger interface for testing
interface TestLoggerInterface {
  logError(message: string, error?: Error): void;
  log(message: string): void;
  show(): void;
  logInfo(message: string): void;
  logWarning(message: string): void;
}

// Implement a test double for Logger
class TestLogger implements Partial<Logger> {
  public errors: Array<{message: string, error?: Error}> = [];
  public logs: string[] = [];

  logError(message: string, error?: Error): void {
    this.errors.push({ message, error });
  }

  log(message: string): void {
    this.logs.push(message);
  }

  show(): void {
    // No-op for test
  }

  logInfo(message: string): void {
    this.logs.push(`INFO: ${message}`);
  }

  logWarning(message: string): void {
    this.logs.push(`WARNING: ${message}`);
  }
}

// Partial implementation of ExtensionContext for testing
class TestExtensionContext {
  public readonly subscriptions: { dispose(): any }[] = [];
  public readonly secrets: vscode.SecretStorage;

  constructor(secretStorage: vscode.SecretStorage) {
    this.secrets = secretStorage;
  }
}

suite('CredentialManager Test Suite', () => {
  let logger: TestLogger;
  let secretStorage: TestSecretStorage;
  let context: TestExtensionContext;
  let credentialManager: CredentialManager;

  setup(() => {
    logger = new TestLogger();
    secretStorage = new TestSecretStorage();
    context = new TestExtensionContext(secretStorage);
    credentialManager = new CredentialManager(logger as unknown as Logger, context as unknown as vscode.ExtensionContext);
  });

  test('storePassword should store password in secret storage', async () => {
    const baseUrl = 'https://example.com';
    const username = 'user@example.com';
    const password = 'password123';

    await credentialManager.storePassword(baseUrl, username, password);

    // Verify password is stored with the correct key
    const storedPassword = await secretStorage.get(`${baseUrl}|${username}`);
    assert.strictEqual(storedPassword, password);
  });

  test('getPassword should retrieve password from secret storage', async () => {
    const baseUrl = 'https://example.com';
    const username = 'user@example.com';
    const password = 'password123';

    // Store the password first
    await secretStorage.store(`${baseUrl}|${username}`, password);

    // Then retrieve it
    const retrievedPassword = await credentialManager.getPassword(baseUrl, username);

    assert.strictEqual(retrievedPassword, password);
  });

  test('deletePassword should remove password from secret storage', async () => {
    const baseUrl = 'https://example.com';
    const username = 'user@example.com';
    const password = 'password123';

    // Store the password first
    await secretStorage.store(`${baseUrl}|${username}`, password);

    // Delete it
    await credentialManager.deletePassword(baseUrl, username);

    // Verify it's gone
    const retrievedPassword = await secretStorage.get(`${baseUrl}|${username}`);
    assert.strictEqual(retrievedPassword, undefined);
  });

  test('storePassword should handle errors', async () => {
    const baseUrl = 'https://example.com';
    const username = 'user@example.com';
    const password = 'password123';

    // Create a failing secret storage
    const failingStorage = new TestSecretStorage();
    // Override the store method to throw an error
    Object.defineProperty(failingStorage, 'store', {
      value: async () => { throw new Error('Storage error'); }
    });

    const failingContext = new TestExtensionContext(failingStorage);

    const managerWithFailingStorage = new CredentialManager(
      logger as unknown as Logger,
      failingContext as unknown as vscode.ExtensionContext
    );

    try {
      await managerWithFailingStorage.storePassword(baseUrl, username, password);
      assert.fail('Expected error to be thrown');
    } catch (e) {
      assert.strictEqual((e as Error).message, 'Storage error');
    }

    // Verify error was logged
    assert.strictEqual(logger.errors.length, 1);
    assert.strictEqual(logger.errors[0].message, 'Failed to store password');
  });

  test('getPassword should handle errors and return undefined', async () => {
    const baseUrl = 'https://example.com';
    const username = 'user@example.com';

    // Create a failing secret storage
    const failingStorage = new TestSecretStorage();
    // Override the get method to throw an error
    Object.defineProperty(failingStorage, 'get', {
      value: async () => { throw new Error('Retrieval error'); }
    });

    const failingContext = new TestExtensionContext(failingStorage);

    const managerWithFailingStorage = new CredentialManager(
      logger as unknown as Logger,
      failingContext as unknown as vscode.ExtensionContext
    );

    const password = await managerWithFailingStorage.getPassword(baseUrl, username);

    // Verify error was logged
    assert.strictEqual(logger.errors.length, 1);
    assert.strictEqual(logger.errors[0].message, 'Failed to retrieve password');

    // Check that undefined was returned
    assert.strictEqual(password, undefined);
  });

  test('deletePassword should handle errors', async () => {
    const baseUrl = 'https://example.com';
    const username = 'user@example.com';

    // Create a failing secret storage
    const failingStorage = new TestSecretStorage();
    // Override the delete method to throw an error
    Object.defineProperty(failingStorage, 'delete', {
      value: async () => { throw new Error('Delete error'); }
    });

    const failingContext = new TestExtensionContext(failingStorage);

    const managerWithFailingStorage = new CredentialManager(
      logger as unknown as Logger,
      failingContext as unknown as vscode.ExtensionContext
    );

    try {
      await managerWithFailingStorage.deletePassword(baseUrl, username);
      assert.fail('Expected error to be thrown');
    } catch (e) {
      assert.strictEqual((e as Error).message, 'Delete error');
    }

    // Verify error was logged
    assert.strictEqual(logger.errors.length, 1);
    assert.strictEqual(logger.errors[0].message, 'Failed to delete password');
  });
});
