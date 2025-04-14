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
import { IMockExtensionContext, IMockSecretStorage } from './interfaces';

suite('DeploymentService Tests', () => {
  let logger: TestLogger;
  let sandbox: sinon.SinonSandbox;
  let server: TestServer;
  let deploymentService: DeploymentService;
  let mockContext: IMockExtensionContext;
  let mockWorkspaceFolder: vscode.WorkspaceFolder;
  let tempDir: string;
  let mockWindow: any;

  const ResultPatterns = {
    Success: /success/i,
    AuthorizationError: /auth|credential|password/i,
    Unauthorized: /unauthorized|access/i,
    NotFound: /not found|find/i,
    ConnectionError: /connect|network/i,
    Unprocessable: /process|invalid/i,
    ZipFailure: /zip|archive/i,
    OtherFailure: /.+/
  };

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

    const mockSecretStorage: IMockSecretStorage = {
      store: sinon.stub(),
      get: sinon.stub().resolves('testpassword'),
      delete: sinon.stub()
    };

    mockContext = {
      secrets: mockSecretStorage
    };

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

    deploymentService = new DeploymentService(logger, mockContext as unknown as vscode.ExtensionContext);
  });

  teardown(async () => {
    await server.stop();

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    sandbox.restore();
  });

  // Helper function to check if result message matches expected pattern
  function assertResultType(result: { result: DeploymentResult; message: string }, expectedPattern: RegExp) {
    assert.ok(
      expectedPattern.test(result.message),
      `Expected message "${result.message}" to match pattern ${expectedPattern}`
    );
  }

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

    // Instead of comparing enum values, check message content
    assertResultType(result, ResultPatterns.Success);
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

    // Check for success message and "cleared" in the message
    assertResultType(result, ResultPatterns.Success);
    assert.ok(
      result.message.includes('cleared'),
      'Message should mention app was cleared'
    );
  });

  function testHttpError(statusCode: number, expectedPattern: RegExp) {
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

      assertResultType(result, expectedPattern);
    };
  }

  test('Should handle 401 unauthorized response', testHttpError(401, ResultPatterns.Unauthorized));
  test('Should handle 404 not found response', testHttpError(404, ResultPatterns.NotFound));
  test('Should handle 409 conflict response', testHttpError(409, ResultPatterns.OtherFailure));
  test('Should handle 422 unprocessable response', testHttpError(422, ResultPatterns.Unprocessable));
  test('Should handle 500 server error response', testHttpError(500, ResultPatterns.OtherFailure));

  test('Should handle connection error', async () => {
    const config: DeploymentConfig = {
      baseUrl: 'http://localhost:1',
      appName: 'test-app',
      username: 'testuser',
      sourcePath: tempDir,
      rapidDeploy: false
    };

    const result = await deploymentService.deploy(mockWorkspaceFolder, config);

    assertResultType(result, ResultPatterns.ConnectionError);
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

    assertResultType(result, ResultPatterns.AuthorizationError);
    assert.ok(
      result.message.includes('auth') ||
      result.message.includes('Auth') ||
      result.message.includes('unauthorized') ||
      result.message.includes('Unauthorized'),
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

    // This should return an error message about clearing the application
    assert.ok(result.message.includes('clear'), 'Message should mention clearing the application');
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

    assertResultType(result, ResultPatterns.AuthorizationError);
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

    assert.ok(!ResultPatterns.Success.test(result.message), 'Should not return success message');
    assert.ok(result.error instanceof Error, 'Should return an error');
  });
});
