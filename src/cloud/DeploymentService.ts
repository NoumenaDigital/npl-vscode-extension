import * as vscode from 'vscode';
import { AuthManager } from './AuthManager';
import { Logger } from '../utils/Logger';
import { getApiBase } from '../utils/ApiUtil';

export class DeploymentService {
  constructor(private readonly authManager: AuthManager, private readonly logger: Logger) {}

  /**
   * Uploads the provided ZIP archive to the deploy endpoint of the given application.
   */
  public async deployArchive(appId: string, zipPath: string): Promise<void> {
    const token = await this.authManager.getAccessToken();
    if (!token) {
      throw new Error('No access token');
    }

    const fs = require('fs');
    const path = require('path');

    // Read the ZIP file into memory
    const zipBuffer: Buffer = await fs.promises.readFile(zipPath);

    // Build simple multipart body manually
    const boundary = `----NoumenaBoundary${Math.random().toString(16).slice(2)}`;

    const preamble = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="npl_archive"; filename="${path.basename(zipPath)}"\r\n` +
      `Content-Type: application/zip\r\n\r\n`,
      'utf8'
    );

    const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

    const bodyBuffer: Buffer = Buffer.concat([preamble, zipBuffer, epilogue]);
    const contentLength = bodyBuffer.length;

    const url = `${getApiBase()}/v1/applications/${encodeURIComponent(appId)}/deploy`;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Uploading deployment...',
      cancellable: false
    }, async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': contentLength.toString()
        },
        body: bodyBuffer
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Deploy failed with status ${res.status}: ${text}`);
      }
    });
  }

  /** Deploys an archive provided directly as a Buffer (no temp file). */
  public async deployArchiveBuffer(appId: string, zipBuffer: Buffer, filename = 'archive.zip'): Promise<void> {
    const token = await this.authManager.getAccessToken();
    if (!token) {
      throw new Error('No access token');
    }

    const boundary = `----NoumenaBoundary${Math.random().toString(16).slice(2)}`;

    const preamble = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="npl_archive"; filename="${filename}"\r\n` +
      `Content-Type: application/zip\r\n\r\n`,
      'utf8'
    );

    const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

    const bodyBuffer = Buffer.concat([preamble, zipBuffer, epilogue]);

    const url = `${getApiBase()}/v1/applications/${encodeURIComponent(appId)}/deploy`;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Uploading deployment...',
      cancellable: false
    }, async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': bodyBuffer.length.toString()
        },
        body: bodyBuffer
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Deploy failed with status ${res.status}: ${text}`);
      }
    });
  }

  /** Deploys a website archive (static frontend) to the application. */
  public async deployWebsiteBuffer(appId: string, zipBuffer: Buffer, filename = 'website.zip'): Promise<void> {
    const token = await this.authManager.getAccessToken();
    if (!token) {
      throw new Error('No access token');
    }

    const boundary = `----NoumenaBoundary${Math.random().toString(16).slice(2)}`;

    const preamble = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="website_zip"; filename="${filename}"\r\n` +
      `Content-Type: application/zip\r\n\r\n`,
      'utf8'
    );

    const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

    const bodyBuffer = Buffer.concat([preamble, zipBuffer, epilogue]);

    const url = `${getApiBase()}/v1/applications/${encodeURIComponent(appId)}/uploadwebsite`;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Uploading frontend website...',
      cancellable: false
    }, async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': bodyBuffer.length.toString()
        },
        body: bodyBuffer
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Website upload failed with status ${res.status}: ${text}`);
      }
    });
  }

  /**
   * Clears the deployed content of the given application by calling its clear endpoint.
   */
  public async clearApplication(appId: string): Promise<void> {
    const token = await this.authManager.getAccessToken();
    if (!token) {
      throw new Error('No access token');
    }

    const url = `${getApiBase()}/v1/applications/${encodeURIComponent(appId)}/clear`;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Clearing deployed content...',
      cancellable: false
    }, async () => {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Clear failed with status ${res.status}: ${text}`);
      }
    });
  }
}
