import * as vscode from 'vscode';
import { AuthManager } from './AuthManager';
import { Logger } from '../utils/Logger';
import { createArchiveBuffer } from '../utils/ZipUtil';
import { DeploymentService } from './DeploymentService';
import { getApiBase } from '../utils/ApiUtil';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  state?: string;
  applications?: Application[];
  [key: string]: any;
}

interface Application {
  id: string;
  name: string;
  slug: string;
  state?: string;
  [key: string]: any;
}

class CloudItem extends vscode.TreeItem {}

class TenantItem extends CloudItem {
  constructor(public readonly tenant: Tenant) {
    super(tenant.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'tenant';
    this.tooltip = tenant.slug;
    this.id = tenant.id;
  }
}

class ApplicationItem extends CloudItem {
  constructor(public readonly application: Application) {
    super(application.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'application';
    this.tooltip = application.slug;
    this.id = application.id;
  }
}

export class CloudAppsProvider implements vscode.TreeDataProvider<CloudItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<CloudItem | undefined | null | void> = new vscode.EventEmitter<CloudItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<CloudItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private isLoggedIn = false;
  private username: string | undefined;
  private tenants: Tenant[] | null = null;

  private readonly logger: Logger;
  private readonly deployer: DeploymentService;
  private readonly context: vscode.ExtensionContext;

  constructor(private readonly authManager: AuthManager, context: vscode.ExtensionContext, logger: Logger) {
    this.logger = logger;
    this.context = context;
    this.deployer = new DeploymentService(authManager, logger);
  }

  refresh(): void {
    this.tenants = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CloudItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CloudItem): Thenable<CloudItem[]> {
    if (!this.isLoggedIn) {
      return Promise.resolve([]);
    }
    if (!element) {
      return this.getTenantItems();
    }
    if (element instanceof TenantItem) {
      return this.getApplicationItems(element.tenant);
    }
    return Promise.resolve([]);
  }

  setLoggedIn(username: string): void {
    this.isLoggedIn = true;
    this.username = username;
    this.tenants = null;
    this.refresh();
  }

  setLoggedOut(): void {
    this.isLoggedIn = false;
    this.username = undefined;
    this.tenants = null;
    this.refresh();
  }

  /* Data loading helpers */
  private async getTenantItems(): Promise<CloudItem[]> {
    if (!this.tenants) {
      try {
        this.tenants = await this.fetchTenants();
      } catch (err) {
        console.error(err);
        void vscode.window.showErrorMessage(`Failed to load tenants: ${err instanceof Error ? err.message : String(err)}`);
        this.tenants = [];
      }
    }
    return this.tenants.map(t => new TenantItem(t));
  }

  private async getApplicationItems(tenant: Tenant): Promise<CloudItem[]> {
    if (!tenant.applications) {
      try {
        tenant.applications = await this.fetchApplications(tenant.id);
        this.refresh();
      } catch (err) {
        console.error(err);
        void vscode.window.showErrorMessage(`Failed to load applications for tenant ${tenant.name}: ${err instanceof Error ? err.message : String(err)}`);
        tenant.applications = [];
      }
    }
    return (tenant.applications ?? []).map(a => new ApplicationItem(a));
  }

  private async fetchTenants(): Promise<Tenant[]> {
    const token = await this.authManager.getAccessToken();
    if (!token) {
      throw new Error('No access token');
    }
    const url = `${getApiBase()}/v1/tenants`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    return (await res.json()) as Tenant[];
  }

  private async fetchApplications(tenantId: string): Promise<Application[]> {
    const token = await this.authManager.getAccessToken();
    if (!token) {
      throw new Error('No access token');
    }
    const url = `${getApiBase()}/v1/tenants/${encodeURIComponent(tenantId)}/applications`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    return (await res.json()) as Application[];
  }

  /** Deploy selected application by zipping workspace folder determined from migration descriptor. */
  public async deployApplication(item: ApplicationItem): Promise<void> {
    try {
      const rootDir = await this.getDeploymentRoot();
      if (!rootDir) {
        return; // user cancelled or no descriptor
      }

      const zipBuffer = await createArchiveBuffer(rootDir);

      await this.deployer.deployArchiveBuffer(item.application.id, zipBuffer);

      void vscode.window.showInformationMessage(`Deployment to ${item.application.name} completed successfully.`);
    } catch (err) {
      this.logger.logError('Deployment failed', err);
      void vscode.window.showErrorMessage(`Deployment failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async getDeploymentRoot(): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      void vscode.window.showErrorMessage('No workspace folder open.');
      return undefined;
    }

    // Look for the first workspace folder with a configured migration descriptor
    for (const folder of workspaceFolders) {
      const descriptor = vscode.workspace.getConfiguration('NPL', folder.uri).get<string>('migrationDescriptor');
      if (descriptor && descriptor.trim().length > 0) {
        const path = require('path');
        return path.dirname(path.dirname(descriptor));
      }
    }

    const choice = await vscode.window.showErrorMessage('The path to the migration needs to be configured.', 'Configure', 'Cancel');
    if (choice === 'Configure') {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'NPL.migrationDescriptor');
    }
    return undefined;
  }

  /** Clear deployed content for the given application, with confirmation dialog that can be skipped per app. */
  public async clearApplication(item: ApplicationItem): Promise<void> {
    const app = item.application;
    const skipKey = `noumena.cloud.clear.skip.${app.id}`;
    const skipConfirm = this.context.globalState.get<boolean>(skipKey);

    let proceed = true;

    if (!skipConfirm) {
      const choice = await vscode.window.showWarningMessage(
        `Are you sure you want to clear deployed content for ${app.name}?`,
        { modal: true },
        'Clear',
        "Clear and don't ask again"
      );

      if (choice === undefined) { // User closed dialog
        proceed = false;
      } else if (choice === "Clear and don't ask again") {
        await this.context.globalState.update(skipKey, true);
      } else if (choice !== 'Clear') {
        proceed = false;
      }
    }

    if (!proceed) {
      return;
    }

    try {
      await this.deployer.clearApplication(app.id);
      void vscode.window.showInformationMessage(`Cleared deployed content for ${app.name}.`);
    } catch (err) {
      this.logger.logError('Clear deployment failed', err);
      void vscode.window.showErrorMessage(`Failed to clear deployed content: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
