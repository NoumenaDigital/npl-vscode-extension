import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

/**
 * Attempts to automatically populate the `NPL.migrationDescriptor` setting.
 *
 * For every workspace folder this will:
 *   1. Check if the setting is already present – if so, leave it untouched.
 *   2. Look for exactly one file whose relative path matches .../yaml/migration.yml
 *   3. If exactly one match is found, set the setting to the absolute path of that file at
 *      *workspace folder* scope.
 *
 * If zero or multiple candidates are found, the setting is left unchanged.
 */
export async function detectAndSetMigrationDescriptor(
  logger: Logger,
  workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders
): Promise<void> {
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  for (const folder of workspaceFolders) {
    try {
      const config = vscode.workspace.getConfiguration('NPL', folder.uri);
      const current = config.get<string>('migrationDescriptor');

      // Skip if the user already set a value
      if (current && current.trim().length > 0) {
        continue;
      }

      // Search for yaml/migration.yml inside this workspace folder
      const searchPattern = new vscode.RelativePattern(folder, '**/yaml/migration.yml');
      const found = await vscode.workspace.findFiles(searchPattern, '**/node_modules/**', 2);

      if (found.length === 1) {
        const filePath = found[0].fsPath;
        await config.update('migrationDescriptor', filePath, vscode.ConfigurationTarget.WorkspaceFolder);
        logger.log(`Auto-set NPL.migrationDescriptor to ${filePath}`);
      } else if (found.length > 1) {
        logger.log(`Found multiple migration descriptor candidates in ${folder.name}; leaving setting unchanged.`);
      }
    } catch (error) {
      logger.logError('Error while detecting migration descriptor', error);
    }
  }
}
