import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CredentialManager } from '../../../deployment/CredentialManager';
import { TestLogger } from './TestLogger';
import { Logger } from '../../../utils/Logger';

suite('CredentialManager Tests', () => {
  let logger: TestLogger;
  let sandbox: sinon.SinonSandbox;
  let mockSecretStorage: any;
  let mockContext: vscode.ExtensionContext;
  let credentialManager: CredentialManager;

  setup(async () => {
    logger = new TestLogger();

    sandbox = sinon.createSandbox();

    mockSecretStorage = {
      store: sinon.stub().resolves(),
      get: sinon.stub().resolves('testpassword'),
      delete: sinon.stub().resolves()
    };

    mockContext = {
      secrets: mockSecretStorage
    } as unknown as vscode.ExtensionContext;

    credentialManager = new CredentialManager(logger as unknown as Logger, mockContext);
  });

  teardown(async () => {
    sandbox.restore();
  });

  test('Should store password', async () => {
    await credentialManager.storePassword('https://example.com', 'testuser', 'testpass');

    assert.strictEqual(mockSecretStorage.store.calledOnce, true);
    assert.strictEqual(mockSecretStorage.store.firstCall.args[0], 'https://example.com|testuser');
    assert.strictEqual(mockSecretStorage.store.firstCall.args[1], 'testpass');
  });

  test('Should retrieve password', async () => {
    const password = await credentialManager.getPassword('https://example.com', 'testuser');

    assert.strictEqual(mockSecretStorage.get.calledOnce, true);
    assert.strictEqual(mockSecretStorage.get.firstCall.args[0], 'https://example.com|testuser');

    assert.strictEqual(password, 'testpassword');
  });

  test('Should delete password', async () => {
    await credentialManager.deletePassword('https://example.com', 'testuser');

    assert.strictEqual(mockSecretStorage.delete.calledOnce, true);
    assert.strictEqual(mockSecretStorage.delete.firstCall.args[0], 'https://example.com|testuser');
  });

  test('Should handle store error', async () => {
    mockSecretStorage.store.rejects(new Error('store error'));

    const logErrorSpy = sandbox.spy(logger, 'logError');

    try {
      await credentialManager.storePassword('https://example.com', 'testuser', 'testpass');
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.strictEqual(logErrorSpy.calledOnce, true);
      assert.strictEqual(logErrorSpy.firstCall.args[0], 'Failed to store password');
    }
  });

  test('Should handle get error', async () => {
    mockSecretStorage.get.rejects(new Error('get error'));

    const logErrorSpy = sandbox.spy(logger, 'logError');

    const password = await credentialManager.getPassword('https://example.com', 'testuser');

    assert.strictEqual(logErrorSpy.calledOnce, true);
    assert.strictEqual(logErrorSpy.firstCall.args[0], 'Failed to retrieve password');

    assert.strictEqual(password, undefined);
  });

  test('Should handle delete error', async () => {
    mockSecretStorage.delete.rejects(new Error('delete error'));

    const logErrorSpy = sandbox.spy(logger, 'logError');

    try {
      await credentialManager.deletePassword('https://example.com', 'testuser');
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.strictEqual(logErrorSpy.calledOnce, true);
      assert.strictEqual(logErrorSpy.firstCall.args[0], 'Failed to delete password');
    }
  });
});
