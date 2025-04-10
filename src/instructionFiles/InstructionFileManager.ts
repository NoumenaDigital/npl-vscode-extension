import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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

export class InstructionFileManager {
  // Current version of NPL instruction sections
  private readonly CURRENT_VERSION = 2;
  private readonly CURSOR_RULES_PATH = '.cursorrules';
  private readonly COPILOT_INSTRUCTIONS_PATH = '.github/copilot-instructions.md';

  // Dependencies injected via constructor
  private readonly dialogHandler: DialogHandler;
  private readonly appNameProvider: () => string;

  constructor(
    dialogHandler: DialogHandler = new VsCodeDialogHandler(),
    appNameProvider: () => string = () => vscode.env.appName
  ) {
    this.dialogHandler = dialogHandler;
    this.appNameProvider = appNameProvider;
  }

  /**
   * Checks for instruction files in the workspace and handles them according to requirements
   */
  public async checkAndHandleInstructionFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    if (!workspaceFolder) {
      return;
    }

    // Always check Copilot instructions
    await this.checkAndHandleCopilotInstructions(workspaceFolder);

    // Only check Cursor rules if in Cursor
    if (this.appNameProvider() === 'Cursor') {
      await this.checkAndHandleCursorRules(workspaceFolder);
    }
  }

  /**
   * Handle Copilot instructions file
   */
  public async checkAndHandleCopilotInstructions(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const filePath = path.join(workspaceFolder.uri.fsPath, this.COPILOT_INSTRUCTIONS_PATH);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // File doesn't exist, ask if user wants to create it
      const answer = await this.dialogHandler.showInformationMessage(
        'NPL-Dev can create a GitHub Copilot instructions file for better NPL code assistance. Create it?',
        'Yes', 'No'
      );

      if (answer === 'Yes') {
        await this.createCopilotInstructionsFile(workspaceFolder);
      }
      return;
    }

    // File exists, check if it has NPL section
    const content = fs.readFileSync(filePath, 'utf8');

    if (!this.hasNplSection(content)) {
      // No NPL section, ask if user wants to add it
      const answer = await this.dialogHandler.showInformationMessage(
        'NPL-Dev can add NPL-specific instructions to your GitHub Copilot instructions file. Add them?',
        'Yes', 'No'
      );

      if (answer === 'Yes') {
        await this.appendNplSectionToCopilot(workspaceFolder, content);
      }
      return;
    }

    // Has NPL section, check version
    const version = this.getNplSectionVersion(content);

    if (version < this.CURRENT_VERSION) {
      // Outdated version, ask if user wants to update
      const answer = await this.dialogHandler.showInformationMessage(
        `Your NPL instructions are outdated (version ${version}). Update to the latest version?`,
        'Yes', 'No'
      );

      if (answer === 'Yes') {
        await this.updateNplSectionInCopilot(workspaceFolder, content);
      }
    }
  }

  /**
   * Handle Cursor rules file
   */
  public async checkAndHandleCursorRules(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const filePath = path.join(workspaceFolder.uri.fsPath, this.CURSOR_RULES_PATH);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      // File doesn't exist, ask if user wants to create it
      const answer = await this.dialogHandler.showInformationMessage(
        'NPL-Dev can create a Cursor rules file for better NPL code assistance. Create it?',
        'Yes', 'No'
      );

      if (answer === 'Yes') {
        await this.createCursorRulesFile(workspaceFolder);
      }
      return;
    }

    // File exists, check if it has NPL section
    const content = fs.readFileSync(filePath, 'utf8');

    if (!this.hasNplSection(content)) {
      // No NPL section, ask if user wants to add it
      const answer = await this.dialogHandler.showInformationMessage(
        'NPL-Dev can add NPL-specific rules to your Cursor rules file. Add them?',
        'Yes', 'No'
      );

      if (answer === 'Yes') {
        await this.appendNplSectionToCursor(workspaceFolder, content);
      }
      return;
    }

    // Has NPL section, check version
    const version = this.getNplSectionVersion(content);

    if (version < this.CURRENT_VERSION) {
      // Outdated version, ask if user wants to update
      const answer = await this.dialogHandler.showInformationMessage(
        `Your NPL rules are outdated (version ${version}). Update to the latest version?`,
        'Yes', 'No'
      );

      if (answer === 'Yes') {
        await this.updateNplSectionInCursor(workspaceFolder, content);
      }
    }
  }

  // Helper methods

  private hasNplSection(content: string): boolean {
    return content.includes('## NPL Development') || content.includes('NPL Development');
  }

  private getNplSectionVersion(content: string): number {
    const versionMatch = content.match(/<!-- NPL-version: (\d+) -->/);
    if (versionMatch && versionMatch[1]) {
      return parseInt(versionMatch[1], 10);
    }
    return 0; // Default to 0 if no version found
  }

  private async createCopilotInstructionsFile(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const filePath = path.join(workspaceFolder.uri.fsPath, this.COPILOT_INSTRUCTIONS_PATH);
    const dirPath = path.dirname(filePath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(filePath, this.getCopilotTemplate(), 'utf8');
  }

  private async appendNplSectionToCopilot(workspaceFolder: vscode.WorkspaceFolder, existingContent: string): Promise<void> {
    const filePath = path.join(workspaceFolder.uri.fsPath, this.COPILOT_INSTRUCTIONS_PATH);

    // Add NPL section to existing content
    const newContent = `${existingContent.trim()}\n\n${this.getNplSection()}`;

    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  private async updateNplSectionInCopilot(workspaceFolder: vscode.WorkspaceFolder, existingContent: string): Promise<void> {
    const filePath = path.join(workspaceFolder.uri.fsPath, this.COPILOT_INSTRUCTIONS_PATH);

    // Replace the old NPL section with the new one
    const newContent = this.replaceNplSection(existingContent);

    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  private async createCursorRulesFile(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const filePath = path.join(workspaceFolder.uri.fsPath, this.CURSOR_RULES_PATH);

    fs.writeFileSync(filePath, this.getCursorRulesTemplate(), 'utf8');
  }

  private async appendNplSectionToCursor(workspaceFolder: vscode.WorkspaceFolder, existingContent: string): Promise<void> {
    const filePath = path.join(workspaceFolder.uri.fsPath, this.CURSOR_RULES_PATH);

    // Add NPL section to existing content
    const newContent = `${existingContent.trim()}\n\n${this.getNplSection()}`;

    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  private async updateNplSectionInCursor(workspaceFolder: vscode.WorkspaceFolder, existingContent: string): Promise<void> {
    const filePath = path.join(workspaceFolder.uri.fsPath, this.CURSOR_RULES_PATH);

    // Replace the old NPL section with the new one
    const newContent = this.replaceNplSection(existingContent);

    fs.writeFileSync(filePath, newContent, 'utf8');
  }

  private replaceNplSection(content: string): string {
    // Find the NPL section start and end
    const startMatch = content.match(/## NPL Development/);
    if (!startMatch) {
      return content;
    }

    const startIndex = startMatch.index;
    if (startIndex === undefined) {
      return content;
    }

    // Find the next heading or end of file
    const nextHeadingMatch = content.slice(startIndex).match(/\n## [^\n]+/);
    const endIndex = nextHeadingMatch && nextHeadingMatch.index !== undefined
      ? startIndex + nextHeadingMatch.index
      : content.length;

    // Replace the section
    return content.slice(0, startIndex) + this.getNplSection() + content.slice(endIndex);
  }

  // Templates

  private getCopilotTemplate(): string {
    return `# GitHub Copilot Instructions for this repository

This file provides instructions to GitHub Copilot to improve assistance when working with this codebase.

${this.getNplSection()}`;
  }

  private getCursorRulesTemplate(): string {
    return `# Cursor Rules for this repository

These rules provide guidance to Cursor to improve assistance when working with this codebase.

${this.getNplSection()}`;
  }

  private getNplSection(): string {
    return `## NPL Development
<!-- NPL-version: ${this.CURRENT_VERSION} -->

When working with NPL (Noumena Protocol Language) files:

1. NPL is a domain-specific language for the Noumena Protocol, a blockchain protocol focused on programmable assets
2. NPL uses a unique syntax for defining protocol types and operations
3. All NPL files have the .npl extension
4. Follow the existing code style when suggesting NPL code
5. Respect the type system - NPL is strongly typed
`;
  }
}
