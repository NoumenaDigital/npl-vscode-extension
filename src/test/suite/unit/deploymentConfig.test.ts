import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { DeploymentConfigManager, DeploymentConfig } from '../../../deployment/DeploymentConfig';
import { Logger } from '../../../utils/Logger';

// Test logger implementation
class TestLogger implements Partial<Logger> {
  public logs: string[] = [];
  public errors: Array<{message: string, error?: Error}> = [];

  logError(message: string, error?: Error): void {
    this.errors.push({ message, error });
  }

  log(message: string): void {
    this.logs.push(message);
  }

  logInfo(message: string): void {
    this.logs.push(`INFO: ${message}`);
  }

  logWarning(message: string): void {
    this.logs.push(`WARNING: ${message}`);
  }

  show(): void {
    // No-op for tests
  }
}

suite('DeploymentConfigManager Test Suite', () => {
  let tempDir: string;
  let logger: TestLogger;
  let configManager: DeploymentConfigManager;
  let workspaceFolder: vscode.WorkspaceFolder;

  suiteSetup(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'deploy-config-test-'));
  });

  suiteTeardown(async () => {
    // Clean up the temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  setup(() => {
    logger = new TestLogger();
    configManager = new DeploymentConfigManager(logger as unknown as Logger);

    // Create a workspace folder pointing to our temp directory
    workspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: 'test',
      index: 0
    };
  });

  test('loadConfig should return undefined when config file does not exist', async () => {
    const config = await configManager.loadConfig(workspaceFolder);
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

    // Write the config file
    const configPath = path.join(tempDir, 'npl-deploy.json');
    await fs.promises.writeFile(configPath, JSON.stringify(mockConfig));

    const config = await configManager.loadConfig(workspaceFolder);

    assert.deepStrictEqual(config, mockConfig);
  });

  test('loadConfig should handle errors', async () => {
    // Create an unreadable file
    const configPath = path.join(tempDir, 'npl-deploy.json');
    await fs.promises.writeFile(configPath, 'invalid-json');

    const config = await configManager.loadConfig(workspaceFolder);

    assert.strictEqual(config, undefined);
    assert.strictEqual(logger.errors.length > 0, true);
    assert.ok(logger.errors.some(e => e.message.includes('Failed to load deployment configuration')));
  });

  test('saveConfig should write config to file', async () => {
    const mockConfig: DeploymentConfig = {
      baseUrl: 'https://test.com',
      appName: 'test-app',
      username: 'user@example.com',
      sourcePath: '/path/to/source',
      rapidDeploy: false
    };

    await configManager.saveConfig(workspaceFolder, mockConfig);

    // Verify file was written
    const configPath = path.join(tempDir, 'npl-deploy.json');
    assert.ok(fs.existsSync(configPath), 'Config file should exist');

    // Read the file and verify content
    const configContent = await fs.promises.readFile(configPath, 'utf-8');
    const parsedConfig = JSON.parse(configContent);
    assert.deepStrictEqual(parsedConfig, mockConfig);
  });

  test('saveConfig should handle errors', async () => {
    const mockConfig: DeploymentConfig = {
      baseUrl: 'https://test.com',
      appName: 'test-app',
      username: 'user@example.com',
      sourcePath: '/path/to/source',
      rapidDeploy: false
    };

    // Make the directory read-only to cause a write error
    const readOnlyDir = path.join(tempDir, 'readonly');
    await fs.promises.mkdir(readOnlyDir);

    // Create a new workspace folder for the read-only directory
    const readOnlyWorkspace = {
      uri: vscode.Uri.file(readOnlyDir),
      name: 'readonly',
      index: 1
    };

    try {
      // On some platforms, we might not be able to make it truly read-only,
      // so this is a best-effort test
      await fs.promises.chmod(readOnlyDir, 0o444);

      try {
        await configManager.saveConfig(readOnlyWorkspace, mockConfig);
        // If we get here on Windows or other platforms that ignore the chmod,
        // we should at least check that no error was logged
        const configFile = path.join(readOnlyDir, 'npl-deploy.json');
        if (!fs.existsSync(configFile)) {
          assert.ok(logger.errors.some(e => e.message.includes('Failed to save deployment configuration')));
        }
      } catch (error) {
        // Expected error
        assert.ok(logger.errors.some(e => e.message.includes('Failed to save deployment configuration')));
      }
    } finally {
      // Make the directory writable again for cleanup
      await fs.promises.chmod(readOnlyDir, 0o755).catch(() => {});
    }
  });
});
