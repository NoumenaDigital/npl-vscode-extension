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
  provider?: string;
  engine_version?: { version: string; deprecated?: boolean; [key: string]: any };
  state?: string;
  deployed_at?: string;
  [key: string]: any;
}

class CloudItem extends vscode.TreeItem {}

class TenantItem extends CloudItem {
  constructor(public readonly tenant: Tenant) {
    super(tenant.name, vscode.TreeItemCollapsibleState.Expanded);
    const stateNorm = (tenant.state ?? '').toLowerCase();
    this.contextValue = `tenant-${stateNorm || 'unknown'}`;
    this.id = tenant.id;
    this.iconPath = getStateIcon(tenant.state);

    const lines: string[] = [];
    const fieldsToDisplay: { displayName: string; getValue: (tenant: Tenant) => string | undefined }[] = [
      { displayName: 'Slug', getValue: tenant => tenant.slug },
      { displayName: 'State', getValue: tenant => tenant.state }
    ];

    for (const field of fieldsToDisplay) {
      const value = field.getValue(this.tenant);

      if (value === null || value === undefined || value.trim() === '') {
        continue;
      }

      let entryString = `**${field.displayName}**:`;
      entryString += ` ${String(value)}`;
      lines.push(entryString);
    }

    const tooltipMarkdown = lines.join('\n\n');
    const markdown = new vscode.MarkdownString(tooltipMarkdown, true);
    markdown.isTrusted = true;

    this.tooltip = markdown;
  }
}

class ApplicationItem extends CloudItem {
  constructor(public readonly application: Application, public readonly tenantSlug: string) {
    super(application.name, vscode.TreeItemCollapsibleState.None);
    const stateNorm = (application.state ?? '').toLowerCase();
    this.contextValue = `application-${stateNorm || 'unknown'}`;
    this.id = application.id;
    this.iconPath = getStateIcon(application.state);

    const lines: string[] = [];
    const fieldsToDisplay: { displayName: string; getValue: (app: Application) => string | undefined }[] = [
      { displayName: 'Slug', getValue: app => app.slug },
      { displayName: 'Provider', getValue: app => app.provider },
      { displayName: 'Engine version', getValue: app => app.engine_version?.version },
      { displayName: 'State', getValue: app => app.state },
      { displayName: 'Deployed at', getValue: app => app.deployed_at }
    ];

    for (const field of fieldsToDisplay) {
      const value = field.getValue(this.application);

      if (value === null || value === undefined || value.trim() === '') {
        continue;
      }

      let entryString = `**${field.displayName}**:`;
      entryString += ` ${String(value)}`;
      lines.push(entryString);
    }

    const tooltipMarkdown = lines.join('\n\n');
    const markdown = new vscode.MarkdownString(tooltipMarkdown, true);
    markdown.isTrusted = true;

    this.tooltip = markdown;
  }

  get tenantAppSlug(): string {
    return `${this.tenantSlug}/${this.application.slug}`;
  }
}

// Helper to render a colored state icon that works across all tree items
function getStateIcon(state: string | undefined): vscode.ThemeIcon {
  const normalized = (state ?? '').toLowerCase();
  switch (normalized) {
    case 'active':
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
    case 'pending':
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow'));
    case 'deactivated':
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('disabledForeground'));
    default:
      return new vscode.ThemeIcon('circle-outline');
  }
}

export class CloudAppsProvider implements vscode.TreeDataProvider<CloudItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<CloudItem | undefined | null | void> = new vscode.EventEmitter<CloudItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<CloudItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private isLoggedIn = false;
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
    this.tenants = null;
    this.refresh();
  }

  setLoggedOut(): void {
    this.isLoggedIn = false;
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
    return (tenant.applications ?? []).map(a => new ApplicationItem(a, tenant.slug));
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

  /** Show deployment options and handle the selected deployment type. */
  public async showDeployOptions(item: ApplicationItem): Promise<void> {
    const options = [
      {
        label: '$(server) NPL Backend',
        description: 'Deploy NPL backend code',
        detail: 'Uses migration.yml to deploy server-side logic',
        value: 'backend'
      },
      {
        label: '$(globe) Static Frontend',
        description: 'Deploy static website files',
        detail: 'Deploy HTML, CSS, JS files to web server',
        value: 'frontend'
      },
      {
        label: '$(rocket) Deploy Both',
        description: 'Deploy backend and frontend together',
        detail: 'Deploy both NPL backend and static frontend',
        value: 'both'
      }
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: `Select deployment type for ${item.tenantAppSlug}`,
      ignoreFocusOut: true
    });

    if (!selected) {
      return; // User cancelled
    }

    try {
      switch (selected.value) {
        case 'backend':
          await this.deployApplication(item);
          break;
        case 'frontend':
          await this.deployFrontendApplication(item);
          break;
        case 'both':
          await this.deployBoth(item);
          break;
      }
    } catch (err) {
      this.logger.logError('Deployment failed', err);
      const deploymentType = selected.value === 'backend' ? 'Backend' :
                            selected.value === 'frontend' ? 'Frontend' :
                            'Full';
      void vscode.window.showErrorMessage(`${deploymentType} deployment to ${item.tenantAppSlug} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Deploy both backend and frontend applications. */
  private async deployBoth(item: ApplicationItem): Promise<void> {
    const results = { backend: null as Error | null, frontend: null as Error | null };

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Deploying backend and frontend...',
      cancellable: false
    }, async (progress) => {
      progress.report({ message: 'Deploying backend...' });
      try {
        await this.deployApplication(item, false);
        progress.report({ message: 'Backend deployed successfully.' });
      } catch (err) {
        results.backend = err instanceof Error ? err : new Error(String(err));
        progress.report({ message: 'Backend deployment failed.' });
      }

      if (results.backend) {
        progress.report({ message: 'Deploying frontend (backend failed)...' });
      } else {
        progress.report({ message: 'Deploying frontend...' });
      }

      try {
        await this.deployFrontendApplication(item, false);
        progress.report({ message: 'Frontend deployed successfully.' });
      } catch (err) {
        results.frontend = err instanceof Error ? err : new Error(String(err));
        progress.report({ message: 'Frontend deployment failed.' });
      }
    });

    // Report results
    this.showDeploymentResults(item, results);
  }

  /** Show appropriate notifications based on deployment results. */
  private showDeploymentResults(item: ApplicationItem, results: { backend: Error | null, frontend: Error | null }): void {
    const deployments = [
      { name: 'Backend', error: results.backend },
      { name: 'Frontend', error: results.frontend }
    ];

    const successes = deployments.filter(d => !d.error);
    const failures = deployments.filter(d => d.error);

    if (failures.length === 0) {
      // All succeeded
      vscode.window.showInformationMessage(`Full deployment to ${item.tenantAppSlug} completed successfully.`);
    } else if (successes.length === 0) {
      // All failed
      const errorDetails = failures.map(f => `${f.name}: ${f.error!.message}`).join('. ');
      vscode.window.showErrorMessage(`Both deployments to ${item.tenantAppSlug} failed. ${errorDetails}`);
    } else {
      // Mixed results - show individual messages
      successes.forEach(s =>
        vscode.window.showInformationMessage(`${s.name} deployment to ${item.tenantAppSlug} completed successfully.`)
      );
      failures.forEach(f =>
        vscode.window.showErrorMessage(`${f.name} deployment to ${item.tenantAppSlug} failed: ${f.error!.message}`)
      );
    }
  }

  /** Deploy selected application by zipping workspace folder determined from migration descriptor. */
  public async deployApplication(item: ApplicationItem, showSuccessMessage: boolean = true): Promise<void> {
    const rootDir = await this.getDeploymentRoot();
    if (!rootDir) {
      // User cancelled or no root found - return silently
      return;
    }

    const zipBuffer = await createArchiveBuffer(rootDir);

    await this.deployer.deployArchiveBuffer(item.application.id, zipBuffer);

    if (showSuccessMessage) {
      void vscode.window.showInformationMessage(`Backend deployment to ${item.tenantAppSlug} completed successfully.`);
    }
  }

  /** Deploy frontend by zipping the configured frontend sources directory. */
  public async deployFrontendApplication(item: ApplicationItem, showSuccessMessage: boolean = true): Promise<void> {
    const rootDir = await this.getFrontendDeploymentRoot();
    if (!rootDir) {
      // User cancelled or no root found - return silently
      return;
    }

    const zipBuffer = await createArchiveBuffer(rootDir);

    await this.deployer.deployWebsiteBuffer(item.application.id, zipBuffer, 'frontend.zip');

    if (showSuccessMessage) {
      void vscode.window.showInformationMessage(`Frontend deployment to ${item.tenantAppSlug} completed successfully.`);
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
        return path.dirname(descriptor);
      }
    }

    const choice = await vscode.window.showErrorMessage('The path to the migration needs to be configured.', 'Configure', 'Cancel');
    if (choice === 'Configure') {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'NPL.migrationDescriptor');
    }
    return undefined;
  }

  private async getFrontendDeploymentRoot(): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      void vscode.window.showErrorMessage('No workspace folder open.');
      return undefined;
    }

    // Look for the first workspace folder with configured frontend sources
    for (const folder of workspaceFolders) {
      const frontendSources = vscode.workspace.getConfiguration('NPL', folder.uri).get<string>('frontendSources');
      if (frontendSources && frontendSources.trim().length > 0) {
        return frontendSources;
      }
    }

    // Check for common frontend build directories
    const path = require('path');
    const fs = require('fs');
    for (const folder of workspaceFolders) {
      // First check for frontend/dist (most common for built files)
      const frontendDistPath = path.join(folder.uri.fsPath, 'frontend', 'dist');
      let frontendDistExists = false;
      try {
        const stat = await fs.promises.stat(frontendDistPath);
        frontendDistExists = stat.isDirectory();
      } catch (err) {
        // Directory doesn't exist
      }

      if (frontendDistExists) {
        const choice = await vscode.window.showInformationMessage(
          `Found a 'frontend/dist' folder. Would you like to deploy from there?`,
          'Use frontend/dist',
          'Configure Different Folder',
          'Cancel'
        );

        if (choice === 'Use frontend/dist') {
          // Save this choice for future deployments
          const config = vscode.workspace.getConfiguration('NPL', folder.uri);
          await config.update('frontendSources', frontendDistPath, vscode.ConfigurationTarget.WorkspaceFolder);
          return frontendDistPath;
        } else if (choice === 'Configure Different Folder') {
          void vscode.commands.executeCommand('workbench.action.openSettings', 'NPL.frontendSources');
          return undefined;
        } else {
          return undefined;
        }
      }


    }

    // No frontend/dist folder found, prompt to configure
    const choice = await vscode.window.showErrorMessage(
      'No sources configured and no "frontend/dist" folder found in the workspace. Please configure the sources path.',
      'Configure',
      'Cancel'
    );

    if (choice === 'Configure') {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'NPL.frontendSources');
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
        `Are you sure you want to clear deployed content for ${item.tenantAppSlug}?`,
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
      void vscode.window.showInformationMessage(`Cleared deployed content for ${item.tenantAppSlug}.`);
    } catch (err) {
      this.logger.logError('Clear deployment failed', err);
      void vscode.window.showErrorMessage(`Failed to clear deployed content for ${item.tenantAppSlug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
