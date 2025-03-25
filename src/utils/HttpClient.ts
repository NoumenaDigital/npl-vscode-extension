import * as https from 'https';
import { IncomingMessage, ClientRequest } from 'http';
import { Logger } from './Logger';

export interface IHttpClient {
  get<T>(url: string, headers?: Record<string, string>): Promise<T>;
}

export interface IHttpRequester {
  request(url: string, options: any): ClientRequest;
}

export class HttpsRequester implements IHttpRequester {
  request(url: string, options: any): ClientRequest {
    return https.get(url, options);
  }
}

export class HttpClient implements IHttpClient {
  constructor(
    private readonly requester: IHttpRequester = new HttpsRequester(),
    private readonly logger?: Logger
  ) {}

  get<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'NPL-dev-vscode',
          'Accept': 'application/vnd.github.v3+json',
          ...headers
        }
      };

      const req = this.requester.request(url, options);

      req.on('response', (res: IncomingMessage) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // Handle redirects
          if (res.headers.location) {
            this.get<T>(res.headers.location, headers)
              .then(resolve)
              .catch(reject);
            return;
          }
          const error = new Error(`Redirect with no location header from ${url}`);
          this.logger?.logError(`HTTP redirect error: ${error.message}`, error);
          reject(error);
          return;
        }

        if (res.statusCode !== 200) {
          const error = new Error(`Request failed with status code: ${res.statusCode}`);
          this.logger?.logError(`HTTP request error: ${error.message}`, error);
          reject(error);
          return;
        }

        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            this.logger?.logError(`JSON parsing error: ${err instanceof Error ? err.message : String(err)}`, err);
            reject(err);
          }
        });
      });

      req.on('error', (err) => {
        this.logger?.logError(`HTTP request error: ${err.message}`, err);
        reject(err);
      });

      req.end();
    });
  }
}

export class HttpClientFactory {
  private static _logger: Logger | undefined;
  private static _instance: HttpClient | undefined;

  static setLogger(logger: Logger): void {
    this._logger = logger;
    // Create a new instance with the logger if needed
    if (this._instance) {
      this._instance = new HttpClient(new HttpsRequester(), logger);
    }
  }

  static getInstance(): HttpClient {
    if (!this._instance) {
      this._instance = new HttpClient(new HttpsRequester(), this._logger);
    }
    return this._instance;
  }
}
