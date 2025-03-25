import * as vscode from 'vscode';

export class Logger {
  private outputChannel: vscode.OutputChannel;

  constructor(name: string) {
    this.outputChannel = vscode.window.createOutputChannel(name);
  }

  log(message: string) {
    this.outputChannel.appendLine(message);
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

  getOutputChannel(): vscode.OutputChannel {
    return this.outputChannel;
  }
}
