import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { StreamInfo } from 'vscode-languageclient/node';
import { ServerManager } from '../../server/ServerManager';
import { TcpConnectionManager } from '../../server/connection/TcpConnectionManager';
import { ServerProcessManager } from '../../server/process/ServerProcessManager';
import { ServerUpdateManager } from '../../server/binary/ServerUpdateManager';
import { VersionPickerUI } from '../../server/ui/VersionPickerUI';
import { CleanFilesUI } from '../../server/ui/CleanFilesUI';
import { MockLogger } from '../mocks/MockLogger';
import { createMockExtensionContext } from '../mocks/MockExtensionContext';

suite('ServerManager Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockLogger: MockLogger;
  let manager: ServerManager;
  let mockContext: vscode.ExtensionContext;

  // Stubs for internal components
  let tcpConnectStub: sinon.SinonStub;
  let processSpawnStub: sinon.SinonStub;
  let updateGetBinaryStub: sinon.SinonStub;
  let updateCheckForUpdatesStub: sinon.SinonStub;
  let versionPickerShowStub: sinon.SinonStub;
  let cleanFilesUICleanStub: sinon.SinonStub;
  let processStopServerStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockLogger = new MockLogger();

    // Create stubs for each internal component method
    tcpConnectStub = sandbox.stub(TcpConnectionManager.prototype, 'connectToExistingServer');
    processSpawnStub = sandbox.stub(ServerProcessManager.prototype, 'spawnServerProcess');
    updateGetBinaryStub = sandbox.stub(ServerUpdateManager.prototype, 'getLatestServerBinary');
    updateCheckForUpdatesStub = sandbox.stub(ServerUpdateManager.prototype, 'checkForUpdates');
    versionPickerShowStub = sandbox.stub(VersionPickerUI.prototype, 'show');
    cleanFilesUICleanStub = sandbox.stub(CleanFilesUI.prototype, 'cleanServerFiles');
    processStopServerStub = sandbox.stub(ServerProcessManager.prototype, 'stopServer');

    // Initialize the ServerManager after stubs are in place
    manager = new ServerManager(mockLogger as any);

    // Use the mock extension context helper
    mockContext = createMockExtensionContext();
  });

  teardown(() => {
    sandbox.restore();
    mockLogger.reset();
  });

  test('getServerConnection should connect to existing server when available', async () => {
    const mockStreamInfo: StreamInfo = { reader: {} as any, writer: {} as any };
    tcpConnectStub.resolves(mockStreamInfo);

    const result = await manager.getServerConnection(mockContext);

    assert.strictEqual(result, mockStreamInfo);
    assert.ok(tcpConnectStub.calledOnce);
    assert.ok(updateGetBinaryStub.notCalled);
    assert.ok(processSpawnStub.notCalled);
  });

  test('getServerConnection should start new server when no existing connection', async () => {
    // No existing connection
    tcpConnectStub.resolves(null);

    // Mock binary path and stream info
    const mockBinaryPath = '/mock/extension/path/bin/server';
    updateGetBinaryStub.resolves(mockBinaryPath);

    const mockStreamInfo: StreamInfo = { reader: {} as any, writer: {} as any };
    processSpawnStub.resolves(mockStreamInfo);

    const result = await manager.getServerConnection(mockContext);

    assert.strictEqual(result, mockStreamInfo);
    assert.ok(tcpConnectStub.calledOnce);
    assert.ok(updateGetBinaryStub.calledOnce);
    assert.ok(processSpawnStub.calledOnce);
    assert.ok(processSpawnStub.calledWith(mockBinaryPath));
  });

  test('checkForUpdates should delegate to update manager', async () => {
    updateCheckForUpdatesStub.resolves(true);

    const result = await manager.checkForUpdates(mockContext);

    assert.strictEqual(result, true);
    assert.ok(updateCheckForUpdatesStub.calledOnce);
    assert.ok(updateCheckForUpdatesStub.calledWith(mockContext));
  });

  test('showVersionPicker should delegate to version picker UI', async () => {
    versionPickerShowStub.resolves();

    await manager.showVersionPicker(mockContext);

    assert.ok(versionPickerShowStub.calledOnce);
    assert.ok(versionPickerShowStub.calledWith(mockContext));
  });

  test('cleanServerFiles should delegate to clean files UI', async () => {
    cleanFilesUICleanStub.resolves();

    await manager.cleanServerFiles(mockContext);

    assert.ok(cleanFilesUICleanStub.calledOnce);
    assert.ok(cleanFilesUICleanStub.calledWith(mockContext));
  });

  test('stopServer should delegate to process manager', () => {
    manager.stopServer();

    assert.ok(processStopServerStub.calledOnce);
  });
});
