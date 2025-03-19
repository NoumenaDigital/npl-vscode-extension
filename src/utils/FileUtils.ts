import * as fs from 'fs';
import * as path from 'path';

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
    return path.join(extensionPath, 'server', 'language-server');
  }
}
