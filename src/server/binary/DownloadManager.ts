import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';

export interface DownloadProgress {
  message?: string;
  increment?: number;
  total?: number;
  current?: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export class DownloadManager {
  static async downloadFile(
    url: string,
    destination: string,
    progressCallback?: ProgressCallback
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Ensure the directory exists
      const dir = path.dirname(destination);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const file = fs.createWriteStream(destination);
      const protocol = url.startsWith('https') ? https : http;

      const req = protocol.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirects
          if (response.headers.location) {
            file.close();
            fs.unlink(destination, () => {
              this.downloadFile(response.headers.location!, destination, progressCallback)
                .then(resolve)
                .catch(reject);
            });
            return;
          }
          reject(new Error(`Redirect with no location header from ${url}`));
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download, status code: ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedSize = 0;
        let lastProgressReport = 0;

        if (progressCallback) {
          progressCallback({
            message: 'Download started...',
            current: 0,
            total: totalSize,
            increment: 0
          });
        }

        response.pipe(file);

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;

          // Report progress, but not too frequently
          if (progressCallback && totalSize > 0) {
            const currentProgress = Math.floor((downloadedSize / totalSize) * 100);

            // Only report when progress increases by at least 5%
            if (currentProgress >= lastProgressReport + 5) {
              const increment = currentProgress - lastProgressReport;
              lastProgressReport = currentProgress;

              progressCallback({
                message: `Downloading... ${currentProgress}%`,
                current: downloadedSize,
                total: totalSize,
                increment
              });
            }
          }
        });

        file.on('finish', () => {
          file.close();
          if (progressCallback) {
            progressCallback({
              message: 'Download completed',
              current: totalSize,
              total: totalSize,
              increment: 100 - lastProgressReport
            });
          }
          resolve();
        });
      });

      req.on('error', (err) => {
        fs.unlink(destination, () => {}); // Delete the file if download fails
        reject(err);
      });

      file.on('error', (err) => {
        fs.unlink(destination, () => {}); // Delete the file if writing fails
        reject(err);
      });
    });
  }
}
