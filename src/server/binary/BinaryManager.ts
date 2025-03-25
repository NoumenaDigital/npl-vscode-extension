import * as fs from 'fs';
import * as path from 'path';
import { DownloadManager, ProgressCallback } from './DownloadManager';
import { VersionManager } from './VersionManager';

export class BinaryManager {
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

  static async cleanUnusedBinaries(extensionPath: string): Promise<string[]> {
    const versions = await VersionManager.loadVersionsData(extensionPath);
    const binDir = VersionManager.getBinDirectory(extensionPath);
    const removed: string[] = [];

    try {
      const files = await fs.promises.readdir(binDir);

      for (const file of files) {
        const fullPath = path.join(binDir, file);

        if (file === VersionManager.VERSIONS_FILE) {
          continue;
        }

        const stats = await fs.promises.stat(fullPath);
        if (stats.isDirectory()) {
          continue;
        }

        const isTracked = versions.some(v => v.installedPath === fullPath);

        if (!isTracked) {
          await this.deleteFileIfExists(fullPath);
          removed.push(fullPath);
        }
      }

      return removed;
    } catch (error) {
      console.error('Error cleaning binaries:', error);
      return [];
    }
  }

  static async deleteFileIfExists(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete file: ${error}`);
    }
  }

  static async downloadServerBinary(
    extensionPath: string,
    progressCallback?: ProgressCallback,
    version?: string
  ): Promise<string> {
    try {
      // Get the appropriate version (latest or specified)
      const selectedVersion = version || VersionManager.getSelectedVersion();

      if (progressCallback) {
        progressCallback({
          message: `Preparing to download server binary (${selectedVersion})...`,
          increment: 5
        });
      }

      // If selectedVersion is 'latest', we need to resolve it to the actual latest version
      let targetVersion = selectedVersion;
      let releaseDate;

      if (targetVersion === 'latest') {
        const latestRelease = await VersionManager.getLatestGithubRelease();
        if (!latestRelease) {
          throw new Error('Failed to fetch latest version information');
        }
        targetVersion = latestRelease.version;
        releaseDate = latestRelease.publishedAt;

        if (progressCallback) {
          progressCallback({
            message: `Latest version is ${targetVersion}`,
            increment: 5
          });
        }
      }

      // Now check if we already have this specific version installed
      const versions = await VersionManager.loadVersionsData(extensionPath);
      const existingVersion = versions.find(v =>
        v.version === targetVersion &&
        v.installedPath &&
        fs.existsSync(v.installedPath)
      );

      if (existingVersion && existingVersion.installedPath) {
        if (progressCallback) {
          progressCallback({
            message: `Using existing binary version ${targetVersion}`,
            increment: 100
          });
        }
        return existingVersion.installedPath;
      }

      const binaryName = VersionManager.getServerBinaryName();

      if (progressCallback) {
        progressCallback({
          message: `Determined binary for platform: ${binaryName}`,
          increment: 10
        });
      }

      const downloadUrl = `${VersionManager.getServerDownloadBaseUrl(targetVersion)}/${binaryName}`;
      const serverPath = VersionManager.getServerPath(extensionPath, targetVersion);

      if (progressCallback) {
        progressCallback({
          message: 'Starting download...',
          increment: 5
        });
      }

      const serverDir = path.dirname(serverPath);
      if (!fs.existsSync(serverDir)) {
        await fs.promises.mkdir(serverDir, { recursive: true });
      }

      await this.deleteFileIfExists(serverPath);

      await DownloadManager.downloadFile(downloadUrl, serverPath, progressCallback);

      await this.validateServerBinary(serverPath);

      await VersionManager.addVersionToRecord(extensionPath, targetVersion, releaseDate);

      return serverPath;
    } catch (error) {
      console.error('Error downloading server binary:', error);
      throw new Error(`Failed to download server binary: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
