import * as vscode from 'vscode';
import * as path from 'path';
import { ILogger } from '../utils/Logger';
import { FileUtils } from '../utils/FileUtils';
import { AuthType } from './CredentialManager';

export interface Application {
  id: string;
  name: string;
  slug: string;
  tenantId: string;
  tenantName: string;
  rapidDeploy: boolean;
  skipRapidDeployWarning?: boolean;
  sourcePath?: string;
}

export interface DeploymentConfig {
  baseUrl: string;
  username: string;
  authType: AuthType;
  sourcePath: string;
  applications: Application[];
  lastDeployedAppId?: string;
}

export class DeploymentConfigManager {
  private static readonly CONFIG_FILE_NAME = 'npl-deploy.json';
  private logger: ILogger;

  constructor(logger: ILogger) {
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
        const config = JSON.parse(content) as DeploymentConfig;

        // Handle older config format for backwards compatibility
        if (!config.applications && (config as any).appName) {
          const oldConfig = config as any;
          config.applications = [{
            id: oldConfig.appName,
            name: oldConfig.appName,
            slug: oldConfig.appName,
            tenantId: 'unknown',
            tenantName: 'Unknown Tenant',
            rapidDeploy: !!oldConfig.rapidDeploy,
            skipRapidDeployWarning: !!oldConfig.skipRapidDeployWarning
          }];
          config.lastDeployedAppId = oldConfig.appName;
          config.authType = AuthType.Basic;
        }

        return config;
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

  public async updateLastDeployedApp(workspaceFolder: vscode.WorkspaceFolder, appId: string): Promise<void> {
    try {
      const config = await this.loadConfig(workspaceFolder);
      if (config) {
        config.lastDeployedAppId = appId;
        await this.saveConfig(workspaceFolder, config);
      }
    } catch (error) {
      this.logger.logError('Failed to update last deployed app', error);
      throw error;
    }
  }

  /**
   * Update the source path for a specific application
   */
  public async updateApplicationSourcePath(
    workspaceFolder: vscode.WorkspaceFolder,
    appId: string,
    sourcePath: string
  ): Promise<void> {
    try {
      const config = await this.loadConfig(workspaceFolder);
      if (config) {
        const app = config.applications.find(a => a.id === appId);
        if (app) {
          app.sourcePath = sourcePath;
          await this.saveConfig(workspaceFolder, config);
        }
      }
    } catch (error) {
      this.logger.logError('Failed to update application source path', error);
      throw error;
    }
  }
}
