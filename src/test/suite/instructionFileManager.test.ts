import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DialogHandler, InstructionFileManager } from '../../instructionFiles/InstructionFileManager';

// Test implementation of DialogHandler that records calls and returns predefined responses
class TestDialogHandler implements DialogHandler {
  public messageCount = 0;
  public lastMessage?: string;
  public lastOptions?: string[];
  public responseToReturn: string | undefined = 'Yes';

  async showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
    this.messageCount++;
    this.lastMessage = message;
    this.lastOptions = items;
    return this.responseToReturn;
  }
}

suite('InstructionFileManager Test Suite', () => {
  let tempDir: string;
  let testDialogHandler: TestDialogHandler;
  let instructionFileManager: InstructionFileManager;

  const cursorrules = '.cursorrules';
  const copilotInstructions = '.github/copilot-instructions.md';

  setup(() => {
    // Create temporary directory for test workspace
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npl-test-'));

    // Create .github directory for tests
    const githubDir = path.join(tempDir, '.github');
    if (!fs.existsSync(githubDir)) {
      fs.mkdirSync(githubDir, { recursive: true });
    }

    // Create test dialog handler
    testDialogHandler = new TestDialogHandler();

    // Default response is Yes
    testDialogHandler.responseToReturn = 'Yes';
  });

  teardown(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      // Recursive delete helper function
      const deleteFolderRecursive = (dirPath: string) => {
        if (fs.existsSync(dirPath)) {
          fs.readdirSync(dirPath).forEach((file) => {
            const curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
              // Recurse
              deleteFolderRecursive(curPath);
            } else {
              // Delete file
              fs.unlinkSync(curPath);
            }
          });
          fs.rmdirSync(dirPath);
        }
      };

      deleteFolderRecursive(tempDir);
    }
  });

  test('checkAndHandleInstructionFiles handles VS Code and Cursor differently', async function() {
    // Mock workspaceFolder
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;

    // Test for VS Code
    instructionFileManager = new InstructionFileManager(
      testDialogHandler,
      () => 'Visual Studio Code'
    );

    // Set response to No so no files are created
    testDialogHandler.responseToReturn = 'No';
    await instructionFileManager.checkAndHandleInstructionFiles(workspaceFolder);

    // Should check only for copilot instructions
    assert.strictEqual(testDialogHandler.messageCount, 1, 'VS Code should show 1 prompt');
    assert.ok(testDialogHandler.lastMessage?.includes('Copilot'));

    // Reset count for next test
    testDialogHandler.messageCount = 0;

    // Test for Cursor
    instructionFileManager = new InstructionFileManager(
      testDialogHandler,
      () => 'Cursor'
    );

    await instructionFileManager.checkAndHandleInstructionFiles(workspaceFolder);

    // Should check both Cursor rules and Copilot instructions
    assert.strictEqual(testDialogHandler.messageCount, 2, 'Cursor should show 2 prompts');
  });

  test('checkAndHandleCopilotInstructions creates file if not exists', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;

    instructionFileManager = new InstructionFileManager(testDialogHandler);
    testDialogHandler.responseToReturn = 'Yes';

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    const copilotFile = path.join(tempDir, copilotInstructions);

    assert.strictEqual(testDialogHandler.messageCount, 1);
    assert.ok(fs.existsSync(copilotFile), 'Copilot instructions file should exist');

    const content = fs.readFileSync(copilotFile, 'utf8');
    assert.ok(content.includes('NPL Development'));
    assert.ok(content.includes('<!-- NPL-version: 2 -->'));
  });

  test('checkAndHandleCopilotInstructions appends NPL section if file exists without it', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;
    const copilotFile = path.join(tempDir, copilotInstructions);

    // Create copilot file without NPL section
    const initialContent = '# Existing instructions\n\nSome content';
    fs.writeFileSync(copilotFile, initialContent, 'utf8');

    instructionFileManager = new InstructionFileManager(testDialogHandler);
    testDialogHandler.responseToReturn = 'Yes';

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    assert.strictEqual(testDialogHandler.messageCount, 1);

    const content = fs.readFileSync(copilotFile, 'utf8');
    assert.ok(content.includes('# Existing instructions'));
    assert.ok(content.includes('NPL Development'));
    assert.ok(content.includes('<!-- NPL-version: 2 -->'));
  });

  test('checkAndHandleCopilotInstructions updates NPL section if outdated', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;
    const copilotFile = path.join(tempDir, copilotInstructions);

    // Create copilot file with outdated NPL section
    const initialContent = '# Instructions\n\n## NPL Development\n<!-- NPL-version: 1 -->\nOld content';
    fs.writeFileSync(copilotFile, initialContent, 'utf8');

    instructionFileManager = new InstructionFileManager(testDialogHandler);
    testDialogHandler.responseToReturn = 'Yes';

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    assert.strictEqual(testDialogHandler.messageCount, 1);

    const content = fs.readFileSync(copilotFile, 'utf8');
    assert.ok(!content.includes('<!-- NPL-version: 1 -->'));
    assert.ok(content.includes('<!-- NPL-version: 2 -->'));
  });

  test('checkAndHandleCopilotInstructions does nothing if NPL section is current', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;
    const copilotFile = path.join(tempDir, copilotInstructions);

    // Create copilot file with current NPL section
    const initialContent = '# Instructions\n\n## NPL Development\n<!-- NPL-version: 2 -->\nCurrent content';
    fs.writeFileSync(copilotFile, initialContent, 'utf8');

    instructionFileManager = new InstructionFileManager(testDialogHandler);

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    assert.strictEqual(testDialogHandler.messageCount, 0);

    const content = fs.readFileSync(copilotFile, 'utf8');
    assert.strictEqual(content, initialContent);
  });

  test('checkAndHandleCursorRules follows same pattern as Copilot instructions', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;

    instructionFileManager = new InstructionFileManager(testDialogHandler);
    testDialogHandler.responseToReturn = 'Yes';

    await instructionFileManager.checkAndHandleCursorRules(workspaceFolder);

    const cursorFile = path.join(tempDir, cursorrules);

    assert.strictEqual(testDialogHandler.messageCount, 1);
    assert.ok(fs.existsSync(cursorFile), 'Cursor rules file should exist');

    const content = fs.readFileSync(cursorFile, 'utf8');
    assert.ok(content.includes('NPL Development'));
    assert.ok(content.includes('<!-- NPL-version: 2 -->'));
  });

  test('user can cancel file creation', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;

    instructionFileManager = new InstructionFileManager(testDialogHandler);
    testDialogHandler.responseToReturn = 'No';

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    const copilotFile = path.join(tempDir, copilotInstructions);

    assert.strictEqual(testDialogHandler.messageCount, 1);
    assert.ok(!fs.existsSync(copilotFile), 'Copilot instructions file should not exist');
  });
});
