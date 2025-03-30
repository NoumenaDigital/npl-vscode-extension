import * as vscode from 'vscode';
import * as fs from 'fs';
import { Logger } from '../../utils/Logger';
import { VersionManager } from './VersionManager';
import { BinaryManager } from './BinaryManager';
import { ProgressCallback } from './DownloadManager';

/**
 * Manages server binary updates and downloads
 */
export class ServerUpdateManager {
  constructor(private logger: Logger) {}

  /**
   * Checks for available updates and prompts the user to download if found
   */
  async checkForUpdates(context: vscode.ExtensionContext): Promise<boolean> {
    try {
      this.logger.log('Checking for language server updates...');
      const updateInfo = await VersionManager.checkForUpdates(context.extensionPath);

      if (updateInfo.hasUpdate && updateInfo.latestVersion) {
        this.logger.log(`New version available: ${updateInfo.latestVersion}`);
        return await this.promptUpdateDownload(context, updateInfo.latestVersion);
      } else {
        this.logger.log('No updates available');
        return false;
      }
    } catch (error) {
      this.logger.logError('Error checking for updates', error);
      return false;
    }
  }

  /**
   * Prompts the user to download an update
   */
  private async promptUpdateDownload(context: vscode.ExtensionContext, version: string): Promise<boolean> {
    const updateNow = await vscode.window.showInformationMessage(
      `A new version of the NPL Language Server is available (${version}). Would you like to update now?`,
      'Update Now', 'Later'
    );

    if (updateNow === 'Update Now') {
      return await this.downloadUpdate(context, version);
    }
    return false;
  }

  /**
   * Downloads and installs an update
   */
  private async downloadUpdate(context: vscode.ExtensionContext, version: string): Promise<boolean> {
    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'NPL Language Server',
      cancellable: false
    }, async (progress) => {
      const progressCallback: ProgressCallback = (info) => {
        if (info.message) {
          progress.report({ message: info.message, increment: info.increment });
        }
      };

      try {
        await BinaryManager.downloadServerBinary(
          context.extensionPath,
          progressCallback,
          version
        );

        vscode.window.showInformationMessage(
          `Successfully updated to version ${version}. Please reload window to use the new version.`,
          'Reload Now'
        ).then(selection => {
          if (selection === 'Reload Now') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
        return true;
      } catch (error) {
        this.logger.logError('Failed to download update', error);
        vscode.window.showErrorMessage(`Failed to download update: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    });
  }

  /**
   * Gets the latest server binary path, downloading if necessary
   */
  async getLatestServerBinary(context: vscode.ExtensionContext): Promise<string> {
    try {
      const anyBinaryExists = await this.checkExistingBinaries(context);

      if (anyBinaryExists) {
        return await this.getExistingBinary(context);
      } else {
        this.logger.log('No language server binary found, downloading automatically...');
        return await this.downloadServerBinary(context);
      }
    } catch (error) {
      this.logger.logError('Failed to get server binary', error);
      throw error;
    }
  }

  /**
   * Checks if any server binaries exist
   */
  private async checkExistingBinaries(context: vscode.ExtensionContext): Promise<boolean> {
    const versions = await VersionManager.loadVersionsData(context.extensionPath);
    this.logger.log(`Found ${versions.length} version(s) in versions.json`);

    for (const v of versions) {
      this.logger.log(`Version: ${v.version}, Path: ${v.installedPath}, Exists: ${v.installedPath ? fs.existsSync(v.installedPath) : false}`);
    }

    return versions.length > 0 && versions.some(v =>
      v.installedPath && fs.existsSync(v.installedPath)
    );
  }

  /**
   * Gets an existing binary, checking for updates first
   */
  private async getExistingBinary(context: vscode.ExtensionContext): Promise<string> {
    this.logger.log('Found existing binary versions');
    // Check for updates when we have existing binaries
    this.logger.log('Checking for updates...');
    const updated = await this.checkForUpdates(context);
    this.logger.log(`Update check completed, updated: ${updated}`);

    // Get latest installed version
    const latestVersion = VersionManager.findLatestInstalledVersion(context.extensionPath);
    if (!latestVersion?.installedPath) {
      throw new Error('No installed binary found');
    }
    this.logger.log(`Using existing server binary at: ${latestVersion.installedPath}`);
    return latestVersion.installedPath;
  }

  /**
   * Downloads the server binary
   */
  private async downloadServerBinary(context: vscode.ExtensionContext): Promise<string> {
    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'NPL Language Server',
      cancellable: false
    }, async (progress) => {
      const progressCallback: ProgressCallback = (info) => {
        if (info.message) {
          progress.report({message: info.message, increment: info.increment});
        }
      };

      // Get the selected version or use 'latest'
      const selectedVersion = VersionManager.getSelectedVersion();
      this.logger.log(`Using server version: ${selectedVersion}`);

      const serverPath = await BinaryManager.downloadServerBinary(
        context.extensionPath,
        progressCallback,
        selectedVersion
      );

      this.logger.log(`Downloaded server binary at: ${serverPath}`);
      return serverPath;
    });
  }
}
