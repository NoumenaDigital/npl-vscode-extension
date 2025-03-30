import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { VersionPickerUI } from '../../../server/ui/VersionPickerUI';
import { VersionManager } from '../../../server/binary/VersionManager';
import { BinaryManager } from '../../../server/binary/BinaryManager';
import { MockLogger } from '../../mocks/MockLogger';
import { createMockExtensionContext } from '../../mocks/MockExtensionContext';

suite('VersionPickerUI Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockLogger: MockLogger;
  let versionPicker: VersionPickerUI;
  let mockContext: vscode.ExtensionContext;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockLogger = new MockLogger();
    versionPicker = new VersionPickerUI(mockLogger as any);

    // Use the mock extension context helper
    mockContext = createMockExtensionContext();

    // Create stubs
    sandbox.stub(VersionManager, 'getAllGithubReleases');
    sandbox.stub(VersionManager, 'loadVersionsData');
    sandbox.stub(VersionManager, 'getLatestGithubRelease');
    sandbox.stub(BinaryManager, 'downloadServerBinary');

    // Stub VS Code API
    sandbox.stub(vscode.window, 'showQuickPick');
    sandbox.stub(vscode.window, 'showInformationMessage');
    sandbox.stub(vscode.window, 'withProgress');
    sandbox.stub(vscode.commands, 'executeCommand');

    // Mock workspace configuration
    const configStub = {
      update: sandbox.stub().resolves()
    };
    sandbox.stub(vscode.workspace, 'getConfiguration').returns(configStub as any);
  });

  teardown(() => {
    sandbox.restore();
    mockLogger.reset();
  });

  test('should be instantiated correctly', () => {
    assert.ok(versionPicker instanceof VersionPickerUI);
    assert.strictEqual(mockLogger.errors.length, 0, 'No errors should be logged during instantiation');
  });

  test('show should handle errors gracefully', async () => {
    // Simulate an error
    (VersionManager.getAllGithubReleases as sinon.SinonStub).rejects(new Error('Network error'));

    await versionPicker.show(mockContext);

    // Verify error was logged
    assert.ok(mockLogger.hasLoggedError('Failed to show version picker'));
  });

  test('show loads and displays versions correctly', async () => {
    // Configure no user selection
    (vscode.window.showQuickPick as sinon.SinonStub).resolves(undefined);

    // Setup data for loading versions
    (VersionManager.getAllGithubReleases as sinon.SinonStub).resolves([
      { version: '1.0.0', publishedAt: '2023-01-01T00:00:00Z' }
    ]);

    (VersionManager.loadVersionsData as sinon.SinonStub).resolves([]);

    await versionPicker.show(mockContext);

    // Verify the window.showQuickPick was called
    assert.ok((vscode.window.showQuickPick as sinon.SinonStub).calledOnce);

    // Verify log messages
    assert.ok(mockLogger.hasLoggedMessage('Fetched 1 versions from GitHub'));
  });
});
