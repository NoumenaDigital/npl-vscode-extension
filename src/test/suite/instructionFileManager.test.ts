import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DialogButton, DialogHandler, EditorType, InstructionFileManager } from '../../instructionFiles/InstructionFileManager';
import {
  NPL_INSTRUCTION_VERSION,
  NPL_SECTION_START_MARKER,
  NPL_SECTION_END_MARKER,
  COPILOT_INSTRUCTIONS_PATH,
  CURSOR_RULES_PATH
} from '../../constants';

class TestDialogHandler implements DialogHandler {
  public messageCount = 0;
  public lastMessage?: string;
  public lastOptions?: string[];
  public responseToReturn: DialogButton | undefined = DialogButton.Yes;

  async showInformationMessage(message: string, ...items: string[]): Promise<DialogButton | undefined> {
    this.messageCount++;
    this.lastMessage = message;
    this.lastOptions = items;
    return this.responseToReturn;
  }
}

class MockConfiguration {
  private settings: Map<string, any> = new Map();

  get<T>(section: string, defaultValue?: T): T {
    return this.settings.has(section) ? this.settings.get(section) : defaultValue as T;
  }

  update(section: string, value: any): Promise<void> {
    this.settings.set(section, value);
    return Promise.resolve();
  }
}

suite('InstructionFileManager Test Suite', () => {
  let tempDir: string;
  let testDialogHandler: TestDialogHandler;
  let instructionFileManager: InstructionFileManager;

  const NPL_SECTION_START = NPL_SECTION_START_MARKER;
  const NPL_SECTION_END = NPL_SECTION_END_MARKER;
  const cursorrules = CURSOR_RULES_PATH;
  const copilotInstructions = COPILOT_INSTRUCTIONS_PATH;
  const expectedVersionString = `${NPL_SECTION_START}${NPL_INSTRUCTION_VERSION}`;

  setup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npl-test-'));
    const githubDir = path.join(tempDir, '.github');
    if (!fs.existsSync(githubDir)) {
      fs.mkdirSync(githubDir, { recursive: true });
    }

    testDialogHandler = new TestDialogHandler();
    testDialogHandler.responseToReturn = DialogButton.Yes;
  });

  teardown(() => {
    if (fs.existsSync(tempDir)) {
      const deleteFolderRecursive = (dirPath: string) => {
        if (fs.existsSync(dirPath)) {
          fs.readdirSync(dirPath).forEach((file) => {
            const curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
              deleteFolderRecursive(curPath);
            } else {
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
    const manager = new InstructionFileManager(testDialogHandler);
    const detectEditorType = (manager as any).detectEditorType.bind(manager);
    const result = detectEditorType();
    assert.strictEqual(result, EditorType.VSCode, 'Editor should be identified as VS Code in test environment');
  });

  test('checkAndHandleInstructionFiles handles VS Code and Cursor differently', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;
    instructionFileManager = new InstructionFileManager(
      testDialogHandler,
      () => EditorType.VSCode
    );

    testDialogHandler.responseToReturn = DialogButton.No;
    await instructionFileManager.checkAndHandleInstructionFiles(workspaceFolder);
    assert.strictEqual(testDialogHandler.messageCount, 1, 'VS Code should show 1 prompt');
    assert.ok(testDialogHandler.lastMessage?.includes('Copilot'));

    testDialogHandler.messageCount = 0;
    instructionFileManager = new InstructionFileManager(
      testDialogHandler,
      () => EditorType.Cursor
    );

    await instructionFileManager.checkAndHandleInstructionFiles(workspaceFolder);

    assert.strictEqual(testDialogHandler.messageCount, 1, 'Cursor should show 1 prompt');
    assert.ok(testDialogHandler.lastMessage?.includes('Cursor rules'), 'Prompt should be about Cursor rules');
    testDialogHandler.messageCount = 0;

    instructionFileManager = new InstructionFileManager(
      testDialogHandler,
      () => {
        const detectEditorType = (new InstructionFileManager(testDialogHandler) as any).detectEditorType.bind({ detectEditorType() {} });
        return detectEditorType();
      }
    );

    await instructionFileManager.checkAndHandleInstructionFiles(workspaceFolder);

    assert.strictEqual(testDialogHandler.messageCount, 1, 'Unknown editor should be treated as VS Code');
  });

  test('checkAndHandleCopilotInstructions creates file if not exists', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;

    instructionFileManager = new InstructionFileManager(testDialogHandler);
    testDialogHandler.responseToReturn = DialogButton.Yes;

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    const copilotFile = path.join(tempDir, copilotInstructions);

    assert.strictEqual(testDialogHandler.messageCount, 1);
    assert.ok(fs.existsSync(copilotFile), 'Copilot instructions file should exist');

    const content = fs.readFileSync(copilotFile, 'utf8');
    assert.ok(content.includes(expectedVersionString));
    assert.ok(content.includes(NPL_SECTION_END));
  });

  test('checkAndHandleCopilotInstructions appends NPL section if file exists without it', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;
    const copilotFile = path.join(tempDir, copilotInstructions);

    const initialContent = '# Existing instructions\n\nSome content';
    fs.writeFileSync(copilotFile, initialContent, 'utf8');

    instructionFileManager = new InstructionFileManager(testDialogHandler);
    testDialogHandler.responseToReturn = DialogButton.Yes;

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    assert.strictEqual(testDialogHandler.messageCount, 1);

    const content = fs.readFileSync(copilotFile, 'utf8');
    assert.ok(content.includes('# Existing instructions'));
    assert.ok(content.includes(expectedVersionString));
    assert.ok(content.includes(NPL_SECTION_END));
  });

  test('checkAndHandleCopilotInstructions updates NPL section if outdated', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;
    const copilotFile = path.join(tempDir, copilotInstructions);

    const initialContent = `# Instructions\n\n${NPL_SECTION_START}0\nOld content\n${NPL_SECTION_END}`;
    fs.writeFileSync(copilotFile, initialContent, 'utf8');

    instructionFileManager = new InstructionFileManager(testDialogHandler);
    testDialogHandler.responseToReturn = DialogButton.Yes;

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    assert.strictEqual(testDialogHandler.messageCount, 1);

    const content = fs.readFileSync(copilotFile, 'utf8');
    assert.ok(!content.includes(`${NPL_SECTION_START}0`));
    assert.ok(content.includes(expectedVersionString));
  });

  test('checkAndHandleCopilotInstructions does nothing if NPL section is current', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;
    const copilotFile = path.join(tempDir, copilotInstructions);

    const initialContent = `# Instructions\n\n${NPL_SECTION_START}${NPL_INSTRUCTION_VERSION}\nCurrent content\n${NPL_SECTION_END}`;
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

    const futureVersion = NPL_INSTRUCTION_VERSION + 1;
    const initialContent = `# Instructions\n\n${NPL_SECTION_START}${futureVersion}\nFuture content\n${NPL_SECTION_END}`;
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
    testDialogHandler.responseToReturn = DialogButton.Yes;

    await instructionFileManager.checkAndHandleCursorRules(workspaceFolder);

    const cursorFile = path.join(tempDir, cursorrules);

    assert.strictEqual(testDialogHandler.messageCount, 1);
    assert.ok(fs.existsSync(cursorFile), 'Cursor rules file should exist');

    const content = fs.readFileSync(cursorFile, 'utf8');
    assert.ok(content.includes(expectedVersionString));
    assert.ok(content.includes(NPL_SECTION_END));
  });

  test('user can cancel file creation', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;

    instructionFileManager = new InstructionFileManager(testDialogHandler);
    testDialogHandler.responseToReturn = DialogButton.No;

    await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

    const copilotFile = path.join(tempDir, copilotInstructions);

    assert.strictEqual(testDialogHandler.messageCount, 1);
    assert.ok(!fs.existsSync(copilotFile), 'Copilot instructions file should not exist');
  });

  test('user can disable future prompts via "Never ask again"', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;

    const mockConfig = new MockConfiguration();
    const originalGetConfiguration = vscode.workspace.getConfiguration;

    try {
      vscode.workspace.getConfiguration = () => mockConfig as any;

      instructionFileManager = new InstructionFileManager(testDialogHandler);
      testDialogHandler.responseToReturn = DialogButton.Never;

      await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

      const copilotFile = path.join(tempDir, copilotInstructions);

      assert.strictEqual(testDialogHandler.messageCount, 1);
      assert.ok(!fs.existsSync(copilotFile), 'Copilot instructions file should not exist');

      // Check that the configuration was updated
      assert.strictEqual(mockConfig.get('instructionPrompts.mode', 'ask'), 'disabled', 'instructionPrompts.mode should be set to disabled');

      // Reset dialog handler count
      testDialogHandler.messageCount = 0;

      // Try to prompt again - should be suppressed by the setting
      await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

      // Should not show any prompts
      assert.strictEqual(testDialogHandler.messageCount, 0, 'No prompts should be shown when in disabled mode');
    } finally {
      // Restore original workspace.getConfiguration
      vscode.workspace.getConfiguration = originalGetConfiguration;
    }
  });

  test('automatic mode applies updates without prompting', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;

    // Create a mock configuration
    const mockConfig = new MockConfiguration();
    mockConfig.update('instructionPrompts.mode', 'auto');

    // Save original workspace.getConfiguration
    const originalGetConfiguration = vscode.workspace.getConfiguration;

    try {
      // Mock workspace.getConfiguration
      vscode.workspace.getConfiguration = () => mockConfig as any;

      instructionFileManager = new InstructionFileManager(testDialogHandler);

      await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

      const copilotFile = path.join(tempDir, copilotInstructions);

      // Should not show any prompts in auto mode
      assert.strictEqual(testDialogHandler.messageCount, 0, 'No prompts should be shown in auto mode');
      assert.ok(fs.existsSync(copilotFile), 'Copilot instructions file should be created automatically');

      // Verify file content
      const content = fs.readFileSync(copilotFile, 'utf8');
      assert.ok(content.includes(expectedVersionString), 'File should contain the correct version marker');
    } finally {
      // Restore original workspace.getConfiguration
      vscode.workspace.getConfiguration = originalGetConfiguration;
    }
  });

  test('user can switch to automatic mode', async function() {
    const workspaceFolder = { uri: vscode.Uri.file(tempDir) } as vscode.WorkspaceFolder;

    // Create a mock configuration
    const mockConfig = new MockConfiguration();

    // Save original workspace.getConfiguration
    const originalGetConfiguration = vscode.workspace.getConfiguration;

    try {
      // Mock workspace.getConfiguration
      vscode.workspace.getConfiguration = () => mockConfig as any;

      instructionFileManager = new InstructionFileManager(testDialogHandler);
      testDialogHandler.responseToReturn = DialogButton.Always;

      await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

      const copilotFile = path.join(tempDir, copilotInstructions);

      assert.strictEqual(testDialogHandler.messageCount, 1);
      assert.ok(fs.existsSync(copilotFile), 'Copilot instructions file should be created');

      // Check that the configuration was updated
      assert.strictEqual(mockConfig.get('instructionPrompts.mode', 'ask'), 'auto', 'instructionPrompts.mode should be set to auto');

      // Clean up for next test
      fs.unlinkSync(copilotFile);

      // Reset dialog handler count
      testDialogHandler.messageCount = 0;

      // Try to create again - should happen automatically without prompting
      await instructionFileManager.checkAndHandleCopilotInstructions(workspaceFolder);

      // Should not show any prompts
      assert.strictEqual(testDialogHandler.messageCount, 0, 'No prompts should be shown in auto mode');
      assert.ok(fs.existsSync(copilotFile), 'Copilot instructions file should be created automatically');
    } finally {
      // Restore original workspace.getConfiguration
      vscode.workspace.getConfiguration = originalGetConfiguration;
    }
  });
});
