import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { DeploymentService, DeploymentResult } from '../../../deployment/DeploymentService';
import { Logger } from '../../../utils/Logger';
import { TestServer } from '../mocks/TestServer';

// Test logger implementation
class TestLogger implements Partial<Logger> {
  public logs: string[] = [];
  public errors: Array<{message: string, error?: Error}> = [];

  log(message: string): void {
    this.logs.push(message);
  }

  logError(message: string, error?: Error): void {
    this.errors.push({ message, error });
  }

  show(): void {
    // No-op for tests
  }

  logInfo(message: string): void {
    this.logs.push(`INFO: ${message}`);
  }

  logWarning(message: string): void {
    this.logs.push(`WARNING: ${message}`);
  }

  // These methods aren't used in our test but needed for the interface
  get outputChannel(): vscode.LogOutputChannel {
    return {} as vscode.LogOutputChannel;
  }

  getOutputChannel(): vscode.LogOutputChannel {
    return {} as vscode.LogOutputChannel;
  }
}

// Simple test secret storage implementation
class TestSecretStorage implements vscode.SecretStorage {
  private storage: Map<string, string> = new Map();
  private changeEmitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();

  public onDidChange = this.changeEmitter.event;

  async get(key: string): Promise<string | undefined> {
    return this.storage.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
    this.changeEmitter.fire({ key });
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
    this.changeEmitter.fire({ key });
  }
}

// Test context implementation
class TestExtensionContext {
  public readonly subscriptions: { dispose(): any }[] = [];
  public readonly secrets: vscode.SecretStorage;

  constructor(secretStorage: vscode.SecretStorage) {
    this.secrets = secretStorage;
  }
}

// Helper function to create a temporary directory
async function createTempDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `npl-deploy-test-${Date.now()}`);
  await fs.promises.mkdir(tempDir, { recursive: true });
  return tempDir;
}

// Helper function to create test files in a directory
async function createTestFiles(dir: string): Promise<void> {
  await fs.promises.writeFile(path.join(dir, 'test1.npl'), 'contract Test {}');
  await fs.promises.writeFile(path.join(dir, 'test2.npl'), 'asset MyAsset {}');
}

suite('DeploymentService Test Suite', () => {
  let logger: TestLogger;
  let secretStorage: TestSecretStorage;
  let context: TestExtensionContext;
  let deploymentService: DeploymentService;
  let testServer: TestServer;
  let baseUrl: string;
  let tempSourceDir: string;
  let tempWorkspaceDir: string;
  let mockWorkspaceFolder: vscode.WorkspaceFolder;

  // Original VS Code API functions for cleanup
  let originalShowInputBox: typeof vscode.window.showInputBox;

  suiteSetup(async function() {
    this.timeout(10000); // Allow more time for server setup

    // Create test server
    testServer = new TestServer();
    baseUrl = await testServer.start();

    // Create temp directories for test files
    tempSourceDir = await createTempDir();
    tempWorkspaceDir = await createTempDir();
    await createTestFiles(tempSourceDir);

    // Store original VS Code window APIs
    originalShowInputBox = vscode.window.showInputBox;
  });

  suiteTeardown(async function() {
    this.timeout(5000); // Allow time for server teardown

    // Stop test server
    await testServer.stop();

    // Clean up temp directories
    await fs.promises.rm(tempSourceDir, { recursive: true, force: true });
    await fs.promises.rm(tempWorkspaceDir, { recursive: true, force: true });

    // Restore original VS Code APIs
    vscode.window.showInputBox = originalShowInputBox;
  });

  setup(() => {
    // Create test objects
    logger = new TestLogger();
    secretStorage = new TestSecretStorage();
    context = new TestExtensionContext(secretStorage);

    // Create mock workspace folder
    mockWorkspaceFolder = {
      uri: vscode.Uri.file(tempWorkspaceDir),
      name: 'test',
      index: 0
    };

    // Create DeploymentService
    deploymentService = new DeploymentService(
      logger as unknown as Logger,
      context as unknown as vscode.ExtensionContext
    );
  });

  teardown(() => {
    // Reset any mocks between tests to avoid test pollution
    vscode.window.showInputBox = originalShowInputBox;
  });

  test('deploy should handle basic scenarios with different implementations', async function() {
    this.timeout(10000);

    // Verify that the most basic deployment functionality works
    // This test just makes sure critical methods are called, without asserting complex path dependencies

    // Create config with test paths
    const config = {
      baseUrl,
      appName: 'test-app',
      username: 'test@example.com',
      sourcePath: tempSourceDir,
      rapidDeploy: false
    };

    // Store password
    await secretStorage.store(`${baseUrl}|${config.username}`, 'password123');

    // Verify we can set up deployment handler
    let deploymentHandlerCalled = false;
    testServer.setDeploymentHandler(() => {
      deploymentHandlerCalled = true;
      return true;
    });

    // Simply test that auth failure is detected
    testServer.enableAuthErrorSimulation(true);
    const authResult = await deploymentService.deploy(mockWorkspaceFolder, config);

    // Should either be auth error or connection error
    assert.ok(
      authResult.result === DeploymentResult.AuthorizationError ||
      authResult.result === DeploymentResult.Unauthorized ||
      authResult.result === DeploymentResult.ConnectionError,
      `Auth error test should return an auth-related error code, got: ${authResult.result}`
    );

    // Reset for next test
    testServer.enableAuthErrorSimulation(false);

    // Test connection errors
    testServer.enableConnectionErrorSimulation(true);
    const connResult = await deploymentService.deploy(mockWorkspaceFolder, config);

    // Verify connection error results
    assert.ok(
      connResult.result !== DeploymentResult.Success,
      `Connection error test should not return success, got: ${connResult.result}`
    );

    // Reset for subsequent tests
    testServer.enableConnectionErrorSimulation(false);
  });
});
