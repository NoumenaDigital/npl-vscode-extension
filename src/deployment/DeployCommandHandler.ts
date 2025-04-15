import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as glob from "glob";
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

  /**
   * Gets a fresh authentication token for the given configuration
   * @param config The deployment configuration
   * @returns A fresh token or undefined if authentication fails
   */
  private async getFreshToken(config: DeploymentConfig): Promise<string | undefined> {
    try {
      // Always get the stored password
      const password = await this.credentialManager.getPassword(config.baseUrl, config.username);
      if (!password) {
        const passwordInput = await vscode.window.showInputBox({
          prompt: 'Enter your password for Noumena Cloud',
          password: true
        });

        if (!passwordInput) {
          return undefined;
        }

        await this.credentialManager.storePassword(config.baseUrl, config.username, passwordInput);

        // Use the new password
        const jwtProvider = new JwtProvider({
          username: config.username,
          password: passwordInput,
          authUrl: `${config.baseUrl}/api/auth/login`,
          authType: config.authType,
          logger: this.logger
        });

        const newToken = await jwtProvider.provideJwt();
        // Handle null token case
        if (newToken) {
          await this.credentialManager.storeToken(config.baseUrl, config.username, newToken);
          return newToken;
        }
        return undefined;
      }

      // Always get a fresh token with the stored password
      const jwtProvider = new JwtProvider({
        username: config.username,
        password: password,
        authUrl: `${config.baseUrl}/api/auth/login`,
        authType: config.authType,
        logger: this.logger
      });

      const newToken = await jwtProvider.provideJwt();
      // Handle null token case
      if (newToken) {
        await this.credentialManager.storeToken(config.baseUrl, config.username, newToken);
        return newToken;
      }
      return undefined;
    } catch (error) {
      this.logger.logError("Error getting fresh token", error);
      return undefined;
    }
  }

  public async configureDeployment(): Promise<boolean> {
    try {
      const workspaceFolder = await this.getWorkspaceFolder();
      if (!workspaceFolder) {
        return false;
      }

      let config = await this.configManager.loadConfig(workspaceFolder);

      if (!config) {
        config = {
          baseUrl: 'https://portal.noumena.cloud',
          username: '',
          authType: AuthType.Basic,
          sourcePath: '', // Empty source path, will be set during deployment
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
        return false;
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
        return false;
      }

      const authType = authMethodResult.value;

      // Step 3: Get username
      const username = await vscode.window.showInputBox({
        prompt: 'Enter your username',
        value: config.username,
        placeHolder: 'Usually your email address'
      });

      if (!username) {
        return false;
      }

      // Step 4: Get password
      const password = await vscode.window.showInputBox({
        prompt: 'Enter your password (will be stored securely)',
        password: true
      });

      if (!password) {
        return false;
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
        return false;
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
        return false;
      }

      if (tenants.length === 0) {
        this.logger.logError('No tenants found');
        vscode.window.showErrorMessage('No tenants found. You may not have access to any tenants.');
        return false;
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
        return false;
      }

      // Create the new config with default empty source path
      // We'll set source paths when deploying
      const newConfig: DeploymentConfig = {
        baseUrl,
        username,
        authType,
        sourcePath: '',
        applications
      };

      await this.configManager.saveConfig(workspaceFolder, newConfig);

      // Set the authentication state in user settings
      await vscode.workspace.getConfiguration('NPL').update('deployment.isAuthenticated', true, vscode.ConfigurationTarget.Global);

      this.logger.log('Deployment configuration saved');
      vscode.window.showInformationMessage('Successfully signed in to Noumena Cloud.');
      return true;
    } catch (error) {
      this.logger.logError('Error configuring deployment', error);
      vscode.window.showErrorMessage('Failed to sign in to Noumena Cloud');
      return false;
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

      // Always get a fresh token
      const token = await this.getFreshToken(config);
      if (!token) {
        vscode.window.showErrorMessage('Failed to authenticate. Please check your credentials.');
        return;
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

      // Ensure we have a source path for this application
      const sourcePath = await this.ensureSourcePath(workspaceFolder, app, config);
      if (!sourcePath) {
        return; // User cancelled the source path selection
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
        token,
        sourcePath
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

      // Clear the authentication state in user settings
      await vscode.workspace.getConfiguration('NPL').update('deployment.isAuthenticated', false, vscode.ConfigurationTarget.Global);

      // Clear the tree view data
      await this.configManager.saveConfig(workspaceFolder, {
        baseUrl: config.baseUrl,
        username: '',
        authType: config.authType,
        sourcePath: '',
        applications: []
      });

      vscode.window.showInformationMessage('Successfully signed out from Noumena Cloud');
    } catch (error) {
      this.logger.logError('Error cleaning credentials', error);
      vscode.window.showErrorMessage('Failed to sign out');
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

      // Always get a fresh token
      const token = await this.getFreshToken(config);
      if (!token) {
        vscode.window.showErrorMessage('Failed to authenticate. Please check your credentials.');
        return;
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
        password: '',  // We don't need the password here
        authUrl: `${config.baseUrl}/api/auth/login`,
        authType: config.authType,
        logger: this.logger
      });

      // Set the token directly instead of overriding provideJwt
      jwtProvider.setToken(token);

      let tenants: Tenant[];
      try {
        tenants = await jwtProvider.getTenants(config.baseUrl);
        this.logger.log(`Retrieved ${tenants.length} tenant(s)`);
      } catch (error) {
        this.logger.logError('Failed to retrieve tenants', error);

        // Check if the error is related to authentication
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('Authentication failed') || errorMsg.includes('401')) {
          vscode.window.showErrorMessage('Your session has expired. Please try again to get a new token.');
        } else {
          vscode.window.showErrorMessage('Failed to refresh applications. Please check your connection and permissions.');
        }
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

  /**
   * Deploy a specific application from the tree view
   * @param app The application to deploy
   */
  public async deployFromTreeView(app: Application): Promise<void> {
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

      // Always get a fresh token
      const token = await this.getFreshToken(config);
      if (!token) {
        vscode.window.showErrorMessage('Failed to authenticate. Please check your credentials.');
        return;
      }

      // Ensure we have a source path for this application
      const sourcePath = await this.ensureSourcePath(workspaceFolder, app, config);
      if (!sourcePath) {
        return; // User cancelled the source path selection
      }

      // Confirm rapid deploy if needed
      if (app.rapidDeploy && !app.skipRapidDeployWarning) {
        const confirmOption = 'Yes, clear data and deploy';
        const dontWarnOption = 'Yes, and don\'t warn me again';

        const selection = await vscode.window.showWarningMessage(
          `This will DELETE ALL DATA in ${app.name} before deployment. Are you sure?`,
          { modal: true },
          confirmOption,
          dontWarnOption
        );

        if (selection === dontWarnOption) {
          // Update the app in the config
          const appInConfig = config.applications.find(a => a.id === app.id);
          if (appInConfig) {
            appInConfig.skipRapidDeployWarning = true;
            await this.configManager.saveConfig(workspaceFolder, config);
          }
        } else if (selection !== confirmOption) {
          return;
        }
      }

      // Deploy the application
      await this.deploymentService.deployToApplication(
        workspaceFolder,
        config,
        app,
        token,
        sourcePath
      );

      // Update last deployed app if successful
      await this.configManager.updateLastDeployedApp(workspaceFolder, app.id);

      vscode.window.showInformationMessage(`Successfully deployed to ${app.name}`);
    } catch (error) {
      this.logger.logError('Error during deployment from tree view', error);
      vscode.window.showErrorMessage('Failed to deploy application');
    }
  }

  /**
   * Detects the most likely NPL source directory within a workspace
   * Looks for standard NPL project structure: src/main directory containing npl-X.Y folders
   * with NPL files and migration.yaml files
   *
   * @param workspaceFolder The workspace folder to scan
   * @returns The detected source folder path or undefined if not found
   */
  private async detectNplSourceFolder(workspaceFolder: vscode.WorkspaceFolder): Promise<string | undefined> {
    try {
      const rootPath = workspaceFolder.uri.fsPath;

      // Main path should be src/main, not src/main/npl-X.Y
      const mainPath = path.join(rootPath, 'src', 'main');

      if (!fs.existsSync(mainPath)) {
        this.logger.log('src/main directory not found');
        return undefined;
      }

      // Check for npl-* subdirectories to validate it's an NPL project
      const nplFolderPattern = path.join(mainPath, 'npl-*');
      const nplFolders = glob.sync(nplFolderPattern, {
        nodir: false,  // Include directories
        mark: true     // Add / to directories
      }).filter(p => fs.lstatSync(p).isDirectory());

      if (nplFolders.length === 0) {
        this.logger.log('No NPL source folders found matching pattern src/main/npl-*');
        return undefined;
      }

      // Check if any of the npl-* folders contain .npl files
      let hasNplFiles = false;
      for (const nplFolder of nplFolders) {
        const nplFiles = glob.sync(path.join(nplFolder, '**', '*.npl'));
        if (nplFiles.length > 0) {
          hasNplFiles = true;
          break;
        }
      }

      if (!hasNplFiles) {
        this.logger.log('No NPL files found in src/main/npl-* directories');
        return undefined;
      }

      // Look for migration.yaml or migration.yml file in various locations
      const yamlDirs = [
        mainPath,                       // src/main
        path.join(mainPath, 'yaml'),    // src/main/yaml
        path.join(mainPath, 'yml'),     // src/main/yml
        path.join(rootPath, 'src', 'yaml'),  // src/yaml
        path.join(rootPath, 'src', 'yml'),   // src/yml
        path.join(rootPath, 'src', 'resources'), // src/resources
      ];

      for (const yamlDir of yamlDirs) {
        if (!fs.existsSync(yamlDir)) {
          continue;
        }

        const migrationFiles = [
          path.join(yamlDir, 'migration.yaml'),
          path.join(yamlDir, 'migration.yml')
        ];

        for (const migFile of migrationFiles) {
          if (fs.existsSync(migFile)) {
            this.logger.log(`Found standard NPL project structure with src/main`);
            return mainPath; // Return src/main path
          }
        }
      }

      // Even if we can't find the migration file, if we found NPL files, return src/main
      if (hasNplFiles) {
        this.logger.log(`Found NPL folder structure (no migration file found)`);
        return mainPath; // Return src/main path
      }

      this.logger.log('No suitable NPL source folder detected');
      return undefined;
    } catch (error) {
      this.logger.logError('Error detecting NPL source folder', error);
      return undefined;
    }
  }

  /**
   * Ensures a source path is set for the application
   * @param workspaceFolder The workspace folder
   * @param app The application
   * @param config The deployment configuration
   * @returns The source path to use or undefined if cancelled
   */
  private async ensureSourcePath(
    workspaceFolder: vscode.WorkspaceFolder,
    app: Application,
    config: DeploymentConfig
  ): Promise<string | undefined> {
    // If app has a specific source path, use it
    if (app.sourcePath) {
      return app.sourcePath;
    }

    // Try to detect NPL source folder with standard structure
    const detectedPath = await this.detectNplSourceFolder(workspaceFolder);

    // If config has a default source path, use it
    if (config.sourcePath) {
      // Ask if user wants to set a specific path for this app
      const defaultOption = 'Use Default Path';
      const specificOption = 'Set Application-Specific Path';
      const detectedOption = detectedPath ? 'Use Detected NPL Folder' : undefined;

      const options = [defaultOption, specificOption];
      if (detectedOption) {
        options.push(detectedOption);
      }

      const choice = await vscode.window.showInformationMessage(
        `Choose source path for ${app.name}:`,
        ...options
      );

      if (choice === specificOption) {
        // Show folder picker
        const sourcePath = await this.pickSourceFolder(workspaceFolder, app.name);
        if (sourcePath) {
          // Save the path to the app config
          app.sourcePath = sourcePath;
          const appInConfig = config.applications.find(a => a.id === app.id);
          if (appInConfig) {
            appInConfig.sourcePath = sourcePath;
            await this.configManager.saveConfig(workspaceFolder, config);
          }
          return sourcePath;
        }
        // If user cancelled, fall back to default
      } else if (choice === detectedOption) {
        // Use detected NPL folder
        app.sourcePath = detectedPath;
        const appInConfig = config.applications.find(a => a.id === app.id);
        if (appInConfig) {
          appInConfig.sourcePath = detectedPath;
          await this.configManager.saveConfig(workspaceFolder, config);
        }
        return detectedPath;
      }

      return config.sourcePath;
    }

    // No source path set, need to prompt
    this.logger.log('No source path configured. Prompting for source folder...');

    if (detectedPath) {
      const useDetected = 'Use Detected NPL Folder';
      const chooseDifferent = 'Choose Different Folder';

      const choice = await vscode.window.showInformationMessage(
        `Found NPL source folder: ${path.relative(workspaceFolder.uri.fsPath, detectedPath)}. Use this folder?`,
        useDetected,
        chooseDifferent
      );

      if (choice === useDetected) {
        // Save the detected path
        app.sourcePath = detectedPath;
        const appInConfig = config.applications.find(a => a.id === app.id);
        if (appInConfig) {
          appInConfig.sourcePath = detectedPath;
        }
        await this.configManager.saveConfig(workspaceFolder, config);

        return detectedPath;
      }
      // If user chose different, continue to folder picker
    }

    const sourcePath = await this.pickSourceFolder(workspaceFolder, app.name);
    if (!sourcePath) {
      return undefined; // User cancelled
    }

    // Save the path to both app and config
    app.sourcePath = sourcePath;
    const appInConfig = config.applications.find(a => a.id === app.id);
    if (appInConfig) {
      appInConfig.sourcePath = sourcePath;
    }
    await this.configManager.saveConfig(workspaceFolder, config);

    return sourcePath;
  }

  /**
   * Shows a folder picker dialog to select a source folder
   * @param workspaceFolder The workspace folder
   * @param appName The application name for display
   * @returns The selected path or undefined if cancelled
   */
  private async pickSourceFolder(
    workspaceFolder: vscode.WorkspaceFolder,
    appName: string
  ): Promise<string | undefined> {
    // Show open folder dialog
    const selectedPaths = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(workspaceFolder.uri.fsPath),
      openLabel: 'Select Source Folder',
      title: `Select source folder for ${appName}`
    });

    if (selectedPaths && selectedPaths.length > 0) {
      return selectedPaths[0].fsPath;
    }

    return undefined;
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
