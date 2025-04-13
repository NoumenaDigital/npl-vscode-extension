import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  const testsRoot = path.resolve(__dirname);

  try {
    // Find test files
    const files = await glob('**/**.test.js', { cwd: testsRoot });

    // Run tests in order:
    // 1. Unit tests first
    // 2. Integration tests next
    // 3. E2E tests last

    // Sort files to run unit tests first, then integration tests, then e2e tests
    const sortedFiles = [...files].sort((a, b) => {
      // Unit tests come first
      if (a.includes('/unit/') && !b.includes('/unit/')) {
        return -1;
      }
      if (!a.includes('/unit/') && b.includes('/unit/')) {
        return 1;
      }

      // Integration tests come next
      if (a.includes('/integration/') && !b.includes('/integration/')) {
        return -1;
      }
      if (!a.includes('/integration/') && b.includes('/integration/')) {
        return 1;
      }

      // E2E tests come last
      if (a.includes('/e2e/') && !b.includes('/e2e/')) {
        return 1;
      }
      if (!a.includes('/e2e/') && b.includes('/e2e/')) {
        return -1;
      }

      // Alpha sort for tests in the same category
      return a.localeCompare(b);
    });

    // Add files to the test suite
    sortedFiles.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

    // Run the mocha test
    return new Promise((resolve, reject) => {
      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    });
  } catch (err) {
    console.error(err);
    throw err;
  }
}
