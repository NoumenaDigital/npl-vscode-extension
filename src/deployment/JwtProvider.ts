import * as https from 'https';
import * as http from 'http';
import * as querystring from 'querystring';
import { Logger } from '../utils/Logger';

export interface JwtProviderOptions {
  username: string;
  password: string;
  authUrl: string;
  logger: Logger;
}

export class JwtProvider {
  private username: string;
  private password: string;
  private authUrl: string;
  private logger: Logger;

  constructor(options: JwtProviderOptions) {
    this.username = options.username;
    this.password = options.password;
    this.authUrl = options.authUrl;
    this.logger = options.logger;
  }

  public async provideJwt(): Promise<string | null> {
    try {
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
    } catch (error) {
      // Catch any unexpected errors at the outer level
      this.logger.logError('Unexpected error during JWT retrieval', error);
      return null;
    }
  }
}
