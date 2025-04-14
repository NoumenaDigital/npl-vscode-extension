import * as vscode from 'vscode';
import { Logger } from './utils/Logger';
import { ServerManager } from './server/ServerManager';
import { LanguageClientManager } from './client/LanguageClientManager';
import { BinaryManager } from './server/binary/BinaryManager';
import { VersionManager } from './server/binary/VersionManager';
import { HttpClientFactory } from './utils/HttpClient';
import { DeployCommandHandler } from './deployment/DeployCommandHandler';

let clientManager: LanguageClientManager;
let serverManager: ServerManager;
let deployCommandHandler: DeployCommandHandler;

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

  // Initialize managers with appropriate loggers
  BinaryManager.setLogger(languageServerLogger);
  VersionManager.setLogger(languageServerLogger);
  HttpClientFactory.setLogger(deploymentLogger);

  try {
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.selectServerVersion', () => {
        serverManager.showVersionPicker(context);
      }),
      vscode.commands.registerCommand('npl.cleanServerFiles', () => {
        serverManager.cleanServerFiles(context);
      }),
      // Register deployment commands
      vscode.commands.registerCommand('npl.configureDeployment', () => {
        deployCommandHandler.configureDeployment();
      }),
      vscode.commands.registerCommand('npl.deployApplication', () => {
        deployCommandHandler.deployApplication();
      }),
      vscode.commands.registerCommand('npl.cleanCredentials', () => {
        deployCommandHandler.cleanCredentials();
      })
    );

    await clientManager.start(context);
  } catch (err) {
    languageServerLogger.logError('Failed to start NPL Language Server', err);
    await clientManager.stop();
    throw err;
  }
}

export async function deactivate(): Promise<void> {
  if (clientManager) {
    await clientManager.stop();
  }
}
