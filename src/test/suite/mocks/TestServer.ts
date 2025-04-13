import express from 'express';
import * as http from 'http';
import jwt from 'jsonwebtoken';
import multer from 'multer';
const getPort = require('get-port');
import { AddressInfo } from 'net';

/**
 * Test server that mimics the Noumena Cloud API for testing deployment functionality
 */
export class TestServer {
  private app: express.Express;
  private server: http.Server | null = null;
  private port = 0;
  private jwtSecret = 'test-jwt-secret';
  private validCredentials = { username: 'test@example.com', password: 'password123' };
  private storage: multer.StorageEngine;
  private upload: multer.Multer;
  private deploymentHandler: ((appId: string, fileBuffer: Buffer) => boolean) | null = null;
  private clearHandler: ((appId: string) => boolean) | null = null;

  constructor() {
    this.app = express();
    this.storage = multer.memoryStorage();
    this.upload = multer({ storage: this.storage });
    this.setupRoutes();
  }

  /**
   * Start the test server on a random available port
   */
  public async start(): Promise<string> {
    // Find an available port
    this.port = await getPort();

    return new Promise<string>((resolve) => {
      this.server = this.app.listen(this.port, () => {
        const address = this.server!.address() as AddressInfo;
        const baseUrl = `http://localhost:${address.port}`;
        resolve(baseUrl);
      });
    });
  }

  /**
   * Stop the test server
   */
  public async stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.server = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Set a custom handler for deployment requests
   */
  public setDeploymentHandler(handler: (appId: string, fileBuffer: Buffer) => boolean): void {
    this.deploymentHandler = handler;
  }

  /**
   * Set a custom handler for application clear requests
   */
  public setClearHandler(handler: (appId: string) => boolean): void {
    this.clearHandler = handler;
  }

  /**
   * Set up the API routes that mimic the Noumena Cloud API
   */
  private setupRoutes(): void {
    // Authentication endpoint
    this.app.post('/api/auth/login', express.urlencoded({ extended: true }), (req: express.Request, res: express.Response) => {
      const { username, password, grant_type } = req.body;

      if (grant_type !== 'password') {
        res.status(400).json({ error: 'Invalid grant type' });
        return;
      }

      if (username === this.validCredentials.username && password === this.validCredentials.password) {
        // Generate a JWT
        const token = jwt.sign({ sub: username }, this.jwtSecret, { expiresIn: '1h' });
        res.status(200).json({ access_token: token });
        return;
      }

      res.status(401).json({ error: 'Invalid credentials' });
    });

    // Authorization middleware
    const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
      }

      const token = authHeader.split(' ')[1];

      try {
        jwt.verify(token, this.jwtSecret);
        next();
      } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
      }
    };

    // Application deployment endpoint
    this.app.post('/api/v1/applications/:appId/deploy', authMiddleware, this.upload.single('npl_archive'), (req: express.Request, res: express.Response) => {
      const appId = req.params.appId;

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      // If a custom deployment handler is set, use it
      if (this.deploymentHandler) {
        const success = this.deploymentHandler(appId, req.file.buffer);
        if (!success) {
          res.status(422).json({ error: 'Failed to process deployment' });
          return;
        }
      }

      res.status(200).json({ message: 'Deployment successful' });
    });

    // Application clear endpoint
    this.app.delete('/api/v1/applications/:appId/clear', authMiddleware, (req: express.Request, res: express.Response) => {
      const appId = req.params.appId;

      // If a custom clear handler is set, use it
      if (this.clearHandler) {
        const success = this.clearHandler(appId);
        if (!success) {
          res.status(422).json({ error: 'Failed to clear application' });
          return;
        }
      }

      res.status(200).json({ message: 'Application cleared successfully' });
    });

    // 404 handler
    this.app.use((req: express.Request, res: express.Response) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }
}
