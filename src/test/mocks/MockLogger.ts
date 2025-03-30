import * as vscode from 'vscode';

export class MockLogger {
  public logs: string[] = [];
  public errors: string[] = [];
  private outputChannel: vscode.OutputChannel;

  constructor() {
    // Create a mock output channel
    this.outputChannel = {
      name: 'MockOutputChannel',
      append: () => {},
      appendLine: (line: string) => { this.logs.push(line); },
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {},
      replace: () => {}
    } as any;
  }

  log(message: string): void {
    this.logs.push(message);
  }

  logError(message: string, error?: any, metadata?: Record<string, any>): void {
    this.errors.push(message);
    if (error) this.errors.push(error.toString());
    if (metadata) this.errors.push(JSON.stringify(metadata));
  }

  getOutputChannel(): vscode.OutputChannel {
    return this.outputChannel;
  }

  // Helper method to check if a specific message was logged
  hasLoggedMessage(substring: string): boolean {
    return this.logs.some(log => log.includes(substring));
  }

  // Helper method to check if a specific error was logged
  hasLoggedError(substring: string): boolean {
    return this.errors.some(error => error.includes(substring));
  }

  // Reset log history
  reset(): void {
    this.logs = [];
    this.errors = [];
  }
}
