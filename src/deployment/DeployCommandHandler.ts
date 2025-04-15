import * as vscode from "vscode";
import { Application, DeploymentConfig, DeploymentConfigManager } from "./DeploymentConfig";
import { DeploymentService } from "./DeploymentService";
import { ILogger } from "../utils/Logger";
import { AuthType, CredentialManager } from "./CredentialManager";
import { JwtProvider, Tenant } from "./JwtProvider";

export class DeployCommandHandler {
  private logger: ILogger;
  private configManager: DeploymentConfigManager;
  private deploymentService: DeploymentService;
  private credentialManager: CredentialManager;

  constructor(logger: ILogger, context: vscode.ExtensionContext) {
    this.logger = logger;
    this.configManager = new DeploymentConfigManager(logger);
    this.deploymentService = new DeploymentService(logger, context);
    this.credentialManager = new CredentialManager(logger, context);
  }

  public async configureDeployment(): Promise<void> {
    try {
      const workspaceFolder = await this.getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      let config = await this.configManager.loadConfig(workspaceFolder);

      if (!config) {
        config = {
          baseUrl: 'https://portal.noumena.cloud',
          username: '',
          authType: AuthType.Basic,
          sourcePath: '',
          applications: []
        };
      }

      // Step 1: Get base URL
      const baseUrl = await vscode.window.showInputBox({
        prompt: 'Enter the Noumena Cloud base URL',
        value: config.baseUrl,
        placeHolder: 'https://portal.noumena.cloud'
      });

      if (!baseUrl) {
        return;
      }

      // Step 2: Choose auth method
      const authMethods = [
        { label: 'Basic Authentication', description: 'Username and password login', value: AuthType.Basic },
        { label: 'Azure Authentication', description: 'Coming soon', value: AuthType.Azure, disabled: true }
      ];

      const authMethodResult = await vscode.window.showQuickPick(
        authMethods.filter(method => !method.disabled),
        {
          placeHolder: 'Select authentication method',
          title: 'Authentication Method'
        }
      );

      if (!authMethodResult) {
        return;
      }

      const authType = authMethodResult.value;

      // Step 3: Get username
      const username = await vscode.window.showInputBox({
        prompt: 'Enter your username',
        value: config.username,
        placeHolder: 'Usually your email address'
      });

      if (!username) {
        return;
      }

      // Step 4: Get password
      const password = await vscode.window.showInputBox({
        prompt: 'Enter your password (will be stored securely)',
        password: true
      });

      if (!password) {
        return;
      }

      // Store the credentials
      await this.credentialManager.storePassword(baseUrl, username, password);

      // Step 5: Authenticate and get tenants
      this.logger.show();
      this.logger.log('Authenticating...');

      const jwtProvider = new JwtProvider({
        username,
        password,
        authUrl: `${baseUrl}/api/auth/login`,
        authType,
        logger: this.logger
      });

      const token = await jwtProvider.provideJwt();
      if (!token) {
        this.logger.logError('Authentication failed');
        vscode.window.showErrorMessage('Failed to authenticate with the provided credentials.');
        return;
      }

      await this.credentialManager.storeToken(baseUrl, username, token);
      this.logger.log('Successfully authenticated');

      // Step 6: Get tenants and applications
      this.logger.log('Retrieving tenants and applications...');
      let tenants: Tenant[];
      try {
        tenants = await jwtProvider.getTenants(baseUrl);
        this.logger.log(`Retrieved ${tenants.length} tenant(s)`);
      } catch (error) {
        this.logger.logError('Failed to retrieve tenants', error);
        vscode.window.showErrorMessage('Failed to retrieve tenants. Please check your connection and permissions.');
        return;
      }

      if (tenants.length === 0) {
        this.logger.logError('No tenants found');
        vscode.window.showErrorMessage('No tenants found. You may not have access to any tenants.');
        return;
      }

      // Step 7: Prepare list of applications from all tenants
      const applications: Application[] = [];
      for (const tenant of tenants) {
        for (const app of tenant.applications) {
          if (app.state === 'active') {
            applications.push({
              id: app.id,
              name: app.name,
              slug: app.slug,
              tenantId: tenant.id,
              tenantName: tenant.name,
              rapidDeploy: false,
              skipRapidDeployWarning: false
            });
          }
        }
      }

      if (applications.length === 0) {
        this.logger.logError('No active applications found');
        vscode.window.showErrorMessage('No active applications found. Please create an application in Noumena Cloud first.');
        return;
      }

      // Step 8: Get source path
      const defaultSourcePath = config.sourcePath || workspaceFolder.uri.fsPath;
      const sourcePath = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(defaultSourcePath),
        openLabel: 'Select source folder',
        title: 'Select the NPL source folder to deploy'
      });

      if (!sourcePath || !sourcePath[0]) {
        return;
      }

      // Create the new config
      const newConfig: DeploymentConfig = {
        baseUrl,
        username,
        authType,
        sourcePath: sourcePath[0].fsPath,
        applications
      };

      await this.configManager.saveConfig(workspaceFolder, newConfig);
      this.logger.log('Deployment configuration saved');
      vscode.window.showInformationMessage('Deployment configuration saved successfully');
    } catch (error) {
      this.logger.logError('Error configuring deployment', error);
      vscode.window.showErrorMessage('Failed to configure deployment');
    }
  }

  public async deployApplication(): Promise<void> {
    try {
      const workspaceFolder = await this.getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const config = await this.configManager.loadConfig(workspaceFolder);
      if (!config) {
        const configOption = 'Configure Deployment';
        const selection = await vscode.window.showErrorMessage(
          'No deployment configuration found. Would you like to create one?',
          configOption
        );

        if (selection === configOption) {
          await this.configureDeployment();
        }
        return;
      }

      if (!config.applications || config.applications.length === 0) {
        vscode.window.showErrorMessage('No applications found in configuration. Please reconfigure deployment.');
        return;
      }

      // Get token (reuse existing or get a new one)
      let token = await this.credentialManager.getToken(config.baseUrl, config.username);
      if (!token) {
        const password = await this.credentialManager.getPassword(config.baseUrl, config.username);
        if (!password) {
          const passwordInput = await vscode.window.showInputBox({
            prompt: 'Enter your password for Noumena Cloud',
            password: true
          });

          if (!passwordInput) {
            return;
          }

          await this.credentialManager.storePassword(config.baseUrl, config.username, passwordInput);
        }

        const jwtProvider = new JwtProvider({
          username: config.username,
          password: password || '',
          authUrl: `${config.baseUrl}/api/auth/login`,
          authType: config.authType,
          logger: this.logger
        });

        const newToken = await jwtProvider.provideJwt();
        if (!newToken) {
          vscode.window.showErrorMessage('Failed to authenticate. Please check your credentials.');
          return;
        }

        await this.credentialManager.storeToken(config.baseUrl, config.username, newToken);
        token = newToken;
      }

      // Create application quick pick items
      const applicationItems = config.applications.map(app => ({
        label: app.name,
        description: `Tenant: ${app.tenantName}`,
        detail: `ID: ${app.id}`,
        picked: config.lastDeployedAppId === app.id,
        app
      }));

      // Sort with the last deployed app first, if any
      if (config.lastDeployedAppId) {
        applicationItems.sort((a, b) => {
          if (a.app.id === config.lastDeployedAppId) return -1;
          if (b.app.id === config.lastDeployedAppId) return 1;
          return 0;
        });
      }

      const selectedApp = await vscode.window.showQuickPick(applicationItems, {
        placeHolder: 'Select application to deploy to',
        title: 'Select Application'
      });

      if (!selectedApp) {
        return;
      }

      const app = selectedApp.app;

      // Ask for rapid deploy option if not set
      if (app.rapidDeploy === undefined) {
        const rapidDeployOptions = [
          { label: 'No', value: false },
          { label: 'Yes - Clear application data before deployment', value: true }
        ];

        const rapidDeploySelection = await vscode.window.showQuickPick(rapidDeployOptions, {
          placeHolder: 'Clear application data before deployment?',
          title: 'Deployment Options'
        });

        if (!rapidDeploySelection) {
          return;
        }

        app.rapidDeploy = rapidDeploySelection.value;
        await this.configManager.saveConfig(workspaceFolder, config);
      }

      // Confirm rapid deploy if needed
      if (app.rapidDeploy && !app.skipRapidDeployWarning) {
        const confirmOption = 'Yes, clear data and deploy';
        const dontWarnOption = 'Yes, and don\'t warn me again';

        const selection = await vscode.window.showWarningMessage(
          'This will DELETE ALL DATA in your application before deployment. Are you sure?',
          { modal: true },
          confirmOption,
          dontWarnOption
        );

        if (selection === dontWarnOption) {
          app.skipRapidDeployWarning = true;
          await this.configManager.saveConfig(workspaceFolder, config);
        } else if (selection !== confirmOption) {
          return;
        }
      }

      // Deploy the application
      await this.deploymentService.deployToApplication(
        workspaceFolder,
        config,
        app,
        token
      );

      // Update last deployed app if successful
      await this.configManager.updateLastDeployedApp(workspaceFolder, app.id);
    } catch (error) {
      this.logger.logError('Error during deployment command', error);
      vscode.window.showErrorMessage('Failed to run deployment');
    }
  }

  public async cleanCredentials(): Promise<void> {
    try {
      const workspaceFolder = await this.getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const config = await this.configManager.loadConfig(workspaceFolder);
      if (!config || !config.baseUrl || !config.username) {
        vscode.window.showInformationMessage('No credentials found to clean');
        return;
      }

      await this.credentialManager.cleanAllCredentials(config.baseUrl, config.username);
      vscode.window.showInformationMessage('Credentials cleaned successfully');
    } catch (error) {
      this.logger.logError('Error cleaning credentials', error);
      vscode.window.showErrorMessage('Failed to clean credentials');
    }
  }

  public async refreshApplications(): Promise<void> {
    try {
      const workspaceFolder = await this.getWorkspaceFolder();
      if (!workspaceFolder) {
        return;
      }

      const config = await this.configManager.loadConfig(workspaceFolder);
      if (!config) {
        vscode.window.showErrorMessage('No deployment configuration found. Please configure deployment first.');
        return;
      }

      // Get token (reuse existing or get a new one)
      let token = await this.credentialManager.getToken(config.baseUrl, config.username);
      if (!token) {
        const password = await this.credentialManager.getPassword(config.baseUrl, config.username);
        if (!password) {
          const passwordInput = await vscode.window.showInputBox({
            prompt: 'Enter your password for Noumena Cloud',
            password: true
          });

          if (!passwordInput) {
            return;
          }

          await this.credentialManager.storePassword(config.baseUrl, config.username, passwordInput);
        }

        const jwtProvider = new JwtProvider({
          username: config.username,
          password: password || '',
          authUrl: `${config.baseUrl}/api/auth/login`,
          authType: config.authType,
          logger: this.logger
        });

        const newToken = await jwtProvider.provideJwt();
        if (!newToken) {
          vscode.window.showErrorMessage('Failed to authenticate. Please check your credentials.');
          return;
        }

        await this.credentialManager.storeToken(config.baseUrl, config.username, newToken);
        token = newToken;
      }

      // Store application settings (rapid deploy, warnings) for later
      const appSettings = new Map<string, { rapidDeploy: boolean, skipRapidDeployWarning?: boolean }>();
      if (config.applications) {
        for (const app of config.applications) {
          appSettings.set(app.id, {
            rapidDeploy: app.rapidDeploy,
            skipRapidDeployWarning: app.skipRapidDeployWarning
          });
        }
      }

      // Get fresh list of tenants and applications
      this.logger.show();
      this.logger.log('Refreshing tenants and applications...');

      const jwtProvider = new JwtProvider({
        username: config.username,
        password: '',
        authUrl: `${config.baseUrl}/api/auth/login`,
        authType: config.authType,
        logger: this.logger
      });
      // Override the provideJwt method to use our existing token
      const originalProvideJwt = jwtProvider.provideJwt;
      jwtProvider.provideJwt = async () => token;

      let tenants: Tenant[];
      try {
        tenants = await jwtProvider.getTenants(config.baseUrl);
        // Restore the original method
        jwtProvider.provideJwt = originalProvideJwt;
        this.logger.log(`Retrieved ${tenants.length} tenant(s)`);
      } catch (error) {
        // Restore the original method
        jwtProvider.provideJwt = originalProvideJwt;
        this.logger.logError('Failed to retrieve tenants', error);
        vscode.window.showErrorMessage('Failed to refresh applications. Please check your connection and permissions.');
        return;
      }

      if (tenants.length === 0) {
        this.logger.logError('No tenants found');
        vscode.window.showErrorMessage('No tenants found. You may not have access to any tenants.');
        return;
      }

      // Prepare updated applications list
      const applications: Application[] = [];
      for (const tenant of tenants) {
        for (const app of tenant.applications) {
          if (app.state === 'active') {
            const appId = app.id;
            const settings = appSettings.get(appId) || { rapidDeploy: false };

            applications.push({
              id: appId,
              name: app.name,
              slug: app.slug,
              tenantId: tenant.id,
              tenantName: tenant.name,
              rapidDeploy: settings.rapidDeploy,
              skipRapidDeployWarning: settings.skipRapidDeployWarning
            });
          }
        }
      }

      // Update the config
      config.applications = applications;
      await this.configManager.saveConfig(workspaceFolder, config);

      this.logger.log(`Applications refreshed successfully. Found ${applications.length} active applications.`);
      vscode.window.showInformationMessage(
        `Applications refreshed successfully. Found ${applications.length} active applications.`
      );
    } catch (error) {
      this.logger.logError('Error refreshing applications', error);
      vscode.window.showErrorMessage('Failed to refresh applications');
    }
  }

  private async getWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder opened');
      return undefined;
    }

    if (workspaceFolders.length === 1) {
      return workspaceFolders[0];
    }

    return vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select workspace folder for deployment configuration'
    });
  }
}
