import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { DeploymentResult } from '../../../deployment/DeploymentService';
import { DeploymentConfig } from '../../../deployment/DeploymentConfig';

/**
 * Interface for mock VS Code extension context used in tests
 */
export interface IMockExtensionContext {
  secrets: IMockSecretStorage;
  [key: string]: any;  // Allow other properties to be added
}

/**
 * Interface for mock VS Code secret storage used in tests
 */
export interface IMockSecretStorage {
  store: sinon.SinonStub;
  get: sinon.SinonStub;
  delete: sinon.SinonStub;
}

/**
 * Interface for mock deployment config manager
 */
export interface IMockDeploymentConfigManager {
  loadConfig: sinon.SinonStub<[vscode.WorkspaceFolder], Promise<DeploymentConfig | undefined>>;
  saveConfig: sinon.SinonStub<[vscode.WorkspaceFolder, DeploymentConfig], Promise<void>>;
  getConfigFilePath: sinon.SinonStub<[vscode.WorkspaceFolder], Promise<string>>;
}

/**
 * Interface for mock deployment service
 */
export interface IMockDeploymentService {
  deploy: sinon.SinonStub<[vscode.WorkspaceFolder, DeploymentConfig], Promise<{
    result: DeploymentResult;
    message: string;
    error?: Error;
  }>>;
}

/**
 * Interface for mock credential manager
 */
export interface IMockCredentialManager {
  storePassword: sinon.SinonStub<[string, string, string], Promise<void>>;
  getPassword: sinon.SinonStub<[string, string], Promise<string | undefined>>;
  deletePassword: sinon.SinonStub<[string, string], Promise<void>>;
}
