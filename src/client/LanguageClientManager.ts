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

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'npl' }],
      outputChannel: this.logger.getOutputChannel(),
      traceOutputChannel: this.logger.getOutputChannel(),
      connectionOptions: {
        maxRestartCount: 3
      },
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

    this.client = new LanguageClient(
      'nplLanguageServer',
      'NPL-Dev for VS Code',
      serverOptions,
      clientOptions
    );

    await this.client.start();
    this.logger.log('NPL Language Server started');
  }

  async stop() {
    if (this.client) {
      await this.client.stop();
      this.client = undefined;
    }
    this.serverManager.stopServer();
  }
}
