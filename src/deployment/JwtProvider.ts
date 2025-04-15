import * as https from 'https';
import * as http from 'http';
import * as querystring from 'querystring';
import { ILogger } from '../utils/Logger';
import { AuthType } from './CredentialManager';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  state: string;
  applications: Application[];
}

export interface Application {
  id: string;
  name: string;
  slug: string;
  state: string;
}

export interface JwtProviderOptions {
  username: string;
  password: string;
  authUrl: string;
  authType: AuthType;
  logger: ILogger;
}

export class JwtProvider {
  private readonly username: string;
  private readonly password: string;
  private readonly authUrl: string;
  private readonly authType: AuthType;
  private logger: ILogger;
  private token: string | null = null;

  constructor(options: JwtProviderOptions) {
    this.username = options.username;
    this.password = options.password;
    this.authUrl = options.authUrl;
    this.authType = options.authType || AuthType.Basic;
    this.logger = options.logger;
  }

  public async provideJwt(): Promise<string | null> {
    try {
      if (this.authType === AuthType.Basic) {
        return await this.getBasicAuthToken();
      } else if (this.authType === AuthType.Azure) {
        // For now, this is a placeholder as per the requirements
        this.logger.log('Azure authentication is not yet implemented');
        return null;
      }
      return null;
    } catch (error) {
      this.logger.logError('Unexpected error during JWT retrieval', error);
      return null;
    }
  }

  private async getBasicAuthToken(): Promise<string | null> {
    return await new Promise<string | null>((resolve) => {
      try {
        const protocol = this.authUrl.startsWith('https') ? https : http;
        const url = new URL(this.authUrl);

        const postData = querystring.stringify({
          username: this.username,
          password: this.password,
          grant_type: 'password'
        });

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const req = protocol.request(options, (res) => {
          if (res.statusCode !== 200) {
            this.logger.logError(`Failed to get JWT: Status ${res.statusCode}`);
            resolve(null);
            return;
          }

          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const parsedData = JSON.parse(data);
              const token = parsedData.access_token;
              if (!token) {
                this.logger.logError('No access token found in response');
                resolve(null);
              } else {
                this.token = token;
                resolve(token);
              }
            } catch (error) {
              this.logger.logError('Failed to parse JWT response', error);
              resolve(null);
            }
          });
        });

        req.on('error', (error) => {
          this.logger.logError('Error retrieving JWT', error);
          resolve(null);
        });

        req.write(postData);
        req.end();

      } catch (error) {
        this.logger.logError('Error during JWT request', error);
        resolve(null);
      }
    });
  }

  public async getTenants(baseUrl: string): Promise<Tenant[]> {
    if (!this.token) {
      this.token = await this.provideJwt();
      if (!this.token) {
        throw new Error('Failed to authenticate');
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const url = new URL(`${baseUrl}/api/v1/tenants`);
        const protocol = url.protocol === 'https:' ? https : http;

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        };

        const req = protocol.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const tenants = JSON.parse(data) as Tenant[];
                resolve(tenants);
              } catch (error) {
                this.logger.logError('Failed to parse tenants response', error);
                reject(new Error('Failed to parse tenants response'));
              }
            } else {
              this.logger.logError(`Failed to get tenants: Status ${res.statusCode}`);
              reject(new Error(`Failed to get tenants: Status ${res.statusCode}`));
            }
          });
        });

        req.on('error', (error) => {
          this.logger.logError('Error retrieving tenants', error);
          reject(error);
        });

        req.end();
      } catch (error) {
        this.logger.logError('Error during tenants request', error);
        reject(error);
      }
    });
  }
}
