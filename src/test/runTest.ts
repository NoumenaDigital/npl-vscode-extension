import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import * as fs from 'fs';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Create a workspace folder for tests - use fixtures directory as workspace
    const workspaceFolder = path.resolve(extensionDevelopmentPath, 'src', 'test', 'fixtures');

    // Check if it exists
    if (!fs.existsSync(workspaceFolder)) {
      console.log(`Creating test workspace folder: ${workspaceFolder}`);
      fs.mkdirSync(workspaceFolder, { recursive: true });
    }

    // Download VS Code, unzip it and run the integration test with a workspace
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // Specify the fixtures folder as the workspace folder
      launchArgs: [workspaceFolder]
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
