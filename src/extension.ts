import * as vscode from 'vscode';
import {Logger} from './utils/Logger';
import {ServerManager} from './server/ServerManager';
import {LanguageClientManager} from './client/LanguageClientManager';
import {BinaryManager} from './server/binary/BinaryManager';
import {VersionManager} from './server/binary/VersionManager';
import {HttpClientFactory} from './utils/HttpClient';
import {InstructionFileManager, setExtensionContext, VsCodeDialogHandler} from './instructionFiles/InstructionFileManager';
import {CloudAppsProvider} from './cloud/CloudAppsProvider';
import {WelcomeView} from './cloud/WelcomeView';
import {AuthManager} from './cloud/AuthManager';
import {detectAndSetMigrationDescriptor} from './cloud/MigrationDescriptorDetector';
import {SourceType} from "./model/SourcesType";

let clientManager: LanguageClientManager;
let serverManager: ServerManager;
let extensionContext: vscode.ExtensionContext;
let cloudAppsProvider: CloudAppsProvider;
let authManager: AuthManager;
let instructionFileManager: InstructionFileManager;

export interface ExtensionAPI {
    restartServer: () => Promise<void>;
}

export async function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    const serverLogger = new Logger('NPL Language Server');
    const cloudLogger = new Logger('NOUMENA Cloud');

    serverManager = new ServerManager(serverLogger);
    clientManager = new LanguageClientManager(serverLogger, serverManager);

    setExtensionContext(context);

    instructionFileManager = new InstructionFileManager(
        new VsCodeDialogHandler()
    );

    BinaryManager.setLogger(serverLogger);
    VersionManager.setLogger(serverLogger);
    HttpClientFactory.setLogger(serverLogger);

    // Initialize authentication manager
    authManager = new AuthManager(context, cloudLogger);

    try {
        vscode.commands.executeCommand('setContext', 'noumena.cloud.isLoggedIn', false);

        cloudAppsProvider = new CloudAppsProvider(authManager, context, cloudLogger);
        const cloudTreeView = vscode.window.createTreeView('noumena.cloud.apps', {
            treeDataProvider: cloudAppsProvider
        });

        const welcomeViewProvider = new WelcomeView(context.extensionUri);

        context.subscriptions.push(
            cloudTreeView,
            vscode.window.registerWebviewViewProvider(WelcomeView.viewType, welcomeViewProvider),
            vscode.commands.registerCommand('noumena.cloud.login', () => {
                authManager.login();
            }),
            vscode.commands.registerCommand('noumena.cloud.logout', () => {
                authManager.logout();
            }),
            vscode.commands.registerCommand('noumena.cloud.deploy', (item) => {
                if (item) {
                    cloudAppsProvider.showDeployOptions(item);
                }
            }),
            vscode.commands.registerCommand('noumena.cloud.clear', (item) => {
                if (item) {
                    cloudAppsProvider.clearApplication(item);
                }
            }),
            vscode.commands.registerCommand('noumena.cloud.refresh', () => {
                cloudAppsProvider.refresh();
            }),
            vscode.commands.registerCommand('npl.selectServerVersion', () => {
                serverManager.showVersionPicker(context);
            }),
            vscode.commands.registerCommand('npl.cleanServerFiles', () => {
                serverManager.cleanServerFiles(context);
            }),

            vscode.commands.registerCommand('npl.selectSources', () => {
                selectNplWorkspace(serverLogger, SourceType.SOURCES);
            }),

            vscode.commands.registerCommand('npl.contribLibraries', () => {
                selectNplWorkspace(serverLogger, SourceType.LIBRARIES);
            }),

            vscode.commands.registerCommand('npl.selectTestSources', () => {
                selectNplWorkspace(serverLogger, SourceType.TEST_SOURCES);
            }),

            vscode.commands.registerCommand('npl.selectFrontendSources', () => {
                selectNplWorkspace(serverLogger, SourceType.FRONTEND_SOURCES);
            }),

            vscode.commands.registerCommand('npl.restartServer', restartServer)
        );

        context.subscriptions.push(
            authManager.onDidLogin(username => {
                cloudAppsProvider.setLoggedIn(username);
                vscode.commands.executeCommand('setContext', 'noumena.cloud.isLoggedIn', true);
                vscode.window.showInformationMessage(`Logged in to NOUMENA Cloud as ${username}`);
            }),
            authManager.onDidLogout(() => {
                cloudAppsProvider.setLoggedOut();
                vscode.commands.executeCommand('setContext', 'noumena.cloud.isLoggedIn', false);
                vscode.window.showInformationMessage('Logged out of NOUMENA Cloud');
            })
        );

        // Attempt to restore previous session
        await authManager.initialize();

        void handleWorkspaceInstructionFiles(serverLogger);
        await detectAndSetMigrationDescriptor(serverLogger);

        clientManager.start(context).catch(err => {
            serverLogger.logError('Failed to start NPL Language Server', err);
        });

        // Return API for external consumers (like tests)
        return {
            restartServer
        } as ExtensionAPI;
    } catch (err) {
        serverLogger.logError('Failed to start NPL Language Server', err);
        await clientManager.stop();
        throw err;
    }
}

export async function restartServer(): Promise<void> {
    if (!serverManager || !clientManager || !extensionContext) {
        throw new Error('Extension not fully initialized');
    }

    await clientManager.stop();

    try {
        await clientManager.start(extensionContext);
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to restart NPL Language Server: ${err}`);
        throw err;
    }
}

async function selectNplWorkspace(logger: Logger, type: SourceType): Promise<void> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open to save NPL settings.');
            return;
        }
        const currentWorkspace = workspaceFolders[0]; // Assuming single-root workspace for simplicity

        const selectedFolder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: currentWorkspace.uri,
            openLabel: 'Select NPL ' + type,
        });

        if (selectedFolder && selectedFolder.length > 0) {
            const selectedPath = selectedFolder[0].fsPath;
            // Get configuration specifically for the current workspace folder
            const config = vscode.workspace.getConfiguration('NPL', currentWorkspace.uri);
            await config.update(type, selectedPath, vscode.ConfigurationTarget.WorkspaceFolder);
            vscode.window.showInformationMessage(`NPL ${type} path set to ${selectedPath} for this workspace.`);
        }
    } catch (error) {
        logger.logError(`Failed to select NPL ${type} workspace`, error);
        vscode.window.showErrorMessage(`Failed to select NPL ${type} workspace: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Checks for Cursor rules and Copilot instructions in the workspace
 */
async function handleWorkspaceInstructionFiles(logger: Logger) {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        // Handle instruction files for each workspace folder
        for (const folder of workspaceFolders) {
            await instructionFileManager.checkAndHandleInstructionFiles(folder);
        }
    } catch (error) {
        logger.logError('Error handling workspace instruction files', error);
    }
}

export async function deactivate(): Promise<void> {
    if (clientManager) {
        await clientManager.stop();
    }
}
