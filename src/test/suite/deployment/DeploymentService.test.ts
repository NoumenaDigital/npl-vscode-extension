import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { DeploymentService, DeploymentResult } from '../../../deployment/DeploymentService';
import { DeploymentConfig } from '../../../deployment/DeploymentConfig';
import { TestServer } from './TestServer';
import { TestLogger } from './TestLogger';
import { Logger } from '../../../utils/Logger';

suite('DeploymentService Tests', () => {
  let logger: TestLogger;
  let sandbox: sinon.SinonSandbox;
  let server: TestServer;
  let deploymentService: DeploymentService;
  let mockContext: vscode.ExtensionContext;
  let mockWorkspaceFolder: vscode.WorkspaceFolder;
  let tempDir: string;
  let mockWindow: any;

  const ERROR_MESSAGES = {
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    CONFLICT: 'Conflict',
    SERVER_ERROR: 'Internal server error',
    GATEWAY_ERROR: 'Bad gateway',
    SERVICE_UNAVAILABLE: 'Service unavailable',
    GATEWAY_TIMEOUT: 'Gateway timeout',
    CONNECTION_REFUSED: 'ECONNREFUSED'
  };

  setup(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npl-deploy-test-'));

    const testFilePath = path.join(tempDir, 'test.npl');
    fs.writeFileSync(testFilePath, 'protocol[] Test() { init {}; };');

    logger = new TestLogger();
    sandbox = sinon.createSandbox();

    const mockSecretStorage = {
      store: sinon.stub().resolves(),
      get: sinon.stub().resolves('testpassword'),
      delete: sinon.stub().resolves()
    };

    mockContext = {
      secrets: mockSecretStorage
    } as unknown as vscode.ExtensionContext;

    mockWorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test',
      index: 0
    };

    mockWindow = sandbox.stub(vscode.window);
    mockWindow.showInputBox.resolves('testpassword');
    mockWindow.showInformationMessage.resolves();
    mockWindow.showErrorMessage.resolves();

    server = new TestServer().start();

    deploymentService = new DeploymentService(logger as unknown as Logger, mockContext);
  });

  teardown(async () => {
    await server.stop();

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    sandbox.restore();
  });

  test('Should deploy successfully', async () => {
    const config: DeploymentConfig = {
      baseUrl: server.getBaseUrl(),
      appName: 'test-app',
      username: 'testuser',
      sourcePath: tempDir,
      rapidDeploy: false
    };

    server.setAuthResponse(200, { access_token: 'test-jwt-token' });
    server.setDeployResponse(200);

    const result = await deploymentService.deploy(mockWorkspaceFolder, config);

    assert.strictEqual(result.result, DeploymentResult.Success);
  });

  test('Should deploy successfully with rapid deploy', async () => {
    const config: DeploymentConfig = {
      baseUrl: server.getBaseUrl(),
      appName: 'test-app',
      username: 'testuser',
      sourcePath: tempDir,
      rapidDeploy: true
    };

    server.setAuthResponse(200, { access_token: 'test-jwt-token' });
    server.setClearResponse(200);
    server.setDeployResponse(200);

    const result = await deploymentService.deploy(mockWorkspaceFolder, config);

    assert.strictEqual(result.result, DeploymentResult.Success);
    assert.ok(result.message?.includes('cleared'), 'Message should mention app was cleared');
  });

  function testHttpError(statusCode: number, expectedResult: DeploymentResult) {
    return async () => {
      const config: DeploymentConfig = {
        baseUrl: server.getBaseUrl(),
        appName: 'test-app',
        username: 'testuser',
        sourcePath: tempDir,
        rapidDeploy: false
      };

      server.setAuthResponse(200, { access_token: 'test-jwt-token' });
      server.setDeployResponse(statusCode);

      const result = await deploymentService.deploy(mockWorkspaceFolder, config);

      assert.strictEqual(result.result, expectedResult);
    };
  }

  test('Should handle 401 unauthorized response', testHttpError(401, DeploymentResult.Unauthorized));
  test('Should handle 404 not found response', testHttpError(404, DeploymentResult.NotFound));
  test('Should handle 409 conflict response', testHttpError(409, DeploymentResult.OtherFailure));
  test('Should handle 422 unprocessable response', testHttpError(422, DeploymentResult.Unprocessable));
  test('Should handle 500 server error response', testHttpError(500, DeploymentResult.OtherFailure));

  test('Should handle connection error', async () => {
    const config: DeploymentConfig = {
      baseUrl: 'http://localhost:1',
      appName: 'test-app',
      username: 'testuser',
      sourcePath: tempDir,
      rapidDeploy: false
    };

    const result = await deploymentService.deploy(mockWorkspaceFolder, config);

    assert.strictEqual(result.result, DeploymentResult.ConnectionError);
  });

  test('Should handle authentication error', async () => {
    const config: DeploymentConfig = {
      baseUrl: server.getBaseUrl(),
      appName: 'test-app',
      username: 'testuser',
      sourcePath: tempDir,
      rapidDeploy: false
    };

    server.setAuthResponse(401, { error: ERROR_MESSAGES.UNAUTHORIZED });

    const result = await deploymentService.deploy(mockWorkspaceFolder, config);

    assert.strictEqual(result.result, DeploymentResult.AuthorizationError);
    assert.ok(
      result.message?.includes('auth') ||
      result.message?.includes('Auth') ||
      result.message?.includes('unauthorized') ||
      result.message?.includes('Unauthorized'),
      'Message should indicate an authentication/authorization error'
    );
  });

  test('Should handle clear application error', async () => {
    const config: DeploymentConfig = {
      baseUrl: server.getBaseUrl(),
      appName: 'test-app',
      username: 'testuser',
      sourcePath: tempDir,
      rapidDeploy: true
    };

    server.setAuthResponse(200, { access_token: 'test-jwt-token' });
    server.setClearResponse(500);

    const result = await deploymentService.deploy(mockWorkspaceFolder, config);

    assert.strictEqual(result.result, DeploymentResult.OtherFailure);
  });

  test('Should handle missing password', async () => {
    const config: DeploymentConfig = {
      baseUrl: server.getBaseUrl(),
      appName: 'test-app',
      username: 'testuser',
      sourcePath: tempDir,
      rapidDeploy: false
    };

    const credentialManager = (deploymentService as any).credentialManager;
    sandbox.stub(credentialManager, 'getPassword').resolves(null);

    mockWindow.showInputBox.resolves(undefined);

    const result = await deploymentService.deploy(mockWorkspaceFolder, config);

    assert.strictEqual(result.result, DeploymentResult.AuthorizationError);
  });

  test('Should handle invalid source path', async () => {
    const config: DeploymentConfig = {
      baseUrl: server.getBaseUrl(),
      appName: 'test-app',
      username: 'testuser',
      sourcePath: path.join(tempDir, 'non-existent'),
      rapidDeploy: false
    };

    // Deploy with path that doesn't exist
    const result = await deploymentService.deploy(mockWorkspaceFolder, config);

    // Check that an error was returned (exact enum value may change over time)
    assert.ok(result.result !== DeploymentResult.Success, 'Should not return success');
    assert.ok(result.error instanceof Error, 'Should return an error');
  });
});
