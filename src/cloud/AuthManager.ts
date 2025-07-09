import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenSuccessResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token: string;
  token_type: string;
}

export class AuthManager {
  private static readonly REFRESH_TOKEN_SECRET_KEY = 'noumena.cloud.refreshToken';
  private static readonly ACCESS_TOKEN_SECRET_KEY = 'noumena.cloud.accessToken';
  private static readonly ACCESS_TOKEN_EXPIRY_SECRET_KEY = 'noumena.cloud.accessTokenExpiry';
  private static readonly CLIENT_ID = 'paas';
  private static readonly CLIENT_SECRET = 'paas';
  private static readonly GRANT_TYPE_DEVICE =
    'urn:ietf:params:oauth:grant-type:device_code';
  private static readonly CONTENT_TYPE_FORM = 'application/x-www-form-urlencoded';
  private static readonly SCOPE = 'openid offline_access';
  private static readonly KEYCLOAK_REALM_PATH = '/realms/paas/protocol/openid-connect';

  private readonly logger: Logger;
  private readonly secrets: vscode.SecretStorage;

  private accessToken: string | undefined;
  private accessTokenExpiry: number | undefined; // epoch millis
  private refreshToken: string | undefined;

  private currentLoginCancel: (() => void) | undefined;

  private readonly _onDidLogin = new vscode.EventEmitter<string>();
  private readonly _onDidLogout = new vscode.EventEmitter<void>();

  public readonly onDidLogin = this._onDidLogin.event;
  public readonly onDidLogout = this._onDidLogout.event;

  constructor(private readonly context: vscode.ExtensionContext, logger: Logger) {
    this.logger = logger;
    this.secrets = context.secrets;
  }

  /** Attempt to restore existing session using stored refresh token. */
  public async initialize(): Promise<void> {
    try {
      this.refreshToken = await this.secrets.get(
        AuthManager.REFRESH_TOKEN_SECRET_KEY
      );
      const storedAccessToken = await this.secrets.get(AuthManager.ACCESS_TOKEN_SECRET_KEY);
      const storedAccessTokenExpiry = await this.secrets.get(AuthManager.ACCESS_TOKEN_EXPIRY_SECRET_KEY);

      if (storedAccessToken && storedAccessTokenExpiry && Date.now() < parseInt(storedAccessTokenExpiry, 10) - 10000) {
        this.accessToken = storedAccessToken;
        this.accessTokenExpiry = parseInt(storedAccessTokenExpiry, 10);
        const username = this.extractUsername(this.accessToken);
        this._onDidLogin.fire(username ?? '');
        this.logger.log(`Restored NOUMENA Cloud session as ${username ?? 'unknown user'} from stored access token`);
        return;
      }

      if (this.refreshToken) {
        await this.refreshAccessToken();
      }
    } catch (err) {
      this.logger.logError('Failed to restore NOUMENA Cloud session', err);
    }
  }

  public async login(): Promise<void> {
    // Cancel any previous login that may still be in progress so we do not end up with
    // multiple "Waiting for NOUMENA Cloud authorization…" dialogs stacking up.
    if (this.currentLoginCancel) {
      try {
        this.currentLoginCancel();
      } catch {
        // ignore – previous attempt might have already completed
      }
      this.currentLoginCancel = undefined;
    }

    // This flag will be flipped to true if another login attempt supersedes this one.
    let cancelled = false;
    this.currentLoginCancel = () => {
      cancelled = true;
    };

    const domain = vscode.workspace.getConfiguration('noumena.cloud').get<string>('domain') || 'noumena.cloud';
    const keycloakBase = `https://keycloak.${domain}`;

    const deviceEndpoint =
      keycloakBase + AuthManager.KEYCLOAK_REALM_PATH + '/auth/device';

    try {
      const deviceRes = await this.requestDeviceCode(deviceEndpoint);

      // Prompt user to complete auth in browser
      const opened = await vscode.env.openExternal(vscode.Uri.parse(deviceRes.verification_uri_complete));
      if (!opened) {
        throw new Error('Failed to open browser for authentication');
      }

      const access = await this.pollForToken(
        keycloakBase + AuthManager.KEYCLOAK_REALM_PATH + '/token',
        deviceRes,
        () => cancelled
      );

      await this.handleSuccessfulAuth(access);
      // Login completed successfully – no longer need the cancel handle.
      if (this.currentLoginCancel && !cancelled) {
        this.currentLoginCancel = undefined;
      }
    } catch (err: any) {
      // Suppress error reporting if this attempt was superseded by a new one.
      if (!(err instanceof Error && err.message === 'Login attempt superseded')) {
        this.logger.logError('Login failed', err);
        void vscode.window.showErrorMessage(
          `NOUMENA Cloud login failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  /** Retrieve a valid access token, refreshing or re-logging when necessary. */
  public async getAccessToken(): Promise<string | undefined> {
    if (this.accessToken && this.accessTokenExpiry && Date.now() < this.accessTokenExpiry - 10000) {
      return this.accessToken;
    }

    if (this.refreshToken) {
      try {
        await this.refreshAccessToken();
        return this.accessToken;
      } catch (e) {
        this.logger.logError('Failed to refresh token, will re-authenticate', e);
      }
    }

    await this.login();
    return this.accessToken;
  }

  public async logout(): Promise<void> {
    this.accessToken = undefined;
    this.accessTokenExpiry = undefined;
    this.refreshToken = undefined;
    await this.secrets.delete(AuthManager.REFRESH_TOKEN_SECRET_KEY);
    await this.secrets.delete(AuthManager.ACCESS_TOKEN_SECRET_KEY);
    await this.secrets.delete(AuthManager.ACCESS_TOKEN_EXPIRY_SECRET_KEY);
    this._onDidLogout.fire();
    this.logger.log('Logged out from NOUMENA Cloud');
  }

  private async requestDeviceCode(endpoint: string): Promise<DeviceCodeResponse> {
    const params = new URLSearchParams();
    params.set('client_id', AuthManager.CLIENT_ID);
    params.set('scope', AuthManager.SCOPE);

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': AuthManager.CONTENT_TYPE_FORM
      },
      body: params.toString()
    });

    if (!resp.ok) {
      throw new Error(`Device code request failed with status ${resp.status}`);
    }

    return (await resp.json()) as DeviceCodeResponse;
  }

  private async pollForToken(
    tokenEndpoint: string,
    device: DeviceCodeResponse,
    isCancelled: () => boolean
  ): Promise<TokenSuccessResponse> {
    const params = new URLSearchParams();
    params.set('client_id', AuthManager.CLIENT_ID);
    params.set('grant_type', AuthManager.GRANT_TYPE_DEVICE);
    params.set('device_code', device.device_code);
    params.set('client_secret', AuthManager.CLIENT_SECRET);
    params.set('scope', AuthManager.SCOPE);

    let interval = device.interval * 1000;
    const maxExpiry = Date.now() + device.expires_in * 1000;

    return await vscode.window.withProgress<TokenSuccessResponse>(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Waiting for NOUMENA Cloud authorization...',
        cancellable: true
      },
      async (_progress, token) => {
        while (true) {
          if (isCancelled()) {
            throw new Error('Login attempt superseded');
          }
          if (token.isCancellationRequested) {
            throw new Error('Login cancelled');
          }

          const res = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': AuthManager.CONTENT_TYPE_FORM },
            body: params.toString()
          });

          const json: any = await res.json();

          if (res.ok && json.access_token) {
            return json as TokenSuccessResponse;
          }

          const error = json.error as string | undefined;
          if (error === 'authorization_pending') {
            // continue polling
          } else if (error === 'slow_down') {
            interval += 1000; // increase wait
          } else {
            throw new Error(json.error_description || 'Authorization failed');
          }

          if (Date.now() > maxExpiry) {
            throw new Error('Device flow expired, please try again');
          }

          await new Promise(r => setTimeout(r, interval));
        }
      }
    );
  }

  private async refreshAccessToken(): Promise<void> {
    const keycloakBase: string | undefined = vscode.workspace.getConfiguration('noumena.cloud').get<string>('authUrl');
    if (!keycloakBase) {
      throw new Error('Keycloak URL not configured');
    }

    if (!this.refreshToken) {
      throw new Error('No refresh token');
    }

    const tokenEndpoint =
      keycloakBase + AuthManager.KEYCLOAK_REALM_PATH + '/token';

    const params = new URLSearchParams();
    params.set('grant_type', 'refresh_token');
    params.set('client_id', AuthManager.CLIENT_ID);
    params.set('refresh_token', this.refreshToken);
    params.set('client_secret', AuthManager.CLIENT_SECRET);
    params.set('scope', AuthManager.SCOPE);

    const resp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': AuthManager.CONTENT_TYPE_FORM
      },
      body: params.toString()
    });

    const json: any = await resp.json();

    if (!resp.ok || !json.access_token) {
      throw new Error(json.error_description || 'Failed to refresh token');
    }

    await this.handleSuccessfulAuth(json as TokenSuccessResponse);
  }

  private async handleSuccessfulAuth(tokenResponse: TokenSuccessResponse) {
    this.accessToken = tokenResponse.access_token;
    this.accessTokenExpiry = Date.now() + tokenResponse.expires_in * 1000;
    this.refreshToken = tokenResponse.refresh_token;
    await this.secrets.store(
      AuthManager.REFRESH_TOKEN_SECRET_KEY,
      this.refreshToken
    );
    await this.secrets.store(
      AuthManager.ACCESS_TOKEN_SECRET_KEY,
      this.accessToken
    );
    await this.secrets.store(
      AuthManager.ACCESS_TOKEN_EXPIRY_SECRET_KEY,
      this.accessTokenExpiry.toString()
    );

    const username = this.extractUsername(this.accessToken);
    this._onDidLogin.fire(username ?? '');
    this.logger.log(`Logged in to NOUMENA Cloud as ${username ?? 'unknown user'}`);
  }

  private extractUsername(jwt: string): string | undefined {
    const parts = jwt.split('.');
    if (parts.length < 2) {
      return undefined;
    }
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf8')
      );
      return (
        payload.preferred_username ||
        payload.username ||
        payload.email ||
        payload.name
      );
    } catch {
      return undefined;
    }
  }
}
