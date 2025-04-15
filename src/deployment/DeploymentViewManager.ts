import * as vscode from 'vscode';
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
  }

  /**
   * Register all commands related to the deployment view
   */
  private registerCommands(context: vscode.ExtensionContext): void {
    // Register the refresh command
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.refreshDeploymentView', () => {
        this.deploymentTreeProvider.clearCache();
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

    // Register command to open configuration
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.openDeploymentConfig', async () => {
        await this.deployCommandHandler.configureDeployment();
        this.deploymentTreeProvider.reloadConfig();
      })
    );

    // Register command to refresh applications list
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.refreshApplicationsList', async () => {
        await this.deployCommandHandler.refreshApplications();
        this.deploymentTreeProvider.reloadConfig();
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
   * Refresh the tree view
   */
  public refresh(): void {
    this.deploymentTreeProvider.refresh();
  }
}
