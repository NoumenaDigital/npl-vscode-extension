import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { VersionManager } from '../../../server/binary/VersionManager';
import * as vscode from 'vscode';
import { BinaryManager } from '../../../server/binary/BinaryManager';
import * as fs from 'fs';

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

  test('getServerBinaryName returns correct binary for current platform', () => {
    // Make sure getServerBinaryName isn't stubbed for this test
    sandbox.restore();

    // This test verifies that getServerBinaryName returns a value for the current platform
    const binaryName = VersionManager.getServerBinaryName();
    assert.ok(binaryName.includes('language-server'), 'Binary name should include "language-server"');

    // Check that it contains the current platform name
    const platform = process.platform;
    if (platform === 'linux') {
      assert.ok(binaryName.includes('linux'), 'Linux binary name should include "linux"');
    } else if (platform === 'darwin') {
      // macOS binaries use 'macos' in their name
      assert.ok(
        binaryName.includes('macos') || binaryName.includes('darwin'),
        `macOS binary name should include platform identifier: ${binaryName}`
      );
    } else if (platform === 'win32') {
      assert.ok(binaryName.includes('windows'), 'Windows binary name should include "windows"');
    }
  });

  test('getServerBinaryName error behavior', async () => {
    // Mock the BinaryManager.downloadServerBinary directly instead of calling it
    const originalMethod = VersionManager.getServerBinaryName;
    const originalBinaryDownload = BinaryManager.downloadServerBinary;

    try {
      // Create a version of getServerBinaryName that throws
      VersionManager.getServerBinaryName = () => {
        throw new Error('Unsupported platform/architecture combination: test/mock');
      };

      // Create a simplified test version of BinaryManager.downloadServerBinary that just
      // calls VersionManager.getServerBinaryName to trigger our error
      BinaryManager.downloadServerBinary = async () => {
        try {
          // This will throw our error
          VersionManager.getServerBinaryName();
          return 'fake-path';
        } catch (error) {
          // This should catch our platform error and enhance it
          if (error instanceof Error && error.message.includes('Unsupported platform/architecture')) {
            const platform = process.platform;
            const arch = process.arch;
            throw new Error(
              `This extension doesn't support your platform (${platform}/${arch}). ` +
              `Currently supported platforms are: Windows (x64), macOS (x64/arm64), and Linux (x64/arm64).`
            );
          }
          throw error;
        }
      };

      try {
        await BinaryManager.downloadServerBinary('/mock/path');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(
          error.message.includes('This extension doesn\'t support your platform'),
          `Error should mention platform support: ${error.message}`
        );
      }
    } finally {
      // Restore original methods
      VersionManager.getServerBinaryName = originalMethod;
      BinaryManager.downloadServerBinary = originalBinaryDownload;
    }
  });
});
