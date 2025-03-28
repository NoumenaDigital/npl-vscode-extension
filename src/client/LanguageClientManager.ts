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
    const sourcesSetting = vscode.workspace.getConfiguration('NPL').get<string>('sources');
    const testSourcesSetting = vscode.workspace.getConfiguration('NPL').get<string>('testSources');

    // Create the main workspace folder from sourcesSetting if available
    let sourcesFolder: vscode.WorkspaceFolder | undefined;
    if (sourcesSetting && sourcesSetting.length > 0) {
      sourcesFolder = {
        uri: vscode.Uri.file(sourcesSetting),
        name: 'NPL Sources',
        index: 0
      };
      this.logger.log(`Using custom workspace folder for sources: ${sourcesSetting}`);
    } else {
      // the client takes a single workspace folder, so we use the first one;
      // in the future, we might want to pass in all the workspace folders
      // and allow the user to configure multiple workspace folders
      sourcesFolder = vscode.workspace.workspaceFolders?.[0];
    }

    // Test sources will be passed in initializationOptions
    let testSourcesFolder: vscode.WorkspaceFolder | undefined;
    if (testSourcesSetting && testSourcesSetting.length > 0) {
      testSourcesFolder = {
        uri: vscode.Uri.file(testSourcesSetting),
        name: 'NPL Test Sources',
        index: 1
      };
      this.logger.log(`Added test sources folder: ${testSourcesSetting}`);
    }

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'npl' }],
      outputChannel: this.logger.getOutputChannel(),
      traceOutputChannel: this.logger.getOutputChannel(),
      connectionOptions: {
        maxRestartCount: 3
      },
      workspaceFolder: sourcesFolder,
      initializationOptions: { testSources: testSourcesFolder },
      errorHandler: {
        error: (error, message) => {
          this.logger.logError(`Language client error: ${message}`, error);
          return { action: ErrorAction.Continue };
        },
        closed: () => {
          return { action: CloseAction.DoNotRestart };
        }
      }
    };

    this.logger.log(`Initialization setup - Main workspace: ${sourcesFolder?.uri.fsPath || 'none'}, Test sources: ${testSourcesFolder?.uri.fsPath || 'none'}`);

    this.client = new LanguageClient(
      'nplLanguageServer',
      'NPL-Dev for VS Code',
      serverOptions,
      clientOptions
    );

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
}
