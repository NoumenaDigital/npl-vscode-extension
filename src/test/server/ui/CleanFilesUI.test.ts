import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { CleanFilesUI } from '../../../server/ui/CleanFilesUI';
import { VersionManager } from '../../../server/binary/VersionManager';
import { BinaryManager } from '../../../server/binary/BinaryManager';
import { MockLogger } from '../../mocks/MockLogger';
import { createMockExtensionContext } from '../../mocks/MockExtensionContext';

suite('CleanFilesUI Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockLogger: MockLogger;
  let cleanFilesUI: CleanFilesUI;
  let mockContext: vscode.ExtensionContext;

  // Stubs for VS Code API and managers
  let showWarningMessageStub: sinon.SinonStub;
  let withProgressStub: sinon.SinonStub;
  let cleanUnusedBinariesStub: sinon.SinonStub;
  let loadVersionsDataStub: sinon.SinonStub;
  let deleteFileIfExistsStub: sinon.SinonStub;
  let saveVersionsDataStub: sinon.SinonStub;
  let getBinDirectoryStub: sinon.SinonStub;
  let showInfoMessageStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockLogger = new MockLogger();
    cleanFilesUI = new CleanFilesUI(mockLogger as any);

    // Use the mock extension context helper
    mockContext = createMockExtensionContext();

    // Create stubs
    showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
    withProgressStub = sandbox.stub(vscode.window, 'withProgress');
    cleanUnusedBinariesStub = sandbox.stub(BinaryManager, 'cleanUnusedBinaries');
    loadVersionsDataStub = sandbox.stub(VersionManager, 'loadVersionsData');
    deleteFileIfExistsStub = sandbox.stub(BinaryManager, 'deleteFileIfExists');
    saveVersionsDataStub = sandbox.stub(VersionManager, 'saveVersionsData');
    getBinDirectoryStub = sandbox.stub(VersionManager, 'getBinDirectory');
    showInfoMessageStub = sandbox.stub(vscode.window, 'showInformationMessage');
    executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand');
  });

  teardown(() => {
    sandbox.restore();
    mockLogger.reset();
  });

  test('cleanServerFiles should show confirmation dialog and do nothing if cancelled', async () => {
    // User cancels the operation
    showWarningMessageStub.resolves('No');

    await cleanFilesUI.cleanServerFiles(mockContext);

    // Verify the warning was shown
    assert.ok(showWarningMessageStub.calledOnce);

    // Verify no other actions were taken
    assert.ok(withProgressStub.notCalled);
  });

  test('cleanServerFiles should clean all files when confirmed', async () => {
    // User confirms the operation
    showWarningMessageStub.resolves('Yes');

    // Setup the progress callback
    withProgressStub.callsFake(async (_options, callback) => {
      // Call the progress callback with a mock progress
      const mockProgress = {
        report: sinon.stub()
      };
      return await callback(mockProgress);
    });

    // Mock versions data
    loadVersionsDataStub.resolves([
      { version: '1.0.0', downloadUrl: 'https://example.com/server-1.0.0', installedPath: '/mock/extension/path/bin/server-1.0.0' },
      { version: '0.9.0', downloadUrl: 'https://example.com/server-0.9.0', installedPath: '/mock/extension/path/bin/server-0.9.0' }
    ]);

    getBinDirectoryStub.returns('/mock/extension/path/bin');

    // Mock successful operations
    cleanUnusedBinariesStub.resolves([]);
    deleteFileIfExistsStub.resolves();
    saveVersionsDataStub.resolves();

    // User does not reload
    showInfoMessageStub.resolves(undefined);

    await cleanFilesUI.cleanServerFiles(mockContext);

    // Verify operations were performed
    assert.ok(withProgressStub.calledOnce);
    assert.ok(cleanUnusedBinariesStub.calledOnce);
    assert.ok(loadVersionsDataStub.calledOnce);

    // Should delete both installed binaries
    assert.strictEqual(deleteFileIfExistsStub.callCount, 2);
    assert.ok(deleteFileIfExistsStub.calledWith('/mock/extension/path/bin/server-1.0.0'));
    assert.ok(deleteFileIfExistsStub.calledWith('/mock/extension/path/bin/server-0.9.0'));

    // Should reset versions data
    assert.ok(saveVersionsDataStub.calledWith('/mock/extension/path', []));

    // Verify success message was shown
    assert.ok(showInfoMessageStub.calledOnce);
    assert.ok(showInfoMessageStub.firstCall.args[0].includes('Successfully cleaned all server files'));
  });

  test('cleanServerFiles should reload window when selected', async () => {
    // User confirms the operation
    showWarningMessageStub.resolves('Yes');

    // Setup the progress callback
    withProgressStub.callsFake(async (_options, callback) => {
      // Call the progress callback with a mock progress
      const mockProgress = {
        report: sinon.stub()
      };
      return await callback(mockProgress);
    });

    // Mock versions data
    loadVersionsDataStub.resolves([]);
    getBinDirectoryStub.returns('/mock/extension/path/bin');

    // Mock successful operations
    cleanUnusedBinariesStub.resolves([]);

    // User selects reload
    showInfoMessageStub.resolves('Reload Now');

    await cleanFilesUI.cleanServerFiles(mockContext);

    // Verify reload command was executed
    assert.ok(executeCommandStub.calledWith('workbench.action.reloadWindow'));
  });

  test('cleanServerFiles should handle errors gracefully', async () => {
    // User confirms the operation
    showWarningMessageStub.resolves('Yes');

    // Setup the progress callback
    withProgressStub.callsFake(async (_options, callback) => {
      // Call the progress callback with a mock progress
      const mockProgress = {
        report: sinon.stub()
      };
      return await callback(mockProgress);
    });

    // Simulate an error during cleanup
    loadVersionsDataStub.rejects(new Error('Test error'));

    await cleanFilesUI.cleanServerFiles(mockContext);

    // Verify error was logged
    assert.ok(mockLogger.hasLoggedError('Failed to clean server files'));
  });
});
