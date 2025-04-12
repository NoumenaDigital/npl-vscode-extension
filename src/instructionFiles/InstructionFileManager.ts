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

// Interface for dialog interactions to make testing easier
export interface DialogHandler {
  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
}

// Default implementation that uses VS Code's native dialog
export class VsCodeDialogHandler implements DialogHandler {
  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    return vscode.window.showInformationMessage(message, ...items);
  }
}

export enum EditorType {
  VSCode,
  Cursor
}

interface InstructionFileType {
  path: string;
  createMessage: string;
  appendMessage: string;
  updateMessage: string;
  templatePath: string;
}

export class InstructionFileManager {
  private readonly CURRENT_VERSION = NPL_INSTRUCTION_VERSION;
  private readonly NPL_SECTION_START = NPL_SECTION_START_MARKER;
  private readonly NPL_SECTION_END = NPL_SECTION_END_MARKER;

  // Define instruction file types
  private readonly instructionTypes = {
    copilot: {
      path: COPILOT_INSTRUCTIONS_PATH,
      createMessage: 'NPL-Dev can create a GitHub Copilot instructions file for better AI assistance in VS Code. Create it?',
      appendMessage: 'NPL-Dev can add NPL-specific instructions to your GitHub Copilot AI assistant in VS Code. Add them?',
      updateMessage: 'Your NPL instructions for GitHub Copilot AI in VS Code are outdated (version {0}). Update to the latest version?',
      templatePath: path.join(__dirname, '..', RESOURCES_DIR, TEMPLATES_DIR, NPL_INSTRUCTIONS_TEMPLATE_FILENAME)
    },
    cursor: {
      path: CURSOR_RULES_PATH,
      createMessage: 'NPL-Dev can create a Cursor rules file for better AI assistance in Cursor editor. Create it?',
      appendMessage: 'NPL-Dev can add NPL-specific rules to your Cursor AI assistant. Add them?',
      updateMessage: 'Your NPL rules for Cursor AI are outdated (version {0}). Update to the latest version?',
      templatePath: path.join(__dirname, '..', RESOURCES_DIR, TEMPLATES_DIR, NPL_INSTRUCTIONS_TEMPLATE_FILENAME)
    }
  };

  // Dependencies injected via constructor
  private readonly dialogHandler: DialogHandler;
  private readonly editorTypeProvider: () => EditorType;

  constructor(
    dialogHandler: DialogHandler = new VsCodeDialogHandler(),
    editorTypeProvider?: () => EditorType
  ) {
    this.dialogHandler = dialogHandler;
    this.editorTypeProvider = editorTypeProvider || (() => this.detectEditorType());
  }

  /**
   * Detects whether we're running in VS Code or Cursor
   */
  private detectEditorType(): EditorType {
    // Simple detection based on app name
    const appName = vscode.env.appName || '';

    if (appName === 'Visual Studio Code') {
      return EditorType.VSCode;
    } else if (appName === 'Cursor') {
      return EditorType.Cursor;
    } else {
      // For testing or unknown environments, default to VS Code
      return EditorType.VSCode;
    }
  }

  /**
   * Checks for instruction files in the workspace and handles them according to requirements
   */
  public async checkAndHandleInstructionFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    if (!workspaceFolder) {
      return;
    }

    const editorType = this.editorTypeProvider();

    switch (editorType) {
      case EditorType.VSCode:
        // VS Code only handles Copilot instructions
        await this.checkAndHandleInstructionFile(workspaceFolder, this.instructionTypes.copilot);
        break;
      case EditorType.Cursor:
        // Cursor only handles Cursor rules
        await this.checkAndHandleInstructionFile(workspaceFolder, this.instructionTypes.cursor);
        break;
      default:
        // This should not happen with our current implementation,
        // but the default case is here for future-proofing
        break;
    }
  }

  /**
   * General method to handle any instruction file
   */
  private async checkAndHandleInstructionFile(
    workspaceFolder: vscode.WorkspaceFolder,
    fileType: InstructionFileType
  ): Promise<void> {
    const filePath = path.join(workspaceFolder.uri.fsPath, fileType.path);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // File doesn't exist, ask if user wants to create it
      const answer = await this.dialogHandler.showInformationMessage(
        fileType.createMessage,
        'Yes', 'No'
      );

      if (answer === 'Yes') {
        await this.createInstructionFile(filePath, fileType.templatePath);
      }
      return;
    }

    // File exists, check if it has NPL section
    const content = fs.readFileSync(filePath, 'utf8');

    if (!this.hasNplSection(content)) {
      // No NPL section, ask if user wants to add it
      const answer = await this.dialogHandler.showInformationMessage(
        fileType.appendMessage,
        'Yes', 'No'
      );

      if (answer === 'Yes') {
        await this.appendNplSection(filePath, content, fileType.templatePath);
      }
      return;
    }

    // Has NPL section, check version
    const version = this.getNplSectionVersion(content);

    if (version < this.CURRENT_VERSION) {
      // Outdated version, ask if user wants to update
      const answer = await this.dialogHandler.showInformationMessage(
        fileType.updateMessage.replace('{0}', version.toString()),
        'Yes', 'No'
      );

      if (answer === 'Yes') {
        await this.updateNplSection(filePath, content, fileType.templatePath);
      }
    }
    // If version is current or higher, do nothing
  }

  // Convenience methods for backward compatibility and direct access

  /**
   * Handle Copilot instructions file
   */
  public async checkAndHandleCopilotInstructions(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    await this.checkAndHandleInstructionFile(workspaceFolder, this.instructionTypes.copilot);
  }

  /**
   * Handle Cursor rules file
   */
  public async checkAndHandleCursorRules(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    await this.checkAndHandleInstructionFile(workspaceFolder, this.instructionTypes.cursor);
  }

  // Helper methods

  private hasNplSection(content: string): boolean {
    return content.includes(this.NPL_SECTION_START);
  }

  private getNplSectionVersion(content: string): number {
    const versionRegex = new RegExp(`${this.NPL_SECTION_START}(\\d+)`);
    const versionMatch = content.match(versionRegex);
    if (versionMatch && versionMatch[1]) {
      return parseInt(versionMatch[1], 10);
    }
    return 0; // Default to 0 if no version found
  }

  private getTemplateContent(templatePath: string): string {
    if (fs.existsSync(templatePath)) {
      let content = fs.readFileSync(templatePath, 'utf8');
      // Replace version placeholder with current version
      content = content.replace('{{VERSION}}', this.CURRENT_VERSION.toString());
      return content;
    }

    return `# NPL Development v${this.CURRENT_VERSION}\n\nWhen working with NPL files:\n\n1. NPL is a domain-specific language\n2. Follow existing code style\n\n${this.NPL_SECTION_END}`;
  }

  private async createInstructionFile(filePath: string, templatePath: string): Promise<void> {
    const dirPath = path.dirname(filePath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(filePath, this.getTemplateContent(templatePath), 'utf8');
  }

  private async appendNplSection(filePath: string, existingContent: string, templatePath: string): Promise<void> {
    // Add NPL section to existing content
    const newContent = `${existingContent.trim()}\n\n${this.getTemplateContent(templatePath)}`;

    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  private async updateNplSection(filePath: string, existingContent: string, templatePath: string): Promise<void> {
    // Replace the old NPL section with the new one
    const newContent = this.replaceNplSection(existingContent, templatePath);

    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  private replaceNplSection(content: string, templatePath: string): string {
    // Find the NPL section start
    const startRegex = new RegExp(`${this.NPL_SECTION_START}\\d+`);
    const startMatch = content.match(startRegex);
    if (!startMatch) {
      return content;
    }

    const startIndex = startMatch.index;
    if (startIndex === undefined) {
      return content;
    }

    // Find the NPL section end
    const endIndex = content.indexOf(this.NPL_SECTION_END, startIndex);
    if (endIndex === -1) {
      // If no end marker, append the entire template
      return `${content}\n\n${this.getTemplateContent(templatePath)}`;
    }

    // Replace section including the end marker
    const endOfSection = endIndex + this.NPL_SECTION_END.length;
    return content.slice(0, startIndex) + this.getTemplateContent(templatePath) + content.slice(endOfSection);
  }
}
