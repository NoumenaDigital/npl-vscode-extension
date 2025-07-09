import * as assert from 'assert';
import { DeploymentService } from '../../cloud/DeploymentService';
import { AuthManager } from '../../cloud/AuthManager';
import { Logger } from '../../utils/Logger';
import * as vscode from 'vscode';
import 'mocha';
import sinon from 'sinon';

suite('DeploymentService', () => {
  const stubContext: any = {
    secrets: {
      get: async () => null,
      store: async () => {},
      delete: async () => {},
    },
  } as unknown as vscode.ExtensionContext;

  const logger = new Logger('Test');
  const authManager = new AuthManager(stubContext, logger);
  let service: DeploymentService;
  let fetchStub: sinon.SinonStub;
  let withProgressStub: sinon.SinonStub;

  setup(() => {
    service = new DeploymentService(authManager, logger);

    // Stub fetch
    fetchStub = sinon.stub(global as any, 'fetch');

    // Stub withProgress
    withProgressStub = sinon.stub(vscode.window, 'withProgress');
    withProgressStub.callsFake(async (options, task) => {
      await task({ report: () => {} });
    });
  });

  teardown(() => {
    sinon.restore();
  });

  suite('deployWebsiteBuffer', () => {
    test('uploads website zip to correct endpoint', async () => {
      const appId = 'app-123';
      const zipBuffer = Buffer.from('test zip content');

      // Stub auth manager to return token
      sinon.stub(authManager, 'getAccessToken').resolves('test-token');

      // Mock successful response
      fetchStub.resolves(new Response('{}', { status: 200 }));

      await service.deployWebsiteBuffer(appId, zipBuffer);

      assert.ok(fetchStub.calledOnce);
      const call = fetchStub.firstCall;

      // Check URL
      assert.ok(call.args[0].includes(`/v1/applications/${appId}/uploadwebsite`));

      // Check method
      assert.strictEqual(call.args[1].method, 'POST');

      // Check headers
      const headers = call.args[1].headers;
      assert.ok(headers['Authorization'].includes('Bearer test-token'));
      assert.ok(headers['Content-Type'].includes('multipart/form-data'));
      assert.ok(headers['Content-Length']);

      // Check body contains zip buffer
      const body = call.args[1].body;
      assert.ok(Buffer.isBuffer(body));
      assert.ok(body.includes(zipBuffer));
    });

    test('uses correct form field name for website zip', async () => {
      const appId = 'app-123';
      const zipBuffer = Buffer.from('test zip content');

      sinon.stub(authManager, 'getAccessToken').resolves('test-token');
      fetchStub.resolves(new Response('{}', { status: 200 }));

      await service.deployWebsiteBuffer(appId, zipBuffer);

      const body = fetchStub.firstCall.args[1].body;
      const bodyString = body.toString();

      // Check that the form field name is 'website_zip'
      assert.ok(bodyString.includes('name="website_zip"'));
    });

    test('shows correct progress title', async () => {
      const appId = 'app-123';
      const zipBuffer = Buffer.from('test zip content');

      sinon.stub(authManager, 'getAccessToken').resolves('test-token');
      fetchStub.resolves(new Response('{}', { status: 200 }));

      await service.deployWebsiteBuffer(appId, zipBuffer);

      assert.ok(withProgressStub.calledOnce);
      const options = withProgressStub.firstCall.args[0];
      assert.strictEqual(options.title, 'Uploading frontend website...');
    });

    test('throws error on failed upload', async () => {
      const appId = 'app-123';
      const zipBuffer = Buffer.from('test zip content');

      sinon.stub(authManager, 'getAccessToken').resolves('test-token');
      fetchStub.resolves(new Response('Upload failed', { status: 500 }));

      await assert.rejects(
        () => service.deployWebsiteBuffer(appId, zipBuffer),
        /Website upload failed with status 500/
      );
    });

    test('throws error when no access token', async () => {
      const appId = 'app-123';
      const zipBuffer = Buffer.from('test zip content');

      sinon.stub(authManager, 'getAccessToken').resolves(undefined);

      await assert.rejects(
        () => service.deployWebsiteBuffer(appId, zipBuffer),
        /No access token/
      );
    });

    test('uses custom filename when provided', async () => {
      const appId = 'app-123';
      const zipBuffer = Buffer.from('test zip content');
      const customFilename = 'my-website.zip';

      sinon.stub(authManager, 'getAccessToken').resolves('test-token');
      fetchStub.resolves(new Response('{}', { status: 200 }));

      await service.deployWebsiteBuffer(appId, zipBuffer, customFilename);

      const body = fetchStub.firstCall.args[1].body;
      const bodyString = body.toString();

      // Check that the custom filename is used
      assert.ok(bodyString.includes(`filename="${customFilename}"`));
    });
  });

  suite('deployArchiveBuffer', () => {
    test('uploads archive to deploy endpoint', async () => {
      const appId = 'app-123';
      const zipBuffer = Buffer.from('test zip content');

      sinon.stub(authManager, 'getAccessToken').resolves('test-token');
      fetchStub.resolves(new Response('{}', { status: 200 }));

      await service.deployArchiveBuffer(appId, zipBuffer);

      assert.ok(fetchStub.calledOnce);
      const call = fetchStub.firstCall;

      // Check URL
      assert.ok(call.args[0].includes(`/v1/applications/${appId}/deploy`));

      // Check form field name is 'npl_archive'
      const body = call.args[1].body;
      const bodyString = body.toString();
      assert.ok(bodyString.includes('name="npl_archive"'));
    });
  });

  suite('clearApplication', () => {
    test('calls clear endpoint with DELETE method', async () => {
      const appId = 'app-123';

      sinon.stub(authManager, 'getAccessToken').resolves('test-token');
      fetchStub.resolves(new Response('{}', { status: 200 }));

      await service.clearApplication(appId);

      assert.ok(fetchStub.calledOnce);
      const call = fetchStub.firstCall;

      // Check URL
      assert.ok(call.args[0].includes(`/v1/applications/${appId}/clear`));

      // Check method
      assert.strictEqual(call.args[1].method, 'DELETE');

      // Check headers
      const headers = call.args[1].headers;
      assert.ok(headers['Authorization'].includes('Bearer test-token'));
      assert.strictEqual(headers['Accept'], 'application/json');
    });
  });
});
