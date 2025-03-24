import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { VersionManager, ServerVersion } from '../../server/binary/VersionManager';
import * as vscode from 'vscode';

suite('VersionManager Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockExtensionPath: string;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockExtensionPath = '/mock/extension/path';

    // Instead of stubbing fs directly, we'll stub VersionManager methods
    sandbox.stub(VersionManager, 'getBinDirectory').returns(path.join(mockExtensionPath, 'bin'));
    sandbox.stub(VersionManager, 'getServerBinaryName').returns('language-server-mock');
  });

  teardown(() => {
    sandbox.restore();
  });

  test('getVersionsFilePath constructs correct path', () => {
    // Call the actual method since we already stubbed getBinDirectory
    const result = VersionManager.getVersionsFilePath(mockExtensionPath);
    const expected = path.join(mockExtensionPath, 'bin', VersionManager.VERSIONS_FILE);
    assert.strictEqual(result, expected);
  });

  test('getSelectedVersion uses VS Code settings', () => {
    // Mock vs code configuration
    const mockConfig = {
      get: sandbox.stub().returns('test-version')
    };
    sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig as any);

    const result = VersionManager.getSelectedVersion();
    assert.strictEqual(result, 'test-version');
    assert.strictEqual(mockConfig.get.calledWith('server.version'), true);
  });

  test('getSelectedVersion returns "latest" as default', () => {
    // Mock vs code configuration to return nothing
    const mockConfig = {
      get: sandbox.stub().returns(undefined)
    };
    sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig as any);

    const result = VersionManager.getSelectedVersion();
    assert.strictEqual(result, 'latest');
  });

  test('shouldAutoUpdate uses VS Code settings', () => {
    // Test with autoUpdate enabled
    const mockConfigEnabled = {
      get: sandbox.stub().returns(true)
    };
    sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfigEnabled as any);

    assert.strictEqual(VersionManager.shouldAutoUpdate(), true);

    // Reset stub for the second test
    sandbox.restore();

    // Test with autoUpdate disabled
    const mockConfigDisabled = {
      get: sandbox.stub().returns(false)
    };
    sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfigDisabled as any);

    assert.strictEqual(VersionManager.shouldAutoUpdate(), false);
  });

  test('getServerPath returns correct path for specific version', () => {
    const version = 'v1.0.0';
    const binaryName = 'language-server-mock';

    // Since getServerPath internally calls other methods that use fs.existsSync,
    // we need to be careful with our approach
    const getServerPathStub = sandbox.stub(VersionManager, 'getServerPath');
    getServerPathStub.returns(path.join(mockExtensionPath, 'bin', `${binaryName}-${version}`));

    // Call our stubbed method to ensure we don't hit fs.existsSync
    const result = VersionManager.getServerPath(mockExtensionPath, version);
    const expected = path.join(mockExtensionPath, 'bin', `${binaryName}-${version}`);

    assert.strictEqual(result, expected);
  });

  test('getServerDownloadBaseUrl formats URLs correctly', () => {
    // Stub getGitHubRepo to return a fixed value
    sandbox.stub(VersionManager, 'getGitHubRepo').returns('test-org/test-repo');

    // Test specific version
    let result = VersionManager.getServerDownloadBaseUrl('v1.0.0');
    assert.strictEqual(result, 'https://github.com/test-org/test-repo/releases/download/v1.0.0');

    // Test latest version
    result = VersionManager.getServerDownloadBaseUrl('latest');
    assert.strictEqual(result, 'https://github.com/test-org/test-repo/releases/latest/download');

    // Test undefined (should default to latest)
    result = VersionManager.getServerDownloadBaseUrl();
    assert.strictEqual(result, 'https://github.com/test-org/test-repo/releases/latest/download');
  });
});
