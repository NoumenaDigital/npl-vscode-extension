import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DialogHandler, EditorType, InstructionFileManager } from '../../instructionFiles/InstructionFileManager';

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

  const NPL_SECTION_START = '# NPL Development v';
  const NPL_SECTION_END = '<!-- END NPL DEVELOPMENT SECTION -->';
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

  test('detectEditorType correctly identifies editor', async function() {
    // Create instance with default editor type detection
    const manager = new InstructionFileManager(testDialogHandler);

    // Use reflection to access the private method
    const detectEditorType = (manager as any).detectEditorType.bind(manager);

    // When run in VS Code Test Runner, it should identify as VS Code
    const result = detectEditorType();
    assert.strictEqual(result, EditorType.VSCode, 'Editor should be identified as VS Code in test environment');
  });

  test('checkAndHandleInstructionFiles handles VS Code and Cursor differently', async function() {
    // Mock workspaceFolder
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;

    // Test for VS Code
    instructionFileManager = new InstructionFileManager(
      testDialogHandler,
      () => EditorType.VSCode
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
      () => EditorType.Cursor
    );

    await instructionFileManager.checkAndHandleInstructionFiles(workspaceFolder);

    // Should check only for Cursor rules
    assert.strictEqual(testDialogHandler.messageCount, 1, 'Cursor should show 1 prompt');
    assert.ok(testDialogHandler.lastMessage?.includes('Cursor rules'), 'Prompt should be about Cursor rules');

    // Reset count for Unknown editor test - this is now handled as VS Code in our implementation
    testDialogHandler.messageCount = 0;

    // Pass a mock function that would have returned Unknown before
    instructionFileManager = new InstructionFileManager(
      testDialogHandler,
      () => {
        // Mock what would happen for an unknown app name - should return VSCode now
        const detectEditorType = (new InstructionFileManager(testDialogHandler) as any).detectEditorType.bind({ detectEditorType() {} });
        return detectEditorType();
      }
    );

    await instructionFileManager.checkAndHandleInstructionFiles(workspaceFolder);

    // Unknown editors are treated as VS Code and should show a prompt for Copilot
    assert.strictEqual(testDialogHandler.messageCount, 1, 'Unknown editor should be treated as VS Code');
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
    assert.ok(content.includes('NPL Development v2'));
    assert.ok(content.includes(NPL_SECTION_END));
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
    assert.ok(content.includes('NPL Development v2'));
    assert.ok(content.includes(NPL_SECTION_END));
  });

  test('checkAndHandleCopilotInstructions updates NPL section if outdated', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;
    const copilotFile = path.join(tempDir, copilotInstructions);

    // Create copilot file with outdated NPL section
    const initialContent = `# Instructions\n\n${NPL_SECTION_START}1\nOld content\n${NPL_SECTION_END}`;
    fs.writeFileSync(copilotFile, initialContent, 'utf8');

    instructionFileManager = new InstructionFileManager(testDialogHandler);
    testDialogHandler.responseToReturn = 'Yes';

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    assert.strictEqual(testDialogHandler.messageCount, 1);

    const content = fs.readFileSync(copilotFile, 'utf8');
    assert.ok(!content.includes(`${NPL_SECTION_START}1`));
    assert.ok(content.includes(`${NPL_SECTION_START}2`));
  });

  test('checkAndHandleCopilotInstructions does nothing if NPL section is current', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;
    const copilotFile = path.join(tempDir, copilotInstructions);

    // Create copilot file with current NPL section
    const initialContent = `# Instructions\n\n${NPL_SECTION_START}2\nCurrent content\n${NPL_SECTION_END}`;
    fs.writeFileSync(copilotFile, initialContent, 'utf8');

    instructionFileManager = new InstructionFileManager(testDialogHandler);

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    assert.strictEqual(testDialogHandler.messageCount, 0);

    const content = fs.readFileSync(copilotFile, 'utf8');
    assert.strictEqual(content, initialContent);
  });

  test('checkAndHandleCopilotInstructions does nothing if NPL section version is higher', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;
    const copilotFile = path.join(tempDir, copilotInstructions);

    // Create copilot file with future NPL section version
    const initialContent = `# Instructions\n\n${NPL_SECTION_START}3\nFuture content\n${NPL_SECTION_END}`;
    fs.writeFileSync(copilotFile, initialContent, 'utf8');

    instructionFileManager = new InstructionFileManager(testDialogHandler);

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    assert.strictEqual(testDialogHandler.messageCount, 0, 'No prompt should appear for higher version');

    const content = fs.readFileSync(copilotFile, 'utf8');
    assert.strictEqual(content, initialContent, 'File with higher version should not be modified');
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
    assert.ok(content.includes('NPL Development v2'));
    assert.ok(content.includes(NPL_SECTION_END));
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
