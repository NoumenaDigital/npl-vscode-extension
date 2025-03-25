import * as net from 'net';
import * as childProcess from 'child_process';
import { StreamInfo } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { ProgressCallback } from './binary/DownloadManager';
import { VersionManager } from './binary/VersionManager';
import { BinaryManager } from './binary/BinaryManager';
import * as fs from 'fs';

export class ServerManager {
  private serverProcess: childProcess.ChildProcess | undefined;
  private logger: Logger;
  private initialized: boolean = false;
  private readonly DEFAULT_PORT = 5007;
  private readonly SERVER_START_TIMEOUT_MS = 15000;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  private getServerPort(): number {
    try {
      const config = vscode.workspace.getConfiguration('NPL');
      const port = config.get<number>('server.port');
      if (port && !isNaN(port) && port > 0 && port < 65536) {
        this.logger.log(`Using port from settings: ${port}`);
        return port;
      }
    } catch (e) {
      // Ignore errors
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

  async connectToExistingServer(): Promise<StreamInfo | null> {
    const socket = await this.connectToServer();
    if (socket) {
      this.logger.log('Connected to existing TCP server');
      return { reader: socket, writer: socket };
    }
    return null;
  }

  async checkForUpdates(context: vscode.ExtensionContext): Promise<boolean> {
    try {
      this.logger.log('Checking for language server updates...');
      const updateInfo = await VersionManager.checkForUpdates(context.extensionPath);

      if (updateInfo.hasUpdate && updateInfo.latestVersion) {
        this.logger.log(`New version available: ${updateInfo.latestVersion}`);

        const updateNow = await vscode.window.showInformationMessage(
            `A new version of the NPL Language Server is available (${updateInfo.latestVersion}). Would you like to update now?`,
            'Update Now', 'Later'
        );

        if (updateNow === 'Update Now') {
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'NPL Language Server',
            cancellable: false
          }, async (progress) => {
            const progressCallback: ProgressCallback = (info) => {
              if (info.message) {
                progress.report({ message: info.message, increment: info.increment });
              }
            };

            try {
              await BinaryManager.downloadServerBinary(
                  context.extensionPath,
                  progressCallback,
                  updateInfo.latestVersion || undefined
              );

              vscode.window.showInformationMessage(
                  `Successfully updated to version ${updateInfo.latestVersion}. Please reload window to use the new version.`,
                  'Reload Now'
              ).then(selection => {
                if (selection === 'Reload Now') {
                  vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
              });
              return true;
            } catch (error) {
              this.logger.logError('Failed to download update', error);
              vscode.window.showErrorMessage(`Failed to download update: ${error instanceof Error ? error.message : String(error)}`);
              return false;
            }
          });
          return true;
        }
        return false;
      } else {
        this.logger.log('No updates available');
        return false;
      }
    } catch (error) {
      this.logger.logError('Error checking for updates', error);
      return false;
    }
  }

  async getServerConnection(context: vscode.ExtensionContext): Promise<StreamInfo> {
    const existingConnection = await this.tryConnectToExistingServer(context);
    if (existingConnection) {
      return existingConnection;
    }

    return this.startNewServerInstance(context);
  }

  private async tryConnectToExistingServer(context: vscode.ExtensionContext): Promise<StreamInfo | null> {
    const existingConnection = await this.connectToExistingServer();
    if (existingConnection) {
      // We have an existing connection, check for updates in the background
      this.checkForUpdates(context).catch(err => {
        this.logger.logError('Error checking for updates in background', err);
      });
      return existingConnection;
    }
    return null;
  }

  private async startNewServerInstance(context: vscode.ExtensionContext): Promise<StreamInfo> {
    try {
      const anyBinaryExists = await this.checkExistingBinaries(context);

      if (anyBinaryExists) {
        return await this.handleExistingBinaryScenario(context);
      } else {
        this.logger.log('No language server binary found, downloading automatically...');
        return await this.startServerWithDownload(context);
      }
    } catch (error) {
      this.logger.logError('Error in server initialization', error);
      throw error;
    }
  }

  private async checkExistingBinaries(context: vscode.ExtensionContext): Promise<boolean> {
    const versions = await VersionManager.loadVersionsData(context.extensionPath);
    this.logger.log(`Found ${versions.length} version(s) in versions.json`);

    for (const v of versions) {
      this.logger.log(`Version: ${v.version}, Path: ${v.installedPath}, Exists: ${v.installedPath ? fs.existsSync(v.installedPath) : false}`);
    }

    return versions.length > 0 && versions.some(v =>
      v.installedPath && fs.existsSync(v.installedPath)
    );
  }

  private async handleExistingBinaryScenario(context: vscode.ExtensionContext): Promise<StreamInfo> {
    this.logger.log('Found existing binary versions');
    // Always check for updates when we have existing binaries
    this.logger.log('Checking for updates...');
    const updated = await this.checkForUpdates(context);
    this.logger.log(`Update check completed, updated: ${updated}`);

    return await this.startServerWithExistingBinary(context);
  }

  async startServerWithDownload(context: vscode.ExtensionContext): Promise<StreamInfo> {
    try {
      const serverPath = await this.downloadServerBinaryWithProgress(context);
      this.logger.log(`Using server binary at: ${serverPath}`);
      await BinaryManager.validateServerBinary(serverPath);

      this.logger.log(`Starting server process: ${serverPath}`);
      return this.spawnServerProcess(serverPath);
    } catch (error) {
      this.logger.logError('Failed to download or start server binary', error);
      throw error;
    }
  }

  private async downloadServerBinaryWithProgress(context: vscode.ExtensionContext): Promise<string> {
    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'NPL Language Server',
      cancellable: false
    }, async (progress) => {
      const progressCallback: ProgressCallback = (info) => {
        if (info.message) {
          progress.report({message: info.message, increment: info.increment});
        }
      };

      // Get the selected version or use 'latest'
      const selectedVersion = VersionManager.getSelectedVersion();
      this.logger.log(`Using server version: ${selectedVersion}`);

      return await BinaryManager.downloadServerBinary(
          context.extensionPath,
          progressCallback,
          selectedVersion
      );
    });
  }

  // This version will use an existing binary without triggering a download
  async startServerWithExistingBinary(context: vscode.ExtensionContext): Promise<StreamInfo> {
    try {
      const serverPath = await this.findLatestInstalledBinary(context);
      this.logger.log(`Using existing server binary at: ${serverPath}`);

      await BinaryManager.validateServerBinary(serverPath);
      this.logger.log(`Starting server process: ${serverPath}`);
      return this.spawnServerProcess(serverPath);
    } catch (error) {
      this.logger.logError('Failed to start server with existing binary', error);
      this.logger.log('Falling back to download');
      return this.startServerWithDownload(context);
    }
  }

  private async findLatestInstalledBinary(context: vscode.ExtensionContext): Promise<string> {
    const latestVersion = VersionManager.findLatestInstalledVersion(context.extensionPath);
    if (!latestVersion?.installedPath) {
      throw new Error('No installed binary found');
    }
    return latestVersion.installedPath;
  }

  private spawnServerProcess(serverPath: string): Promise<StreamInfo> {
    const options: childProcess.SpawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    };

    try {
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
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved && currentProcess && !currentProcess.killed) {
          this.logger.logError(`Server initialization timed out after ${this.SERVER_START_TIMEOUT_MS}ms`);
          currentProcess.kill();
          reject(new Error(`Timeout waiting for server to start after ${this.SERVER_START_TIMEOUT_MS}ms`));
        }
      }, this.SERVER_START_TIMEOUT_MS);

      currentProcess.once('exit', (code) => {
        if (!resolved) {
          clearTimeout(timeout);
          this.logger.logError(`Server process exited with code ${code} before initialization`);
          reject(new Error(`Server process exited with code ${code} before initialization`));
        }
      });

      const checkInterval = setInterval(() => {
        if (startupError) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          this.logger.logError(`Server startup error: ${startupError.message}`);
          reject(startupError);
        } else if (this.initialized && currentProcess && !currentProcess.killed) { // Use class property
          resolved = true;
          clearTimeout(timeout);
          clearInterval(checkInterval);
          this.logger.log('Server initialized successfully, connection established');
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
      this.logger.log('Stopping server process');
      try {
        this.serverProcess.kill();
      } catch (error) {
        this.logger.logError(`Error stopping server process: ${error}`);
      }
      this.serverProcess = undefined;
    }
  }

  async showVersionPicker(context: vscode.ExtensionContext): Promise<void> {
    try {
      const versions = await VersionManager.getAllGithubReleases();

      this.logger.log(`Fetched ${versions.length} versions from GitHub`);

      const installedVersions = await VersionManager.loadVersionsData(context.extensionPath);

      // Create a map to easily check if a version is installed
      const installedVersionMap = new Map<string, boolean>();
      for (const version of installedVersions) {
        if (version.installedPath && fs.existsSync(version.installedPath)) {
          installedVersionMap.set(version.version, true);
        }
      }

      const quickPickItems: vscode.QuickPickItem[] = [
        { label: 'latest', description: 'Always use the latest version' }
      ];

      for (const version of versions) {
        const date = new Date(version.publishedAt);
        const formattedDate = date.toLocaleDateString();

        const isInstalled = installedVersionMap.has(version.version);

        quickPickItems.push({
          label: version.version,
          description: `Released on ${formattedDate}${isInstalled ? ' (installed)' : ''}`
        });
      }

      const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a server version',
        title: 'NPL Language Server Version'
      });

      if (selectedItem) {
        this.logger.log(`Selected version: ${selectedItem.label}`);

        const config = vscode.workspace.getConfiguration('NPL');
        await config.update('server.version', selectedItem.label, vscode.ConfigurationTarget.Global);

        if (selectedItem.label === 'latest') {
          const latestRelease = await VersionManager.getLatestGithubRelease();
          if (latestRelease) {
            if (installedVersionMap.has(latestRelease.version)) {
              const message = `Latest version (${latestRelease.version}) is set as active.`;
              this.logger.log(message);
              vscode.window.showInformationMessage(
                message,
                'Reload Now'
              ).then(selection => {
                if (selection === 'Reload Now') {
                  vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
              });
              return;
            }
          }
        }
        else if (installedVersionMap.has(selectedItem.label)) {
          const message = `Version ${selectedItem.label} is set as active.`;
          this.logger.log(message);
          vscode.window.showInformationMessage(
            message,
            'Reload Now'
          ).then(selection => {
            if (selection === 'Reload Now') {
              vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          });
          return;
        }

        // If we got here, the selected version needs to be downloaded
        // Ask if user wants to download this version now
        const downloadNow = await vscode.window.showInformationMessage(
          `Version set to ${selectedItem.label}. Would you like to download it now?`,
          'Yes', 'No'
        );

        if (downloadNow === 'Yes') {
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'NPL Language Server',
            cancellable: false
          }, async (progress) => {
            const progressCallback: ProgressCallback = (info) => {
              if (info.message) {
                progress.report({ message: info.message, increment: info.increment });
              }
            };

            try {
              await BinaryManager.downloadServerBinary(
                context.extensionPath,
                progressCallback,
                selectedItem.label === 'latest' ? undefined : selectedItem.label
              );

              vscode.window.showInformationMessage(
                `Successfully downloaded version ${selectedItem.label}. Please reload window to use the new version.`,
                'Reload Now'
              ).then(selection => {
                if (selection === 'Reload Now') {
                  vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
              });
            } catch (error) {
              this.logger.logError('Failed to download version', error);
              vscode.window.showErrorMessage(`Failed to download version: ${error instanceof Error ? error.message : String(error)}`);
            }
          });
        }
      }
    } catch (error) {
      this.logger.logError('Failed to show version picker', error);
      vscode.window.showErrorMessage(`Failed to show version picker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async cleanServerFiles(context: vscode.ExtensionContext): Promise<void> {
    try {
      const result = await vscode.window.showWarningMessage(
        'Are you sure you want to clean all server files? This will remove all downloaded language server binaries.',
        { modal: true },
        'Yes', 'No'
      );

      if (result === 'Yes') {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Cleaning server files',
          cancellable: false
        }, async (progress) => {
          try {
            progress.report({ message: 'Cleaning server files...' });

            await BinaryManager.cleanUnusedBinaries(context.extensionPath);

            const versions = await VersionManager.loadVersionsData(context.extensionPath);
            for (const version of versions) {
              if (version.installedPath) {
                await BinaryManager.deleteFileIfExists(version.installedPath);
              }
            }

            // Reset versions file
            await VersionManager.saveVersionsData(context.extensionPath, []);

            const binDir = VersionManager.getBinDirectory(context.extensionPath);
            this.logger.log(`Cleaned server files in ${binDir}`);

            vscode.window.showInformationMessage(
              'Successfully cleaned all server files. The next time you open an NPL file, the server will be downloaded again.',
              'Reload Now'
            ).then(selection => {
              if (selection === 'Reload Now') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
              }
            });
          } catch (error) {
            this.logger.logError('Failed to clean server files', error);
            vscode.window.showErrorMessage(`Failed to clean server files: ${error instanceof Error ? error.message : String(error)}`);
          }
        });
      }
    } catch (error) {
      this.logger.logError('Error in cleanServerFiles', error);
      vscode.window.showErrorMessage(`Error cleaning server files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
