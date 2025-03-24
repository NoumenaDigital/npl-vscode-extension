import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import * as vscode from 'vscode';

export interface DownloadProgress {
  message?: string;
  increment?: number;
  total?: number;
  current?: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export interface ServerVersion {
  version: string;
  downloadUrl: string;
  installedPath?: string;
  releaseDate?: string;
}

export class FileUtils {
  private static readonly VERSIONS_FILE = 'server-versions.json';

  static async validateServerBinary(serverPath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(serverPath);
      const isExecutable = (stats.mode & fs.constants.S_IXUSR) !== 0;

      if (!isExecutable) {
        await fs.promises.chmod(serverPath, '755');
      }
    } catch (err) {
      throw new Error(`Server binary not found or inaccessible at ${serverPath}`);
    }
  }

  static getBinDirectory(extensionPath: string): string {
    return path.join(extensionPath, 'bin');
  }

  static getVersionsFilePath(extensionPath: string): string {
    return path.join(this.getBinDirectory(extensionPath), this.VERSIONS_FILE);
  }

  static getServerPath(extensionPath: string, version?: string): string {
    const binDir = this.getBinDirectory(extensionPath);
    const binaryName = this.getServerBinaryName();

    if (version && version !== 'latest') {
      // When a specific version is requested, use the versioned binary name
      return path.join(binDir, `${binaryName}-${version}`);
    }

    // For 'latest' or unspecified, check if there's a non-versioned binary
    const defaultPath = path.join(binDir, binaryName);
    if (fs.existsSync(defaultPath)) {
      return defaultPath;
    }

    // If no default binary exists, try to find the latest installed version
    try {
      const versions = this.loadVersionsDataSync(extensionPath);
      if (versions.length > 0) {
        // Find the latest installed version by date
        const latestVersion = versions
          .filter(v => v.installedPath && fs.existsSync(v.installedPath))
          .sort((a, b) => {
            // Sort by release date if available, otherwise by version string
            if (a.releaseDate && b.releaseDate) {
              return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
            }
            return b.version.localeCompare(a.version);
          })[0];

        if (latestVersion?.installedPath) {
          return latestVersion.installedPath;
        }
      }
    } catch (error) {
      // Fall back to default path if there's an error
      console.error('Error finding latest installed version:', error);
    }

    // Fall back to the default path if no versioned binary is found
    return defaultPath;
  }

  static getServerBinaryName(): string {
    const platform = os.platform();
    const arch = os.arch();

    let binaryName = 'language-server';

    if (platform === 'linux') {
      if (arch === 'arm64') {
        binaryName = 'language-server-linux-aarch64';
      } else if (arch === 'x64') {
        binaryName = 'language-server-linux-x86_64';
      }
    } else if (platform === 'darwin') {
      if (arch === 'arm64') {
        binaryName = 'language-server-macos-aarch64';
      } else if (arch === 'x64') {
        binaryName = 'language-server-macos-x86_64';
      }
    } else if (platform === 'win32') {
      binaryName = 'language-server-windows-x86_64.exe';
    }

    return binaryName;
  }

  static getServerDownloadBaseUrl(version?: string): string {
    const repo = this.getGitHubRepo();

    if (version && version !== 'latest') {
      // For specific versions
      return `https://github.com/${repo}/releases/download/${version}`;
    } else {
      // For latest version
      return `https://github.com/${repo}/releases/latest/download`;
    }
  }

  static getGitHubRepo(): string {
    return 'NoumenaDigital/npl-language-server';
  }

  static getSelectedVersion(): string {
    if (process.env.NPL_SERVER_VERSION) {
      return process.env.NPL_SERVER_VERSION;
    }

    try {
      const config = vscode.workspace.getConfiguration('NPL');
      const version = config.get<string>('server.version');
      if (version) {
        return version;
      }
    } catch (e) {
      // Ignore errors
    }

    return 'latest';
  }

  static shouldAutoUpdate(): boolean {
    if (process.env.NPL_SERVER_AUTO_UPDATE === 'false') {
      return false;
    }

    try {
      const config = vscode.workspace.getConfiguration('NPL');
      const autoUpdate = config.get<boolean>('server.autoUpdate');
      return autoUpdate !== false; // Default to true
    } catch (e) {
      // Ignore errors
    }

    return true;
  }

  static async deleteFileIfExists(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (error) {
      // Log but continue if file deletion fails
      console.error(`Failed to delete existing file: ${error}`);
    }
  }

  static async loadVersionsData(extensionPath: string): Promise<ServerVersion[]> {
    const versionsFilePath = this.getVersionsFilePath(extensionPath);

    try {
      if (fs.existsSync(versionsFilePath)) {
        const data = await fs.promises.readFile(versionsFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`Failed to load versions data: ${error}`);
    }

    return [];
  }

  static async saveVersionsData(extensionPath: string, versions: ServerVersion[]): Promise<void> {
    const versionsFilePath = this.getVersionsFilePath(extensionPath);

    try {
      const binDir = this.getBinDirectory(extensionPath);
      if (!fs.existsSync(binDir)) {
        await fs.promises.mkdir(binDir, { recursive: true });
      }

      await fs.promises.writeFile(versionsFilePath, JSON.stringify(versions, null, 2), 'utf8');
    } catch (error) {
      console.error(`Failed to save versions data: ${error}`);
    }
  }

  static async addVersionToRecord(
      extensionPath: string,
      version: string,
      releaseDate?: string
  ): Promise<void> {
    const versions = await this.loadVersionsData(extensionPath);
    const binaryName = this.getServerBinaryName();
    const serverPath = this.getServerPath(extensionPath, version);

    // Check if version already exists
    const existingVersionIndex = versions.findIndex(v => v.version === version);

    if (existingVersionIndex >= 0) {
      // Update existing record
      versions[existingVersionIndex].installedPath = serverPath;
      if (releaseDate) {
        versions[existingVersionIndex].releaseDate = releaseDate;
      }
    } else {
      // Add new version
      versions.push({
        version,
        downloadUrl: `${this.getServerDownloadBaseUrl(version)}/${binaryName}`,
        installedPath: serverPath,
        releaseDate: releaseDate || new Date().toISOString()
      });
    }

    await this.saveVersionsData(extensionPath, versions);
  }

  static async getLatestGithubRelease(): Promise<{version: string, publishedAt: string} | null> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.getGitHubRepo()}/releases/latest`,
        headers: {
          'User-Agent': 'NPL-VSCode-Extension',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.get(options, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          if (res.headers.location) {
            // Follow redirect
            https.get(res.headers.location, (redirectRes) => {
              let data = '';

              redirectRes.on('data', (chunk) => {
                data += chunk;
              });

              redirectRes.on('end', () => {
                try {
                  const release = JSON.parse(data);
                  if (release.tag_name) {
                    resolve({
                      version: release.tag_name,
                      publishedAt: release.published_at
                    });
                  } else {
                    resolve(null);
                  }
                } catch (e) {
                  reject(e);
                }
              });
            }).on('error', reject);
            return;
          }
        }

        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }

        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const release = JSON.parse(data);
            if (release.tag_name) {
              resolve({
                version: release.tag_name,
                publishedAt: release.published_at
              });
            } else {
              resolve(null);
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', (e) => {
        resolve(null); // Don't reject, just return null on error
      });

      req.end();
    });
  }

  static async checkForUpdates(extensionPath: string): Promise<{hasUpdate: boolean, latestVersion: string | null}> {
    try {
      const latestRelease = await this.getLatestGithubRelease();
      if (!latestRelease) {
        console.log('No latest release information found');
        return { hasUpdate: false, latestVersion: null };
      }

      const versions = await this.loadVersionsData(extensionPath);
      const latestVersion = latestRelease.version;

      console.log(`Latest version from GitHub: ${latestVersion}`);
      console.log(`Local versions: ${versions.map(v => v.version).join(', ') || 'none'}`);

      // Check if we already have this version
      const hasVersion = versions.some(v => {
        const exists = v.version === latestVersion && v.installedPath && fs.existsSync(v.installedPath);
        console.log(`Version ${v.version}: installed at ${v.installedPath || 'unknown'}, exists: ${exists}`);
        return exists;
      });

      console.log(`Has latest version installed: ${hasVersion}`);

      return {
        hasUpdate: !hasVersion,
        latestVersion
      };
    } catch (error) {
      console.error(`Error checking for updates: ${error}`);
      return { hasUpdate: false, latestVersion: null };
    }
  }

  static async downloadServerBinary(
      extensionPath: string,
      progressCallback?: ProgressCallback,
      version?: string
  ): Promise<string> {
    const binDir = this.getBinDirectory(extensionPath);
    if (!fs.existsSync(binDir)) {
      await fs.promises.mkdir(binDir, { recursive: true });
    }

    // Determine which version to download
    const requestedVersion = version || this.getSelectedVersion();
    let targetVersion = requestedVersion;
    let releaseInfo = null;

    if (requestedVersion === 'latest') {
      // Get latest release information from GitHub
      releaseInfo = await this.getLatestGithubRelease();
      if (releaseInfo) {
        console.log(`Latest GitHub release: ${releaseInfo.version}`);
        targetVersion = releaseInfo.version;
      }
    }

    // Check if we already have this version cached
    const versions = await this.loadVersionsData(extensionPath);
    const existingVersion = versions.find(v => v.version === targetVersion);

    if (existingVersion && existingVersion.installedPath && fs.existsSync(existingVersion.installedPath)) {
      console.log(`Using existing binary for version ${targetVersion}: ${existingVersion.installedPath}`);
      return existingVersion.installedPath;
    }

    const binaryName = this.getServerBinaryName();
    const serverPath = this.getServerPath(extensionPath, targetVersion);

    // If we're redownloading, clean up the old binary first
    if (fs.existsSync(serverPath)) {
      if (progressCallback) {
        progressCallback({
          message: `Removing existing binary...`
        });
      }
      console.log(`Removing existing binary at ${serverPath}`);
      await this.deleteFileIfExists(serverPath);
    }

    if (progressCallback) {
      progressCallback({
        message: `Downloading ${binaryName} (${targetVersion})...`
      });
    }

    // Determine download URL
    const baseUrl = this.getServerDownloadBaseUrl(targetVersion);
    const serverUrl = `${baseUrl}/${binaryName}`;

    console.log(`Downloading from URL: ${serverUrl}`);

    // Add a temporary download path to avoid issues with partially downloaded files
    const tempDownloadPath = `${serverPath}.download`;
    await this.deleteFileIfExists(tempDownloadPath);

    await this.downloadFile(serverUrl, tempDownloadPath, progressCallback);

    if (progressCallback) {
      progressCallback({
        message: `Making ${binaryName} executable...`
      });
    }

    // Make the temporary binary executable
    if (os.platform() !== 'win32') {
      await fs.promises.chmod(tempDownloadPath, '755');
    }

    // Move the temporary file to the final location
    await fs.promises.rename(tempDownloadPath, serverPath);
    console.log(`Binary saved to ${serverPath}`);

    // Record this version
    await this.addVersionToRecord(
        extensionPath,
        targetVersion,
        releaseInfo?.publishedAt
    );

    return serverPath;
  }

  private static downloadFile(
      url: string,
      destination: string,
      progressCallback?: ProgressCallback
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const request = protocol.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirects
          if (response.headers.location) {
            if (progressCallback) {
              progressCallback({ message: 'Following redirect...' });
            }
            return this.downloadFile(response.headers.location, destination, progressCallback)
                .then(resolve)
                .catch(reject);
          }
          return reject(new Error(`Redirect with no location header: ${response.statusCode}`));
        }

        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to download file, status code: ${response.statusCode}`));
        }

        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        if (progressCallback && contentLength > 0) {
          progressCallback({
            message: 'Starting download...',
            total: contentLength,
            current: 0
          });
        }

        const file = fs.createWriteStream(destination);

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;

          if (progressCallback && contentLength > 0) {
            const percent = Math.round((downloadedBytes / contentLength) * 100);
            progressCallback({
              message: `Downloading... ${percent}%`,
              current: downloadedBytes,
              total: contentLength,
              increment: (chunk.length / contentLength) * 100
            });
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          if (progressCallback) {
            progressCallback({
              message: 'Download complete',
              current: contentLength,
              total: contentLength
            });
          }
          resolve();
        });

        file.on('error', (err) => {
          file.close();
          fs.unlink(destination, () => {});
          reject(err);
        });
      });

      request.on('error', (err) => {
        fs.unlink(destination, () => {});
        reject(err);
      });

      request.end();
    });
  }

  // Sync version of loadVersionsData for use in getServerPath
  static loadVersionsDataSync(extensionPath: string): ServerVersion[] {
    const versionsFilePath = this.getVersionsFilePath(extensionPath);

    try {
      if (fs.existsSync(versionsFilePath)) {
        const data = fs.readFileSync(versionsFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`Failed to load versions data: ${error}`);
    }

    return [];
  }
}
