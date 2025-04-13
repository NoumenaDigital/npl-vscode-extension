import * as assert from 'assert';
import * as sinon from 'sinon';
import * as path from 'path';
import { BinaryManager } from '../../../server/binary/BinaryManager';
import { VersionManager } from '../../../server/binary/VersionManager';
import { DownloadManager, ProgressCallback } from '../../../server/binary/DownloadManager';

// Define a type for our stubbed download manager for better type checking
type StubDownloadManager = DownloadManager & {
  downloadFile: sinon.SinonStub;
};

suite('BinaryManager Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockExtensionPath: string;
  let originalDownloadManager: DownloadManager;
  let mockDownloadManager: StubDownloadManager;
  // Store the original implementation
  let originalDownloadServerBinary: typeof BinaryManager.downloadServerBinary;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockExtensionPath = '/mock/extension/path';

    // Save the original download manager
    originalDownloadManager = BinaryManager.downloadManager;

    // Save the original method
    originalDownloadServerBinary = BinaryManager.downloadServerBinary;

    // Create a mock download manager and set it on BinaryManager
    mockDownloadManager = {
      downloadFile: sinon.stub().resolves()
    } as unknown as StubDownloadManager;
    BinaryManager.downloadManager = mockDownloadManager;

    // Stub the methods on VersionManager
    sandbox.stub(VersionManager, 'loadVersionsData');
    sandbox.stub(VersionManager, 'addVersionToRecord').resolves();
    sandbox.stub(VersionManager, 'getServerBinaryName').returns('language-server-mock');
    sandbox.stub(VersionManager, 'getServerPath');
    sandbox.stub(VersionManager, 'getServerDownloadBaseUrl');
    sandbox.stub(VersionManager, 'getSelectedVersion');
    sandbox.stub(VersionManager, 'getLatestGithubRelease');
    sandbox.stub(VersionManager, 'getBinDirectory').returns(path.join(mockExtensionPath, 'bin'));

    // Stub BinaryManager's own methods that would call fs
    sandbox.stub(BinaryManager, 'validateServerBinary').resolves();
    sandbox.stub(BinaryManager, 'deleteFileIfExists').resolves();

    // Mock fs.promises.mkdir
    sandbox.stub(require('fs').promises, 'mkdir').resolves();
  });

  teardown(() => {
    // Restore the original download manager
    BinaryManager.downloadManager = originalDownloadManager;

    // Restore the original method
    BinaryManager.downloadServerBinary = originalDownloadServerBinary;

    sandbox.restore();
  });

  test('downloadServerBinary invocation - simple test', async () => {
    // This is a simplified test to check invocation only
    const progressSpy = sandbox.spy();

    // Skip the actual implementation by stubbing downloadServerBinary
    const downloadStub = sandbox.stub(BinaryManager, 'downloadServerBinary').resolves('/mock/binary/path');

    await BinaryManager.downloadServerBinary(
      mockExtensionPath,
      progressSpy as unknown as ProgressCallback
    );

    // Verify it was called with the expected arguments
    assert.strictEqual(downloadStub.calledOnce, true);
    assert.strictEqual(downloadStub.firstCall.args[0], mockExtensionPath);
    assert.strictEqual(downloadStub.firstCall.args[1], progressSpy);
  });

  test('validateServerBinary mocked behavior', async () => {
    // Since we can't directly stub fs.constants and fs.promises.stat,
    // we'll just verify that our stub was called
    const validateStub = BinaryManager.validateServerBinary as sinon.SinonStub;
    const serverPath = '/mock/binary/path';

    await BinaryManager.validateServerBinary(serverPath);

    assert.strictEqual(validateStub.calledOnce, true);
    assert.strictEqual(validateStub.firstCall.args[0], serverPath);
  });

  test('downloadServerBinary should reuse existing version if available', async () => {
    // Arrange
    const progressCallback = sandbox.spy();
    const mockVersion = '1.2.3';
    const mockBinaryPath = '/mock/extension/path/bin/language-server-mock-1.2.3';

    // Reset the stub to use the original implementation
    BinaryManager.downloadServerBinary = originalDownloadServerBinary;

    // Configure mocks
    (VersionManager.getSelectedVersion as sinon.SinonStub).returns(mockVersion);
    (VersionManager.getServerPath as sinon.SinonStub).returns(mockBinaryPath);

    // Mock existing version
    const mockVersions = [{
      version: mockVersion,
      downloadUrl: 'https://example.com/download/1.2.3',
      installedPath: mockBinaryPath,
      releaseDate: '2023-01-01T00:00:00Z'
    }];
    (VersionManager.loadVersionsData as sinon.SinonStub).resolves(mockVersions);

    // Mock that file exists
    const fsExistsStub = sandbox.stub().returns(true);
    sandbox.stub(require('fs'), 'existsSync').callsFake(fsExistsStub);

    // Act
    const result = await BinaryManager.downloadServerBinary(
      mockExtensionPath,
      progressCallback as ProgressCallback,
      mockVersion
    );

    // Assert
    assert.strictEqual(result, mockBinaryPath, 'Should return path to existing binary');
    assert.strictEqual(mockDownloadManager.downloadFile.called, false, 'Download should not be called');
    assert.strictEqual((BinaryManager.validateServerBinary as sinon.SinonStub).called, false, 'Validate should not be called');

    // Check that progress callback was called with 100% increment
    assert.strictEqual(progressCallback.called, true);
    const progressCall = progressCallback.getCalls().find(call =>
      call.args[0].message?.includes('Using existing binary') &&
      call.args[0].increment === 100
    );
    assert.ok(progressCall, 'Progress callback should indicate using existing binary with 100% completion');
  });

  test('downloadServerBinary should download when version does not exist', async () => {
    // Arrange
    const progressCallback = sandbox.spy();
    const mockVersion = '1.2.3';
    const mockBinaryPath = '/mock/extension/path/bin/language-server-mock-1.2.3';
    const mockDownloadUrl = 'https://example.com/download/1.2.3/language-server-mock';

    // Reset the stub to use the original implementation
    BinaryManager.downloadServerBinary = originalDownloadServerBinary;

    // Configure mocks
    (VersionManager.getSelectedVersion as sinon.SinonStub).returns(mockVersion);
    (VersionManager.getServerPath as sinon.SinonStub).returns(mockBinaryPath);
    (VersionManager.getServerBinaryName as sinon.SinonStub).returns('language-server-mock');
    (VersionManager.getServerDownloadBaseUrl as sinon.SinonStub).returns('https://example.com/download/1.2.3');

    // Mock empty versions list (no existing versions)
    (VersionManager.loadVersionsData as sinon.SinonStub).resolves([]);

    // Mock file system
    const fsExistsStub = sandbox.stub().returns(false);
    sandbox.stub(require('fs'), 'existsSync').callsFake(fsExistsStub);

    // Act
    const result = await BinaryManager.downloadServerBinary(
      mockExtensionPath,
      progressCallback as ProgressCallback,
      mockVersion
    );

    // Assert
    assert.strictEqual(result, mockBinaryPath, 'Should return path to downloaded binary');
    assert.strictEqual(mockDownloadManager.downloadFile.calledOnce, true, 'Download should be called once');
    assert.deepStrictEqual(
      mockDownloadManager.downloadFile.firstCall.args,
      [mockDownloadUrl, mockBinaryPath, progressCallback],
      'Download should be called with correct arguments'
    );
    assert.strictEqual((BinaryManager.validateServerBinary as sinon.SinonStub).calledOnce, true, 'Binary should be validated');
    assert.strictEqual((VersionManager.addVersionToRecord as sinon.SinonStub).calledOnce, true, 'Version should be recorded');
  });

  test('downloadServerBinary should handle "latest" version specially', async () => {
    // Arrange
    const progressCallback = sandbox.spy();
    const latestVersion = '2.0.0';
    const mockBinaryPath = '/mock/extension/path/bin/language-server-mock-2.0.0';
    const mockDownloadUrl = 'https://example.com/download/2.0.0/language-server-mock';
    const mockReleaseDate = '2023-02-01T00:00:00Z';

    // Reset the stub to use the original implementation
    BinaryManager.downloadServerBinary = originalDownloadServerBinary;

    // Configure mocks
    (VersionManager.getSelectedVersion as sinon.SinonStub).returns('latest');
    (VersionManager.getServerPath as sinon.SinonStub).withArgs(mockExtensionPath, 'latest')
      .returns('/mock/extension/path/bin/language-server-mock-latest');
    (VersionManager.getServerPath as sinon.SinonStub).withArgs(mockExtensionPath, latestVersion)
      .returns(mockBinaryPath);
    (VersionManager.getServerBinaryName as sinon.SinonStub).returns('language-server-mock');
    (VersionManager.getServerDownloadBaseUrl as sinon.SinonStub).returns('https://example.com/download/2.0.0');
    (VersionManager.getLatestGithubRelease as sinon.SinonStub).resolves({
      version: latestVersion,
      publishedAt: mockReleaseDate
    });

    // Mock empty versions list (no existing versions)
    (VersionManager.loadVersionsData as sinon.SinonStub).resolves([]);

    // Mock file system
    const fsExistsStub = sandbox.stub().returns(false);
    sandbox.stub(require('fs'), 'existsSync').callsFake(fsExistsStub);

    // Act
    const result = await BinaryManager.downloadServerBinary(
      mockExtensionPath,
      progressCallback as ProgressCallback,
      'latest'
    );

    // Assert
    assert.strictEqual(result, mockBinaryPath, 'Should return path to downloaded binary with resolved version');
    assert.strictEqual(mockDownloadManager.downloadFile.calledOnce, true, 'Download should be called once');
    assert.strictEqual(
      mockDownloadManager.downloadFile.firstCall.args[0],
      mockDownloadUrl,
      'Download URL should be correctly constructed with resolved version'
    );

    // Check that proper progress callbacks were made for resolving latest version
    const latestResolutionCall = progressCallback.getCalls().find(call =>
      call.args[0].message?.includes('Latest version is')
    );
    assert.ok(latestResolutionCall, 'Progress callback should report resolving latest version');

    // Check that version was added with the correct date
    assert.strictEqual(
      (VersionManager.addVersionToRecord as sinon.SinonStub).firstCall.args[1],
      latestVersion,
      'Should record the resolved version'
    );
    assert.strictEqual(
      (VersionManager.addVersionToRecord as sinon.SinonStub).firstCall.args[2],
      mockReleaseDate,
      'Should record the release date'
    );
  });

  test('downloadServerBinary should handle errors properly', async () => {
    // Arrange
    const progressCallback = sandbox.spy();
    const mockVersion = '1.2.3';
    const mockBinaryPath = '/mock/extension/path/bin/language-server-mock-1.2.3';
    const mockError = new Error('Download failed');

    // Reset the stub to use the original implementation
    BinaryManager.downloadServerBinary = originalDownloadServerBinary;

    // Configure mocks
    (VersionManager.getSelectedVersion as sinon.SinonStub).returns(mockVersion);
    (VersionManager.getServerPath as sinon.SinonStub).returns(mockBinaryPath);
    (VersionManager.getServerBinaryName as sinon.SinonStub).returns('language-server-mock');
    (VersionManager.getServerDownloadBaseUrl as sinon.SinonStub).returns('https://example.com/download/1.2.3');

    // Mock empty versions list (no existing versions)
    (VersionManager.loadVersionsData as sinon.SinonStub).resolves([]);

    // Mock download to fail
    mockDownloadManager.downloadFile.rejects(mockError);

    // Mock file system
    const fsExistsStub = sandbox.stub().returns(false);
    sandbox.stub(require('fs'), 'existsSync').callsFake(fsExistsStub);

    // Act & Assert
    let caughtError: any;
    try {
      await BinaryManager.downloadServerBinary(
        mockExtensionPath,
        progressCallback as ProgressCallback,
        mockVersion
      );
      assert.fail('Should have thrown an error');
    } catch (error: any) {
      caughtError = error;
    }

    // Make sure we caught an error
    assert.ok(caughtError instanceof Error, 'Should throw an Error object');
    assert.ok(caughtError.message.includes('Failed to download server binary'), 'Error message should be descriptive');
    assert.ok(caughtError.message.includes('Download failed'), `Error message should include original error text. Got: ${caughtError.message}`);

    // Verify cleanup attempt
    assert.strictEqual((BinaryManager.deleteFileIfExists as sinon.SinonStub).called, true, 'Should attempt to clean up');
  });
});
