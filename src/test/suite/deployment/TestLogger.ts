import * as vscode from 'vscode';

/**
 * A simplified logger for testing that can be cast to the Logger type when needed
 */
export class TestLogger {

  // Spy functions that can be used to track calls
  public logCalls: string[] = [];
  public logErrorCalls: { message: string, error?: Error }[] = [];

  /**
   * Logs a message to the output channel.
   */
  public log(message: string): void {
    this.logCalls.push(message);
  }

  /**
   * Logs an error message and optional error object.
   */
  public logError(message: string, error?: Error): void {
    this.logErrorCalls.push({ message, error });
  }
  /**
   * Shows the output channel.
   */
  public show(): void {
    // No-op in tests
  }
}
