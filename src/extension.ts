import * as vscode from 'vscode';
import { Logger } from './utils/Logger';
import { ServerManager } from './server/ServerManager';
import { LanguageClientManager } from './client/LanguageClientManager';
import { BinaryManager } from './server/binary/BinaryManager';
import { VersionManager } from './server/binary/VersionManager';
import { HttpClientFactory } from './utils/HttpClient';
import { InstructionFileManager, VsCodeDialogHandler, setExtensionContext } from './instructionFiles/InstructionFileManager';

let clientManager: LanguageClientManager;
let serverManager: ServerManager;
let instructionFileManager: InstructionFileManager;

export async function activate(context: vscode.ExtensionContext) {
  const logger = new Logger('NPL Language Server');
  serverManager = new ServerManager(logger);
  clientManager = new LanguageClientManager(logger, serverManager);

  // Set extension context for correct path resolution
  setExtensionContext(context);

  instructionFileManager = new InstructionFileManager(
    new VsCodeDialogHandler()
  );

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
      })
    );

    // Handle instruction files when workspace contains NPL files
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === 'npl') {
          handleWorkspaceInstructionFiles(logger);
        }
      })
    );

    // Check if we're already in a workspace with NPL files
    if (vscode.workspace.textDocuments.some(doc => doc.languageId === 'npl')) {
      handleWorkspaceInstructionFiles(logger);
    }

    await clientManager.start(context);
  } catch (err) {
    logger.logError('Failed to start NPL Language Server', err);
    await clientManager.stop();
    throw err;
  }
}

/**
 * Checks for Cursor rules and Copilot instructions in the workspace
 */
async function handleWorkspaceInstructionFiles(logger: Logger) {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    // Handle instruction files for each workspace folder
    for (const folder of workspaceFolders) {
      await instructionFileManager.checkAndHandleInstructionFiles(folder);
    }
  } catch (error) {
    logger.logError('Error handling workspace instruction files', error);
  }
}

export async function deactivate(): Promise<void> {
  if (clientManager) {
    await clientManager.stop();
  }
}
