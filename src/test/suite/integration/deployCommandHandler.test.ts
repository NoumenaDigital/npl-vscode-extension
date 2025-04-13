import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { DeployCommandHandler } from '../../../deployment/DeployCommandHandler';
import { DeploymentConfig } from '../../../deployment/DeploymentConfig';
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

// Simple test context implementation
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

// Test context with real-like behavior
class TestExtensionContext {
  public readonly subscriptions: { dispose(): any }[] = [];
  public readonly secrets: vscode.SecretStorage;

  constructor(secretStorage: vscode.SecretStorage) {
    this.secrets = secretStorage;
  }
}

suite('DeployCommandHandler Test Suite', () => {
  let tempDir: string;
  let tempSourceDir: string;
  let logger: TestLogger;
  let secretStorage: TestSecretStorage;
  let context: TestExtensionContext;
  let deployCommandHandler: DeployCommandHandler;
  let testServer: TestServer;
  let baseUrl: string;
  let inputBoxValues: string[] = [];
  let showOpenDialogValue: vscode.Uri[] | undefined;
  let showQuickPickValue: string | undefined;
  let showErrorMessageValue: string | undefined;
  let showInformationMessageValue: string | undefined;

  // Create a workspace folder instance for tests
  function createWorkspaceFolder(): vscode.WorkspaceFolder {
    return {
      uri: vscode.Uri.file(tempDir),
      name: 'test-workspace',
      index: 0
    };
  }

  suiteSetup(async function() {
    this.timeout(10000); // Allow more time for setup

    // Create temp directories for test files
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'deploy-handler-test-'));
    tempSourceDir = path.join(tempDir, 'src');
    await fs.promises.mkdir(tempSourceDir, { recursive: true });

    // Create some test source files
    await fs.promises.writeFile(path.join(tempSourceDir, 'test1.npl'), 'contract Test {}');

    // Create and start test server
    testServer = new TestServer();
    baseUrl = await testServer.start();
  });

  suiteTeardown(async function() {
    this.timeout(5000); // Allow time for teardown

    // Stop test server
    await testServer.stop();

    // Clean up temp directories
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  // Original VS Code API functions for cleanup
  let originalShowInputBox: typeof vscode.window.showInputBox;
  let originalShowOpenDialog: typeof vscode.window.showOpenDialog;
  let originalShowQuickPick: typeof vscode.window.showQuickPick;
  let originalShowErrorMessage: typeof vscode.window.showErrorMessage;
  let originalShowInformationMessage: typeof vscode.window.showInformationMessage;
  let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
  let originalWorkspaceFolderPick: typeof vscode.window.showWorkspaceFolderPick;
  let originalGetWorkspaceFolder: typeof vscode.workspace.getWorkspaceFolder;

  setup(function() {
    logger = new TestLogger();
    secretStorage = new TestSecretStorage();
    context = new TestExtensionContext(secretStorage);

    // Create the handler
    deployCommandHandler = new DeployCommandHandler(
      logger as unknown as Logger,
      context as unknown as vscode.ExtensionContext
    );

    // Setup values for VS Code API calls
    inputBoxValues = [];
    showOpenDialogValue = undefined;
    showQuickPickValue = undefined;
    showErrorMessageValue = undefined;
    showInformationMessageValue = undefined;

    // Create a workspace folder
    const workspaceFolder = createWorkspaceFolder();

    // Store original VS Code window APIs
    originalShowInputBox = vscode.window.showInputBox;
    originalShowOpenDialog = vscode.window.showOpenDialog;
    originalShowQuickPick = vscode.window.showQuickPick;
    originalShowErrorMessage = vscode.window.showErrorMessage;
    originalShowInformationMessage = vscode.window.showInformationMessage;
    originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    originalWorkspaceFolderPick = vscode.window.showWorkspaceFolderPick;
    originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder;

    // Mock workspace folder
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      get: () => [workspaceFolder],
      configurable: true
    });

    // Mock workspace folder picker
    vscode.window.showWorkspaceFolderPick = async () => workspaceFolder;

    // Mock getWorkspaceFolder
    vscode.workspace.getWorkspaceFolder = () => workspaceFolder;

    // Replace APIs with test doubles
    vscode.window.showInputBox = async (_options?: vscode.InputBoxOptions) => {
      return inputBoxValues.shift() || '';
    };
    vscode.window.showOpenDialog = async () => showOpenDialogValue;
    (vscode.window.showQuickPick as any) = async (_items: any, _options?: any) => {
      return showQuickPickValue;
    };
    vscode.window.showErrorMessage = async (message: string, ..._items: any[]) => {
      showErrorMessageValue = message;
      return undefined;
    };
    vscode.window.showInformationMessage = async (message: string, ..._items: any[]) => {
      showInformationMessageValue = message;
      return undefined;
    };
  });

  // Add separate teardown hook to restore API functions
  teardown(function() {
    // Restore original VS Code APIs
    vscode.window.showInputBox = originalShowInputBox;
    vscode.window.showOpenDialog = originalShowOpenDialog;
    vscode.window.showQuickPick = originalShowQuickPick;
    vscode.window.showErrorMessage = originalShowErrorMessage;
    vscode.window.showInformationMessage = originalShowInformationMessage;
    vscode.window.showWorkspaceFolderPick = originalWorkspaceFolderPick;
    vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder;

    // Restore original workspace folders
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: originalWorkspaceFolders,
      configurable: true
    });
  });

  test('configureDeployment should save configuration', async function() {
    // Set up inputs for the configuration
    inputBoxValues = [
      baseUrl,                         // baseUrl
      'test-app-id',                   // appName
      'test@example.com',              // username
      'password123'                    // password
    ];
    showOpenDialogValue = [vscode.Uri.file(tempSourceDir)];
    showQuickPickValue = 'No';         // rapidDeploy: No

    // Call the method to test
    await deployCommandHandler.configureDeployment();

    // Check that the config file was created
    const configPath = path.join(tempDir, 'npl-deploy.json');
    // Add a timeout to allow file system operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check if the file exists, otherwise show the errors for debugging
    if (!fs.existsSync(configPath)) {
      console.error(`Config file not found: ${configPath}`);
      console.error('Logger errors:', logger.errors);
      console.error('Logger logs:', logger.logs);
    }

    assert.strictEqual(fs.existsSync(configPath), true, 'Config file should be created');

    // Read the config and verify its contents
    const configJson = await fs.promises.readFile(configPath, 'utf8');
    const config = JSON.parse(configJson) as DeploymentConfig;

    assert.strictEqual(config.baseUrl, baseUrl);
    assert.strictEqual(config.appName, 'test-app-id');
    assert.strictEqual(config.username, 'test@example.com');
    assert.strictEqual(config.sourcePath, tempSourceDir);
    assert.strictEqual(config.rapidDeploy, false);

    // Check that password was stored in secret storage
    const key = `${baseUrl}|test@example.com`;
    const storedPassword = await secretStorage.get(key);
    assert.strictEqual(storedPassword, 'password123');

    // Check that success message was shown
    assert.strictEqual(showInformationMessageValue, 'Deployment configuration saved');
  });

  test('deployApplication should check for config', async function() {
    // Setup - make sure no config file exists
    const configPath = path.join(tempDir, 'npl-deploy.json');
    if (fs.existsSync(configPath)) {
      await fs.promises.unlink(configPath);
    }

    // Call deploy without a config file
    await deployCommandHandler.deployApplication();

    // Should show error about missing config
    assert.ok(
      showErrorMessageValue && showErrorMessageValue.includes('No deployment configuration found'),
      `Expected error message about missing config, got: ${showErrorMessageValue}`
    );
  });

  test('deployApplication should deploy with valid config', async function() {
    // Create a valid config file
    const configPath = path.join(tempDir, 'npl-deploy.json');
    const config: DeploymentConfig = {
      baseUrl,
      appName: 'test-app',
      username: 'test@example.com',
      sourcePath: tempSourceDir,
      rapidDeploy: false
    };

    await fs.promises.writeFile(configPath, JSON.stringify(config));

    // Store password in secret storage
    await secretStorage.store(`${baseUrl}|test@example.com`, 'password123');

    // Setup deployment handler in test server
    let deploymentReceived = false;
    testServer.setDeploymentHandler((appId: string, fileBuffer: Buffer) => {
      deploymentReceived = true;
      assert.strictEqual(appId, 'test-app');
      assert.ok(fileBuffer.length > 0);
      return true;
    });

    // Call deploy
    await deployCommandHandler.deployApplication();

    // Wait a bit for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify deployment happened
    assert.strictEqual(deploymentReceived, true, 'Deployment handler should have been called');

    // Check for success message
    assert.ok(
      showInformationMessageValue && showInformationMessageValue.includes('successfully'),
      `Expected success message, got: ${showInformationMessageValue}`
    );
  });

  test('cleanCredentials should delete stored password', async function() {
    // Create a valid config file
    const configPath = path.join(tempDir, 'npl-deploy.json');
    const config: DeploymentConfig = {
      baseUrl,
      appName: 'test-app',
      username: 'test@example.com',
      sourcePath: tempSourceDir,
      rapidDeploy: false
    };

    await fs.promises.writeFile(configPath, JSON.stringify(config));

    // Store password in secret storage
    await secretStorage.store(`${baseUrl}|test@example.com`, 'password123');

    // Verify password exists
    let storedPassword = await secretStorage.get(`${baseUrl}|test@example.com`);
    assert.strictEqual(storedPassword, 'password123');

    // Call clean credentials
    await deployCommandHandler.cleanCredentials();

    // Check password was deleted - may need time for async operations
    await new Promise(resolve => setTimeout(resolve, 100));
    storedPassword = await secretStorage.get(`${baseUrl}|test@example.com`);

    assert.strictEqual(storedPassword, undefined);

    // Check for success message
    assert.strictEqual(showInformationMessageValue, 'Credentials cleaned successfully');
  });
});
