import * as fs from 'fs';
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

      if (projectPath && !sourcePath.startsWith(projectPath)) {
        return reject(new Error(`Path ${sourcePath} is not in project ${projectPath}`));
      }

      const chunks: Buffer[] = [];
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      archive.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk));
      });

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

      archive.on('error', (err: Error) => {
        reject(err);
      });

      archive.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });

      archive.directory(sourcePath, false);
      archive.finalize();
    });
  }
}
