import * as vscode from 'vscode';
import * as path from 'path';
import { ILogger } from '../utils/Logger';
import { DeployCommandHandler } from './DeployCommandHandler';
import { DeploymentTreeProvider, DeploymentItem } from './DeploymentTreeProvider';
import { DeploymentConfigManager } from './DeploymentConfig';
import { Application } from './DeploymentConfig';

/**
 * Manages the deployment view and registers all related commands
 */
export class DeploymentViewManager {
  private deploymentTreeProvider: DeploymentTreeProvider;
  private treeView: vscode.TreeView<DeploymentItem>;
  private logger: ILogger;
  private deployCommandHandler: DeployCommandHandler;
  private configManager: DeploymentConfigManager;
  private disposables: vscode.Disposable[] = [];

  constructor(
    context: vscode.ExtensionContext,
    logger: ILogger,
    deployCommandHandler: DeployCommandHandler
  ) {
    this.logger = logger;
    this.deployCommandHandler = deployCommandHandler;
    this.configManager = new DeploymentConfigManager(logger);

    // Create the tree provider
    this.deploymentTreeProvider = new DeploymentTreeProvider(
      logger,
      deployCommandHandler,
      this.configManager
    );

    // Register the tree view
    this.treeView = vscode.window.createTreeView('nplDeploymentView', {
      treeDataProvider: this.deploymentTreeProvider,
      showCollapseAll: true
    });

    // Register all commands
    this.registerCommands(context);

    // Add the tree view to subscriptions
    context.subscriptions.push(this.treeView);

    // Add the tree provider's dispose method to context subscriptions
    context.subscriptions.push({ dispose: () => this.deploymentTreeProvider.dispose() });

    // Store disposables for later cleanup
    this.disposables.push(this.treeView);
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.deploymentTreeProvider.dispose();
  }

  /**
   * Register all commands related to the deployment view
   */
  private registerCommands(context: vscode.ExtensionContext): void {
    // Register the refresh command
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.refreshDeploymentView', () => {
        this.deploymentTreeProvider.forceRefresh();
      })
    );

    // Register deploy command for application tree items
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.deploySelectedApplication', async (item: DeploymentItem) => {
        if (item.itemType === 'application' && item.app) {
          try {
            this.logger.log(`Deploying application ${item.app.name}...`);
            await this.deployCommandHandler.deployFromTreeView(item.app);
          } catch (error) {
            this.logger.logError('Error deploying application', error);
            vscode.window.showErrorMessage(`Failed to deploy application: ${error}`);
          }
        }
      })
    );

    // Register configure rapid deploy command
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.configureRapidDeploy', async (item: DeploymentItem) => {
        if (item.itemType === 'application' && item.app) {
          await this.configureRapidDeploy(item.app);
          this.deploymentTreeProvider.refresh();
        }
      })
    );

    // Register command to change source folder
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.changeSourceFolder', async (item: DeploymentItem) => {
        if (item.itemType === 'application' && item.app) {
          await this.changeSourceFolder(item.app);
          this.deploymentTreeProvider.refresh();
        }
      })
    );

    // Register command to open configuration
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.openDeploymentConfig', async () => {
        await this.deployCommandHandler.configureDeployment();
        this.deploymentTreeProvider.forceRefresh();
      })
    );

    // Register command to refresh applications list
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.refreshApplicationsList', async (item?: DeploymentItem) => {
        // If the item was clicked from tree view, provide feedback
        if (item && item.id === 'login-refresh-apps') {
          vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Refreshing applications...',
            cancellable: false
          }, async () => {
            await this.deployCommandHandler.refreshApplications();
            this.deploymentTreeProvider.forceRefresh();
          });
        } else {
          // Direct command invocation
          await this.deployCommandHandler.refreshApplications();
          this.deploymentTreeProvider.forceRefresh();
        }
      })
    );
  }

  /**
   * Configure rapid deploy for an application
   */
  private async configureRapidDeploy(app: Application): Promise<void> {
    const options = [
      { label: 'No - Normal deployment', value: false },
      { label: 'Yes - Clear application data before deployment', value: true }
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'Configure rapid deployment for ' + app.name,
      title: 'Rapid Deployment'
    });

    if (selected) {
      try {
        // Get the workspace folder
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
          return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        const config = await this.configManager.loadConfig(workspaceFolder);

        if (config) {
          // Find and update the application
          const appToUpdate = config.applications.find(a => a.id === app.id);
          if (appToUpdate) {
            appToUpdate.rapidDeploy = selected.value;
            await this.configManager.saveConfig(workspaceFolder, config);

            // Also update the app instance passed to this method
            app.rapidDeploy = selected.value;

            // Show confirmation message
            vscode.window.showInformationMessage(
              `Rapid deployment ${selected.value ? 'enabled' : 'disabled'} for ${app.name}`
            );
          }
        }
      } catch (error) {
        this.logger.logError('Error configuring rapid deploy', error);
        vscode.window.showErrorMessage(`Failed to configure rapid deploy: ${error}`);
      }
    }
  }

  /**
   * Change source folder for an application
   */
  private async changeSourceFolder(app: Application): Promise<void> {
    try {
      // Get the workspace folder
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder opened');
        return;
      }

      const workspaceFolder = vscode.workspace.workspaceFolders[0];
      const config = await this.configManager.loadConfig(workspaceFolder);

      if (!config) {
        vscode.window.showErrorMessage('No deployment configuration found');
        return;
      }

      // Default path to choose from
      const defaultPath = app.sourcePath || config.sourcePath || workspaceFolder.uri.fsPath;

      // Show open folder dialog
      const selectedPaths = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(defaultPath),
        openLabel: 'Select Source Folder',
        title: `Select source folder for ${app.name}`
      });

      if (selectedPaths && selectedPaths.length > 0) {
        const selectedPath = selectedPaths[0].fsPath;

        // Update the app's source path
        await this.configManager.updateApplicationSourcePath(
          workspaceFolder,
          app.id,
          selectedPath
        );

        // Also update the passed app instance
        app.sourcePath = selectedPath;

        // Show confirmation
        const relativePath = path.relative(workspaceFolder.uri.fsPath, selectedPath);
        const displayPath = relativePath === '' ? '.' : relativePath;

        vscode.window.showInformationMessage(
          `Source folder for ${app.name} set to: ${displayPath}`
        );

        // Force refresh to update the UI
        this.deploymentTreeProvider.forceRefresh();
      }
    } catch (error) {
      this.logger.logError('Error changing source folder', error);
      vscode.window.showErrorMessage(`Failed to change source folder: ${error}`);
    }
  }

  /**
   * Refresh the tree view
   */
  public refresh(): void {
    this.deploymentTreeProvider.refresh();
  }

  /**
   * Force a complete refresh including clearing the cache
   */
  public forceRefresh(): void {
    this.deploymentTreeProvider.forceRefresh();
  }
}
