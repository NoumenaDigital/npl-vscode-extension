import * as http from 'http';
import { AddressInfo } from 'net';

/**
 * Creates an HTTP server that mocks the Noumena Cloud API for testing.
 */
export class TestServer {
  private server: http.Server;
  private port = 0;
  private jwtToken = 'test-jwt-token';
  private authResponse: { status: number, body?: any } = { status: 200, body: { access_token: 'test-jwt-token' } };
  private deployResponse: { status: number, body?: any } = { status: 200 };
  private clearResponse: { status: number, body?: any } = { status: 200 };
  private zipContentValidator?: (zipContent: Buffer) => boolean;

  constructor() {
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  /**
   * Starts the server on a random available port
   */
  public start(): TestServer {
    this.server.listen(0);
    const addressInfo = this.server.address() as AddressInfo;
    this.port = addressInfo.port;
    return this;
  }

  /**
   * Stops the server
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  /**
   * Gets the base URL of the server
   */
  public getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Sets the response for authentication requests
   */
  public setAuthResponse(status: number, body?: any): TestServer {
    this.authResponse = { status, body };
    return this;
  }

  /**
   * Sets the response for deployment requests
   */
  public setDeployResponse(status: number, body?: any): TestServer {
    this.deployResponse = { status, body };
    return this;
  }

  /**
   * Sets the response for clear application requests
   */
  public setClearResponse(status: number, body?: any): TestServer {
    this.clearResponse = { status, body };
    return this;
  }
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url || '';
    const method = req.method || '';

    // Handle authentication request
    if (url === '/api/auth/login' && method === 'POST') {
      return this.handleAuthRequest(res);
    }

    // Handle clear application request
    if (url.match(/\/api\/v1\/applications\/.*\/clear/) && method === 'DELETE') {
      return this.handleClearRequest(req, res);
    }

    // Handle deploy application request
    if (url.match(/\/api\/v1\/applications\/.*\/deploy/) && method === 'POST') {
      return this.handleDeployRequest(req, res);
    }

    // Default: Not found
    res.statusCode = 404;
    res.end('Not found');
  }

  private async handleAuthRequest(res: http.ServerResponse): Promise<void> {
    // Set response status and headers
    res.statusCode = this.authResponse.status;
    res.setHeader('Content-Type', 'application/json');

    // Return response
    if (this.authResponse.body) {
      res.end(JSON.stringify(this.authResponse.body));
    } else {
      res.end();
    }
  }

  private async handleClearRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Validate token
    const authHeader = req.headers.authorization;
    if (!this.validateToken(authHeader)) {
      res.statusCode = 401;
      res.end('Unauthorized');
      return;
    }

    // Set response status and headers
    res.statusCode = this.clearResponse.status;
    res.setHeader('Content-Type', 'application/json');

    // Return response
    if (this.clearResponse.body) {
      res.end(JSON.stringify(this.clearResponse.body));
    } else {
      res.end();
    }
  }

  private async handleDeployRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Validate token
    const authHeader = req.headers.authorization;
    if (!this.validateToken(authHeader)) {
      res.statusCode = 401;
      res.end('Unauthorized');
      return;
    }

    // If we're validating the ZIP content, read the multipart form data
    if (this.zipContentValidator) {
      try {
        const zipContent = await this.extractZipFromMultipart(req);
        const isValid = this.zipContentValidator(zipContent);

        if (!isValid) {
          res.statusCode = 400;
          res.end('Invalid ZIP content');
          return;
        }
      } catch (error) {
        res.statusCode = 400;
        res.end('Invalid request: ' + (error instanceof Error ? error.message : String(error)));
        return;
      }
    }

    // Set response status and headers
    res.statusCode = this.deployResponse.status;
    res.setHeader('Content-Type', 'application/json');

    // Return response
    if (this.deployResponse.body) {
      res.end(JSON.stringify(this.deployResponse.body));
    } else {
      res.end();
    }
  }

  private validateToken(authHeader?: string): boolean {
    if (!authHeader) {
      return false;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' && token === this.jwtToken;
  }

  private async extractZipFromMultipart(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=([^;]+)/);

      if (!boundaryMatch) {
        reject(new Error('No boundary found in content-type'));
        return;
      }

      const boundary = boundaryMatch[1];
      const chunks: Buffer[] = [];

      req.on('data', (chunk) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const body = buffer.toString();

          // Extract the ZIP file content from the multipart request
          const boundaryPattern = new RegExp(`--${boundary}[\\s\\S]*?Content-Type: application\\/octet-stream[\\s\\S]*?\\r\\n\\r\\n([\\s\\S]*?)--${boundary}`, 'i');
          const match = body.match(boundaryPattern);

          if (!match) {
            reject(new Error('Could not extract ZIP content from multipart data'));
            return;
          }

          // Extract the ZIP content - we need to get the raw binary data
          const zipStart = body.indexOf(match[0]) + match[0].indexOf('\r\n\r\n') + 4;
          const zipEnd = body.indexOf(`--${boundary}--`) - 2;
          const zipContent = buffer.subarray(zipStart, zipEnd);

          resolve(zipContent);
        } catch (error) {
          reject(error);
        }
      });

      req.on('error', reject);
    });
  }
}
