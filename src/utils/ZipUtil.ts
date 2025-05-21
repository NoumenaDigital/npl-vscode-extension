import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Creates a ZIP archive of the provided directory and stores it in the system temp folder.
 * Returns the absolute path of the created archive.
 */
export async function createArchive(rootDir: string): Promise<string> {
  const archiver = require('archiver');

  const tempZip = path.join(os.tmpdir(), `npl-archive-${Date.now()}.zip`);

  return await new Promise<string>((resolve, reject) => {
    try {
      const output = fs.createWriteStream(tempZip);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(tempZip));
      output.on('error', reject);

      archive.pipe(output);
      archive.directory(rootDir, false);
      archive.finalize();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Creates a ZIP archive entirely in-memory and returns it as a Buffer.
 */
export async function createArchiveBuffer(rootDir: string): Promise<Buffer> {
  const archiver = require('archiver');
  const { PassThrough } = require('stream');

  return await new Promise<Buffer>((resolve, reject) => {
    try {
      const pass = new PassThrough();
      const chunks: Buffer[] = [];

      pass.on('data', (chunk: Buffer) => chunks.push(chunk));
      pass.on('end', () => resolve(Buffer.concat(chunks)));
      pass.on('error', reject);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', reject);

      archive.pipe(pass);
      archive.directory(rootDir, false);
      archive.finalize();
    } catch (e) {
      reject(e);
    }
  });
}
