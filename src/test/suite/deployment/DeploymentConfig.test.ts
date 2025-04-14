import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { DeploymentConfigManager, DeploymentConfig } from '../../../deployment/DeploymentConfig';
import { FileUtils } from '../../../utils/FileUtils';
import { TestLogger } from './TestLogger';
import { Logger } from '../../../utils/Logger';

suite('DeploymentConfig Tests', () => {
  let logger: TestLogger;
  let sandbox: sinon.SinonSandbox;
  let tempDir: string;
  let mockWorkspaceFolder: vscode.WorkspaceFolder;
  let configManager: DeploymentConfigManager;

  setup(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npl-config-test-'));

    logger = new TestLogger();

    sandbox = sinon.createSandbox();

    mockWorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test',
      index: 0
    };

    configManager = new DeploymentConfigManager(logger);
  });

  teardown(async () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    sandbox.restore();
  });

  test('Should get config file path', async () => {
    const configPath = await configManager.getConfigFilePath(mockWorkspaceFolder);
    assert.strictEqual(configPath, path.join(tempDir, 'npl-deploy.json'));
  });

  test('Should save and load config', async () => {
    const config: DeploymentConfig = {
      baseUrl: 'https://test.example.com',
      appName: 'test-app',
      username: 'testuser',
      sourcePath: '/test/path',
      rapidDeploy: true,
      skipRapidDeployWarning: false
    };

    await configManager.saveConfig(mockWorkspaceFolder, config);

    const loadedConfig = await configManager.loadConfig(mockWorkspaceFolder);

    assert.deepStrictEqual(loadedConfig, config);

    const configPath = await configManager.getConfigFilePath(mockWorkspaceFolder);
    assert.strictEqual(fs.existsSync(configPath), true);

    const content = fs.readFileSync(configPath, 'utf8');
    const parsedContent = JSON.parse(content);
    assert.deepStrictEqual(parsedContent, config);
  });

  test('Should return undefined when config file does not exist', async () => {
    const loadedConfig = await configManager.loadConfig(mockWorkspaceFolder);

    assert.strictEqual(loadedConfig, undefined);
  });

  test('Should handle file read errors', async () => {
    sandbox.stub(FileUtils, 'readFile').rejects(new Error('read error'));

    sandbox.stub(FileUtils, 'fileExists').resolves(true);

    const loadedConfig = await configManager.loadConfig(mockWorkspaceFolder);

    assert.strictEqual(loadedConfig, undefined);
  });

  test('Should handle file write errors', async () => {
    sandbox.stub(FileUtils, 'writeFile').rejects(new Error('write error'));

    const config: DeploymentConfig = {
      baseUrl: 'https://test.example.com',
      appName: 'test-app',
      username: 'testuser',
      sourcePath: '/test/path',
      rapidDeploy: true
    };

    const logErrorSpy = sandbox.spy(logger, 'logError');

    try {
      await configManager.saveConfig(mockWorkspaceFolder, config);
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.strictEqual(logErrorSpy.calledOnce, true);
      assert.strictEqual(logErrorSpy.firstCall.args[0], 'Failed to save deployment configuration');
    }
  });

  test('Should handle JSON parse errors', async () => {
    const configPath = await configManager.getConfigFilePath(mockWorkspaceFolder);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, 'invalid json', 'utf8');

    const logErrorSpy = sandbox.spy(logger, 'logError');

    const loadedConfig = await configManager.loadConfig(mockWorkspaceFolder);

    assert.strictEqual(loadedConfig, undefined);

    assert.strictEqual(logErrorSpy.calledOnce, true);
    assert.strictEqual(logErrorSpy.firstCall.args[0], 'Failed to load deployment configuration');
  });
});
