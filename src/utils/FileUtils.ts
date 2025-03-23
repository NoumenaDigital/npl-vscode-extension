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

export class FileUtils {
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

  static getServerPath(extensionPath: string): string {
    const binDir = path.join(extensionPath, 'bin');
    const binaryName = this.getServerBinaryName();
    return path.join(binDir, binaryName);
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

  static getServerDownloadBaseUrl(): string {
    // First check environment variable
    if (process.env.NPL_SERVER_DOWNLOAD_URL) {
      return process.env.NPL_SERVER_DOWNLOAD_URL;
    }
    
    // Then try VSCode configuration
    try {
      const config = vscode.workspace.getConfiguration('NPL-dev');
      const baseUrl = config.get<string>('server.downloadBaseURL');
      if (baseUrl) {
        return baseUrl;
      }
    } catch (e) {
      // Ignore errors, fall back to default
    }
    
    // Default to localhost:8000 for testing
    return 'http://localhost:8000';
  }

  static shouldForceDownload(): boolean {
    // First check environment variable
    if (process.env.NPL_SERVER_FORCE_DOWNLOAD === 'true') {
      return true;
    }
    
    // Then try VSCode configuration
    try {
      const config = vscode.workspace.getConfiguration('NPL-dev');
      return config.get<boolean>('server.forceDownload') === true;
    } catch (e) {
      // Ignore errors, fall back to default
    }
    
    return false;
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

  static async downloadServerBinary(
    extensionPath: string, 
    progressCallback?: ProgressCallback
  ): Promise<string> {
    const binDir = path.join(extensionPath, 'bin');
    if (!fs.existsSync(binDir)) {
      await fs.promises.mkdir(binDir, { recursive: true });
    }

    const binaryName = this.getServerBinaryName();
    const serverPath = path.join(binDir, binaryName);
    
    // Skip download if the binary already exists unless force download is enabled
    if (fs.existsSync(serverPath) && !this.shouldForceDownload()) {
      return serverPath;
    }

    // If we're redownloading, clean up the old binary first
    if (fs.existsSync(serverPath)) {
      if (progressCallback) {
        progressCallback({ 
          message: `Removing existing binary...` 
        });
      }
      await this.deleteFileIfExists(serverPath);
    }

    if (progressCallback) {
      progressCallback({ 
        message: `Downloading ${binaryName}...` 
      });
    }

    const baseUrl = this.getServerDownloadBaseUrl();
    const serverUrl = `${baseUrl}/${binaryName}`;
    
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
}
