import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

// Import setup to load environment variables before running tests
import './setup';

async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  const testsRoot = path.resolve(__dirname);

  try {
    // Find all test files
    const testFiles = await glob('**/*.test.js', { cwd: testsRoot });

    // Add all test files to mocha
    testFiles.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

    // Run the mocha tests
    return new Promise<void>((resolve, reject) => {
      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    });
  } catch (err) {
    console.error('Error running deployment tests:', err);
    throw err;
  }
}

export { run };
