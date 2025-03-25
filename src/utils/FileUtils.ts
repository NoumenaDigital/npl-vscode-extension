import * as fs from 'fs';
import * as path from 'path';

export class FileUtils {
  static async ensureDirectoryExists(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  static async isExecutable(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  static async copyFile(source: string, destination: string): Promise<void> {
    await fs.promises.copyFile(source, destination);
  }

  static async writeFile(filePath: string, data: string): Promise<void> {
    const dir = path.dirname(filePath);
    await this.ensureDirectoryExists(dir);
    await fs.promises.writeFile(filePath, data, 'utf8');
  }

  static async readFile(filePath: string): Promise<string> {
    return await fs.promises.readFile(filePath, 'utf8');
  }

  static async listFiles(dirPath: string): Promise<string[]> {
    if (!await this.fileExists(dirPath)) {
      return [];
    }

    return await fs.promises.readdir(dirPath);
  }
}
