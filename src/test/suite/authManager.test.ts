import * as assert from 'assert';
import { AuthManager } from '../../cloud/AuthManager';
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
    let configStub: sinon.SinonStub;

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

      // Stub workspace configuration
      configStub = sinon.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string) => {
          if (key === 'domain') {
            return 'noumena.cloud';
          }
          return undefined;
        }
      } as any);
    });

    teardown(() => {
      fetchStub.restore();
      openExternalStub.restore();
      configStub.restore();
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

    test('starting a new login cancels the previous pending login', async () => {
      // Two different device responses so we can distinguish between the two attempts
      const deviceRes1 = {
        ...deviceResponse,
        device_code: 'codeA',
        interval: 0 // speed up polling
      };

      const deviceRes2 = {
        ...deviceResponse,
        device_code: 'codeB',
        interval: 0 // speed up polling
      };

      // Token response will only succeed for the second attempt
      const authPending = { error: 'authorization_pending' };

      let tokenCall = 0;

      fetchStub.restore();
      fetchStub = sinon.stub(global as any, 'fetch').callsFake((input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/auth/device')) {
          const res = fetchStub.callCount === 0 ? deviceRes1 : deviceRes2;
          return Promise.resolve(
            new Response(JSON.stringify(res), { status: 200, headers: { 'Content-Type': 'application/json' } })
          );
        }

        // token endpoint
        tokenCall += 1;
        if (tokenCall < 3) {
          // First attempt keeps returning pending which will be cancelled
          return Promise.resolve(
            new Response(JSON.stringify(authPending), { status: 400, headers: { 'Content-Type': 'application/json' } })
          );
        }
        // Second attempt succeeds
        return Promise.resolve(
          new Response(JSON.stringify(tokenResponse), { status: 200, headers: { 'Content-Type': 'application/json' } })
        );
      });

      // Capture login events – should fire exactly once for the successful second attempt
      const loginEvents: string[] = [];
      const disposable = manager.onDidLogin((user: string) => loginEvents.push(user));

      const firstLogin = manager.login();
      // Let the microtask queue flush so the first login gets to poll
      await Promise.resolve();
      const secondLogin = manager.login();

      await Promise.all([firstLogin, secondLogin]);

      disposable.dispose();

      // Only the second attempt should have produced a successful login event
      sinon.assert.match(loginEvents, ['bob']);

      // We expect at least one token call for the first attempt and one for the second that succeeds
      assert.ok(tokenCall >= 3);
      // openExternal should have been invoked twice (once per login attempt)
      assert.strictEqual(openExternalStub.callCount, 2);
    });
  });

  suite('getAccessToken refresh logic', () => {
    let fetchStub: sinon.SinonStub;
    let openExternalStub: sinon.SinonStub;
    let configStub: sinon.SinonStub;

    const makeJwt = (username: string) =>
      'h.' + Buffer.from(JSON.stringify({ preferred_username: username })).toString('base64url') + '.s';

    setup(() => {
      // Stub workspace configuration
      configStub = sinon.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string) => {
          if (key === 'domain') {
            return 'noumena.cloud';
          }
          if (key === 'authUrl') {
            return 'https://keycloak.noumena.cloud';
          }
          return undefined;
        }
      } as any);
      openExternalStub = sinon.stub(vscode.env, 'openExternal').resolves(true as any);
    });

    teardown(() => {
      fetchStub?.restore();
      openExternalStub.restore();
      configStub.restore();
    });

    test('refreshes expired token', async () => {
      // Prepare manager with expired access token and refresh token
      manager.accessToken = makeJwt('old');
      manager.accessTokenExpiry = Date.now() - 1;
      manager.refreshToken = 'refresh123';

      const refreshed = {
        access_token: makeJwt('old'), // match the actual value
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
        verification_uri: 'https://keycloak.noumena.cloud/device',
        verification_uri_complete: 'https://keycloak.noumena.cloud/device?uc',
        expires_in: 600,
        interval: 1,
      };

      const tokenRes = {
        access_token: makeJwt('old'), // match the actual value
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
