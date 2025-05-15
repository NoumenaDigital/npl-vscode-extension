import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  NPL_INSTRUCTION_VERSION,
  NPL_SECTION_START_MARKER,
  NPL_SECTION_END_MARKER,
  COPILOT_INSTRUCTIONS_PATH,
  CURSOR_RULES_PATH,
  RESOURCES_DIR,
  TEMPLATES_DIR,
  NPL_INSTRUCTIONS_TEMPLATE_FILENAME
} from '../constants';

export enum DialogButton {
  Yes = 'Yes',
  Always = 'Always & auto-update',
  AlwaysUpdate = 'Always',
  Never = 'Never'
}

let extensionContext: vscode.ExtensionContext;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

export interface DialogHandler {
  showInformationMessage(message: string, ...items: string[]): Thenable<DialogButton | undefined>;
}

export class VsCodeDialogHandler implements DialogHandler {
  showInformationMessage(message: string, ...items: string[]): Thenable<DialogButton | undefined> {
    return vscode.window.showInformationMessage(message, ...items) as Thenable<DialogButton | undefined>;
  }
}

export enum EditorType {
  VSCode,
  Cursor
}

export class InstructionFileManager {
  private readonly CURRENT_VERSION = NPL_INSTRUCTION_VERSION;
  private readonly NPL_SECTION_START = NPL_SECTION_START_MARKER;
  private readonly NPL_SECTION_END = NPL_SECTION_END_MARKER;
  private readonly templatePath = this.getTemplatePath();

  private readonly PROMPT_MODES = {
    ASK: 'ask',
    AUTO: 'auto',
    DISABLED: 'disabled'
  };

  private readonly dialogHandler: DialogHandler;
  private readonly editorTypeProvider: () => EditorType;

  constructor(
    dialogHandler: DialogHandler = new VsCodeDialogHandler(),
    editorTypeProvider?: () => EditorType
  ) {
    this.dialogHandler = dialogHandler;
    this.editorTypeProvider = editorTypeProvider || (() => this.detectEditorType());
  }

  private detectEditorType(): EditorType {
    const appName = vscode.env.appName || '';

    if (appName === 'Visual Studio Code') {
      return EditorType.VSCode;
    } else if (appName === 'Cursor') {
      return EditorType.Cursor;
    } else {
      return EditorType.VSCode;
    }
  }

  private getPromptMode(): string {
    const config = vscode.workspace.getConfiguration('NPL');
    return config.get<string>('instructionPrompts.mode', this.PROMPT_MODES.ASK);
  }

  private async setPromptMode(mode: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('NPL');
    await config.update('instructionPrompts.mode', mode, vscode.ConfigurationTarget.Global);
  }

  public async checkAndHandleInstructionFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    if (!workspaceFolder) {
      return;
    }

    const promptMode = this.getPromptMode();
    if (promptMode === this.PROMPT_MODES.DISABLED) {
      return;
    }

    const editorType = this.editorTypeProvider();
    const filePath = editorType === EditorType.VSCode ?
      COPILOT_INSTRUCTIONS_PATH :
      CURSOR_RULES_PATH;

    await this.checkAndHandleInstructionFile(workspaceFolder, filePath, promptMode);
  }

  public async checkAndHandleCopilotInstructions(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const promptMode = this.getPromptMode();
    if (promptMode !== this.PROMPT_MODES.DISABLED) {
      await this.checkAndHandleInstructionFile(workspaceFolder, COPILOT_INSTRUCTIONS_PATH, promptMode);
    }
  }

  public async checkAndHandleCursorRules(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const promptMode = this.getPromptMode();
    if (promptMode !== this.PROMPT_MODES.DISABLED) {
      await this.checkAndHandleInstructionFile(workspaceFolder, CURSOR_RULES_PATH, promptMode);
    }
  }

  private async checkAndHandleInstructionFile(
    workspaceFolder: vscode.WorkspaceFolder,
    filePath: string,
    promptMode: string
  ): Promise<void> {
    const fullPath = path.join(workspaceFolder.uri.fsPath, filePath);
    const isAutoMode = promptMode === this.PROMPT_MODES.AUTO;

    if (!fs.existsSync(fullPath)) {
      if (isAutoMode) {
        // Auto mode - create without asking
        await this.createInstructionFile(fullPath, this.templatePath);
        return;
      }

      // Ask mode - prompt the user
      const answer = await this.dialogHandler.showInformationMessage(
        'Create and maintain AI rules file with NPL-specific instructions?',
        DialogButton.Yes, DialogButton.Always, DialogButton.Never
      );

      if (answer === DialogButton.Yes) {
        await this.createInstructionFile(fullPath, this.templatePath);
      } else if (answer === DialogButton.Always) {
        await this.setPromptMode(this.PROMPT_MODES.AUTO);
        await this.createInstructionFile(fullPath, this.templatePath);
      } else if (answer === DialogButton.Never) {
        await this.setPromptMode(this.PROMPT_MODES.DISABLED);
      }
      return;
    }

    // File exists, check if it has NPL section
    const content = fs.readFileSync(fullPath, 'utf8');

    if (!this.hasNplSection(content)) {
      if (isAutoMode) {
        await this.appendNplSection(fullPath, content, this.templatePath);
        return;
      }

      // Ask mode - prompt the user
      const answer = await this.dialogHandler.showInformationMessage(
        'Add and maintain NPL-specific rules in your AI rules file?',
        DialogButton.Yes, DialogButton.Always, DialogButton.Never
      );

      if (answer === DialogButton.Yes) {
        await this.appendNplSection(fullPath, content, this.templatePath);
      } else if (answer === DialogButton.Always) {
        await this.setPromptMode(this.PROMPT_MODES.AUTO);
        await this.appendNplSection(fullPath, content, this.templatePath);
      } else if (answer === DialogButton.Never) {
        await this.setPromptMode(this.PROMPT_MODES.DISABLED);
      }
      return;
    }

    const version = this.getNplSectionVersion(content);

    if (version !== undefined && version < this.CURRENT_VERSION) {
      if (isAutoMode) {
        // Auto mode - update without asking
        await this.updateNplSection(fullPath, content, this.templatePath);
        return;
      }

      const answer = await this.dialogHandler.showInformationMessage(
        `NPL-specific rules for AI assistance outdated (v${version}). Update to latest?`,
        DialogButton.Yes, DialogButton.AlwaysUpdate, DialogButton.Never
      );

      if (answer === DialogButton.Yes) {
        await this.updateNplSection(fullPath, content, this.templatePath);
      } else if (answer === DialogButton.AlwaysUpdate) {
        await this.setPromptMode(this.PROMPT_MODES.AUTO);
        await this.updateNplSection(fullPath, content, this.templatePath);
      } else if (answer === DialogButton.Never) {
        await this.setPromptMode(this.PROMPT_MODES.DISABLED);
      }
    }
  }

  private hasNplSection(content: string): boolean {
    return content.includes(this.NPL_SECTION_START);
  }

  private getNplSectionVersion(content: string): number | undefined {
    // Only match actual digit sequences (not template placeholders)
    const versionRegex = new RegExp(`${this.NPL_SECTION_START}(\\d+)`);
    const versionMatch = content.match(versionRegex);
    if (versionMatch && versionMatch[1]) {
      return parseInt(versionMatch[1], 10);
    }

    return undefined;
  }

  private getTemplateContent(templatePath: string): string {
    try {
      if (fs.existsSync(templatePath)) {
        let content = fs.readFileSync(templatePath, 'utf8');
        content = content.replace('{{VERSION}}', this.CURRENT_VERSION.toString());
        return content;
      }

      // Try looking in the source directory (useful during development)
      const srcTemplatePath = path.join(__dirname, '..', '..', 'src', RESOURCES_DIR, TEMPLATES_DIR, NPL_INSTRUCTIONS_TEMPLATE_FILENAME);
      if (fs.existsSync(srcTemplatePath)) {
        let content = fs.readFileSync(srcTemplatePath, 'utf8');
        content = content.replace('{{VERSION}}', this.CURRENT_VERSION.toString());
        return content;
      }

      // Try directly in the extension folder
      const extensionFilePath = path.join(__dirname, '..', '..', RESOURCES_DIR, TEMPLATES_DIR, NPL_INSTRUCTIONS_TEMPLATE_FILENAME);
      if (fs.existsSync(extensionFilePath)) {
        let content = fs.readFileSync(extensionFilePath, 'utf8');
        content = content.replace('{{VERSION}}', this.CURRENT_VERSION.toString());
        return content;
      }

      throw new Error(`Template file not found: ${templatePath}`);
    } catch (error) {
      console.error(`Error loading template: ${error}`);
      throw error;
    }
  }

  private async createInstructionFile(filePath: string, templatePath: string): Promise<void> {
    const dirPath = path.dirname(filePath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(filePath, this.getTemplateContent(templatePath), 'utf8');
  }

  private async appendNplSection(filePath: string, existingContent: string, templatePath: string): Promise<void> {
    const newContent = `${existingContent.trim()}\n\n${this.getTemplateContent(templatePath)}`;

    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  private async updateNplSection(filePath: string, existingContent: string, templatePath: string): Promise<void> {
    const newContent = this.replaceNplSection(existingContent, templatePath);

    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  private replaceNplSection(content: string, templatePath: string): string {
    const startRegex = new RegExp(`${this.NPL_SECTION_START}\\d+`);
    const startMatch = content.match(startRegex);
    if (!startMatch) {
      return content;
    }

    const startIndex = startMatch.index;
    if (startIndex === undefined) {
      return content;
    }

    const endIndex = content.indexOf(this.NPL_SECTION_END, startIndex);
    if (endIndex === -1) {
      return `${content}\n\n${this.getTemplateContent(templatePath)}`;
    }

    const endOfSection = endIndex + this.NPL_SECTION_END.length;
    return content.slice(0, startIndex) + this.getTemplateContent(templatePath) + content.slice(endOfSection);
  }

  private getTemplatePath(): string {
    if (extensionContext) {
      // Production path
      const prodPath = path.join(extensionContext.extensionPath, 'out', RESOURCES_DIR, TEMPLATES_DIR, NPL_INSTRUCTIONS_TEMPLATE_FILENAME);
      if (fs.existsSync(prodPath)) {
        return prodPath;
      }

      // Root resources path
      const altPath = path.join(extensionContext.extensionPath, RESOURCES_DIR, TEMPLATES_DIR, NPL_INSTRUCTIONS_TEMPLATE_FILENAME);
      if (fs.existsSync(altPath)) {
        return altPath;
      }
    }

    // Fallback relative path
    return path.join(__dirname, '..', RESOURCES_DIR, TEMPLATES_DIR, NPL_INSTRUCTIONS_TEMPLATE_FILENAME);
  }
}
