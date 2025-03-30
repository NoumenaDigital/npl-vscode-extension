import * as childProcess from 'child_process';
import { StreamInfo } from 'vscode-languageclient/node';
import { Logger } from '../../utils/Logger';
import { BinaryManager } from '../binary/BinaryManager';

/**
 * Manages the lifecycle of the language server process
 */
export class ServerProcessManager {
  private serverProcess: childProcess.ChildProcess | undefined;
  private hasWarnedAboutStderr: boolean = false;
  private readonly SERVER_START_TIMEOUT_MS = 15000;

  constructor(private logger: Logger) {}

  /**
   * Creates a new server process from the given binary path
   */
  async spawnServerProcess(serverPath: string): Promise<StreamInfo> {
    // Validate the binary first
    await BinaryManager.validateServerBinary(serverPath);

    const options: childProcess.SpawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    };

    try {
      this.logger.log(`Starting server process: ${serverPath}`);
      const currentProcess = childProcess.spawn(serverPath, ['--stdio'], options);
      this.serverProcess = currentProcess;

      if (!currentProcess.stdout || !currentProcess.stdin) {
        throw new Error('Failed to create stdio streams for server process');
      }

      return this.initializeServerProcess(currentProcess);
    } catch (error) {
      this.logger.logError(`Failed to spawn server process: ${error}`);
      throw error;
    }
  }

  /**
   * Sets up stdout/stderr handlers and waits for process initialization
   */
  private initializeServerProcess(currentProcess: childProcess.ChildProcess): Promise<StreamInfo> {
    let startupError: Error | undefined;

    currentProcess.stdout!.setEncoding('utf8');
    currentProcess.stderr?.setEncoding('utf8');

    currentProcess.stdout!.on('data', (data) => {
      const message = data.toString();
      this.logger.log(`Server stdout: ${message}`);
    });

    currentProcess.stderr?.on('data', (data) => {
      // Log stderr messages but don't filter - ensure we're not missing anything important
      // Just prefix differently to distinguish in the logs
      const message = data.toString();

      // Check if this is an LSP protocol message (starts with Content-Length: or is JSON-RPC)
      const isLspProtocolMessage = message.trim().startsWith('Content-Length:') ||
                                  (message.includes('"jsonrpc"') && message.includes('"method"'));

      if (isLspProtocolMessage) {
        // Just log a warning once - no need to be chatty about it
        if (!this.hasWarnedAboutStderr) {
          this.logger.logError(
            `WARNING: LSP protocol messages detected on stderr instead of stdout. ` +
            `This can prevent proper handling of diagnostics and other notifications.`
          );
          this.hasWarnedAboutStderr = true;
        }
        // Don't log the actual message content to reduce spam
        return;
      }

      // Handle regular stderr output
      const isError = message.toLowerCase().includes('error:') ||
                     message.toLowerCase().includes('exception:') ||
                     message.toLowerCase().includes('failed:');

      if (isError) {
        this.logger.logError(`Server error: ${message}`);
      } else {
        this.logger.log(`STDERR: ${message}`);
      }
    });

    currentProcess.on('error', (err) => {
      startupError = err;
      this.logger.logError('Failed to start server process', err);
    });

    currentProcess.on('exit', (code, signal) => {
      this.logger.log(`Server process exited with code ${code} and signal ${signal}`);
      // Reset serverProcess if it exits unexpectedly before client connects
      if (currentProcess === this.serverProcess) {
         this.serverProcess = undefined;
      }
    });

    // Let the language client handle initialization
    return this.waitForServerInitialization(currentProcess, startupError);
  }

  /**
   * Waits for the server process to be ready with available streams
   */
  private waitForServerInitialization(
      currentProcess: childProcess.ChildProcess,
      startupError: Error | undefined
  ): Promise<StreamInfo> {
    return new Promise((resolve, reject) => {
      let processExited = false;
      let processError: Error | undefined = startupError;

      const timeout = setTimeout(() => {
        if (!processExited && currentProcess && !currentProcess.killed) {
          this.logger.logError(`Server initialization timed out after ${this.SERVER_START_TIMEOUT_MS}ms`);
          currentProcess.kill();
          reject(new Error(`Timeout waiting for server to start after ${this.SERVER_START_TIMEOUT_MS}ms`));
        }
      }, this.SERVER_START_TIMEOUT_MS);

      const onExit = (code: number | null) => {
        processExited = true;
        clearTimeout(timeout);
        if (code !== 0 && code !== null) {
           const exitMsg = `Server process exited prematurely with code ${code}`;
           this.logger.logError(exitMsg);
           reject(new Error(exitMsg));
        } else {
            // Process exited cleanly before we could resolve, likely an issue
            const exitMsg = `Server process exited prematurely without error code before connection established`;
            this.logger.logError(exitMsg);
            reject(new Error(exitMsg));
        }
      };

      const onError = (err: Error) => {
        processError = err;
        processExited = true; // Treat error as a form of exit for rejection logic
        clearTimeout(timeout);
        this.logger.logError(`Server process error: ${err.message}`);
        reject(err);
      };

      currentProcess.once('exit', onExit);
      currentProcess.once('error', onError);

      // Check if streams are available. If they are, resolve.
      // The LanguageClient will handle the actual LSP initialization handshake.
      if (currentProcess.stdout && currentProcess.stdin) {
        this.logger.log('Server process started, streams available. Handing over to LanguageClient.');
        clearTimeout(timeout);
        // Remove listeners we added to prevent leaks if client takes over
        currentProcess.removeListener('exit', onExit);
        currentProcess.removeListener('error', onError);
        resolve({
          reader: currentProcess.stdout,
          writer: currentProcess.stdin
        });
      } else if (processError) {
        // Reject immediately if a startup error was already caught
        clearTimeout(timeout);
        this.logger.logError(`Server startup error before streams available: ${processError.message}`);
        reject(processError);
      } else if (processExited) {
        // Reject if the process exited before streams were confirmed
        clearTimeout(timeout);
        reject(new Error('Server process exited before streams could be confirmed.'));
      }
      // If streams aren't ready yet, the timeout or exit/error listeners will handle rejection.
    });
  }

  /**
   * Stops the server process if it's running
   */
  stopServer() {
    if (this.serverProcess) {
      this.logger.log('Stopping server process');
      try {
        this.serverProcess.kill();
      } catch (error) {
        this.logger.logError(`Error stopping server process: ${error}`);
      }
      this.serverProcess = undefined;
    }
  }
}
