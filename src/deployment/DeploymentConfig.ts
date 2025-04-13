import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/Logger';
import { FileUtils } from '../utils/FileUtils';

export interface DeploymentConfig {
  baseUrl: string;
  appName: string;
  username: string;
  sourcePath: string;
  rapidDeploy: boolean;
  skipRapidDeployWarning?: boolean;
}

export class DeploymentConfigManager {
  private static readonly CONFIG_FILE_NAME = 'npl-deploy.json';
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public async getConfigFilePath(workspaceFolder: vscode.WorkspaceFolder): Promise<string> {
    return path.join(workspaceFolder.uri.fsPath, DeploymentConfigManager.CONFIG_FILE_NAME);
  }

  public async loadConfig(workspaceFolder: vscode.WorkspaceFolder): Promise<DeploymentConfig | undefined> {
    try {
      const configPath = await this.getConfigFilePath(workspaceFolder);

      if (await FileUtils.fileExists(configPath)) {
        const content = await FileUtils.readFile(configPath);
        return JSON.parse(content) as DeploymentConfig;
      }

      return undefined;
    } catch (error) {
      this.logger.logError('Failed to load deployment configuration', error);
      return undefined;
    }
  }

  public async saveConfig(workspaceFolder: vscode.WorkspaceFolder, config: DeploymentConfig): Promise<void> {
    try {
      const configPath = await this.getConfigFilePath(workspaceFolder);
      const content = JSON.stringify(config, null, 2);
      await FileUtils.writeFile(configPath, content);
    } catch (error) {
      this.logger.logError('Failed to save deployment configuration', error);
      throw error;
    }
  }
}
