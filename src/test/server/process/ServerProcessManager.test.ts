import * as assert from 'assert';
import * as sinon from 'sinon';
import { ServerProcessManager } from '../../../server/process/ServerProcessManager';
import { MockLogger } from '../../mocks/MockLogger';
import { BinaryManager } from '../../../server/binary/BinaryManager';

suite('ServerProcessManager Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockLogger: MockLogger;
  let manager: ServerProcessManager;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockLogger = new MockLogger();

    // Stub BinaryManager.validateServerBinary
    sandbox.stub(BinaryManager, 'validateServerBinary').resolves();

    manager = new ServerProcessManager(mockLogger as any);
  });

  teardown(() => {
    sandbox.restore();
    mockLogger.reset();
  });

  test('should be instantiated correctly', () => {
    assert.ok(manager instanceof ServerProcessManager);
    assert.strictEqual(mockLogger.errors.length, 0, 'No errors should be logged during instantiation');
  });

  test('stopServer should not throw when no server is running', () => {
    // This test doesn't need to mock the child process
    assert.doesNotThrow(() => {
      manager.stopServer();
    });
  });
});
