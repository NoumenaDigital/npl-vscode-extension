import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
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
      // Get all files in the bin directory
      const files = await fs.promises.readdir(binDir);

      for (const file of files) {
        const fullPath = path.join(binDir, file);

        // Skip version data file
        if (file === VersionManager.VERSIONS_FILE) {
          continue;
        }

        // Skip if it's a directory
        const stats = await fs.promises.stat(fullPath);
        if (stats.isDirectory()) {
          continue;
        }

        // Check if this binary is in our versions list
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

      // Determine the binary name for the current platform
      const binaryName = VersionManager.getServerBinaryName();

      if (progressCallback) {
        progressCallback({
          message: `Determined binary for platform: ${binaryName}`,
          increment: 10
        });
      }

      // Determine the download URL and local server path
      const downloadUrl = `${VersionManager.getServerDownloadBaseUrl(targetVersion)}/${binaryName}`;
      const serverPath = VersionManager.getServerPath(extensionPath, targetVersion);

      if (progressCallback) {
        progressCallback({
          message: 'Starting download...',
          increment: 5
        });
      }

      // Create the containing directory if it doesn't exist
      const serverDir = path.dirname(serverPath);
      if (!fs.existsSync(serverDir)) {
        await fs.promises.mkdir(serverDir, { recursive: true });
      }

      // Delete existing file if it exists
      await this.deleteFileIfExists(serverPath);

      // Download the binary
      await DownloadManager.downloadFile(downloadUrl, serverPath, progressCallback);

      // Make it executable
      await this.validateServerBinary(serverPath);

      // Record this version in our versions database
      await VersionManager.addVersionToRecord(extensionPath, targetVersion, releaseDate);

      return serverPath;
    } catch (error) {
      console.error('Error downloading server binary:', error);
      throw new Error(`Failed to download server binary: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
