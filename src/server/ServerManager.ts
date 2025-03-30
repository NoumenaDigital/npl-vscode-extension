import * as vscode from 'vscode';
import { StreamInfo } from 'vscode-languageclient/node';
import { Logger } from '../utils/Logger';
import { TcpConnectionManager } from './connection/TcpConnectionManager';
import { ServerProcessManager } from './process/ServerProcessManager';
import { ServerUpdateManager } from './binary/ServerUpdateManager';
import { VersionPickerUI } from './ui/VersionPickerUI';
import { CleanFilesUI } from './ui/CleanFilesUI';

/**
 * Main orchestrator for all server interactions
 */
export class ServerManager {
  private connectionManager: TcpConnectionManager;
  private processManager: ServerProcessManager;
  private updateManager: ServerUpdateManager;
  private versionPickerUI: VersionPickerUI;
  private cleanFilesUI: CleanFilesUI;

  constructor(private logger: Logger) {
    this.connectionManager = new TcpConnectionManager(logger);
    this.processManager = new ServerProcessManager(logger);
    this.updateManager = new ServerUpdateManager(logger);
    this.versionPickerUI = new VersionPickerUI(logger);
    this.cleanFilesUI = new CleanFilesUI(logger);
  }

  /**
   * Gets a connection to the language server, either by connecting to an existing one
   * or by starting a new server process
   */
  async getServerConnection(context: vscode.ExtensionContext): Promise<StreamInfo> {
    // First try to connect to an existing server
    const existingConnection = await this.connectionManager.connectToExistingServer();
    if (existingConnection) {
      return existingConnection;
    }

    // No existing server, so get the server binary and start a new process
    const serverPath = await this.updateManager.getLatestServerBinary(context);
    return this.processManager.spawnServerProcess(serverPath);
  }

  /**
   * Checks for available updates to the language server
   */
  async checkForUpdates(context: vscode.ExtensionContext): Promise<boolean> {
    return this.updateManager.checkForUpdates(context);
  }

  /**
   * Shows the version picker UI
   */
  async showVersionPicker(context: vscode.ExtensionContext): Promise<void> {
    return this.versionPickerUI.show(context);
  }

  /**
   * Shows the clean files UI
   */
  async cleanServerFiles(context: vscode.ExtensionContext): Promise<void> {
    return this.cleanFilesUI.cleanServerFiles(context);
  }

  /**
   * Stops the server if it's running
   */
  stopServer(): void {
    this.processManager.stopServer();
  }
}
