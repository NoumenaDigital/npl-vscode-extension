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
    context.subscriptions.push(
      vscode.commands.registerCommand('npl.selectServerVersion', () => {
        serverManager.showVersionPicker(context);
      }),
      vscode.commands.registerCommand('npl.cleanServerFiles', () => {
        serverManager.cleanServerFiles(context);
      }),

      vscode.commands.registerCommand('npl.selectSources', () => {
        selectNplWorkspace(logger, 'sources');
      }),

      vscode.commands.registerCommand('npl.selectTestSources', () => {
        selectNplWorkspace(logger, 'testSources');
      })
    );

    await clientManager.start(context);
  } catch (err) {
    logger.logError('Failed to start NPL Language Server', err);
    await clientManager.stop();
    throw err;
  }
}

async function selectNplWorkspace(logger: Logger, type: 'sources' | 'testSources'): Promise<void> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let defaultUri: vscode.Uri | undefined;

    if (workspaceFolders && workspaceFolders.length > 0) {
      defaultUri = workspaceFolders[0].uri;
    }

    const selectedFolder = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri,
      openLabel: 'Select NPL ' + type,
    });

    if (selectedFolder && selectedFolder.length > 0) {
      const selectedPath = selectedFolder[0].fsPath;
      const config = vscode.workspace.getConfiguration('NPL');
      await config.update(type, selectedPath, vscode.ConfigurationTarget.Global);
    }
  } catch (error) {
    logger.logError(`Failed to select NPL ${type} workspace`, error);
    vscode.window.showErrorMessage(`Failed to select NPL ${type} workspace: ${error instanceof Error ? error.message : String(error)}`);
  }
}


export async function deactivate(): Promise<void> {
  if (clientManager) {
    await clientManager.stop();
  }
}
