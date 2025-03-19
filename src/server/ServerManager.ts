import * as net from 'net';
import * as childProcess from 'child_process';
import { StreamInfo } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { FileUtils } from '../utils/FileUtils';

export class ServerManager {
  private serverProcess: childProcess.ChildProcess | undefined;
  private logger: Logger;
  private initialized: boolean = false;
  private readonly DEFAULT_PORT = 5007;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  private getServerPort(): number {
    const envPort = process.env.NPL_SERVER_PORT;
    if (envPort) {
      const port = parseInt(envPort);
      if (!isNaN(port) && port > 0 && port < 65536) {
        this.logger.log(`Using port from environment variable: ${port}`);
        return port;
      }
      this.logger.log(`Invalid port in environment variable: ${envPort}, using default`);
    }
    return this.DEFAULT_PORT;
  }

  async connectToServer(): Promise<net.Socket | null> {
    const port = this.getServerPort();
    return new Promise((resolve) => {
      let socket: net.Socket;

      const connectionTimeout = setTimeout(() => {
        this.logger.log('Connection attempt timed out after 5000ms');
        socket.destroy();
        resolve(null);
      }, 5000);

      socket = net.connect({ host: 'localhost', port }, () => {
        clearTimeout(connectionTimeout);
        resolve(socket);
      });

      socket.on('error', (err) => {
        clearTimeout(connectionTimeout);
        this.logger.log(`Failed to connect to existing TCP server: ${err.message}`);
        resolve(null);
      });
    });
  }

  async startServer(context: vscode.ExtensionContext): Promise<StreamInfo> {
    const socket = await this.connectToServer();
    if (socket) {
      this.logger.log('Connected to existing TCP server');
      return { reader: socket, writer: socket };
    }

    const serverPath = FileUtils.getServerPath(context.extensionPath);
    this.logger.log(`Using server binary at: ${serverPath}`);

    await FileUtils.validateServerBinary(serverPath);

    this.logger.log(`Starting server process: ${serverPath}`);
    return this.spawnServerProcess(serverPath);
  }

  private spawnServerProcess(serverPath: string): Promise<StreamInfo> {
    const options: childProcess.SpawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    };

    const currentProcess = childProcess.spawn(serverPath, ['--stdio'], options);
    this.serverProcess = currentProcess;

    if (!currentProcess.stdout || !currentProcess.stdin) {
      throw new Error('Failed to create stdio streams for server process');
    }

    return this.initializeServerProcess(currentProcess);
  }

  private initializeServerProcess(currentProcess: childProcess.ChildProcess): Promise<StreamInfo> {
    let startupError: Error | undefined;

    currentProcess.stdout!.setEncoding('utf8');
    currentProcess.stderr?.setEncoding('utf8');

    currentProcess.stdout!.on('data', (data) => {
      const message = data.toString();
      this.logger.log(`Server stdout: ${message}`);
      message.split('\r\n').forEach((line: string) => {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if ((parsed.method === 'initialized') ||
                (parsed.id === 1 && parsed.result && parsed.result.capabilities)) {
              this.initialized = true; // Update class property
              this.logger.log('Server initialized successfully');
            }
          } catch (e) {
            // Not a JSON message, ignore
          }
        }
      });
    });

    currentProcess.stderr?.on('data', (data) => {
      this.logger.logError(`Server error: ${data.toString()}`);
    });

    currentProcess.on('error', (err) => {
      startupError = err;
      this.logger.logError('Failed to start server process', err);
    });

    currentProcess.on('exit', (code, signal) => {
      this.logger.log(`Server process exited with code ${code} and signal ${signal}`);
      if (!this.initialized && currentProcess === this.serverProcess) {
        this.serverProcess = undefined;
      }
    });

    this.sendInitializeRequest(currentProcess);

    return this.waitForServerInitialization(currentProcess, startupError);
  }

  private sendInitializeRequest(currentProcess: childProcess.ChildProcess) {
    const initializeRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        processId: process.pid,
        clientInfo: { name: 'vscode' },
        rootUri: null,
        capabilities: {}
      }
    };
    const content = JSON.stringify(initializeRequest);
    const contentLength = Buffer.byteLength(content, 'utf8');
    const header = `Content-Length: ${contentLength}\r\n\r\n`;
    currentProcess.stdin!.write(header + content, 'utf8');
  }

  private waitForServerInitialization(
    currentProcess: childProcess.ChildProcess,
    startupError: Error | undefined
  ): Promise<StreamInfo> {
    return new Promise((resolve, reject) => {
      const timeoutMs = 10000;
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved && currentProcess && !currentProcess.killed) {
          currentProcess.kill();
          reject(new Error(`Timeout waiting for server to start after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      currentProcess.once('exit', (code) => {
        if (!resolved) {
          clearTimeout(timeout);
          reject(new Error(`Server process exited with code ${code} before initialization`));
        }
      });

      const checkInterval = setInterval(() => {
        if (startupError) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          reject(startupError);
        } else if (this.initialized && currentProcess && !currentProcess.killed) { // Use class property
          resolved = true;
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve({
            reader: currentProcess.stdout!,
            writer: currentProcess.stdin!
          });
        }
      }, 100);
    });
  }

  stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = undefined;
    }
  }
}
