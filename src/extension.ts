import * as vscode from 'vscode';
import { Logger } from './utils/Logger';
import { ServerManager } from './server/ServerManager';
import { LanguageClientManager } from './client/LanguageClientManager';

let clientManager: LanguageClientManager;

export async function activate(context: vscode.ExtensionContext) {
  const logger = new Logger('NPL Language Server');
  const serverManager = new ServerManager(logger);
  clientManager = new LanguageClientManager(logger, serverManager);

  try {
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
