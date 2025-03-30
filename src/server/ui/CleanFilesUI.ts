import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { BinaryManager } from '../binary/BinaryManager';
import { VersionManager } from '../binary/VersionManager';

/**
 * Handles the UI for cleaning server files
 */
export class CleanFilesUI {
  constructor(private logger: Logger) {}

  /**
   * Shows a confirmation dialog and cleans server files if confirmed
   */
  async cleanServerFiles(context: vscode.ExtensionContext): Promise<void> {
    try {
      const result = await vscode.window.showWarningMessage(
        'Are you sure you want to clean all server files? This will remove all downloaded language server binaries.',
        { modal: true },
        'Yes', 'No'
      );

      if (result === 'Yes') {
        await this.performCleanup(context);
      }
    } catch (error) {
      this.logger.logError('Error in cleanServerFiles', error);
      vscode.window.showErrorMessage(`Error cleaning server files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Performs the actual cleanup operations
   */
  private async performCleanup(context: vscode.ExtensionContext): Promise<void> {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Cleaning server files',
      cancellable: false
    }, async (progress) => {
      try {
        progress.report({ message: 'Cleaning server files...' });

        // Clean unused binaries first
        await BinaryManager.cleanUnusedBinaries(context.extensionPath);

        // Delete all installed binaries
        const versions = await VersionManager.loadVersionsData(context.extensionPath);
        for (const version of versions) {
          if (version.installedPath) {
            await BinaryManager.deleteFileIfExists(version.installedPath);
          }
        }

        // Reset versions file
        await VersionManager.saveVersionsData(context.extensionPath, []);

        const binDir = VersionManager.getBinDirectory(context.extensionPath);
        this.logger.log(`Cleaned server files in ${binDir}`);

        // Show success message with reload option
        vscode.window.showInformationMessage(
          'Successfully cleaned all server files. The next time you open an NPL file, the server will be downloaded again.',
          'Reload Now'
        ).then(selection => {
          if (selection === 'Reload Now') {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
      } catch (error) {
        this.logger.logError('Failed to clean server files', error);
        vscode.window.showErrorMessage(`Failed to clean server files: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
}
