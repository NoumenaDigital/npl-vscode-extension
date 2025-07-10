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
  constructor(public readonly application: Application) {
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
      placeHolder: `Select deployment type for ${item.application.name}`,
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
      void vscode.window.showErrorMessage(`Deployment failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Deploy both backend and frontend applications. */
  private async deployBoth(item: ApplicationItem): Promise<void> {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Deploying backend and frontend...',
      cancellable: false
    }, async (progress) => {
      progress.report({ message: 'Deploying backend...' });
      await this.deployApplication(item);

      progress.report({ message: 'Deploying frontend...' });
      await this.deployFrontendApplication(item);
    });

    void vscode.window.showInformationMessage(`Full deployment to ${item.application.name} completed successfully.`);
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

      void vscode.window.showInformationMessage(`Backend deployment to ${item.application.name} completed successfully.`);

      // Offer to create frontend config after successful backend deployment
      await this.offerFrontendConfig(item);
    } catch (err) {
      this.logger.logError('Backend deployment failed', err);
      void vscode.window.showErrorMessage(`Backend deployment failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Deploy frontend by zipping the configured frontend sources directory. */
  public async deployFrontendApplication(item: ApplicationItem): Promise<void> {
    try {
      const rootDir = await this.getFrontendDeploymentRoot();
      if (!rootDir) {
        return; // user cancelled or no frontend sources configured
      }

      const zipBuffer = await createArchiveBuffer(rootDir);

      await this.deployer.deployWebsiteBuffer(item.application.id, zipBuffer, 'frontend.zip');

      void vscode.window.showInformationMessage(`Frontend deployment to ${item.application.name} completed successfully.`);
    } catch (err) {
      this.logger.logError('Frontend deployment failed', err);
      void vscode.window.showErrorMessage(`Frontend deployment failed: ${err instanceof Error ? err.message : String(err)}`);
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
          'Use Frontend/Dist',
          'Configure Different Folder',
          'Cancel'
        );

        if (choice === 'Use Frontend/Dist') {
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

  /** Offer to create frontend configuration file after successful backend deployment. */
  private async offerFrontendConfig(item: ApplicationItem): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }
    const workspaceFolder = workspaceFolders[0];
    const configPath = vscode.Uri.joinPath(workspaceFolder.uri, 'frontend-config.ts');

    // Only offer if the file does not exist
    try {
      await vscode.workspace.fs.stat(configPath);
      // File exists, do not prompt
      return;
    } catch (err) {
      // File does not exist, proceed to offer
    }

    const choice = await vscode.window.showInformationMessage(
      `Would you like to create a frontend configuration file for ${item.application.name}?`,
      'Create Config',
      'Not Now'
    );

    if (choice !== 'Create Config') {
      return;
    }

    try {
      await this.createFrontendConfig(item);
    } catch (err) {
      this.logger.logError('Failed to create frontend config', err);
      void vscode.window.showErrorMessage(`Failed to create frontend config: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Create frontend configuration file with connection details. */
  private async createFrontendConfig(item: ApplicationItem): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      void vscode.window.showErrorMessage('No workspace folder open.');
      return;
    }

    // Get tenant information
    const tenant = await this.getTenantForApplication(item.application.id);
    if (!tenant) {
      void vscode.window.showErrorMessage('Could not find tenant information for the application.');
      return;
    }

    // Check if frontend-config.ts already exists
    const workspaceFolder = workspaceFolders[0];
    const configPath = vscode.Uri.joinPath(workspaceFolder.uri, 'frontend-config.ts');

    try {
      await vscode.workspace.fs.stat(configPath);
      void vscode.window.showInformationMessage('Frontend configuration file already exists. Skipping creation.');
      return;
    } catch (err) {
      // File doesn't exist, proceed with creation
    }

    // Prompt user for package name
    const packageName = await vscode.window.showInputBox({
      prompt: `Enter the NPL package name for ${item.application.name}`,
      placeHolder: 'e.g., iou, rental, payment',
      value: item.application.slug, // Default to application slug
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Package name cannot be empty';
        }
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
          return 'Package name must start with a letter and contain only letters, numbers, and underscores';
        }
        return null;
      }
    });

    if (!packageName) {
      return; // User cancelled
    }

        // Get domain configuration
    const domain = vscode.workspace.getConfiguration('noumena.cloud').get<string>('domain') || 'noumena.cloud';

    // Construct tenant-specific URLs
    const engineUrl = `https://engine-${tenant.slug}-${item.application.slug}.${domain}`;
    const keycloakUrl = `https://keycloak-${tenant.slug}-${item.application.slug}.${domain}`;

    // Generate configuration content
    const configContent = `export const NPL_APPLICATION_URL = "${engineUrl}";
export const NPL_CLIENT_ID = "${item.application.slug}";
export const NPL_TOKEN_ENDPOINT = "${keycloakUrl}/realms/${item.application.slug}/protocol/openid-connect/token";
export const NPL_SWAGGER_URL = "${engineUrl}/npl/${packageName}/-/openapi.json";`;

    const wsedit = new vscode.WorkspaceEdit();
    wsedit.createFile(configPath, { overwrite: true });
    wsedit.insert(configPath, new vscode.Position(0, 0), configContent);

    await vscode.workspace.applyEdit(wsedit);

    // Open the file
    const document = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(document);

    void vscode.window.showInformationMessage(`Frontend configuration created: ${configPath.fsPath}`);
  }

  /** Get tenant information for an application. */
  private async getTenantForApplication(appId: string): Promise<Tenant | null> {
    if (!this.tenants) {
      try {
        this.tenants = await this.fetchTenants();
      } catch (err) {
        this.logger.logError('Failed to fetch tenants', err);
        return null;
      }
    }

    for (const tenant of this.tenants) {
      if (tenant.applications) {
        for (const app of tenant.applications) {
          if (app.id === appId) {
            return tenant;
          }
        }
      }
    }

    return null;
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
