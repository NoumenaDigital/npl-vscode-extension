import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { TcpConnectionManager } from '../../../server/connection/TcpConnectionManager';
import { MockLogger } from '../../mocks/MockLogger';

suite('TcpConnectionManager Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockLogger: MockLogger;
  let manager: TcpConnectionManager;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockLogger = new MockLogger();
    manager = new TcpConnectionManager(mockLogger as any);

    // Setup mock VS Code configuration
    const mockConfig = {
      get: sandbox.stub().returns(undefined) // Return undefined to use default port
    };
    sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig as any);
  });

  teardown(() => {
    sandbox.restore();
    mockLogger.reset();
  });

  test('should be instantiated correctly', () => {
    assert.ok(manager instanceof TcpConnectionManager);
    assert.strictEqual(mockLogger.errors.length, 0, 'No errors should be logged during instantiation');
  });

  test('getServerPort returns default port when no config value', () => {
    // Test that the default port is used when no config value is provided
    assert.strictEqual(manager.getServerPort(), 5007);
  });
});
