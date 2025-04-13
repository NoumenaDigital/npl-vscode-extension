import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { Logger } from '../utils/Logger';

export class ZipProducer {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Creates a zip file from the source directory
   * @param sourcePath The path to the directory to zip
   * @param projectPath The root project path to validate source is within project
   * @returns A buffer containing the zip contents
   */
  public async produceZip(sourcePath: string, projectPath?: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Validate source path
      if (!sourcePath) {
        return reject(new Error('Source path is empty'));
      }

      if (!fs.existsSync(sourcePath)) {
        return reject(new Error(`Path ${sourcePath} does not exist`));
      }

      const sourcePathStat = fs.statSync(sourcePath);
      if (!sourcePathStat.isDirectory()) {
        return reject(new Error(`Path ${sourcePath} is not a directory`));
      }

      try {
        fs.accessSync(sourcePath, fs.constants.R_OK);
      } catch (error) {
        return reject(new Error(`Path ${sourcePath} is not readable`));
      }

      // Check if source is within project if projectPath is provided
      if (projectPath && !sourcePath.startsWith(projectPath)) {
        return reject(new Error(`Path ${sourcePath} is not in project ${projectPath}`));
      }

      // Create the zip
      const chunks: Buffer[] = [];
      const archive = archiver('zip', {
        zlib: { level: 9 } // Best compression
      });

      // Capture chunks as they're generated
      archive.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk));
      });

      // Check for warnings
      archive.on('warning', (err: Error & { code?: string }) => {
        if (err.code === 'ENOENT') {
          if (this.logger.logWarning) {
            this.logger.logWarning(`Warning while zipping: ${err.message}`);
          } else {
            console.warn(`Warning while zipping: ${err.message}`);
          }
        } else {
          reject(err);
        }
      });

      // Reject on error
      archive.on('error', (err: Error) => {
        reject(err);
      });

      // Resolve with the complete buffer when the archive is finalized
      archive.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });

      // Add the directory and finalize
      archive.directory(sourcePath, false);
      archive.finalize();
    });
  }
}
