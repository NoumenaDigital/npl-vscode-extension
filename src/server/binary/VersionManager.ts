import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as https from 'https';
import { Logger } from '../../utils/Logger';

export interface ServerVersion {
  version: string;
  downloadUrl: string;
  installedPath?: string;
  releaseDate?: string;
}

export class VersionManager {
  static readonly VERSIONS_FILE = 'server-versions.json';
  private static _logger: Logger | undefined;

  /**
   * Sets the logger for the VersionManager
   */
  static setLogger(logger: Logger): void {
    this._logger = logger;
  }

  static getVersionsFilePath(extensionPath: string): string {
    return path.join(this.getBinDirectory(extensionPath), this.VERSIONS_FILE);
  }

  static getBinDirectory(extensionPath: string): string {
    return path.join(extensionPath, 'bin');
  }

  static async loadVersionsData(extensionPath: string): Promise<ServerVersion[]> {
    const versionsFilePath = this.getVersionsFilePath(extensionPath);

    try {
      if (fs.existsSync(versionsFilePath)) {
        const data = await fs.promises.readFile(versionsFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      this._logger?.logError('Failed to load versions data', error) || console.error(`Failed to load versions data: ${error}`);
    }

    return [];
  }

  static loadVersionsDataSync(extensionPath: string): ServerVersion[] {
    const versionsFilePath = this.getVersionsFilePath(extensionPath);

    try {
      if (fs.existsSync(versionsFilePath)) {
        const data = fs.readFileSync(versionsFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      this._logger?.logError('Failed to load versions data', error) || console.error(`Failed to load versions data: ${error}`);
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
      this._logger?.logError('Failed to save versions data', error) || console.error(`Failed to save versions data: ${error}`);
    }
  }

  static async addVersionToRecord(
    extensionPath: string,
    version: string,
    releaseDate?: string
  ): Promise<void> {
    const versions = await this.loadVersionsData(extensionPath);
    const serverPath = this.getServerPath(extensionPath, version);

    const existingVersionIndex = versions.findIndex(v => v.version === version);

    if (existingVersionIndex >= 0) {
      versions[existingVersionIndex].installedPath = serverPath;
      if (releaseDate) {
        versions[existingVersionIndex].releaseDate = releaseDate;
      }
    } else {
      versions.push({
        version,
        downloadUrl: `${this.getServerDownloadBaseUrl(version)}/${this.getServerBinaryName()}`,
        installedPath: serverPath,
        releaseDate: releaseDate || new Date().toISOString()
      });
    }

    await this.saveVersionsData(extensionPath, versions);
  }

  static getSelectedVersion(): string {
    try {
      const config = vscode.workspace.getConfiguration('NPL');
      const version = config.get<string>('server.version');
      if (version) {
        return version;
      }
    } catch (e) {
      this._logger?.logError('Error reading server version from configuration', e) || console.error('Error reading server version from configuration:', e);
    }

    return 'latest';
  }

  static getServerPath(extensionPath: string, version?: string): string {
    const binDir = this.getBinDirectory(extensionPath);
    const binaryName = this.getServerBinaryName();

    if (!version || version === 'latest') {
      const latestVersion = this.findLatestInstalledVersion(extensionPath);
      if (latestVersion?.installedPath) {
        return latestVersion.installedPath;
      }
      // Return a path that will trigger a download of the latest version
      // Note: This path is never used to save a binary, it's just a trigger
      return path.join(binDir, `${binaryName}-latest`);
    }

    return path.join(binDir, `${binaryName}-${version}`);
  }

  static findLatestInstalledVersion(extensionPath: string): ServerVersion | undefined {
    try {
      const versions = this.loadVersionsDataSync(extensionPath);
      if (versions.length > 0) {
        return versions
          .filter(v => v.installedPath && fs.existsSync(v.installedPath))
          .sort((a, b) => {
            // Sort by release date if available, otherwise by version string
            if (a.releaseDate && b.releaseDate) {
              return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
            }
            return b.version.localeCompare(a.version);
          })[0];
      }
    } catch (error) {
      this._logger?.logError('Error finding latest installed version', error) || console.error('Error finding latest installed version:', error);
    }
    return undefined;
  }

  static async getLatestGithubRelease(): Promise<{version: string, publishedAt: string} | null> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.getGitHubRepo()}/releases/latest`,
        headers: {
          'User-Agent': 'NPL-dev-vscode',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.get(options, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // Handle redirect
          if (res.headers.location) {
            https.get(res.headers.location, (redirectRes) => {
              let data = '';
              redirectRes.on('data', (chunk) => data += chunk);
              redirectRes.on('end', () => {
                try {
                  const release = JSON.parse(data);
                  resolve({
                    version: release.tag_name,
                    publishedAt: release.published_at
                  });
                } catch (err) {
                  reject(err);
                }
              });
            }).on('error', reject);
          } else {
            this._logger?.logError(`GitHub API redirect without location header. Status code: ${res.statusCode}`) ||
              console.error('GitHub API redirect without location header. Status code:', res.statusCode);
            reject(new Error('Redirect with no location header'));
          }
          return;
        }

        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const release = JSON.parse(data);
            resolve({
              version: release.tag_name,
              publishedAt: release.published_at
            });
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  static async getAllGithubReleases(): Promise<Array<{version: string, publishedAt: string}>> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.getGitHubRepo()}/releases`,
        headers: {
          'User-Agent': 'NPL-dev-vscode',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.get(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const releases = JSON.parse(data);
            const result = releases.map((release: any) => ({
              version: release.tag_name,
              publishedAt: release.published_at
            }));
            resolve(result);
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  static getGitHubRepo(): string {
    return 'NoumenaDigital/npl-language-server';
  }

  static getServerDownloadBaseUrl(version?: string): string {
    const repo = this.getGitHubRepo();
    if (version && version !== 'latest') {
      return `https://github.com/${repo}/releases/download/${version}`;
    } else {
      return `https://github.com/${repo}/releases/latest/download`;
    }
  }

  static getServerBinaryName(): string {
    const platform = process.platform;
    const arch = process.arch;

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

  static async checkForUpdates(extensionPath: string): Promise<{hasUpdate: boolean, latestVersion: string | null}> {
    try {
      const latestRelease = await this.getLatestGithubRelease();

      if (!latestRelease) {
        return { hasUpdate: false, latestVersion: null };
      }

      const versions = await this.loadVersionsData(extensionPath);

      const isInstalled = versions.some(v =>
        v.version === latestRelease.version &&
        v.installedPath &&
        fs.existsSync(v.installedPath || '')
      );

      return {
        hasUpdate: !isInstalled,
        latestVersion: latestRelease.version
      };
    } catch (error) {
      this._logger?.logError('Error checking for updates', error) || console.error('Error checking for updates:', error);
      return { hasUpdate: false, latestVersion: null };
    }
  }
}
