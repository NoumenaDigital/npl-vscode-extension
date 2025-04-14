import * as vscode from 'vscode';

export interface ILogger {
  log(message: string): void;
  logInfo(message: string): void;
  logWarning(message: string): void;
  logError(message: string, error?: any, metadata?: Record<string, any>): void;
  show(): void;
  getOutputChannel(): vscode.OutputChannel;
}

export class Logger implements ILogger {
  private outputChannel: vscode.OutputChannel;

  constructor(name: string) {
    this.outputChannel = vscode.window.createOutputChannel(name);
  }

  log(message: string) {
    this.outputChannel.appendLine(message);
  }

  logInfo(message: string) {
    this.outputChannel.appendLine(`INFO: ${message}`);
  }

  logWarning(message: string) {
    this.outputChannel.appendLine(`WARNING: ${message}`);
  }

  logError(message: string, error?: any, metadata?: Record<string, any>) {
    const errorMessage = error ? `${message}: ${error.toString()}` : message;
    this.outputChannel.appendLine(`ERROR: ${errorMessage}`);

    if (metadata) {
      this.outputChannel.appendLine(`METADATA: ${JSON.stringify(metadata, null, 2)}`);
    }

    if (error?.stack) {
      this.outputChannel.appendLine(error.stack);
    }
  }

  show() {
    this.outputChannel.show();
  }

  getOutputChannel(): vscode.OutputChannel {
    return this.outputChannel;
  }
}
