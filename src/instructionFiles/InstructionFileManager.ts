import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import {
  NPL_INSTRUCTION_VERSION,
  NPL_SECTION_START_MARKER,
  NPL_SECTION_END_MARKER,
  COPILOT_INSTRUCTIONS_PATH,
  CURSOR_RULES_PATH
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
  private readonly INSTRUCTION_URL = 'https://raw.githubusercontent.com/NoumenaDigital/npl-vscode-extension/refs/heads/ST-4691_fix_instruction_file_location/npl-instructions.md';

  private readonly PROMPT_MODES = {
    ASK: 'ask',
    AUTO: 'auto',
    DISABLED: 'disabled'
  };

  private readonly dialogHandler: DialogHandler;
  private readonly editorTypeProvider: () => EditorType;
  private instructionContentCache: string | null = null;

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
        await this.createInstructionFile(fullPath);
        return;
      }

      // Ask mode - prompt the user
      const answer = await this.dialogHandler.showInformationMessage(
        'Create and maintain AI rules file with NPL-specific instructions?',
        DialogButton.Yes, DialogButton.Always, DialogButton.Never
      );

      if (answer === DialogButton.Yes) {
        await this.createInstructionFile(fullPath);
      } else if (answer === DialogButton.Always) {
        await this.setPromptMode(this.PROMPT_MODES.AUTO);
        await this.createInstructionFile(fullPath);
      } else if (answer === DialogButton.Never) {
        await this.setPromptMode(this.PROMPT_MODES.DISABLED);
      }
      return;
    }

    // File exists, check if it has NPL section
    const content = fs.readFileSync(fullPath, 'utf8');

    if (!this.hasNplSection(content)) {
      if (isAutoMode) {
        await this.appendNplSection(fullPath, content);
        return;
      }

      // Ask mode - prompt the user
      const answer = await this.dialogHandler.showInformationMessage(
        'Add and maintain NPL-specific rules in your AI rules file?',
        DialogButton.Yes, DialogButton.Always, DialogButton.Never
      );

      if (answer === DialogButton.Yes) {
        await this.appendNplSection(fullPath, content);
      } else if (answer === DialogButton.Always) {
        await this.setPromptMode(this.PROMPT_MODES.AUTO);
        await this.appendNplSection(fullPath, content);
      } else if (answer === DialogButton.Never) {
        await this.setPromptMode(this.PROMPT_MODES.DISABLED);
      }
      return;
    }

    const version = this.getNplSectionVersion(content);

    if (version !== undefined && version < this.CURRENT_VERSION) {
      if (isAutoMode) {
        // Auto mode - update without asking
        await this.updateNplSection(fullPath, content);
        return;
      }

      const answer = await this.dialogHandler.showInformationMessage(
        `NPL-specific rules for AI assistance outdated (v${version}). Update to latest?`,
        DialogButton.Yes, DialogButton.AlwaysUpdate, DialogButton.Never
      );

      if (answer === DialogButton.Yes) {
        await this.updateNplSection(fullPath, content);
      } else if (answer === DialogButton.AlwaysUpdate) {
        await this.setPromptMode(this.PROMPT_MODES.AUTO);
        await this.updateNplSection(fullPath, content);
      } else if (answer === DialogButton.Never) {
        await this.setPromptMode(this.PROMPT_MODES.DISABLED);
      }
    }
  }

  private hasNplSection(content: string): boolean {
    return content.includes(this.NPL_SECTION_START);
  }

  private getNplSectionVersion(content: string): number | undefined {
    const versionRegex = new RegExp(`${this.NPL_SECTION_START}(\\d+)`);
    const versionMatch = content.match(versionRegex);
    if (versionMatch && versionMatch[1]) {
      return parseInt(versionMatch[1], 10);
    }

    return undefined;
  }

  private async getInstructionContent(): Promise<string> {
    if (this.instructionContentCache) {
      return this.instructionContentCache;
    }

    try {
      const content = await this.fetchTextContent(this.INSTRUCTION_URL);
      this.instructionContentCache = content;
      return content;
    } catch (error) {
      console.error(`Error fetching instruction content from ${this.INSTRUCTION_URL}:`, error);
      throw new Error(`Failed to fetch NPL instruction content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async fetchTextContent(url: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const req = https.get(url, (res: any) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          if (res.headers.location) {
            this.fetchTextContent(res.headers.location)
              .then(resolve)
              .catch(reject);
            return;
          }
          reject(new Error(`Redirect with no location header from ${url}`));
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Request failed with status code: ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (chunk: any) => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', (err: Error) => reject(err));
      req.end();
    });
  }

  private async createInstructionFile(filePath: string): Promise<void> {
    const dirPath = path.dirname(filePath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const instructionContent = await this.getInstructionContent();
    fs.writeFileSync(filePath, instructionContent, 'utf8');
  }

  private async appendNplSection(filePath: string, existingContent: string): Promise<void> {
    const instructionContent = await this.getInstructionContent();
    const newContent = `${existingContent.trim()}\n\n${instructionContent}`;

    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  private async updateNplSection(filePath: string, existingContent: string): Promise<void> {
    const newContent = await this.replaceNplSection(existingContent);

    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  private async replaceNplSection(content: string): Promise<string> {
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
      const instructionContent = await this.getInstructionContent();
      return `${content}\n\n${instructionContent}`;
    }

    const endOfSection = endIndex + this.NPL_SECTION_END.length;
    const instructionContent = await this.getInstructionContent();
    return content.slice(0, startIndex) + instructionContent + content.slice(endOfSection);
  }
}
