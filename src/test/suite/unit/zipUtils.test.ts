import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ZipProducer } from '../../../deployment/ZipProducer';
import { Logger } from '../../../utils/Logger';

suite('ZipProducer Unit Tests', () => {
  let tempDir: string;
  let logger: Logger;
  let zipProducer: ZipProducer;

  suiteSetup(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zip-producer-test-'));
    logger = new Logger('Zip Producer Test');
    zipProducer = new ZipProducer(logger);
  });

  suiteTeardown(async () => {
    // Clean up the temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  test('produceZip should create a zip from directory contents', async function() {
    this.timeout(5000); // Allow more time for file operations

    // Create test files in the temporary directory
    const testFiles = [
      { name: 'file1.txt', content: 'Content of file 1' },
      { name: 'file2.txt', content: 'Content of file 2' },
      { name: path.join('subdir', 'file3.txt'), content: 'Content of file 3 in subdirectory' }
    ];

    // Create the files
    for (const file of testFiles) {
      const filePath = path.join(tempDir, file.name);
      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      // Write file content
      await fs.promises.writeFile(filePath, file.content);
    }

    // Generate the zip
    const zipBuffer = await zipProducer.produceZip(tempDir);

    // Basic validation - should produce a buffer with content
    assert.ok(zipBuffer instanceof Buffer, 'Should return a Buffer');
    assert.ok(zipBuffer.length > 0, 'Zip buffer should not be empty');

    // Verify zip signature - first 4 bytes of a zip file are 0x50, 0x4B, 0x03, 0x04 (PK..)
    assert.strictEqual(zipBuffer[0], 0x50);
    assert.strictEqual(zipBuffer[1], 0x4B);
    assert.strictEqual(zipBuffer[2], 0x03);
    assert.strictEqual(zipBuffer[3], 0x04);
  });

  test('produceZip should handle validation of source path', async function() {
    // Test with non-existent path
    const nonExistentPath = path.join(tempDir, 'does-not-exist');

    await assert.rejects(
      zipProducer.produceZip(nonExistentPath),
      /does not exist/,
      'Should reject when path does not exist'
    );

    // Test with a file instead of a directory
    const filePath = path.join(tempDir, 'single-file.txt');
    await fs.promises.writeFile(filePath, 'This is a file, not a directory');

    await assert.rejects(
      zipProducer.produceZip(filePath),
      /is not a directory/,
      'Should reject when path is a file, not a directory'
    );

    // Test with project path validation
    const otherDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'other-dir-'));
    try {
      await assert.rejects(
        zipProducer.produceZip(tempDir, otherDir),
        /is not in project/,
        'Should reject when source is not in project'
      );
    } finally {
      await fs.promises.rm(otherDir, { recursive: true, force: true });
    }
  });
});
