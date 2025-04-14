import * as fs from 'fs';
import * as https from 'https';
import { IncomingMessage, ClientRequest } from 'http';
import * as path from 'path';
import { ILogger } from '../../utils/Logger';

export interface DownloadProgress {
  message?: string;
  increment?: number;
  total?: number;
  current?: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export interface IFileSystem {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: fs.MakeDirectoryOptions): void;
  createWriteStream(path: string): fs.WriteStream;
  unlink(path: string, callback: (err: NodeJS.ErrnoException | null) => void): void;
}

export interface IHttpClient {
  get(url: string, callback: (response: IncomingMessage) => void): ClientRequest;
}

export class DownloadManager {
  constructor(
    private readonly fs: IFileSystem,
    private readonly https: IHttpClient,
    private readonly logger?: ILogger
  ) {}

  async downloadFile(
    url: string,
    destination: string,
    progressCallback?: ProgressCallback
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const dir = path.dirname(destination);
      if (!this.fs.existsSync(dir)) {
        this.fs.mkdirSync(dir, { recursive: true });
      }

      const writeStream = this.fs.createWriteStream(destination);

      const req = this.https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirects
          if (response.headers.location) {
            writeStream.close();
            this.fs.unlink(destination, () => {
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

        response.pipe(writeStream);

        response.on('data', (chunk: Buffer) => {
          downloadedSize += chunk.length;

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

        writeStream.on('finish', () => {
          writeStream.close();
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

      req.on('error', (err: Error) => {
        this.logger?.logError(`Download error: ${err.message}`, err) || console.error(`Download error: ${err.message}`, err);
        writeStream.close();
        this.fs.unlink(destination, () => {});
        reject(err);
      });

      writeStream.on('error', (err: Error) => {
        this.logger?.logError(`File write error: ${err.message}`, err) || console.error(`File write error: ${err.message}`, err);
        this.fs.unlink(destination, () => {});
        reject(err);
      });
    });
  }
}

export class DownloadManagerFactory {
  // Static reference to the logger that will be shared
  private static _logger: ILogger | undefined;

  /**
   * Sets the logger for all download managers
   */
  static setLogger(logger: ILogger): void {
    this._logger = logger;
  }

  static create(): DownloadManager {
    return new DownloadManager(
      {
        existsSync: fs.existsSync,
        mkdirSync: fs.mkdirSync,
        createWriteStream: (path: string) => fs.createWriteStream(path),
        unlink: fs.unlink
      },
      https,
      this._logger
    );
  }
}
