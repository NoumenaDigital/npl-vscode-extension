import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  StreamInfo,
  ErrorAction,
  CloseAction
} from 'vscode-languageclient/node';
import { Logger } from '../utils/Logger';
import { ServerManager } from '../server/ServerManager';

export class LanguageClientManager {
  private client: LanguageClient | undefined;
  private logger: Logger;
  private serverManager: ServerManager;
  private configChangeListener: vscode.Disposable | undefined;
  private extensionContext: vscode.ExtensionContext | undefined;

  constructor(logger: Logger, serverManager: ServerManager) {
    this.logger = logger;
    this.serverManager = serverManager;
  }

  async start(context: vscode.ExtensionContext) {
    this.extensionContext = context;

    if (this.client) {
      this.logger.log('Client already exists, stopping it before restart');
      await this.stop();
    }

    const serverOptions = async (): Promise<StreamInfo> => {
      try {
        return await this.serverManager.getServerConnection(context);
      } catch (err) {
        this.logger.logError('Failed to start server', err);
        throw err;
      }
    };

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder found');
    }
    const config = vscode.workspace.getConfiguration('NPL', workspaceFolders[0].uri);
    const sourcesSetting = config.get<string>('sources');
    const testSourcesSetting = config.get<string>('testSources');
    const nplContribLibraries = config.get<string[]>('contribLibraries');

    // Build the list of workspace folders to process
    const workspaceFoldersToProcess: vscode.WorkspaceFolder[] = this.buildWorkspaceFoldersList(
      sourcesSetting,
      testSourcesSetting,
      workspaceFolders
    );

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'npl' }],
      outputChannel: this.logger.getOutputChannel(),
      traceOutputChannel: this.logger.getOutputChannel(),
      connectionOptions: {
        maxRestartCount: 3
      },
      initializationOptions: {
        effectiveWorkspaceFolders: workspaceFoldersToProcess.map(wf => ({ uri: wf.uri.toString(), name: wf.name })),
        nplServerDebouncingTimeMs: vscode.workspace.getConfiguration('NPL').get<number>('server.debouncing.time.ms', 300),
        nplContribLibraries: nplContribLibraries
      },
      errorHandler: {
        error: (error, message) => {
          this.logger.logError(`Language client error: ${message}`, error);
          return { action: ErrorAction.Continue };
        },
        closed: () => {
          // Attempt to restart on closed connection, respecting maxRestartCount
          this.logger.log('Language client connection closed.');
          return { action: CloseAction.DoNotRestart };
        }
      },
    };

    this.logger.log(`LanguageClient initialized with workspace folders: ${workspaceFoldersToProcess.map(f => `${f.name} (${f.uri.fsPath})`).join(', ')}`);

    this.client = new LanguageClient(
      'nplLanguageServer',
      'NPL-Dev for VS Code',
      serverOptions,
      clientOptions
    );

    this.configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('NPL.sources') || e.affectsConfiguration('NPL.testSources')|| e.affectsConfiguration('NPL.contribLibraries')) {
        this.logger.log('NPL workspace settings have changed. Restarting the language server...');

        // Stop and restart the client
        this.stop().then(() => {
          // Short delay to ensure cleanup is complete
          setTimeout(() => {
            // Use the stored extension context
            if (this.extensionContext) {
              this.start(this.extensionContext).then(() => {
                vscode.window.showInformationMessage('NPL Language Server restarted with updated workspace settings.');
              }).catch(err => {
                this.logger.logError('Failed to restart language server after settings change', err);
                vscode.window.showErrorMessage('Failed to restart NPL Language Server. You may need to reload the window.');
              });
            } else {
              this.logger.logError('Cannot restart language server: extension context is undefined');
              vscode.window.showErrorMessage('Failed to restart NPL Language Server. Please reload the window.');
            }
          }, 500);
        }).catch(err => {
          this.logger.logError('Failed to stop language server before restart', err);
        });
      }
    });
    context.subscriptions.push(this.configChangeListener);

    await this.client.start();
    this.logger.log('NPL Language Server started');
  }

  async stop() {
    if (this.configChangeListener) {
      this.configChangeListener.dispose();
      this.configChangeListener = undefined;
    }

    if (this.client) {
      await this.client.stop();
      this.client = undefined;
    }
    this.serverManager.stopServer();
  }

  private buildWorkspaceFoldersList(
    sourcesSetting: string | undefined,
    testSourcesSetting: string | undefined,
    vscodeWorkspaceFolders: readonly vscode.WorkspaceFolder[] | undefined
  ): vscode.WorkspaceFolder[] {
    const result: vscode.WorkspaceFolder[] = [];

    // Determine main source folders
    if (sourcesSetting && sourcesSetting.trim().length > 0) {
      result.push({
        uri: vscode.Uri.file(sourcesSetting),
        name: 'NPL Sources',
        index: result.length // Assign index sequentially
      });
      this.logger.log(`Using custom workspace folder for sources: ${sourcesSetting}`);
    } else if (vscodeWorkspaceFolders && vscodeWorkspaceFolders.length > 0) {
      // Use VS Code's workspace folders if no custom setting
      vscodeWorkspaceFolders.forEach((folder, index) => {
        result.push({
          uri: folder.uri,
          name: folder.name,
          index: index
        });
      });
      this.logger.log(`Using VS Code workspace folders: ${result.map(f => f.uri.fsPath).join(', ')}`);
    }

    // Add test sources folder if configured
    if (testSourcesSetting && testSourcesSetting.trim().length > 0) {
       const testSourceUri = vscode.Uri.file(testSourcesSetting);
       const testSourcePath = testSourceUri.fsPath;

       // Ensure we don't add duplicates if test sources are inside main sources/workspace
       // Check if testSourcePath is exactly the same as or is contained within any existing folder
       const isDuplicate = result.some(wf => {
         const existingPath = wf.uri.fsPath;
         // Check if they're the same path, or if testSourcePath starts with existingPath + path separator
         return testSourcePath === existingPath ||
                testSourcePath.startsWith(existingPath + '/') ||
                testSourcePath.startsWith(existingPath + '\\');
       });

       if (!isDuplicate) {
         result.push({
           uri: testSourceUri,
           name: 'NPL Test Sources',
           index: result.length // Assign index sequentially
         });
         this.logger.log(`Added test sources folder: ${testSourcesSetting}`);
       } else {
          this.logger.log(`Test sources folder (${testSourcesSetting}) is already included in the workspace folders.`);
       }
    }

    if (result.length === 0) {
      this.logger.log('Warning: No workspace folders determined for the NPL Language Server. The server might not function correctly.');
    }

    return result;
  }
}
