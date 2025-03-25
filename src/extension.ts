import * as vscode from 'vscode';
import { Logger } from './utils/Logger';
import { ServerManager } from './server/ServerManager';
import { LanguageClientManager } from './client/LanguageClientManager';
import { BinaryManager } from './server/binary/BinaryManager';
import { VersionManager } from './server/binary/VersionManager';
import { HttpClientFactory } from './utils/HttpClient';

let clientManager: LanguageClientManager;
let serverManager: ServerManager;

export async function activate(context: vscode.ExtensionContext) {
  const logger = new Logger('NPL Language Server');
  serverManager = new ServerManager(logger);
  clientManager = new LanguageClientManager(logger, serverManager);

  // Initialize managers with the same logger
  BinaryManager.setLogger(logger);
  VersionManager.setLogger(logger);
  HttpClientFactory.setLogger(logger);

  try {
    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.selectServerVersion', () => {
        serverManager.showVersionPicker(context);
      }),

      // Command to open settings to the version selection
      vscode.commands.registerCommand('npl.openVersionSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'NPL.server.version');
      }),

      // Command to clean server files
      vscode.commands.registerCommand('npl.cleanServerFiles', () => {
        serverManager.cleanServerFiles(context);
      })
    );

    await clientManager.start(context);
  } catch (err) {
    logger.logError('Failed to start NPL Language Server', err);
    await clientManager.stop();
    throw err;
  }
}

export async function deactivate(): Promise<void> {
  if (clientManager) {
    await clientManager.stop();
  }
}
