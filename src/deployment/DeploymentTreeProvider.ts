import * as vscode from 'vscode';
import { ILogger } from '../utils/Logger';
import { Application, DeploymentConfig, DeploymentConfigManager } from './DeploymentConfig';
import { DeployCommandHandler } from './DeployCommandHandler';

/**
 * Represents a tree item in the deployment tree view
 */
export class DeploymentItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: 'tenant' | 'application',
    public readonly id: string,
    public readonly children?: DeploymentItem[],
    public readonly app?: Application
  ) {
    super(label, collapsibleState);

    // Set common properties
    this.contextValue = itemType;
    this.id = `${itemType}-${id}`;

    // Configure item based on type
    if (itemType === 'tenant') {
      this.iconPath = new vscode.ThemeIcon('organization');
      this.tooltip = `Tenant: ${label}`;
    } else if (itemType === 'application') {
      this.iconPath = app?.rapidDeploy
        ? new vscode.ThemeIcon('rocket')
        : new vscode.ThemeIcon('package');

      this.tooltip = `Application: ${label}\nID: ${id}\nTenant: ${app?.tenantName}`;

      // Add status badges or icons based on app state
      if (app) {
        this.description = app.tenantName;
      }
    }
  }
}

/**
 * Tree data provider for the NPL deployment view
 */
export class DeploymentTreeProvider implements vscode.TreeDataProvider<DeploymentItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<DeploymentItem | undefined | null | void> = new vscode.EventEmitter<DeploymentItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<DeploymentItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private logger: ILogger;
  private deployCommandHandler: DeployCommandHandler;
  private configManager: DeploymentConfigManager;
  private workspaceFolder: vscode.WorkspaceFolder | undefined;
  private lastConfig: DeploymentConfig | undefined;

  constructor(logger: ILogger, deployCommandHandler: DeployCommandHandler, configManager: DeploymentConfigManager) {
    this.logger = logger;
    this.deployCommandHandler = deployCommandHandler;
    this.configManager = configManager;

    // Get the workspace folder
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      this.workspaceFolder = vscode.workspace.workspaceFolders[0];
    }
  }

  /**
   * Refresh the tree view
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get the tree item for the given element
   */
  getTreeItem(element: DeploymentItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get the children of the given element
   */
  async getChildren(element?: DeploymentItem): Promise<DeploymentItem[]> {
    // If no workspace folder, we can't get config
    if (!this.workspaceFolder) {
      return [new DeploymentItem(
        'No workspace folder open',
        vscode.TreeItemCollapsibleState.None,
        'tenant',
        'no-workspace'
      )];
    }

    try {
      // Load config if not already loaded
      if (!this.lastConfig) {
        this.lastConfig = await this.configManager.loadConfig(this.workspaceFolder);
      }

      // If no config or no element, show root items
      if (!element) {
        if (!this.lastConfig) {
          return [new DeploymentItem(
            'Configure Deployment',
            vscode.TreeItemCollapsibleState.None,
            'tenant',
            'configure'
          )];
        }

        // Group applications by tenant
        const tenantMap = new Map<string, { id: string, name: string, apps: Application[] }>();

        if (this.lastConfig.applications) {
          for (const app of this.lastConfig.applications) {
            if (!tenantMap.has(app.tenantId)) {
              tenantMap.set(app.tenantId, {
                id: app.tenantId,
                name: app.tenantName,
                apps: []
              });
            }
            tenantMap.get(app.tenantId)?.apps.push(app);
          }
        }

        // Convert tenant map to tree items
        const tenants: DeploymentItem[] = [];

        tenantMap.forEach((tenant) => {
          tenants.push(new DeploymentItem(
            tenant.name,
            vscode.TreeItemCollapsibleState.Expanded,
            'tenant',
            tenant.id
          ));
        });

        if (tenants.length === 0) {
          return [new DeploymentItem(
            'No applications found',
            vscode.TreeItemCollapsibleState.None,
            'tenant',
            'no-apps'
          )];
        }

        return tenants;
      } else if (element.itemType === 'tenant') {
        // Show applications for this tenant
        const tenantId = element.id.replace('tenant-', '');
        const applications: DeploymentItem[] = [];

        if (this.lastConfig.applications) {
          for (const app of this.lastConfig.applications) {
            if (app.tenantId === tenantId) {
              applications.push(new DeploymentItem(
                app.name,
                vscode.TreeItemCollapsibleState.None,
                'application',
                app.id,
                undefined,
                app
              ));
            }
          }
        }

        return applications;
      }

      return [];
    } catch (error) {
      this.logger.logError('Error loading deployment tree', error);
      return [new DeploymentItem(
        'Error loading deployment data',
        vscode.TreeItemCollapsibleState.None,
        'tenant',
        'error'
      )];
    }
  }

  /**
   * Clear the cached configuration
   */
  public clearCache(): void {
    this.lastConfig = undefined;
    this.refresh();
  }

  /**
   * Reload the configuration
   */
  public async reloadConfig(): Promise<void> {
    if (this.workspaceFolder) {
      this.lastConfig = await this.configManager.loadConfig(this.workspaceFolder);
      this.refresh();
    }
  }
}
