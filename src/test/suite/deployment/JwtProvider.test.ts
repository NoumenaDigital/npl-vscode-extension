import * as assert from 'assert';
import * as sinon from 'sinon';
import * as http from 'http';
import { AddressInfo } from 'net';
import { JwtProvider } from '../../../deployment/JwtProvider';
import { TestServer } from './TestServer';
import { TestLogger } from './TestLogger';
import { Logger } from '../../../utils/Logger';

suite('JwtProvider Tests', () => {
  let server: TestServer;
  let logger: TestLogger;
  let sandbox: sinon.SinonSandbox;

  setup(async () => {
    server = new TestServer().start();

    logger = new TestLogger();

    sandbox = sinon.createSandbox();
  });

  teardown(async () => {
    await server.stop();

    sandbox.restore();
  });

  test('Should successfully retrieve JWT token', async () => {
    server.setAuthResponse(200, { access_token: 'test-jwt-token' });

    const jwtProvider = new JwtProvider({
      username: 'testuser',
      password: 'testpass',
      authUrl: `${server.getBaseUrl()}/api/auth/login`,
      logger: logger
    });

    const token = await jwtProvider.provideJwt();

    assert.strictEqual(token, 'test-jwt-token');
  });

  test('Should return null when authentication fails', async () => {
    server.setAuthResponse(401);

    const jwtProvider = new JwtProvider({
      username: 'testuser',
      password: 'testpass',
      authUrl: `${server.getBaseUrl()}/api/auth/login`,
      logger: logger
    });

    const logErrorSpy = sandbox.spy(logger, 'logError');

    const token = await jwtProvider.provideJwt();

    assert.strictEqual(token, null);

    // Verify error was logged
    assert.strictEqual(logErrorSpy.calledOnce, true);
    assert.strictEqual(logErrorSpy.firstCall.args[0], 'Failed to get JWT: Status 401');
  });

  test('Should return null when response is missing token', async () => {
    // Configure test server with successful response but no token
    server.setAuthResponse(200, { something_else: 'value' });

    // Create JWT provider with type cast
    const jwtProvider = new JwtProvider({
      username: 'testuser',
      password: 'testpass',
      authUrl: `${server.getBaseUrl()}/api/auth/login`,
      logger: logger as unknown as Logger
    });

    const logErrorSpy = sandbox.spy(logger, 'logError');

    const token = await jwtProvider.provideJwt();

    assert.strictEqual(token, null);

    assert.strictEqual(logErrorSpy.calledOnce, true);
    assert.strictEqual(logErrorSpy.firstCall.args[0], 'No access token found in response');
  });

  test('Should return null when server is unavailable', async () => {
    await server.stop();

    const jwtProvider = new JwtProvider({
      username: 'testuser',
      password: 'testpass',
      authUrl: `${server.getBaseUrl()}/api/auth/login`,
      logger: logger as unknown as Logger
    });

    const logErrorSpy = sandbox.spy(logger, 'logError');

    const token = await jwtProvider.provideJwt();

    assert.strictEqual(token, null);

    assert.strictEqual(logErrorSpy.called, true);
  });

  test('Should return null when response is invalid JSON', async () => {
    server.setAuthResponse(200, null);

    const originalServer = http.createServer((req, res) => {
      if (req.url === '/api/auth/login' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{invalid json');
      }
    });

    const port = await new Promise<number>(resolve => {
      originalServer.listen(0, () => {
        const address = originalServer.address() as AddressInfo;
        resolve(address.port);
      });
    });

    const jwtProvider = new JwtProvider({
      username: 'testuser',
      password: 'testpass',
      authUrl: `http://localhost:${port}/api/auth/login`,
      logger: logger as unknown as Logger
    });

    const logErrorSpy = sandbox.spy(logger, 'logError');

    const token = await jwtProvider.provideJwt();

    assert.strictEqual(token, null);

    assert.strictEqual(logErrorSpy.called, true);

    await new Promise<void>(resolve => {
      originalServer.close(() => resolve());
    });
  });
});
