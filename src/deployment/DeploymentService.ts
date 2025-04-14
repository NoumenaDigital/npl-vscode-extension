import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { CredentialManager } from './CredentialManager';
import { ZipProducer } from './ZipProducer';
import { JwtProvider } from './JwtProvider';
import { ILogger } from '../utils/Logger';
import { DeploymentConfig } from './DeploymentConfig';

export enum DeploymentResult {
  Success,
  AuthorizationError,
  Unauthorized,
  NotFound,
  ConnectionError,
  Unprocessable,
  ZipFailure,
  OtherFailure
}

export interface DeploymentStatus {
  result: DeploymentResult;
  message: string;
  error?: Error;
}

export class DeploymentService {
  private readonly logger: ILogger;
  private credentialManager: CredentialManager;
  private zipProducer: ZipProducer;

  constructor(logger: ILogger, context: vscode.ExtensionContext) {
    this.logger = logger;
    this.credentialManager = new CredentialManager(logger, context);
    this.zipProducer = new ZipProducer(logger);
  }

  public async deploy(workspaceFolder: vscode.WorkspaceFolder, config: DeploymentConfig): Promise<DeploymentStatus> {
    this.logger.show();
    this.logger.log(`Starting deployment to ${config.baseUrl} for app ${config.appName}...`);

    try {
      const password = await this.credentialManager.getPassword(config.baseUrl, config.username);
      if (!password) {
        const passwordInput = await vscode.window.showInputBox({
          prompt: 'Enter your password for Noumena Cloud',
          password: true
        });

        if (!passwordInput) {
          return {
            result: DeploymentResult.AuthorizationError,
            message: 'Password is required for deployment'
          };
        }

        await this.credentialManager.storePassword(config.baseUrl, config.username, passwordInput);
      }

      const jwtProvider = new JwtProvider({
        username: config.username,
        password: password || '',
        authUrl: `${config.baseUrl}/api/auth/login`,
        logger: this.logger
      });

      this.logger.log('Creating deployment package...');
      const zipBuffer = await this.zipProducer.produceZip(
        config.sourcePath,
        workspaceFolder.uri.fsPath
      );
      this.logger.log(`Deployment package created (${Math.round(zipBuffer.length / 1024)} KB)`);

      this.logger.log('Authenticating...');
      const tokenPromise = jwtProvider.provideJwt();
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 3000);
      });

      const token = await Promise.race([tokenPromise, timeoutPromise]);

      if (!token) {
        try {
          const url = new URL(config.baseUrl);
          await new Promise<void>((resolve, reject) => {
            const protocol = url.protocol === 'https:' ? https : http;
            const req = protocol.request(
              {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: '/',
                method: 'HEAD',
                timeout: 2000
              },
              () => resolve()
            );
            req.on('error', () => reject(new Error('ECONNREFUSED')));
            req.end();
          });

          return {
            result: DeploymentResult.AuthorizationError,
            message: 'Failed to retrieve authentication token. Check your credentials.'
          };
        } catch (error) {
          return {
            result: DeploymentResult.ConnectionError,
            message: 'Could not connect to the server. Check your network connection and server URL.'
          };
        }
      }

      this.logger.log('Authentication successful');

      if (config.rapidDeploy) {
        this.logger.log('Clearing existing application...');
        const clearResult = await this.clearApplication(config.baseUrl, config.appName, token);
        if (!clearResult.success) {
          return {
            result: DeploymentResult.OtherFailure,
            message: `Failed to clear the application: ${clearResult.message}`,
            error: new Error(clearResult.message)
          };
        }
        this.logger.log('Application cleared successfully');
      }

      this.logger.log('Uploading deployment package...');
      const deployResult = await this.uploadDeployment(config.baseUrl, config.appName, token, zipBuffer);

      if (deployResult.success) {
        this.logger.log('Deployment completed successfully!');
        vscode.window.showInformationMessage('NPL application deployed successfully!');
        return {
          result: DeploymentResult.Success,
          message: config.rapidDeploy
            ? 'Successfully deployed. Application was cleared.'
            : 'Successfully deployed.'
        };
      } else {
        const statusCode = deployResult.statusCode || 0;
        let result: DeploymentResult;
        let message: string;

        switch (statusCode) {
          case 401:
            result = DeploymentResult.Unauthorized;
            message = 'Failed to deploy due to unauthorized access.';
            break;
          case 404:
            result = DeploymentResult.NotFound;
            message = 'Could not find the server. Check the server base URL and application ID.';
            break;
          case 422:
            result = DeploymentResult.Unprocessable;
            message = 'Failed to process the deployment. Check the logs in the Noumena Cloud dashboard for details.';
            break;
          default:
            result = DeploymentResult.OtherFailure;
            message = `Failed to deploy the application: ${deployResult.message}`;
        }

        this.logger.log(`Deployment failed: ${message}`);
        vscode.window.showErrorMessage(`Deployment failed: ${message}`);
        return {
          result,
          message,
          error: new Error(deployResult.message)
        };
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.logError('Error during deployment', error);

        let result: DeploymentResult;
        if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
          result = DeploymentResult.ConnectionError;
        } else if (error.message.includes('zip') || error.message.includes('archive')) {
          result = DeploymentResult.ZipFailure;
        } else {
          result = DeploymentResult.OtherFailure;
        }

        this.logger.log(`Deployment failed: ${error.message}`);
        vscode.window.showErrorMessage(`Deployment failed: ${error.message}`);
        return {
          result,
          message: error.message,
          error
        };
      } else {
        this.logger.log('Deployment failed with unknown error');
        vscode.window.showErrorMessage('Deployment failed with unknown error');
        return {
          result: DeploymentResult.OtherFailure,
          message: 'Unknown error occurred during deployment',
          error: new Error('Unknown error')
        };
      }
    }
  }

  private async clearApplication(baseUrl: string, appName: string, token: string): Promise<{ success: boolean, message: string, statusCode?: number }> {
    return new Promise((resolve) => {
      try {
        const url = new URL(`${baseUrl}/api/v1/applications/${appName}/clear`);
        const protocol = url.protocol === 'https:' ? https : http;

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        };

        const req = protocol.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve({
                success: true,
                message: 'Application cleared successfully'
              });
            } else {
              resolve({
                success: false,
                message: `Failed to clear application: HTTP ${res.statusCode} - ${data}`,
                statusCode: res.statusCode
              });
            }
          });
        });

        req.on('error', (error) => {
          resolve({
            success: false,
            message: `Connection error: ${error.message}`
          });
        });

        req.end();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        resolve({
          success: false,
          message: `Error: ${errorMessage}`
        });
      }
    });
  }

  private async uploadDeployment(baseUrl: string, appName: string, token: string, zipBuffer: Buffer): Promise<{ success: boolean, message: string, statusCode?: number }> {
    return new Promise((resolve) => {
      try {
        const url = new URL(`${baseUrl}/api/v1/applications/${appName}/deploy`);
        const protocol = url.protocol === 'https:' ? https : http;

        const boundary = `----WebKitFormBoundary${Math.random().toString(16).substr(2)}`;

        const postData = [
          `--${boundary}`,
          'Content-Disposition: form-data; name="npl_archive"; filename="npl_archive.zip"',
          'Content-Type: application/octet-stream',
          '',
          zipBuffer.toString('binary'),
          `--${boundary}--`,
          ''
        ].join('\r\n');

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': Buffer.byteLength(postData, 'binary')
          }
        };

        const req = protocol.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                success: true,
                message: 'Deployment completed successfully'
              });
            } else {
              resolve({
                success: false,
                message: `Deployment failed: HTTP ${res.statusCode} - ${data}`,
                statusCode: res.statusCode
              });
            }
          });
        });

        req.on('error', (error) => {
          resolve({
            success: false,
            message: `Connection error: ${error.message}`
          });
        });

        req.write(postData, 'binary');
        req.end();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        resolve({
          success: false,
          message: `Error: ${errorMessage}`
        });
      }
    });
  }
}
