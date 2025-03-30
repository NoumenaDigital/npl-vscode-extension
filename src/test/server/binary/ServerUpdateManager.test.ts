import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ServerUpdateManager } from '../../../server/binary/ServerUpdateManager';
import { VersionManager } from '../../../server/binary/VersionManager';
import { BinaryManager } from '../../../server/binary/BinaryManager';
import { MockLogger } from '../../mocks/MockLogger';
import { createMockExtensionContext } from '../../mocks/MockExtensionContext';

suite('ServerUpdateManager Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockLogger: MockLogger;
  let manager: ServerUpdateManager;
  let mockContext: vscode.ExtensionContext;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockLogger = new MockLogger();
    manager = new ServerUpdateManager(mockLogger as any);

    // Use the mock extension context helper
    mockContext = createMockExtensionContext();

    // Stub VS Code window APIs
    sandbox.stub(vscode.window, 'showInformationMessage');
    sandbox.stub(vscode.window, 'withProgress');

    // Set up stubs for VersionManager and BinaryManager
    sandbox.stub(VersionManager, 'checkForUpdates');
    sandbox.stub(VersionManager, 'loadVersionsData');
    sandbox.stub(VersionManager, 'getSelectedVersion');
    sandbox.stub(VersionManager, 'findLatestInstalledVersion');
    sandbox.stub(BinaryManager, 'downloadServerBinary');
  });

  teardown(() => {
    sandbox.restore();
    mockLogger.reset();
  });

  test('should be instantiated correctly', () => {
    assert.ok(manager instanceof ServerUpdateManager);
    assert.strictEqual(mockLogger.errors.length, 0, 'No errors should be logged during instantiation');
  });

  test('checkForUpdates delegations', async () => {
    // Just verify the delegations happen correctly
    await manager.checkForUpdates(mockContext);

    // Verify VersionManager.checkForUpdates was called with correct context
    assert.ok((VersionManager.checkForUpdates as sinon.SinonStub).calledWith(mockContext.extensionPath));
  });

  test('getLatestServerBinary delegations', async () => {
    // Set up minimum stubs for successful path
    (VersionManager.loadVersionsData as sinon.SinonStub).resolves([]);
    (VersionManager.getSelectedVersion as sinon.SinonStub).returns('latest');
    (BinaryManager.downloadServerBinary as sinon.SinonStub).resolves('/path/to/binary');

    // Configure withProgress to just call the callback
    (vscode.window.withProgress as sinon.SinonStub).callsFake(
      async (_options: any, callback: Function) => {
        return callback({ report: () => {} });
      }
    );

    // Call the method
    const result = await manager.getLatestServerBinary(mockContext);

    // Verify result
    assert.strictEqual(result, '/path/to/binary');
    assert.ok((BinaryManager.downloadServerBinary as sinon.SinonStub).calledOnce);
  });
});
