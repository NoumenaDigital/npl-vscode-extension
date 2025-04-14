import * as assert from 'assert';
import * as sinon from 'sinon';
import { ClientRequest, IncomingMessage } from 'http';
import { HttpClient, IHttpRequester } from '../../utils/HttpClient';
import { EventEmitter } from 'events';
import { ILogger } from '../../utils/Logger';

function createMockRequest(): ClientRequest & EventEmitter {
  const emitter = new EventEmitter() as ClientRequest & EventEmitter;
  // Add end method that HttpClient will call
  emitter.end = sinon.stub().callsFake(() => emitter);
  return emitter;
}

suite('HttpClient Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockRequester: IHttpRequester & sinon.SinonStubbedInstance<IHttpRequester>;
  let httpClient: HttpClient;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Create a mock requester instead of stubbing https.get directly
    mockRequester = {
      request: sandbox.stub()
    } as IHttpRequester & sinon.SinonStubbedInstance<IHttpRequester>;

    httpClient = new HttpClient(mockRequester);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should handle successful response', async () => {
    // Create mock response and request using EventEmitter
    const requestEmitter = createMockRequest();
    const responseEmitter = new EventEmitter() as IncomingMessage & EventEmitter;

    // Setup the mock requester
    mockRequester.request.returns(requestEmitter);

    // Setup response properties
    Object.assign(responseEmitter, {
      statusCode: 200,
      headers: {}
    });

    // Create a promise to resolve with our test data
    const testPromise = httpClient.get<{ hello: string }>('https://example.com/api');

    // Emit response event with our mock response
    process.nextTick(() => {
      requestEmitter.emit('response', responseEmitter);

      // Emit data and end events
      responseEmitter.emit('data', JSON.stringify({ hello: 'world' }));
      responseEmitter.emit('end');
    });

    // Await the result
    const result = await testPromise;

    // Assert the result
    assert.deepStrictEqual(result, { hello: 'world' });
    assert.strictEqual(mockRequester.request.calledOnce, true);
    assert.strictEqual((requestEmitter.end as sinon.SinonStub).calledOnce, true);
  });

  test('should handle error response', async () => {
    // Create mock request
    const requestEmitter = createMockRequest();
    const mockError = new Error('Network error');

    // Setup the mock requester
    mockRequester.request.returns(requestEmitter);

    // Create a promise that will be rejected
    const testPromise = httpClient.get<any>('https://example.com/api');

    // Emit error event
    process.nextTick(() => {
      requestEmitter.emit('error', mockError);
    });

    // Expect the promise to be rejected with our error
    try {
      await testPromise;
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(error instanceof Error, 'Error should be an instance of Error');
      assert.strictEqual(error, mockError);
    }

    assert.strictEqual(mockRequester.request.calledOnce, true);
    assert.strictEqual((requestEmitter.end as sinon.SinonStub).calledOnce, true);
  });

  test('should handle non-200 status code', async () => {
    // Create mock response and request
    const requestEmitter = createMockRequest();
    const responseEmitter = new EventEmitter() as IncomingMessage & EventEmitter;

    // Setup response properties for a 404 status
    Object.assign(responseEmitter, {
      statusCode: 404,
      headers: {}
    });

    // Setup the mock requester
    mockRequester.request.returns(requestEmitter);

    // Create a promise that will be rejected
    const testPromise = httpClient.get<any>('https://example.com/api');

    // Emit response event
    process.nextTick(() => {
      requestEmitter.emit('response', responseEmitter);
    });

    // Expect the promise to be rejected with our error
    try {
      await testPromise;
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(error instanceof Error, 'Error should be an instance of Error');
      assert.strictEqual(error.message, 'Request failed with status code: 404');
    }

    assert.strictEqual(mockRequester.request.calledOnce, true);
    assert.strictEqual((requestEmitter.end as sinon.SinonStub).calledOnce, true);
  });
});
