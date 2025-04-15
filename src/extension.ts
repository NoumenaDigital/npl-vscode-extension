import * as vscode from 'vscode';
import { Logger } from './utils/Logger';
import { ServerManager } from './server/ServerManager';
import { LanguageClientManager } from './client/LanguageClientManager';
import { BinaryManager } from './server/binary/BinaryManager';
import { VersionManager } from './server/binary/VersionManager';
import { HttpClientFactory } from './utils/HttpClient';
import { DeployCommandHandler } from './deployment/DeployCommandHandler';
import { DeploymentViewManager } from './deployment/DeploymentViewManager';
import { DeploymentConfigManager } from './deployment/DeploymentConfig';

let clientManager: LanguageClientManager;
let serverManager: ServerManager;
let deployCommandHandler: DeployCommandHandler;
let deploymentViewManager: DeploymentViewManager;

export async function activate(context: vscode.ExtensionContext) {
  // Create separate loggers for different components
  const deploymentLogger = new Logger('Noumena Cloud Deployment');
  const languageServerLogger = new Logger('NPL Language Server');

  // Use the language server logger for server and client components
  serverManager = new ServerManager(languageServerLogger);
  clientManager = new LanguageClientManager(languageServerLogger, serverManager);

  // Use the deployment logger for deployment components
  // Pass the extension context to use for secrets storage
  deployCommandHandler = new DeployCommandHandler(deploymentLogger, context);

  // Initialize the deployment view
  deploymentViewManager = new DeploymentViewManager(context, deploymentLogger, deployCommandHandler);

  // Initialize managers with appropriate loggers
  BinaryManager.setLogger(languageServerLogger);
  VersionManager.setLogger(languageServerLogger);
  HttpClientFactory.setLogger(deploymentLogger);

  // Check if the user is already authenticated
  await checkAuthenticationState(context, deploymentViewManager);

  try {
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.selectServerVersion', () => {
        serverManager.showVersionPicker(context);
      }),
      vscode.commands.registerCommand('npl.cleanServerFiles', () => {
        serverManager.cleanServerFiles(context);
      }),
      // Register deployment commands
      vscode.commands.registerCommand('npl.loginToNoumenaCloud', async () => {
        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Signing in to Noumena Cloud...',
          cancellable: false
        }, async () => {
          const success = await deployCommandHandler.configureDeployment();
          if (success) {
            // If login succeeded, refresh the view
            deploymentViewManager.refresh();
          }
        });
      }),
      vscode.commands.registerCommand('npl.configureDeployment', () => {
        deployCommandHandler.configureDeployment();
        // Refresh the deployment view after configuration
        deploymentViewManager.refresh();
      }),
      vscode.commands.registerCommand('npl.deployApplication', () => {
        deployCommandHandler.deployApplication();
      }),
      vscode.commands.registerCommand('npl.cleanCredentials', () => {
        deployCommandHandler.cleanCredentials();
        // Refresh the view after signing out
        deploymentViewManager.refresh();
      })
    );

    await clientManager.start(context);
  } catch (err) {
    languageServerLogger.logError('Failed to start NPL Language Server', err);
    await clientManager.stop();
    throw err;
  }

  // Register listener for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      // If deployment-related settings changed, refresh the view
      if (event.affectsConfiguration('npl.deployment')) {
        deploymentViewManager.forceRefresh();
      }
    })
  );
}

/**
 * Check if the user is already authenticated and set the authentication state accordingly
 */
async function checkAuthenticationState(
  context: vscode.ExtensionContext,
  deploymentViewManager: DeploymentViewManager
): Promise<void> {
  const config = vscode.workspace.getConfiguration('npl.deployment');
  const isAuthenticated = config.get<boolean>('authenticated') || false;

  // Validate token if authenticated
  if (isAuthenticated) {
    const token = config.get<string>('token');
    if (!token) {
      // Token missing but marked as authenticated - fix the state
      await config.update('authenticated', false, true);
      deploymentViewManager.forceRefresh();
    }
  }
}

export async function deactivate(): Promise<void> {
  if (clientManager) {
    await clientManager.stop();
  }
}
