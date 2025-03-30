import * as vscode from 'vscode';
import * as fs from 'fs';
import { Logger } from '../../utils/Logger';
import { VersionManager } from '../binary/VersionManager';
import { BinaryManager } from '../binary/BinaryManager';
import { ProgressCallback } from '../binary/DownloadManager';

/**
 * Handles the UI for version selection
 */
export class VersionPickerUI {
  constructor(private logger: Logger) {}

  /**
   * Shows the version picker and handles user selection
   */
  async show(context: vscode.ExtensionContext): Promise<void> {
    try {
      const versions = await VersionManager.getAllGithubReleases();
      this.logger.log(`Fetched ${versions.length} versions from GitHub`);

      const installedVersions = await VersionManager.loadVersionsData(context.extensionPath);

      // Create a map to easily check if a version is installed
      const installedVersionMap = new Map<string, boolean>();
      for (const version of installedVersions) {
        if (version.installedPath && fs.existsSync(version.installedPath)) {
          installedVersionMap.set(version.version, true);
        }
      }

      const quickPickItems: vscode.QuickPickItem[] = [
        { label: 'latest', description: 'Always use the latest version' }
      ];

      for (const version of versions) {
        const date = new Date(version.publishedAt);
        const formattedDate = date.toLocaleDateString();

        const isInstalled = installedVersionMap.has(version.version);

        quickPickItems.push({
          label: version.version,
          description: `Released on ${formattedDate}${isInstalled ? ' (installed)' : ''}`
        });
      }

      const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a server version',
        title: 'NPL Language Server Version'
      });

      if (selectedItem) {
        await this.handleVersionSelection(context, selectedItem, installedVersionMap);
      }
    } catch (error) {
      this.logger.logError('Failed to show version picker', error);
      vscode.window.showErrorMessage(`Failed to show version picker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handles the user's version selection
   */
  private async handleVersionSelection(
    context: vscode.ExtensionContext,
    selectedItem: vscode.QuickPickItem,
    installedVersionMap: Map<string, boolean>
  ): Promise<void> {
    this.logger.log(`Selected version: ${selectedItem.label}`);

    const config = vscode.workspace.getConfiguration('NPL');
    await config.update('server.version', selectedItem.label, vscode.ConfigurationTarget.Global);

    if (selectedItem.label === 'latest') {
      const latestRelease = await VersionManager.getLatestGithubRelease();
      if (latestRelease && installedVersionMap.has(latestRelease.version)) {
        this.showReloadPrompt(`Latest version (${latestRelease.version}) is set as active.`);
        return;
      }
    }
    else if (installedVersionMap.has(selectedItem.label)) {
      this.showReloadPrompt(`Version ${selectedItem.label} is set as active.`);
      return;
    }

    // If we got here, the selected version needs to be downloaded
    await this.promptDownloadVersion(context, selectedItem.label);
  }

  /**
   * Shows a prompt asking if the user wants to reload the window
   */
  private showReloadPrompt(message: string): void {
    this.logger.log(message);
    vscode.window.showInformationMessage(
      message,
      'Reload Now'
    ).then(selection => {
      if (selection === 'Reload Now') {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    });
  }

  /**
   * Prompts the user to download the selected version
   */
  private async promptDownloadVersion(context: vscode.ExtensionContext, version: string): Promise<void> {
    const downloadNow = await vscode.window.showInformationMessage(
      `Version set to ${version}. Would you like to download it now?`,
      'Yes', 'No'
    );

    if (downloadNow === 'Yes') {
      await this.downloadVersion(context, version);
    }
  }

  /**
   * Downloads the selected version of the language server
   */
  private async downloadVersion(context: vscode.ExtensionContext, version: string): Promise<void> {
    await vscode.window.withProgress({
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
          version === 'latest' ? undefined : version
        );

        this.showReloadPrompt(`Successfully downloaded version ${version}. Please reload window to use the new version.`);
      } catch (error) {
        this.logger.logError('Failed to download version', error);
        vscode.window.showErrorMessage(`Failed to download version: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
}
