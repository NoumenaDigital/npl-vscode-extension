import * as vscode from 'vscode';
import * as path from 'path';
import { DeploymentConfigManager, DeploymentConfig } from './DeploymentConfig';
import { DeploymentService } from './DeploymentService';
import { Logger } from '../utils/Logger';
import { CredentialManager } from './CredentialManager';

export class DeployCommandHandler {
  private logger: Logger;
  private configManager: DeploymentConfigManager;
  private deploymentService: DeploymentService;
  private credentialManager: CredentialManager;

  constructor(logger: Logger, context: vscode.ExtensionContext) {
    this.logger = logger;
    this.configManager = new DeploymentConfigManager(logger);
    this.deploymentService = new DeploymentService(logger, context);
    this.credentialManager = new CredentialManager(logger, context);
  }

  public async configureDeployment(): Promise<void> {
    try {
      const workspaceFolder = await this.getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      // Load existing config if available
      let config = await this.configManager.loadConfig(workspaceFolder);

      // Create default config if none exists
      if (!config) {
        config = {
          baseUrl: 'https://portal.noumena.cloud',
          appName: '',
          username: '',
          sourcePath: '',
          rapidDeploy: false
        };
      }

      // Get input from user
      const baseUrl = await vscode.window.showInputBox({
        prompt: 'Enter the Noumena Cloud base URL',
        value: config.baseUrl,
        placeHolder: 'https://portal.noumena.cloud'
      });

      if (!baseUrl) {
        return;
      }

      const appName = await vscode.window.showInputBox({
        prompt: 'Enter your application ID',
        value: config.appName,
        placeHolder: 'e.g. f6254844-7e45-4afe-83ee-458576215687'
      });

      if (!appName) {
        return;
      }

      const username = await vscode.window.showInputBox({
        prompt: 'Enter your username',
        value: config.username,
        placeHolder: 'Usually your email address'
      });

      if (!username) {
        return;
      }

      // Prompt for password right after username
      const password = await vscode.window.showInputBox({
        prompt: 'Enter your password (will be stored securely)',
        password: true
      });

      if (password) {
        await this.credentialManager.storePassword(baseUrl, username, password);
      }

      // Select source path with folder picker
      const defaultSourcePath = config.sourcePath || workspaceFolder.uri.fsPath;
      const sourcePath = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(defaultSourcePath),
        openLabel: 'Select source folder',
        title: 'Select the NPL source folder to deploy'
      });

      if (!sourcePath || !sourcePath[0]) {
        return;
      }

      const rapidDeployOptions = ['No', 'Yes - Clear application data before deployment'];
      const rapidDeploySelection = await vscode.window.showQuickPick(rapidDeployOptions, {
        placeHolder: 'Clear application data before deployment?',
        title: 'Deployment Options',
      });

      if (!rapidDeploySelection) {
        return;
      }

      const rapidDeploy = rapidDeploySelection.startsWith('Yes');

      // Save the configuration
      const newConfig: DeploymentConfig = {
        baseUrl,
        appName,
        username,
        sourcePath: sourcePath[0].fsPath,
        rapidDeploy
      };

      await this.configManager.saveConfig(workspaceFolder, newConfig);
      vscode.window.showInformationMessage('Deployment configuration saved');
    } catch (error) {
      this.logger.logError('Error configuring deployment', error);
      vscode.window.showErrorMessage('Failed to configure deployment');
    }
  }

  public async deployApplication(): Promise<void> {
    try {
      const workspaceFolder = await this.getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      // Load config
      const config = await this.configManager.loadConfig(workspaceFolder);
      if (!config) {
        const configOption = 'Configure Deployment';
        const selection = await vscode.window.showErrorMessage(
          'No deployment configuration found. Would you like to create one?',
          configOption
        );

        if (selection === configOption) {
          await this.configureDeployment();
        }
        return;
      }

      // Confirm before doing a rapid deployment
      if (config.rapidDeploy && !config.skipRapidDeployWarning) {
        const confirmOption = 'Yes, clear data and deploy';
        const dontWarnOption = 'Yes, and don\'t warn me again';

        const selection = await vscode.window.showWarningMessage(
          'This will DELETE ALL DATA in your application before deployment. Are you sure?',
          { modal: true },
          confirmOption,
          dontWarnOption
        );

        if (selection === dontWarnOption) {
          // Save preference to skip warning in the future
          config.skipRapidDeployWarning = true;
          await this.configManager.saveConfig(workspaceFolder, config);
        } else if (selection !== confirmOption) {
          return;
        }
      }

      // Deploy
      await this.deploymentService.deploy(workspaceFolder, config);
    } catch (error) {
      this.logger.logError('Error during deployment command', error);
      vscode.window.showErrorMessage('Failed to run deployment');
    }
  }

  public async cleanCredentials(): Promise<void> {
    try {
      const workspaceFolder = await this.getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      // Load config
      const config = await this.configManager.loadConfig(workspaceFolder);
      if (!config || !config.baseUrl || !config.username) {
        vscode.window.showInformationMessage('No credentials found to clean');
        return;
      }

      // Delete password
      await this.credentialManager.deletePassword(config.baseUrl, config.username);
      vscode.window.showInformationMessage('Credentials cleaned successfully');
    } catch (error) {
      this.logger.logError('Error cleaning credentials', error);
      vscode.window.showErrorMessage('Failed to clean credentials');
    }
  }

  private async getWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder opened');
      return undefined;
    }

    if (workspaceFolders.length === 1) {
      return workspaceFolders[0];
    }

    // If multiple workspace folders, let the user pick one
    const selected = await vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select workspace folder for deployment configuration'
    });

    return selected;
  }
}
