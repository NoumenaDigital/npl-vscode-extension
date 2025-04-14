import * as vscode from 'vscode';
import { ILogger } from '../../../utils/Logger';

/**
 * A simplified logger for testing that implements the ILogger interface
 */
export class TestLogger implements ILogger {
  // Spy functions that can be used to track calls
  public logCalls: string[] = [];
  public logErrorCalls: { message: string, error?: Error }[] = [];
  public logInfoCalls: string[] = [];
  public logWarningCalls: string[] = [];

  /**
   * Logs a message to the output channel.
   */
  public log(message: string): void {
    this.logCalls.push(message);
  }

  /**
   * Logs an info message.
   */
  public logInfo(message: string): void {
    this.logInfoCalls.push(message);
  }

  /**
   * Logs a warning message.
   */
  public logWarning(message: string): void {
    this.logWarningCalls.push(message);
  }

  /**
   * Logs an error message and optional error object.
   */
  public logError(message: string, error?: any, metadata?: Record<string, any>): void {
    this.logErrorCalls.push({ message, error });
  }

  /**
   * Shows the output channel.
   */
  public show(): void {
    // No-op in tests
  }

  /**
   * Gets the output channel.
   */
  public getOutputChannel(): vscode.OutputChannel {
    // Return a mock output channel using unknown as intermediate step
    return {} as unknown as vscode.OutputChannel;
  }
}
