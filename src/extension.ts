import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  StreamInfo,
  ErrorAction,
  CloseAction
} from 'vscode-languageclient/node';
import * as net from 'net';
import * as path from 'path';
import * as childProcess from 'child_process';
import * as fs from 'fs';

let client: LanguageClient;
let serverProcess: childProcess.ChildProcess | undefined;
let outputChannel: vscode.OutputChannel;

export function log(message: string) {
  outputChannel.appendLine(message);
}

export function logError(message: string, error?: any) {
  const errorMessage = error ? `${message}: ${error.toString()}` : message;
  outputChannel.appendLine(`ERROR: ${errorMessage}`);
  if (error?.stack) {
    outputChannel.appendLine(error.stack);
  }
}

export async function connectToServer(): Promise<net.Socket | null> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: 'localhost', port: 5007 }, () => {
      resolve(socket);
    });

    socket.on('error', () => {
      resolve(null);
    });
  });
}

export async function startServer(context: vscode.ExtensionContext): Promise<StreamInfo> {
  const socket = await connectToServer();
  if (socket) {
    log('Connected to existing TCP server');
    return { reader: socket, writer: socket };
  }

  const serverPath = path.join(context.extensionPath, 'server', 'language-server');

  try {
    const stats = await fs.promises.stat(serverPath);
    const isExecutable = (stats.mode & fs.constants.S_IXUSR) !== 0;

    if (!isExecutable) {
      await fs.promises.chmod(serverPath, '755');
    }
  } catch (err) {
    throw new Error(`Server binary not found or inaccessible at ${serverPath}`);
  }

  const currentProcess = childProcess.spawn(serverPath, ['--stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false
  });

  serverProcess = currentProcess;

  if (!currentProcess.stdout || !currentProcess.stdin) {
    throw new Error('Failed to create stdio streams for server process');
  }

  let initialized = false;
  let startupError: Error | undefined;

  currentProcess.stdout.setEncoding('utf8');
  currentProcess.stderr?.setEncoding('utf8');

  currentProcess.stdout.on('data', (data) => {
    const message = data.toString();
    message.split('\r\n').forEach((line: string) => {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          if ((parsed.method === 'initialized') ||
              (parsed.id === 1 && parsed.result && parsed.result.capabilities)) {
            initialized = true;
          }
        } catch (e) {
          // Not a JSON message, ignore
        }
      }
    });
  });

  currentProcess.stderr?.on('data', (data) => {
    logError(`Server error: ${data.toString()}`);
  });

  currentProcess.on('error', (err) => {
    startupError = err;
    logError('Failed to start server process', err);
  });

  currentProcess.on('exit', (code, signal) => {
    if (!initialized) {
      startupError = new Error(`Server process exited with code ${code} before initialization`);
    }
    if (currentProcess === serverProcess) {
      serverProcess = undefined;
    }
  });

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

  currentProcess.stdin.write(header + content, 'utf8');

  return new Promise((resolve, reject) => {
    const timeoutMs = 10000;
    const timeout = setTimeout(() => {
      if (currentProcess && !currentProcess.killed) {
        currentProcess.kill();
      }
      reject(new Error(`Timeout waiting for server to start after ${timeoutMs}ms`));
    }, timeoutMs);

    if (currentProcess) {
      currentProcess.once('exit', () => {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        if (!initialized && currentProcess === serverProcess) {
          reject(new Error('Server process exited before initialization'));
        }
      });
    }

    const checkInterval = setInterval(() => {
      if (startupError) {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        reject(startupError);
        return;
      }

      if (initialized && currentProcess && !currentProcess.killed) {
        clearTimeout(timeout);
        clearInterval(checkInterval);
        resolve({
          reader: currentProcess.stdout!,
          writer: currentProcess.stdin!
        });
        return;
      }
    }, 100);
  });
}

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('NPL Language Server');

  try {
    const serverOptions = async () => {
      try {
        return await startServer(context);
      } catch (err) {
        logError('Failed to start server', err);
        throw err;
      }
    };

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file', language: 'npl' }],
      outputChannel: outputChannel,
      traceOutputChannel: outputChannel,
      connectionOptions: {
        maxRestartCount: 3
      },
      errorHandler: {
        error: (error, message, count) => {
          logError(`Language client error: ${error.message}`, error);
          return { action: ErrorAction.Continue };
        },
        closed: () => {
          return { action: CloseAction.DoNotRestart };
        }
      }
    };

    client = new LanguageClient(
      'nplLanguageServer',
      'NPL Language Server',
      serverOptions,
      clientOptions
    );

    await client.start();
    log('NPL Language Server started');
  } catch (err) {
    logError('Failed to start NPL Language Server', err);
    if (client) {
      await client.stop();
    }
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = undefined;
    }
    throw err;
  }
}

export async function deactivate(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = undefined;
  }
  if (client) {
    return client.stop();
  }
}
