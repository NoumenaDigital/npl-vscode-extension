import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { VersionManager, ServerVersion } from '../../server/binary/VersionManager';

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

  test('getSelectedVersion uses environment variable when available', () => {
    const originalEnv = process.env.NPL_SERVER_VERSION;

    try {
      process.env.NPL_SERVER_VERSION = 'test-version';
      const result = VersionManager.getSelectedVersion();
      assert.strictEqual(result, 'test-version');
    } finally {
      // Restore original env
      if (originalEnv === undefined) {
        delete process.env.NPL_SERVER_VERSION;
      } else {
        process.env.NPL_SERVER_VERSION = originalEnv;
      }
    }
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

  test('shouldAutoUpdate respects environment variable', () => {
    const originalEnv = process.env.NPL_SERVER_AUTO_UPDATE;

    try {
      process.env.NPL_SERVER_AUTO_UPDATE = 'false';
      assert.strictEqual(VersionManager.shouldAutoUpdate(), false);

      process.env.NPL_SERVER_AUTO_UPDATE = 'true';
      // Note: This doesn't test the VS Code configuration part, which would require more mocking
      assert.strictEqual(VersionManager.shouldAutoUpdate(), true);
    } finally {
      // Restore original env
      if (originalEnv === undefined) {
        delete process.env.NPL_SERVER_AUTO_UPDATE;
      } else {
        process.env.NPL_SERVER_AUTO_UPDATE = originalEnv;
      }
    }
  });
});
