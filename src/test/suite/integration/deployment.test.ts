import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { DeployCommandHandler } from '../../../deployment/DeployCommandHandler';
import { DeploymentConfig } from '../../../deployment/DeploymentConfig';
import { Logger } from '../../../utils/Logger';
import { TestServer } from '../mocks/TestServer';

suite('Deployment Integration Tests', () => {
  // Test directories and files
  let workspaceDir: string;
  let sourceDir: string;

  // Test server
  let testServer: TestServer;
  let serverUrl: string;

  // VS Code components
  let context: vscode.ExtensionContext;
  let logger: Logger;
  let deployHandler: DeployCommandHandler;

  // UI responses for testing
  let inputResponses: Map<string, string | undefined> = new Map();
  let dialogResponses: Map<string, any> = new Map();

  // Original VS Code API functions for cleanup
  let originalShowInputBox: typeof vscode.window.showInputBox;
  let originalShowOpenDialog: typeof vscode.window.showOpenDialog;
  let originalShowQuickPick: typeof vscode.window.showQuickPick;
  let originalShowErrorMessage: typeof vscode.window.showErrorMessage;
  let originalShowInformationMessage: typeof vscode.window.showInformationMessage;
  let originalShowWarningMessage: typeof vscode.window.showWarningMessage;
  let originalWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
  let originalWorkspaceFolderPick: typeof vscode.window.showWorkspaceFolderPick;
  let originalGetWorkspaceFolder: typeof vscode.workspace.getWorkspaceFolder;

  suiteSetup(async function() {
    this.timeout(15000); // Allow more time for setup

    // Create temp workspace and source directories
    workspaceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'npl-deploy-test-workspace-'));
    sourceDir = path.join(workspaceDir, 'src');

    // Create some NPL source files
    await fs.promises.mkdir(sourceDir, { recursive: true });
    await fs.promises.writeFile(path.join(sourceDir, 'contract.npl'), 'contract Test { }');
    await fs.promises.writeFile(path.join(sourceDir, 'asset.npl'), 'asset TestAsset { }');

    // Start the test server
    testServer = new TestServer();
    serverUrl = await testServer.start();

    // Setup VS Code components
    logger = new Logger('NPL Deploy Test');

    // Create real secret storage for testing
    const secretStorage = await createInMemorySecretStorage();

    // Create minimal test context
    const testContext = {
      subscriptions: [],
      secrets: secretStorage
    };

    // Cast to Extension context - we only need the subset of properties we're using
    context = testContext as unknown as vscode.ExtensionContext;

    // Create deployment handler
    deployHandler = new DeployCommandHandler(logger, context);

    // Store original VS Code window APIs
    originalShowInputBox = vscode.window.showInputBox;
    originalShowOpenDialog = vscode.window.showOpenDialog;
    originalShowQuickPick = vscode.window.showQuickPick;
    originalShowErrorMessage = vscode.window.showErrorMessage;
    originalShowInformationMessage = vscode.window.showInformationMessage;
    originalShowWarningMessage = vscode.window.showWarningMessage;
    originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    originalWorkspaceFolderPick = vscode.window.showWorkspaceFolderPick;
    originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder;
  });

  suiteTeardown(async function() {
    this.timeout(10000); // Allow more time for teardown

    // Tear down UI mocks
    restoreUIStubs();

    // Stop the test server
    await testServer.stop();

    // Clean up the temporary directories
    await fs.promises.rm(workspaceDir, { recursive: true, force: true });
  });

  setup(() => {
    // Reset UI responses for each test
    inputResponses.clear();
    dialogResponses.clear();

    // Setup UI interaction stubs
    setupUIStubs();
  });

  teardown(() => {
    // Restore original VS Code APIs
    restoreUIStubs();
  });

  test('Configure and deploy NPL application', async function() {
    this.timeout(15000);

    // 1. Setup a workspace folder
    const workspaceFolder: vscode.WorkspaceFolder = {
      uri: vscode.Uri.file(workspaceDir),
      name: 'test-workspace',
      index: 0
    };

    // Override the workspace folder handling
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      get: () => [workspaceFolder],
      configurable: true
    });

    // Mock workspace folder picker and getWorkspaceFolder
    vscode.window.showWorkspaceFolderPick = async () => workspaceFolder;
    vscode.workspace.getWorkspaceFolder = () => workspaceFolder;

    try {
      // 2. Set up UI responses for configuration
      const appName = 'test-app';
      const username = 'test@example.com';
      const password = 'password123';

      // Responses for input box prompts
      inputResponses.set('Enter the Noumena Cloud base URL', serverUrl);
      inputResponses.set('Enter your application ID', appName);
      inputResponses.set('Enter your username', username);
      inputResponses.set('Enter your password (will be stored securely)', password);

      // Response for folder picker
      dialogResponses.set('openDialog', [vscode.Uri.file(sourceDir)]);

      // Response for quick pick (rapid deploy)
      dialogResponses.set('quickPick', 'No');

      // 3. Setup deployment handler in test server
      let deploymentReceived = false;
      testServer.setDeploymentHandler((appId, fileBuffer) => {
        deploymentReceived = true;
        assert.strictEqual(appId, appName);
        assert.ok(fileBuffer.length > 0, 'Deployment package should not be empty');
        return true;
      });

      // 4. Configure the deployment
      await deployHandler.configureDeployment();

      // Add a timeout to allow file system operations to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // 5. Verify configuration was saved
      const configPath = path.join(workspaceDir, 'npl-deploy.json');

      // Debug information if the file doesn't exist
      if (!fs.existsSync(configPath)) {
        console.error(`Config file not found at: ${configPath}`);
        console.error('Workspace dir:', workspaceDir);
        console.error('Current directory:', process.cwd());
      }

      assert.strictEqual(fs.existsSync(configPath), true, 'Configuration file should be created');

      const configJson = await fs.promises.readFile(configPath, 'utf8');
      const config = JSON.parse(configJson) as DeploymentConfig;

      assert.strictEqual(config.baseUrl, serverUrl);
      assert.strictEqual(config.appName, appName);
      assert.strictEqual(config.username, username);
      assert.strictEqual(config.sourcePath, sourceDir);
      assert.strictEqual(config.rapidDeploy, false);

      // 6. Deploy the application
      await deployHandler.deployApplication();

      // Add a timeout to allow deployment to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // 7. Verify the deployment was received
      assert.strictEqual(deploymentReceived, true, 'Deployment should be received by the server');

      // 8. Clean up credentials
      await deployHandler.cleanCredentials();

    } finally {
      // Restore original functions
      restoreUIStubs();
    }
  });

  test('Deploy with rapid deploy option', async function() {
    this.timeout(15000);

    // 1. Setup a workspace folder
    const workspaceFolder: vscode.WorkspaceFolder = {
      uri: vscode.Uri.file(workspaceDir),
      name: 'test-workspace',
      index: 0
    };

    // Override the workspace folder handling
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      get: () => [workspaceFolder],
      configurable: true
    });

    // Mock workspace folder picker and getWorkspaceFolder
    vscode.window.showWorkspaceFolderPick = async () => workspaceFolder;
    vscode.workspace.getWorkspaceFolder = () => workspaceFolder;

    try {
      // 2. Set up UI responses for configuration
      const appName = 'test-app-rapid';
      const username = 'test@example.com';
      const password = 'password123';

      // Responses for input box prompts
      inputResponses.set('Enter the Noumena Cloud base URL', serverUrl);
      inputResponses.set('Enter your application ID', appName);
      inputResponses.set('Enter your username', username);
      inputResponses.set('Enter your password (will be stored securely)', password);

      // Response for folder picker
      dialogResponses.set('openDialog', [vscode.Uri.file(sourceDir)]);

      // Response for quick pick (rapid deploy) - Yes this time
      dialogResponses.set('quickPick', 'Yes - Clear application data before deployment');

      // 3. Setup handlers in test server
      let clearReceived = false;
      let deploymentReceived = false;

      testServer.setClearHandler((appId) => {
        clearReceived = true;
        assert.strictEqual(appId, appName);
        return true;
      });

      testServer.setDeploymentHandler((appId, fileBuffer) => {
        deploymentReceived = true;
        assert.strictEqual(appId, appName);
        assert.ok(fileBuffer.length > 0, 'Deployment package should not be empty');
        return true;
      });

      // 4. Configure the deployment
      await deployHandler.configureDeployment();

      // Wait for file operations to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // 5. Response for rapid deploy warning confirmation
      dialogResponses.set('warningMessage', 'Yes, clear data and deploy');

      // 6. Deploy the application
      await deployHandler.deployApplication();

      // Wait for deployment to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // 7. Verify the deployment workflow
      assert.strictEqual(clearReceived, true, 'Application clear should be requested');
      assert.strictEqual(deploymentReceived, true, 'Deployment should be received by the server');

    } finally {
      // Restore original function
      restoreUIStubs();
    }
  });

  // Helper functions

  // Create an in-memory secret storage for testing
  async function createInMemorySecretStorage(): Promise<vscode.SecretStorage> {
    const storage = new Map<string, string>();
    const eventEmitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();

    return {
      get: async (key: string) => storage.get(key),
      store: async (key: string, value: string) => {
        storage.set(key, value);
        eventEmitter.fire({ key });
      },
      delete: async (key: string) => {
        storage.delete(key);
        eventEmitter.fire({ key });
      },
      onDidChange: eventEmitter.event
    };
  }

  // Setup stubs for VS Code UI interactions
  function setupUIStubs() {
    // Replace with test implementations
    vscode.window.showInputBox = async (options?: vscode.InputBoxOptions) => {
      const prompt = options?.prompt || '';
      return inputResponses.get(prompt) || '';
    };

    vscode.window.showOpenDialog = async () => {
      return dialogResponses.get('openDialog');
    };

    vscode.window.showQuickPick = async (items: any, options?: any) => {
      return dialogResponses.get('quickPick');
    };

    vscode.window.showErrorMessage = async (message: string, ...items: any[]) => {
      return dialogResponses.get('errorMessage');
    };

    vscode.window.showInformationMessage = async (message: string, ...items: any[]) => {
      return dialogResponses.get('infoMessage');
    };

    vscode.window.showWarningMessage = async (message: string, options?: any, ...items: any[]) => {
      return dialogResponses.get('warningMessage');
    };
  }

  // Restore original VS Code UI functions
  function restoreUIStubs() {
    vscode.window.showInputBox = originalShowInputBox;
    vscode.window.showOpenDialog = originalShowOpenDialog;
    vscode.window.showQuickPick = originalShowQuickPick;
    vscode.window.showErrorMessage = originalShowErrorMessage;
    vscode.window.showInformationMessage = originalShowInformationMessage;
    vscode.window.showWarningMessage = originalShowWarningMessage;

    // Restore original workspace folders if needed
    if (originalWorkspaceFolders !== undefined) {
      Object.defineProperty(vscode.workspace, 'workspaceFolders', {
        value: originalWorkspaceFolders,
        configurable: true
      });
    }

    if (originalWorkspaceFolderPick) {
      vscode.window.showWorkspaceFolderPick = originalWorkspaceFolderPick;
    }

    if (originalGetWorkspaceFolder) {
      vscode.workspace.getWorkspaceFolder = originalGetWorkspaceFolder;
    }
  }
});
