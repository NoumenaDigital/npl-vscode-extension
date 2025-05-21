import * as vscode from 'vscode';
import { AuthManager } from './AuthManager';

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
    super(tenant.name, vscode.TreeItemCollapsibleState.Collapsed);
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

  constructor(private readonly authManager: AuthManager) {}

  refresh(): void {
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
    const url = `${this.getApiBase()}/v1/tenants`;
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
    const url = `${this.getApiBase()}/v1/tenants/${encodeURIComponent(tenantId)}/applications`;
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

  private getApiBase(): string {
    const portal = vscode.workspace.getConfiguration('noumena.cloud').get<string>('portalUrl');
    if (portal && portal.trim().length > 0) {
      return portal.replace(/\/+$/, '') + '/api'; // strip trailing slash
    }
    return 'https://portal.noumena.cloud/api';
  }
}
