import * as assert from 'assert';
import { AuthManager } from '../../noumena/AuthManager';
import { Logger } from '../../utils/Logger';
import * as vscode from 'vscode';
import 'mocha';
import sinon from 'sinon';

suite('AuthManager', () => {
  const stubContext: any = {
    secrets: {
      get: async () => null,
      store: async () => {},
      delete: async () => {},
    },
  } as unknown as vscode.ExtensionContext;

  const logger = new Logger('Test');
  const manager: any = new AuthManager(stubContext, logger);

  test('extractUsername reads preferred_username', () => {
    const payload = {
      preferred_username: 'alice',
    };
    const token = [
      Buffer.from('{}').toString('base64url'),
      Buffer.from(JSON.stringify(payload)).toString('base64url'),
      '',
    ].join('.');
    const username = manager.extractUsername(token);
    assert.strictEqual(username, 'alice');
  });

  suite('login flow', () => {
    let fetchStub: sinon.SinonStub;
    let openExternalStub: sinon.SinonStub;

    const deviceResponse = {
      device_code: 'code123',
      user_code: 'USER-CODE',
      verification_uri: 'https://keycloak.noumena.cloud/device',
      verification_uri_complete: 'https://keycloak.noumena.cloud/device?user_code=USER-CODE',
      expires_in: 600,
      interval: 1,
    };

    const tokenResponse = {
      access_token: 'header.' + Buffer.from(JSON.stringify({ preferred_username: 'bob' })).toString('base64url') + '.sig',
      expires_in: 300,
      refresh_expires_in: 0,
      refresh_token: 'refresh123',
      token_type: 'Bearer',
    };

    setup(() => {
      // Stub fetch: first call device, then token success
      fetchStub = sinon.stub(global as any, 'fetch');
      fetchStub.onFirstCall().resolves(new Response(JSON.stringify(deviceResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      fetchStub.onSecondCall().resolves(new Response(JSON.stringify(tokenResponse), { status: 200, headers: { 'Content-Type': 'application/json' } }));

      // Stub openExternal
      openExternalStub = sinon.stub(vscode.env, 'openExternal').resolves(true as any);

      const keycloakUrl = 'https://keycloak.noumena.cloud';
      manager.config = {
        get: (key: string) => {
          if (key === 'keycloakUrl') {
            return keycloakUrl;
          }
          return undefined;
        }
      } as any;
    });

    teardown(() => {
      fetchStub.restore();
      openExternalStub.restore();
    });

    test('login stores refresh token and emits event', async () => {
      const loginEvent = new Promise<string>(resolve => manager.onDidLogin(resolve));

      await manager.login();

      const username = await loginEvent;
      assert.strictEqual(username, 'bob');
      assert.strictEqual(manager.refreshToken, tokenResponse.refresh_token);
      assert.ok(fetchStub.calledTwice);
      assert.ok(openExternalStub.calledOnce);
    });
  });

  suite('getAccessToken refresh logic', () => {
    let fetchStub: sinon.SinonStub;
    let openExternalStub: sinon.SinonStub;

    const makeJwt = (username: string) =>
      'h.' + Buffer.from(JSON.stringify({ preferred_username: username })).toString('base64url') + '.s';

    setup(() => {
      const keycloakUrl = 'https://keycloak.noumena.cloud';
      // Override config
      manager.config = {
        get: (key: string) => {
          if (key === 'keycloakUrl') {
            return keycloakUrl;
          }
          return undefined;
        }
      } as any;
      openExternalStub = sinon.stub(vscode.env, 'openExternal').resolves(true as any);
    });

    teardown(() => {
      fetchStub?.restore();
      openExternalStub.restore();
    });

    test('refreshes expired token', async () => {
      // Prepare manager with expired access token and refresh token
      manager.accessToken = makeJwt('old');
      manager.accessTokenExpiry = Date.now() - 1;
      manager.refreshToken = 'refresh123';

      const refreshed = {
        access_token: makeJwt('new'),
        expires_in: 300,
        refresh_expires_in: 0,
        refresh_token: 'refresh123',
        token_type: 'Bearer',
      };

      fetchStub = sinon.stub(global as any, 'fetch').resolves(
        new Response(JSON.stringify(refreshed), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

      const token = await manager.getAccessToken();

      assert.strictEqual(token, refreshed.access_token);
      assert.ok(fetchStub.calledOnce);
      assert.ok(openExternalStub.notCalled); // no new login
    });

    test('falls back to device flow when refresh fails', async () => {
      manager.accessToken = makeJwt('old');
      manager.accessTokenExpiry = Date.now() - 1;
      manager.refreshToken = 'refresh123';

      const deviceRes = {
        device_code: 'd1',
        user_code: 'UC',
        verification_uri: 'https://keycloak/device',
        verification_uri_complete: 'https://keycloak/device?uc',
        expires_in: 600,
        interval: 1,
      };

      const tokenRes = {
        access_token: makeJwt('login'),
        expires_in: 300,
        refresh_expires_in: 0,
        refresh_token: 'r2',
        token_type: 'Bearer',
      };

      fetchStub = sinon.stub(global as any, 'fetch');
      // First call: refresh fails
      fetchStub.onFirstCall().resolves(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
      // Second: device code
      fetchStub.onSecondCall().resolves(new Response(JSON.stringify(deviceRes), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      // Third: token success
      fetchStub.onThirdCall().resolves(new Response(JSON.stringify(tokenRes), { status: 200, headers: { 'Content-Type': 'application/json' } }));

      const token = await manager.getAccessToken();

      assert.strictEqual(token, tokenRes.access_token);
      assert.ok(fetchStub.callCount === 3);
      assert.ok(openExternalStub.calledOnce);
    });
  });
});
