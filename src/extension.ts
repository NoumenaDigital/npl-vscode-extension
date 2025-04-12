import * as vscode from 'vscode';
import { Logger } from './utils/Logger';
import { ServerManager } from './server/ServerManager';
import { LanguageClientManager } from './client/LanguageClientManager';
import { BinaryManager } from './server/binary/BinaryManager';
import { VersionManager } from './server/binary/VersionManager';
import { HttpClientFactory } from './utils/HttpClient';
import { InstructionFileManager, VsCodeDialogHandler } from './instructionFiles/InstructionFileManager';

let clientManager: LanguageClientManager;
let serverManager: ServerManager;
let extensionContext: vscode.ExtensionContext;

export interface ExtensionAPI {
  restartServer: () => Promise<void>;
}
let instructionFileManager: InstructionFileManager;

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  const logger = new Logger('NPL Language Server');
  serverManager = new ServerManager(logger);
  clientManager = new LanguageClientManager(logger, serverManager);
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
      }),

      vscode.commands.registerCommand('npl.selectSources', () => {
        selectNplWorkspace(logger, 'sources');
      }),

      vscode.commands.registerCommand('npl.selectTestSources', () => {
        selectNplWorkspace(logger, 'testSources');
      }),

      vscode.commands.registerCommand('npl.restartServer', restartServer)
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

    // Return API for external consumers (like tests)
    return {
      restartServer
    } as ExtensionAPI;
  } catch (err) {
    logger.logError('Failed to start NPL Language Server', err);
    await clientManager.stop();
    throw err;
  }
}

// API method to restart the server
export async function restartServer(): Promise<void> {
  if (!serverManager || !clientManager || !extensionContext) {
    throw new Error('Extension not fully initialized');
  }

  // Stop the client first
  await clientManager.stop();

  // Then restart with a new server connection
  try {
    await clientManager.start(extensionContext);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to restart NPL Language Server: ${err}`);
    throw err;
  }
}

async function selectNplWorkspace(logger: Logger, type: 'sources' | 'testSources'): Promise<void> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open to save NPL settings.');
      return;
    }
    const currentWorkspace = workspaceFolders[0]; // Assuming single-root workspace for simplicity

    const selectedFolder = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: currentWorkspace.uri,
      openLabel: 'Select NPL ' + type,
    });

    if (selectedFolder && selectedFolder.length > 0) {
      const selectedPath = selectedFolder[0].fsPath;
      // Get configuration specifically for the current workspace folder
      const config = vscode.workspace.getConfiguration('NPL', currentWorkspace.uri);
      await config.update(type, selectedPath, vscode.ConfigurationTarget.WorkspaceFolder);
      vscode.window.showInformationMessage(`NPL ${type} path set to ${selectedPath} for this workspace.`);
    }
  } catch (error) {
    logger.logError(`Failed to select NPL ${type} workspace`, error);
    vscode.window.showErrorMessage(`Failed to select NPL ${type} workspace: ${error instanceof Error ? error.message : String(error)}`);
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
