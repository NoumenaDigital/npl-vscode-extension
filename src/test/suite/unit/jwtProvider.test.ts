import * as assert from 'assert';
import * as vscode from 'vscode';
import { JwtProvider } from '../../../deployment/JwtProvider';
import { Logger } from '../../../utils/Logger';
import { TestServer } from '../mocks/TestServer';

// Simple logger implementation for testing
class TestLogger implements Partial<Logger> {
  public logs: string[] = [];
  public errors: Array<{message: string, error?: Error}> = [];

  log(message: string): void {
    this.logs.push(message);
  }

  logError(message: string, error?: Error): void {
    this.errors.push({ message, error });
  }

  show(): void {
    // No-op for tests
  }

  logInfo(message: string): void {
    this.logs.push(`INFO: ${message}`);
  }

  logWarning(message: string): void {
    this.logs.push(`WARNING: ${message}`);
  }

  // These methods aren't used in our test but needed for the interface
  get outputChannel(): vscode.LogOutputChannel {
    return {} as vscode.LogOutputChannel;
  }

  getOutputChannel(): vscode.LogOutputChannel {
    return {} as vscode.LogOutputChannel;
  }
}

suite('JwtProvider Test Suite', () => {
  let logger: TestLogger;
  let testServer: TestServer;
  let baseUrl: string;

  suiteSetup(async function() {
    this.timeout(10000); // Allow more time for server setup

    // Create and start test server
    testServer = new TestServer();
    baseUrl = await testServer.start();
  });

  suiteTeardown(async function() {
    this.timeout(5000); // Allow time for server teardown

    // Stop test server
    await testServer.stop();
  });

  setup(() => {
    logger = new TestLogger();
    testServer.enableConnectionErrorSimulation(false); // Reset connection error simulation
    testServer.enableAuthErrorSimulation(false); // Reset auth error simulation
  });

  test('provideJwt should retrieve JWT token successfully', async function() {
    // Configure test server with valid credentials
    testServer.setValidCredentials('test@example.com', 'password123');

    // Create JWT provider with valid credentials
    const jwtProvider = new JwtProvider({
      username: 'test@example.com',
      password: 'password123',
      authUrl: `${baseUrl}/api/auth/login`,
      logger: logger as unknown as Logger
    });

    // Request the JWT
    const token = await jwtProvider.provideJwt();

    // Verify we got a token
    assert.ok(token, 'Should receive a valid token');
    assert.strictEqual(typeof token, 'string', 'Token should be a string');
  });

  test('provideJwt should return null with invalid credentials', async function() {
    // Create JWT provider with invalid credentials
    const jwtProvider = new JwtProvider({
      username: 'test@example.com',
      password: 'wrong-password', // Incorrect password
      authUrl: `${baseUrl}/api/auth/login`,
      logger: logger as unknown as Logger
    });

    // Request the JWT
    const token = await jwtProvider.provideJwt();

    // Verify we didn't get a token
    assert.strictEqual(token, null, 'Should not receive a token with invalid credentials');

    // Verify error was logged
    assert.ok(logger.errors.length > 0, 'Error should be logged');
    assert.ok(
      logger.errors.some(e => e.message.includes('Failed to get JWT') ||
                         e.message.includes('Status 401')),
      'Error log should mention JWT failure or unauthorized status'
    );
  });

  test('provideJwt should handle connection errors', async function() {
    // Create JWT provider with non-existent server URL
    const jwtProvider = new JwtProvider({
      username: 'test@example.com',
      password: 'password123',
      authUrl: testServer.getConnectionErrorUrl(), // Non-existent server
      logger: logger as unknown as Logger
    });

    // Request the JWT
    const token = await jwtProvider.provideJwt();

    // Verify we didn't get a token
    assert.strictEqual(token, null, 'Should not receive a token with connection error');

    // Verify error was logged
    assert.ok(logger.errors.length > 0, 'Error should be logged');
    assert.ok(
      logger.errors.some(e =>
        e.message.includes('Error retrieving JWT') ||
        e.message.includes('Error during JWT request') ||
        e.message.includes('Failed to get JWT') ||
        e.message.includes('Unexpected error')),
      'Error log should mention JWT retrieval failure'
    );
  });

  test('provideJwt should handle server errors', async function() {
    // Create JWT provider with error endpoint
    const jwtProvider = new JwtProvider({
      username: 'test@example.com',
      password: 'password123',
      authUrl: `${baseUrl}/api/auth/error`, // Using the server error endpoint
      logger: logger as unknown as Logger
    });

    // Request the JWT
    const token = await jwtProvider.provideJwt();

    // Verify we didn't get a token
    assert.strictEqual(token, null, 'Should not receive a token when server errors');

    // Verify error was logged
    assert.ok(logger.errors.length > 0, 'Error should be logged');

    // Check error message
    assert.ok(
      logger.errors.some(error =>
        error.message.includes('Failed to get JWT') ||
        error.message.includes('Error retrieving JWT') ||
        error.message.includes('Status 500')),
      'Error message should indicate JWT retrieval failure or server error'
    );
  });
});
