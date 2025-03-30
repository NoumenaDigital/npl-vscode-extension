import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  StreamInfo,
  ErrorAction,
  CloseAction,
  Trace
} from 'vscode-languageclient/node';
import { Logger } from '../utils/Logger';
import { ServerManager } from '../server/ServerManager';

export class LanguageClientManager {
  private client: LanguageClient | undefined;
  private logger: Logger;
  private serverManager: ServerManager;
  private configChangeListener: vscode.Disposable | undefined;

  constructor(logger: Logger, serverManager: ServerManager) {
    this.logger = logger;
    this.serverManager = serverManager;
  }

  async start(context: vscode.ExtensionContext) {
    const serverOptions = async (): Promise<StreamInfo> => {
      try {
        return await this.serverManager.getServerConnection(context);
      } catch (err) {
        this.logger.logError('Failed to start server', err);
        throw err;
      }
    };

    // Get workspace folder settings from configuration
    const config = vscode.workspace.getConfiguration('NPL');
    const sourcesSetting = config.get<string>('sources');
    const testSourcesSetting = config.get<string>('testSources');

    // Build the list of workspace folders to process
    const workspaceFolders: vscode.WorkspaceFolder[] = this.buildWorkspaceFoldersList(
      sourcesSetting,
      testSourcesSetting,
      vscode.workspace.workspaceFolders
    );

    // Check if trace is enabled (minimal logging)
    const traceEnabled = config.get<boolean>('NPL.server.trace.enabled', false);

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'npl' }],
      outputChannel: this.logger.getOutputChannel(),
      connectionOptions: {
        maxRestartCount: 3
      },
      // Let the client handle standard workspace folders based on VS Code's state.
      // Pass the *effective* list, including custom paths, via initializationOptions.
      initializationOptions: {
        effectiveWorkspaceFolders: workspaceFolders.map(wf => ({ uri: wf.uri.toString(), name: wf.name }))
      },
      errorHandler: {
        error: (error, message) => {
          this.logger.logError(`Language client error`, error);
          if (message && traceEnabled) {
            this.logger.logError(`  Message: ${message.jsonrpc}`);
          }
          return { action: ErrorAction.Continue };
        },
        closed: () => {
          // Attempt to restart on closed connection, respecting maxRestartCount
          this.logger.log('Language client connection closed.');
          return { action: CloseAction.DoNotRestart };
        }
      },
    };

    this.logger.log(`LanguageClient initialized with workspace folders: ${workspaceFolders.map(f => `${f.name} (${f.uri.fsPath})`).join(', ')}`);

    this.client = new LanguageClient(
      'nplLanguageServer',
      'NPL-Dev for VS Code',
      serverOptions,
      clientOptions
    );

    // Configure trace level based on settings
    if (traceEnabled) {
      this.client.setTrace(Trace.Verbose);
      this.logger.log('Language server trace enabled (verbose mode)');
    }

    this.configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('NPL.sources') || e.affectsConfiguration('NPL.testSources')) {
        const message = 'NPL workspace settings have changed. Please reload VS Code to apply the changes.';
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
          index: index // Preserve original index if possible, though LSP server might re-index
        });
      });
      this.logger.log(`Using VS Code workspace folders: ${result.map(f => f.uri.fsPath).join(', ')}`);
    }

    // Add test sources folder if configured
    if (testSourcesSetting && testSourcesSetting.trim().length > 0) {
       const testSourceUri = vscode.Uri.file(testSourcesSetting);
       // Ensure we don't add duplicates if test sources are inside main sources/workspace
       if (!result.some(wf => wf.uri.fsPath === testSourceUri.fsPath)) {
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

    // If no folders are determined, we might need a fallback or error handling
    if (result.length === 0) {
      this.logger.log('Warning: No workspace folders determined for the NPL Language Server. The server might not function correctly.');
      // Depending on server requirements, you might want to throw an error here
      // or provide a default (e.g., based on the first opened file later)
    }

    return result;
  }
}
