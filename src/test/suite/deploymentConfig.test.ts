import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { DeploymentConfigManager, DeploymentConfig } from '../../deployment/DeploymentConfig';
import { Logger } from '../../utils/Logger';
import { FileUtils } from '../../utils/FileUtils';

suite('DeploymentConfigManager Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let fileUtilsStub: sinon.SinonStub;
  let mockLogger: Logger;
  let configManager: DeploymentConfigManager;
  let mockWorkspaceFolder: vscode.WorkspaceFolder;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Create mock logger
    mockLogger = {
      logInfo: sandbox.stub(),
      logWarning: sandbox.stub(),
      logError: sandbox.stub(),
      show: sandbox.stub()
    } as unknown as Logger;

    // Create mock workspace folder
    mockWorkspaceFolder = {
      uri: vscode.Uri.file('/test/workspace'),
      name: 'test',
      index: 0
    };

    // Stub FileUtils methods
    fileUtilsStub = sandbox.stub(FileUtils, 'fileExists');
    sandbox.stub(FileUtils, 'readFile');
    sandbox.stub(FileUtils, 'writeFile');

    configManager = new DeploymentConfigManager(mockLogger);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('loadConfig should return undefined when config file does not exist', async () => {
    fileUtilsStub.resolves(false);

    const config = await configManager.loadConfig(mockWorkspaceFolder);

    assert.strictEqual(config, undefined);
  });

  test('loadConfig should return config when file exists', async () => {
    const mockConfig: DeploymentConfig = {
      baseUrl: 'https://test.com',
      appName: 'test-app',
      username: 'user@example.com',
      sourcePath: '/path/to/source',
      rapidDeploy: false
    };

    fileUtilsStub.resolves(true);
    (FileUtils.readFile as sinon.SinonStub).resolves(JSON.stringify(mockConfig));

    const config = await configManager.loadConfig(mockWorkspaceFolder);

    assert.deepStrictEqual(config, mockConfig);
  });

  test('loadConfig should handle errors', async () => {
    fileUtilsStub.resolves(true);
    (FileUtils.readFile as sinon.SinonStub).rejects(new Error('Test error'));

    const config = await configManager.loadConfig(mockWorkspaceFolder);

    assert.strictEqual(config, undefined);
    assert.strictEqual((mockLogger.logError as sinon.SinonStub).calledOnce, true);
  });

  test('saveConfig should write config to file', async () => {
    const mockConfig: DeploymentConfig = {
      baseUrl: 'https://test.com',
      appName: 'test-app',
      username: 'user@example.com',
      sourcePath: '/path/to/source',
      rapidDeploy: false
    };

    await configManager.saveConfig(mockWorkspaceFolder, mockConfig);

    assert.strictEqual((FileUtils.writeFile as sinon.SinonStub).calledOnce, true);

    const writeArgs = (FileUtils.writeFile as sinon.SinonStub).firstCall.args;
    assert.strictEqual(writeArgs[1], JSON.stringify(mockConfig, null, 2));
  });

  test('saveConfig should handle errors', async () => {
    const mockConfig: DeploymentConfig = {
      baseUrl: 'https://test.com',
      appName: 'test-app',
      username: 'user@example.com',
      sourcePath: '/path/to/source',
      rapidDeploy: false
    };

    (FileUtils.writeFile as sinon.SinonStub).rejects(new Error('Test error'));

    try {
      await configManager.saveConfig(mockWorkspaceFolder, mockConfig);
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.strictEqual((mockLogger.logError as sinon.SinonStub).calledOnce, true);
    }
  });
});
