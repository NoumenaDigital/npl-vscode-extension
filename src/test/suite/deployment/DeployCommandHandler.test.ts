import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { DeployCommandHandler } from '../../../deployment/DeployCommandHandler';
import { DeploymentResult } from '../../../deployment/DeploymentService';
import { TestLogger } from './TestLogger';
import {
  IMockExtensionContext,
  IMockSecretStorage,
  IMockDeploymentConfigManager,
  IMockDeploymentService,
  IMockCredentialManager
} from './interfaces';
import { DeploymentConfig } from '../../../deployment/DeploymentConfig';

const TEST_VALUE = 'test-value';
const TEST_URL = 'https://test.example.com';
const TEST_APP = 'test-app';
const TEST_USER = 'testuser';
const TEST_PASSWORD = 'testpassword';


suite('DeployCommandHandler Tests', () => {
  let logger: TestLogger;
  let sandbox: sinon.SinonSandbox;
  let deployCommandHandler: DeployCommandHandler;
  let mockContext: IMockExtensionContext;
  let mockWorkspaceFolder: vscode.WorkspaceFolder;
  let tempDir: string;
  let mockWindow: any;
  let workspaceFolders: vscode.WorkspaceFolder[];
  let mockConfigManager: IMockDeploymentConfigManager;
  let mockDeploymentService: IMockDeploymentService;
  let mockCredentialManager: IMockCredentialManager;

  setup(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npl-command-test-'));

    logger = new TestLogger();

    sandbox = sinon.createSandbox();

    const mockSecretStorage: IMockSecretStorage = {
      store: sinon.stub().resolves(),
      get: sinon.stub().resolves(TEST_PASSWORD),
      delete: sinon.stub().resolves()
    };

    mockContext = {
      secrets: mockSecretStorage
    };

    mockWorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test',
      index: 0
    };

    workspaceFolders = [mockWorkspaceFolder];

    // Mock vscode.window
    mockWindow = sandbox.stub(vscode.window);
    mockWindow.showInputBox.resolves(TEST_VALUE);
    mockWindow.showOpenDialog.resolves([vscode.Uri.file(tempDir)]);
    mockWindow.showQuickPick.resolves('No');
    mockWindow.showInformationMessage.resolves();
    mockWindow.showErrorMessage.resolves();
    mockWindow.showWarningMessage.resolves();
    mockWindow.showWorkspaceFolderPick.resolves(mockWorkspaceFolder);

    // Mock vscode.workspace using a getter instead of direct assignment
    // This avoids the "Cannot set property workspaceFolders" error
    sandbox.stub(vscode.workspace, 'workspaceFolders').get(() => workspaceFolders);

    // Create stubs with the correct types
    mockConfigManager = {
      loadConfig: sinon.stub<[vscode.WorkspaceFolder], Promise<DeploymentConfig | undefined>>().resolves(undefined),
      saveConfig: sinon.stub<[vscode.WorkspaceFolder, DeploymentConfig], Promise<void>>().resolves(),
      getConfigFilePath: sinon.stub<[vscode.WorkspaceFolder], Promise<string>>().resolves(path.join(tempDir, 'npl-deploy.json'))
    };

    mockDeploymentService = {
      deploy: sinon.stub<[vscode.WorkspaceFolder, DeploymentConfig], Promise<{
        result: DeploymentResult;
        message: string;
        error?: Error;
      }>>().resolves({
        result: DeploymentResult.Success,
        message: 'Successfully deployed.'
      })
    };

    mockCredentialManager = {
      storePassword: sinon.stub<[string, string, string], Promise<void>>().resolves(),
      getPassword: sinon.stub<[string, string], Promise<string | undefined>>().resolves(TEST_PASSWORD),
      deletePassword: sinon.stub<[string, string], Promise<void>>().resolves()
    };

    // Create deploy command handler
    deployCommandHandler = new DeployCommandHandler(logger, mockContext as unknown as vscode.ExtensionContext);

    // Replace the dependencies with our mocks
    (deployCommandHandler as any).configManager = mockConfigManager;
    (deployCommandHandler as any).deploymentService = mockDeploymentService;
    (deployCommandHandler as any).credentialManager = mockCredentialManager;
  });

  teardown(async () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    sandbox.restore();
  });

  test('Should configure deployment', async () => {
    await deployCommandHandler.configureDeployment();

    assert.strictEqual(mockConfigManager.saveConfig.calledOnce, true);

    const savedConfig = mockConfigManager.saveConfig.firstCall.args[1];
    assert.strictEqual(savedConfig.baseUrl, TEST_VALUE);
    assert.strictEqual(savedConfig.appName, TEST_VALUE);
    assert.strictEqual(savedConfig.username, TEST_VALUE);
    assert.strictEqual(savedConfig.sourcePath, tempDir);
    assert.strictEqual(savedConfig.rapidDeploy, false);

    assert.strictEqual(mockCredentialManager.storePassword.calledOnce, true);
  });

  test('Should handle missing workspace', async () => {
    workspaceFolders = [];

    await deployCommandHandler.configureDeployment();

    assert.strictEqual(mockConfigManager.saveConfig.called, false);

    assert.strictEqual(mockWindow.showErrorMessage.called, true);
  });

  test('Should deploy application with existing config', async () => {
    mockConfigManager.loadConfig.resolves({
      baseUrl: TEST_URL,
      appName: TEST_APP,
      username: TEST_USER,
      sourcePath: tempDir,
      rapidDeploy: false
    });

    await deployCommandHandler.deployApplication();

    assert.strictEqual(mockDeploymentService.deploy.calledOnce, true);
  });

  test('Should prompt to configure when no config exists', async () => {
    // Mock no existing config
    mockConfigManager.loadConfig.resolves(undefined);

    mockWindow.showErrorMessage.resolves('Some Other Option');

    await deployCommandHandler.deployApplication();

    assert.strictEqual(mockDeploymentService.deploy.called, false);

    assert.strictEqual(mockConfigManager.loadConfig.calledOnce, true);

    assert.strictEqual(mockWindow.showErrorMessage.calledOnce, true);
  });

  function testRapidDeploy(options: {
    rapidDeploy: boolean,
    skipWarning?: boolean,
    userResponse?: string,
    expectDeploy: boolean,
    expectWarning: boolean,
    expectSkipSetting?: boolean
  }) {
    return async () => {
      // Mock existing config with proper typing
      const config: {
        baseUrl: string;
        appName: string;
        username: string;
        sourcePath: string;
        rapidDeploy: boolean;
        skipRapidDeployWarning?: boolean;
      } = {
        baseUrl: TEST_URL,
        appName: TEST_APP,
        username: TEST_USER,
        sourcePath: tempDir,
        rapidDeploy: options.rapidDeploy
      };

      if (options.skipWarning !== undefined) {
        config.skipRapidDeployWarning = options.skipWarning;
      }

      mockConfigManager.loadConfig.resolves(config);

      if (options.userResponse) {
        mockWindow.showWarningMessage.resolves(options.userResponse);
      } else {
        mockWindow.showWarningMessage.resolves(undefined);
      }

      await deployCommandHandler.deployApplication();

      assert.strictEqual(mockDeploymentService.deploy.called, options.expectDeploy);

      assert.strictEqual(mockWindow.showWarningMessage.called, options.expectWarning);

      if (options.expectSkipSetting) {
        assert.strictEqual(mockConfigManager.saveConfig.calledOnce, true);
        const savedConfig = mockConfigManager.saveConfig.firstCall.args[1];
        assert.strictEqual(savedConfig.skipRapidDeployWarning, true);
      }
    };
  }

  test('Should confirm before rapid deploy', testRapidDeploy({
    rapidDeploy: true,
    userResponse: 'Yes, clear data and deploy',
    expectDeploy: true,
    expectWarning: true
  }));

  test('Should save preference when user selects "don\'t warn me again"', testRapidDeploy({
    rapidDeploy: true,
    userResponse: 'Yes, and don\'t warn me again',
    expectDeploy: true,
    expectWarning: true,
    expectSkipSetting: true
  }));

  test('Should not deploy when user cancels rapid deploy', testRapidDeploy({
    rapidDeploy: true,
    userResponse: undefined,
    expectDeploy: false,
    expectWarning: true
  }));

  test('Should not warn for rapid deploy if skipRapidDeployWarning is true', testRapidDeploy({
    rapidDeploy: true,
    skipWarning: true,
    expectDeploy: true,
    expectWarning: false
  }));

  test('Should clean credentials', async () => {
    // Mock existing config
    mockConfigManager.loadConfig.resolves({
      baseUrl: TEST_URL,
      appName: TEST_APP,
      username: TEST_USER,
      sourcePath: tempDir,
      rapidDeploy: false
    });

    await deployCommandHandler.cleanCredentials();

    assert.strictEqual(mockCredentialManager.deletePassword.calledOnce, true);
    assert.strictEqual(mockCredentialManager.deletePassword.firstCall.args[0], TEST_URL);
    assert.strictEqual(mockCredentialManager.deletePassword.firstCall.args[1], TEST_USER);

    assert.strictEqual(mockWindow.showInformationMessage.calledOnce, true);
  });

  test('Should handle no credentials to clean', async () => {
    mockConfigManager.loadConfig.resolves(undefined);

    await deployCommandHandler.cleanCredentials();

    assert.strictEqual(mockCredentialManager.deletePassword.called, false);

    assert.strictEqual(mockWindow.showInformationMessage.called, true);
  });

  test('Should handle multiple workspace folders', async () => {
    const secondWorkspaceFolder = {
      uri: vscode.Uri.file(path.join(tempDir, 'second')),
      name: 'second',
      index: 1
    };
    workspaceFolders = [mockWorkspaceFolder, secondWorkspaceFolder];

    await deployCommandHandler.configureDeployment();

    assert.strictEqual(mockWindow.showWorkspaceFolderPick.calledOnce, true);

    assert.strictEqual(mockConfigManager.saveConfig.calledOnce, true);
  });
});
