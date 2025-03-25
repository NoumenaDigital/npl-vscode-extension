import * as assert from 'assert';
import * as sinon from 'sinon';
import { DownloadManager, IFileSystem, IHttpClient } from '../../server/binary/DownloadManager';
import * as http from 'http';
import * as fs from 'fs';

function createMockResponse(options: {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
}): http.IncomingMessage {
  const callbacks: Record<string, Array<(...args: any[]) => void>> = {};

  const mockResponse = {
    statusCode: options.statusCode,
    headers: options.headers,
    on: function(event: string, callback: (...args: any[]) => void) {
      callbacks[event] = callbacks[event] || [];
      callbacks[event].push(callback);
      return this;
    },
    emit: function(event: string, ...args: any[]) {
      const eventCallbacks = callbacks[event] || [];
      eventCallbacks.forEach(callback => callback(...args));
      return true;
    },
    pipe: function(destination: any) {
      // Simulate piping behavior by triggering the destination's finish event
      if (destination && typeof destination.emit === 'function') {
        setImmediate(() => {
          destination.emit('finish');
        });
      }
      return destination;
    }
  } as unknown as http.IncomingMessage;

  return mockResponse;
}

function createMockClientRequest(): http.ClientRequest {
  return {
    on: sinon.stub(),
    abort: sinon.stub()
  } as unknown as http.ClientRequest;
}

function createMockWriteStream(): fs.WriteStream {
  // Create a more sophisticated mock of WriteStream
  const callbacks: Record<string, Array<(...args: any[]) => void>> = {};

  const mockWriteStream = {
    on: function(event: string, callback: (...args: any[]) => void) {
      callbacks[event] = callbacks[event] || [];
      callbacks[event].push(callback);
      return this;
    },
    emit: function(event: string, ...args: any[]) {
      const eventCallbacks = callbacks[event] || [];
      eventCallbacks.forEach(callback => callback(...args));
      return true;
    },
    close: sinon.stub(),
    write: sinon.stub().returns(true)
  } as unknown as fs.WriteStream;

  return mockWriteStream;
}

suite('DownloadManager Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockFs: IFileSystem & sinon.SinonStubbedInstance<IFileSystem>;
  let mockHttp: IHttpClient & sinon.SinonStubbedInstance<IHttpClient>;
  let mockHttps: IHttpClient & sinon.SinonStubbedInstance<IHttpClient>;
  let downloadManager: DownloadManager;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Create mock filesystem
    mockFs = {
      existsSync: sandbox.stub().returns(false),
      mkdirSync: sandbox.stub(),
      createWriteStream: sandbox.stub().returns(createMockWriteStream()),
      unlink: sandbox.stub()
    } as IFileSystem & sinon.SinonStubbedInstance<IFileSystem>;

    // Create mock HTTP clients
    mockHttp = {
      get: sandbox.stub()
    } as IHttpClient & sinon.SinonStubbedInstance<IHttpClient>;

    mockHttps = {
      get: sandbox.stub()
    } as IHttpClient & sinon.SinonStubbedInstance<IHttpClient>;

    downloadManager = new DownloadManager(mockFs, mockHttp, mockHttps);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should create directory if it does not exist', async () => {
    const mockResponse = createMockResponse({
      statusCode: 200,
      headers: { 'content-length': '100' }
    });

    const mockWriteStream = createMockWriteStream();
    mockFs.createWriteStream.returns(mockWriteStream);

    mockHttp.get.callsFake((_url: string, callback: (response: http.IncomingMessage) => void) => {
      callback(mockResponse);
      return createMockClientRequest();
    });

    // Create a promise to be resolved when download completes
    const downloadPromise = downloadManager.downloadFile('http://example.com/file', '/path/to/file');

    // Simulate stream events
    setImmediate(() => {
      (mockResponse as any).emit('end');
      (mockWriteStream as any).emit('finish');
    });

    await downloadPromise;
    assert.strictEqual(mockFs.mkdirSync.calledWith('/path/to', { recursive: true }), true);
  });

  test('should handle successful download with progress', async () => {
    const progressCallback = sandbox.stub();
    const mockResponse = createMockResponse({
      statusCode: 200,
      headers: { 'content-length': '100' }
    });

    const mockWriteStream = createMockWriteStream();
    mockFs.createWriteStream.returns(mockWriteStream);

    mockHttp.get.callsFake((_url: string, callback: (response: http.IncomingMessage) => void) => {
      callback(mockResponse);
      return createMockClientRequest();
    });

    // Create a promise to be resolved when download completes
    const downloadPromise = downloadManager.downloadFile('http://example.com/file', '/path/to/file', progressCallback);

    // Simulate stream events
    setImmediate(() => {
      (mockResponse as any).emit('data', Buffer.from('test data'));
      (mockResponse as any).emit('end');
      (mockWriteStream as any).emit('finish');
    });

    await downloadPromise;
    assert.strictEqual(progressCallback.called, true);
    const progressCall = progressCallback.getCall(0);
    assert.deepStrictEqual(progressCall.args[0], {
      message: 'Download started...',
      current: 0,
      total: 100,
      increment: 0
    });
  });

  test('should handle non-200 responses', async () => {
    const mockResponse = createMockResponse({
      statusCode: 404,
      headers: {}
    });

    mockHttp.get.callsFake((_url: string, callback: (response: http.IncomingMessage) => void) => {
      callback(mockResponse);
      return createMockClientRequest();
    });

    try {
      await downloadManager.downloadFile('http://example.com/file', '/path/to/file');
      assert.fail('Should have thrown an error');
    } catch (error: unknown) {
      if (error instanceof Error) {
        assert.strictEqual(error.message, 'Failed to download, status code: 404');
      } else {
        assert.fail('Error should be an instance of Error');
      }
    }
  });

  test('should handle download errors', async () => {
    const mockError = new Error('Network error');
    mockHttp.get.callsFake((_url: string, _callback: (response: http.IncomingMessage) => void) => {
      const req = createMockClientRequest();
      (req.on as sinon.SinonStub).withArgs('error').callsFake((_event: string, callback: (error: Error) => void) => {
        callback(mockError);
        return req;
      });
      return req;
    });

    try {
      await downloadManager.downloadFile('http://example.com/file', '/path/to/file');
      assert.fail('Should have thrown an error');
    } catch (error: unknown) {
      if (error instanceof Error) {
        assert.strictEqual(error, mockError);
      } else {
        assert.fail('Error should be an instance of Error');
      }
    }

    assert.strictEqual(mockFs.unlink.called, true);
  });

  test('should handle file write errors', async function() {
    // Increase timeout for this test
    this.timeout(5000);

    const mockResponse = createMockResponse({
      statusCode: 200,
      headers: { 'content-length': '100' }
    });

    const mockWriteStream = createMockWriteStream();
    const mockError = new Error('Write error');

    // Don't initialize the writeStream in the mock yet
    mockFs.createWriteStream.callsFake(() => {
      // We'll get a reference to the writeStream directly
      return mockWriteStream;
    });

    mockHttp.get.callsFake((_url: string, callback: (response: http.IncomingMessage) => void) => {
      callback(mockResponse);
      return createMockClientRequest();
    });

    // Set up a promise that we'll use to wait until pipe has been called
    let resolvePipePromise: () => void;
    const pipePromise = new Promise<void>(resolve => {
      resolvePipePromise = resolve;
    });

    // Override the pipe method to detect when it's called
    (mockResponse as any).pipe = function(destination: any) {
      if (destination === mockWriteStream) {
        // Signal that pipe has been called
        process.nextTick(resolvePipePromise);
      }
      return destination;
    };

    // Start the download
    const downloadPromise = downloadManager.downloadFile('http://example.com/file', '/path/to/file');

    // Wait until pipe has been called
    await pipePromise;

    // Now trigger the error
    process.nextTick(() => {
      (mockWriteStream as any).emit('error', mockError);
    });

    // Now await and expect it to throw our error
    try {
      await downloadPromise;
      assert.fail('Download should have failed');
    } catch (error) {
      assert.strictEqual(error, mockError, 'Error should be the mock error we created');
    }

    assert.strictEqual(mockFs.unlink.called, true, 'File should be cleaned up');
  });
});
