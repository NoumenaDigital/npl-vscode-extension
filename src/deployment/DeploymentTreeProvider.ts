import * as vscode from 'vscode';
import * as path from 'path';
import { ILogger } from '../utils/Logger';
import { Application, DeploymentConfig, DeploymentConfigManager } from './DeploymentConfig';
import { DeployCommandHandler } from './DeployCommandHandler';

/**
 * Item types for the deployment tree
 */
export type DeploymentItemType = 'tenant' | 'application' | 'login' | 'logout';

/**
 * Represents a tree item in the deployment tree view
 */
export class DeploymentItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: DeploymentItemType,
    public readonly id: string,
    public readonly children?: DeploymentItem[],
    public readonly app?: Application,
    private readonly workspaceFolder?: vscode.WorkspaceFolder,
    iconOverride?: vscode.ThemeIcon
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

      // Create a detailed tooltip with source path if available
      let tooltipText = `Application: ${label}\nID: ${id}\nTenant: ${app?.tenantName}`;

      if (app?.sourcePath) {
        // Show relative path if possible
        let displayPath = app.sourcePath;
        if (this.workspaceFolder) {
          const relativePath = path.relative(this.workspaceFolder.uri.fsPath, app.sourcePath);
          displayPath = relativePath === '' ? '.' : relativePath;
        }
        tooltipText += `\nSource: ${displayPath}`;
      } else {
        tooltipText += '\nSource: Default workspace path';
      }

      if (app?.rapidDeploy) {
        tooltipText += '\nRapid Deploy: Enabled';
      }

      this.tooltip = tooltipText;

      // Add status badges or icons based on app state
      if (app) {
        this.description = app.tenantName;
      }
    } else if (itemType === 'login') {
      // Special type for login items
      this.iconPath = iconOverride || new vscode.ThemeIcon('person-add');
      this.tooltip = 'Sign in to Noumena Cloud to view and deploy your applications';

      // Add a command to execute when clicked
      this.command = {
        title: 'Sign in to Noumena Cloud',
        command: 'npl.loginToNoumenaCloud'
      };
    } else if (itemType === 'logout') {
      // Special type for logout items
      this.iconPath = iconOverride || new vscode.ThemeIcon('person-delete');
      this.tooltip = 'Sign out from Noumena Cloud';

      // Add a command to execute when clicked
      this.command = {
        title: 'Sign out',
        command: 'npl.cleanCredentials'
      };
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
  private currentAuthState: boolean = false;
  private disposables: vscode.Disposable[] = [];

  constructor(logger: ILogger, deployCommandHandler: DeployCommandHandler, configManager: DeploymentConfigManager) {
    this.logger = logger;
    this.deployCommandHandler = deployCommandHandler;
    this.configManager = configManager;

    // Get the workspace folder
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      this.workspaceFolder = vscode.workspace.workspaceFolders[0];
    }

    // Initialize current auth state
    this.currentAuthState = this.isAuthenticated();

    // Listen for configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('NPL.deployment.isAuthenticated')) {
          const newAuthState = this.isAuthenticated();

          // Only refresh if auth state actually changed
          if (newAuthState !== this.currentAuthState) {
            this.logger.log(`Authentication state changed: ${this.currentAuthState} -> ${newAuthState}`);
            this.currentAuthState = newAuthState;

            // Force full refresh on auth state change
            this.forceRefresh();
          }
        }
      })
    );
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }

  /**
   * Refresh the tree view
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Force a complete refresh of the tree view including cached data
   */
  public forceRefresh(): void {
    this.lastConfig = undefined;
    this.refresh();
  }

  /**
   * Get the tree item for the given element
   */
  getTreeItem(element: DeploymentItem): vscode.TreeItem {
    return element;
  }

  /**
   * Check if the user is currently authenticated
   */
  private isAuthenticated(): boolean {
    return vscode.workspace.getConfiguration('NPL').get('deployment.isAuthenticated') === true;
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
      // First check if the user is authenticated
      const isAuthenticated = this.isAuthenticated();
      this.currentAuthState = isAuthenticated;

      // If not authenticated, just show the login prompt
      if (!isAuthenticated) {
        this.lastConfig = undefined; // Clear the cached config
        return [
          new DeploymentItem(
            'Sign in to Noumena Cloud',
            vscode.TreeItemCollapsibleState.None,
            'login',
            'login',
            undefined,
            undefined,
            undefined,
            new vscode.ThemeIcon('person-add')
          )
        ];
      }

      // If authenticated, ensure we have the latest config
      this.lastConfig = await this.configManager.loadConfig(this.workspaceFolder);

      // If no config or no element, show root items
      if (!element) {
        // If config exists but no applications
        if (!this.lastConfig || !this.lastConfig.applications || this.lastConfig.applications.length === 0) {
          return [
            new DeploymentItem(
              'No applications found',
              vscode.TreeItemCollapsibleState.None,
              'tenant',
              'no-apps'
            ),
            new DeploymentItem(
              'Refresh applications',
              vscode.TreeItemCollapsibleState.None,
              'login',
              'refresh-apps',
              undefined,
              undefined,
              undefined,
              new vscode.ThemeIcon('refresh')
            )
          ];
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

        return tenants;
      } else if (element.itemType === 'tenant') {
        // Show applications for this tenant
        const tenantId = element.id.replace('tenant-', '');
        const applications: DeploymentItem[] = [];

        if (this.lastConfig && this.lastConfig.applications) {
          for (const app of this.lastConfig.applications) {
            if (app.tenantId === tenantId) {
              applications.push(new DeploymentItem(
                app.name,
                vscode.TreeItemCollapsibleState.None,
                'application',
                app.id,
                undefined,
                app,
                this.workspaceFolder
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
