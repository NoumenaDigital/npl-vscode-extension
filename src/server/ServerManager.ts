import * as net from 'net';
import * as childProcess from 'child_process';
import { StreamInfo } from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { FileUtils, ProgressCallback } from '../utils/FileUtils';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

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

  async connectToExistingServer(): Promise<StreamInfo | null> {
    const socket = await this.connectToServer();
    if (socket) {
      this.logger.log('Connected to existing TCP server');
      return { reader: socket, writer: socket };
    }
    return null;
  }

  async checkForUpdates(context: vscode.ExtensionContext): Promise<boolean> {
    if (!FileUtils.shouldAutoUpdate()) {
      this.logger.log('Auto-update is disabled, skipping update check');
      return false;
    }

    try {
      this.logger.log('Checking for language server updates...');
      const updateInfo = await FileUtils.checkForUpdates(context.extensionPath);

      if (updateInfo.hasUpdate && updateInfo.latestVersion) {
        this.logger.log(`New version available: ${updateInfo.latestVersion}`);

        // Ask user if they want to update
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
              await FileUtils.downloadServerBinary(
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
    // First try to connect to an existing server
    const existingConnection = await this.connectToExistingServer();
    if (existingConnection) {
      // We have an existing connection, check for updates in the background
      this.checkForUpdates(context).catch(err => {
        this.logger.logError('Error checking for updates in background', err);
      });
      return existingConnection;
    }

    // No existing server, check if we have any binary version installed
    try {
      // Check versions.json to see if any binaries exist
      const versions = await FileUtils.loadVersionsData(context.extensionPath);
      this.logger.log(`Found ${versions.length} version(s) in versions.json`);

      for (const v of versions) {
        this.logger.log(`Version: ${v.version}, Path: ${v.installedPath}, Exists: ${v.installedPath ? fs.existsSync(v.installedPath) : false}`);
      }

      const anyBinaryExists = versions.length > 0 && versions.some(v =>
        v.installedPath && fs.existsSync(v.installedPath)
      );

      if (anyBinaryExists) {
        this.logger.log('Found existing binary versions');
        // Binary exists, check for updates and ask user before downloading
        let updated = false;
        if (FileUtils.shouldAutoUpdate()) {
          this.logger.log('Auto-update is enabled, checking for updates...');
          updated = await this.checkForUpdates(context);
          this.logger.log(`Update check completed, updated: ${updated}`);
        } else {
          this.logger.log('Auto-update is disabled, skipping update check');
        }

        // Start the server using the existing binary - DO NOT trigger a download here
        return await this.startServerWithExistingBinary(context);
      } else {
        // No binary exists, automatically download without asking
        this.logger.log('No language server binary found, downloading automatically...');
        return await this.startServerWithDownload(context);
      }
    } catch (error) {
      this.logger.logError('Error in server initialization', error);
      throw error;
    }
  }

  // This version will download if necessary
  async startServerWithDownload(context: vscode.ExtensionContext): Promise<StreamInfo> {
    try {
      // Download or get cached server binary with progress notification
      const serverPath = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'NPL Language Server',
        cancellable: false
      }, async (progress) => {
        const progressCallback: ProgressCallback = (info) => {
          if (info.message) {
            progress.report({ message: info.message, increment: info.increment });
          }
        };

        // Get the selected version or use 'latest'
        const selectedVersion = FileUtils.getSelectedVersion();
        this.logger.log(`Using server version: ${selectedVersion}`);

        return await FileUtils.downloadServerBinary(
            context.extensionPath,
            progressCallback,
            selectedVersion
        );
      });

      this.logger.log(`Using server binary at: ${serverPath}`);
      await FileUtils.validateServerBinary(serverPath);

      this.logger.log(`Starting server process: ${serverPath}`);
      return this.spawnServerProcess(serverPath);
    } catch (error) {
      this.logger.logError('Failed to download or start server binary', error);
      throw error;
    }
  }

  // This version will use an existing binary without triggering a download
  async startServerWithExistingBinary(context: vscode.ExtensionContext): Promise<StreamInfo> {
    try {
      // Find the most recent installed version
      const versions = await FileUtils.loadVersionsData(context.extensionPath);
      const latestInstalled = versions
        .filter(v => v.installedPath && fs.existsSync(v.installedPath))
        .sort((a, b) => {
          if (a.releaseDate && b.releaseDate) {
            return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
          }
          return b.version.localeCompare(a.version);
        })[0];

      if (!latestInstalled || !latestInstalled.installedPath) {
        throw new Error('No installed binary found');
      }

      const serverPath = latestInstalled.installedPath;
      this.logger.log(`Using existing server binary at: ${serverPath} (version ${latestInstalled.version})`);

      await FileUtils.validateServerBinary(serverPath);
      this.logger.log(`Starting server process: ${serverPath}`);
      return this.spawnServerProcess(serverPath);
    } catch (error) {
      this.logger.logError('Failed to start server with existing binary', error);
      // Fall back to download if using existing binary fails
      this.logger.log('Falling back to download');
      return this.startServerWithDownload(context);
    }
  }

  // Original startServer method is deprecated, use startServerWithDownload or startServerWithExistingBinary
  async startServer(context: vscode.ExtensionContext): Promise<StreamInfo> {
    this.logger.log('WARNING: Using deprecated startServer method, please update code to use startServerWithDownload');
    return this.startServerWithDownload(context);
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

  // Add this new method for the version picker
  async showVersionPicker(context: vscode.ExtensionContext): Promise<void> {
    try {
      // Show progress while fetching versions
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'NPL Language Server',
        cancellable: false
      }, async (progress) => {
        progress.report({ message: 'Fetching available versions...' });
      });

      // Show the quick pick outside of the progress indicator
      const allReleases = await this.getAllGithubReleases();
      const installedVersions = await FileUtils.loadVersionsData(context.extensionPath);
      const latestRelease = await FileUtils.getLatestGithubRelease();

      if (!allReleases || allReleases.length === 0) {
        vscode.window.showErrorMessage('Failed to fetch versions from GitHub');
        return;
      }

      // Create QuickPick items
      const items = allReleases.map(release => {
        const isLatest = latestRelease && latestRelease.version === release.version;
        const isInstalled = installedVersions.some(v =>
          v.version === release.version && v.installedPath && fs.existsSync(v.installedPath)
        );

        return {
          label: `${release.version}${isLatest ? ' (latest)' : ''}`,
          description: isInstalled ? '✓ Installed' : '',
          detail: `Released: ${new Date(release.publishedAt).toLocaleDateString()}`,
          version: release.version,
          isInstalled
        };
      });

      // Add "latest" option at the top
      items.unshift({
        label: 'latest',
        description: 'Always use the latest version',
        detail: 'The extension will automatically use the most recent version',
        version: 'latest',
        isInstalled: true // Consider latest as always "installed" since it's a special case
      });

      // Show quick pick
      const selectedItem = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select NPL Language Server Version',
        ignoreFocusOut: true
      });

      if (selectedItem) {
        // Save the selected version in settings
        await vscode.workspace.getConfiguration('NPL').update(
          'server.version',
          selectedItem.version,
          vscode.ConfigurationTarget.Global
        );

        // If not installed, download it first
        if (!selectedItem.isInstalled && selectedItem.version !== 'latest') {
          const shouldDownload = await vscode.window.showInformationMessage(
            `Version ${selectedItem.version} is not installed yet. Download it now?`,
            'Download', 'Cancel'
          );

          if (shouldDownload === 'Download') {
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
                await FileUtils.downloadServerBinary(
                  context.extensionPath,
                  progressCallback,
                  selectedItem.version
                );

                vscode.window.showInformationMessage(
                  `Successfully downloaded version ${selectedItem.version}. Restart window to use it.`,
                  'Restart Now'
                ).then(selection => {
                  if (selection === 'Restart Now') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                  }
                });
              } catch (error) {
                this.logger.logError('Failed to download version', error);
                vscode.window.showErrorMessage(`Failed to download version: ${error instanceof Error ? error.message : String(error)}`);
              }
            });
            return;
          }
        } else {
          vscode.window.showInformationMessage(
            `Version set to ${selectedItem.label}. Restart window to apply.`,
            'Restart Now'
          ).then(selection => {
            if (selection === 'Restart Now') {
              vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          });
        }
      }
    } catch (error) {
      this.logger.logError('Error showing version picker', error);
      vscode.window.showErrorMessage(`Failed to show version picker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Helper method to get all GitHub releases
  private async getAllGithubReleases(): Promise<Array<{version: string, publishedAt: string}>> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${FileUtils.getGitHubRepo()}/releases`,
        headers: {
          'User-Agent': 'NPL-VSCode-Extension',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.get(options, (res) => {
        if (res.statusCode !== 200) {
          resolve([]);
          return;
        }

        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            if (Array.isArray(releases)) {
              const mapped = releases.map(release => ({
                version: release.tag_name,
                publishedAt: release.published_at
              }));
              resolve(mapped);
            } else {
              resolve([]);
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', (e) => {
        resolve([]); // Don't reject, just return empty array on error
      });

      req.end();
    });
  }

  // Clean all server files and configurations
  async cleanServerFiles(context: vscode.ExtensionContext): Promise<void> {
    try {
      // Show confirmation dialog
      const confirm = await vscode.window.showWarningMessage(
        'This will delete all downloaded language server binaries and reset configurations. Continue?',
        { modal: true },
        'Yes, Clean Everything', 'Cancel'
      );

      if (confirm !== 'Yes, Clean Everything') {
        return;
      }

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Cleaning NPL Language Server Files',
        cancellable: false
      }, async (progress) => {
        // Step 1: Load version data to know what to clean
        progress.report({ message: 'Finding files to clean...' });
        const binDir = FileUtils.getBinDirectory(context.extensionPath);
        const versionsFile = FileUtils.getVersionsFilePath(context.extensionPath);
        const versions = await FileUtils.loadVersionsData(context.extensionPath);

        // Step 2: Delete each binary
        let deletedCount = 0;
        if (versions.length > 0) {
          progress.report({ message: `Deleting ${versions.length} server binaries...` });

          for (const version of versions) {
            if (version.installedPath && fs.existsSync(version.installedPath)) {
              this.logger.log(`Deleting binary: ${version.installedPath}`);
              await FileUtils.deleteFileIfExists(version.installedPath);
              deletedCount++;
            }
          }
        }

        // Step 3: Delete versions file
        if (fs.existsSync(versionsFile)) {
          progress.report({ message: 'Deleting versions database...' });
          await FileUtils.deleteFileIfExists(versionsFile);
        }

        // Step 4: Delete any other files in bin directory
        if (fs.existsSync(binDir)) {
          progress.report({ message: 'Checking for other files...' });
          const files = fs.readdirSync(binDir);
          for (const file of files) {
            const filePath = path.join(binDir, file);
            if (fs.statSync(filePath).isFile()) {
              this.logger.log(`Deleting additional file: ${filePath}`);
              await FileUtils.deleteFileIfExists(filePath);
              deletedCount++;
            }
          }

          // Try to remove the bin directory if empty
          const remainingFiles = fs.readdirSync(binDir);
          if (remainingFiles.length === 0) {
            try {
              fs.rmdirSync(binDir);
            } catch (e) {
              // Non-critical if this fails
              this.logger.log(`Could not remove bin directory: ${e}`);
            }
          }
        }

        // Step 5: Reset version setting to 'latest'
        progress.report({ message: 'Resetting version settings...' });
        await vscode.workspace.getConfiguration('NPL').update(
          'server.version',
          'latest',
          vscode.ConfigurationTarget.Global
        );

        progress.report({ message: `Clean complete! ${deletedCount} files removed.` });
      });

      // Final notification
      const restart = await vscode.window.showInformationMessage(
        'All NPL Language Server files have been cleaned. It is recommended to restart VS Code.',
        'Restart Now', 'Later'
      );

      if (restart === 'Restart Now') {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (error) {
      this.logger.logError('Error cleaning server files', error);
      vscode.window.showErrorMessage(`Failed to clean server files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
