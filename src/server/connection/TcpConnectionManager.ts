import * as net from 'net';
import * as vscode from 'vscode';
import { StreamInfo } from 'vscode-languageclient/node';
import { Logger } from '../../utils/Logger';

/**
 * Manages TCP connections to a language server
 */
export class TcpConnectionManager {
  private readonly DEFAULT_PORT = 5007;

  constructor(private logger: Logger) {}

  /**
   * Gets the server port from configuration or returns the default
   */
  getServerPort(): number {
    try {
      const config = vscode.workspace.getConfiguration('NPL');
      const port = config.get<number>('server.port');
      if (port && !isNaN(port) && port > 0 && port < 65536) {
        this.logger.log(`Using port from settings: ${port}`);
        return port;
      }
    } catch (e) {
      this.logger.logError('Error reading server port from configuration:', e);
    }

    return this.DEFAULT_PORT;
  }

  /**
   * Attempts to connect to a running server via TCP
   */
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

  /**
   * Connects to an existing server and returns a StreamInfo object for the language client
   */
  async connectToExistingServer(): Promise<StreamInfo | null> {
    const socket = await this.connectToServer();
    if (socket) {
      this.logger.log('Connected to existing TCP server');
      return { reader: socket, writer: socket };
    }
    return null;
  }
}
