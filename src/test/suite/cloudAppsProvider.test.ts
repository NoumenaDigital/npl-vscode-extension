import * as assert from 'assert';
import { CloudAppsProvider } from '../../cloud/CloudAppsProvider';
import { AuthManager } from '../../cloud/AuthManager';
import { Logger } from '../../utils/Logger';
import * as vscode from 'vscode';
import 'mocha';
import sinon from 'sinon';

suite('CloudAppsProvider', () => {
  const stubContext: any = {
    globalState: {
      get: () => false,
      update: async () => {},
    },
  } as unknown as vscode.ExtensionContext;

  const logger = new Logger('Test');
  const authManager = new AuthManager(stubContext, logger);
  let provider: CloudAppsProvider;
  let showQuickPickStub: sinon.SinonStub;
  let showInformationMessageStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let withProgressStub: sinon.SinonStub;

  const mockApplicationItem = {
    application: {
      id: 'app-123',
      name: 'Test App',
      slug: 'test-app',
      state: 'active'
    }
  };

  setup(() => {
    provider = new CloudAppsProvider(authManager, stubContext, logger);

    // Stub VS Code UI methods
    showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
    showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    withProgressStub = sinon.stub(vscode.window, 'withProgress');

    // Stub workspace configuration
    sinon.stub(vscode.workspace, 'getConfiguration').returns({
      get: () => undefined,
      update: async () => {}
    } as any);
  });

  teardown(() => {
    sinon.restore();
  });

  suite('showDeployOptions', () => {
    test('shows quick pick with three options', async () => {
      showQuickPickStub.resolves(undefined); // User cancels

      await provider.showDeployOptions(mockApplicationItem as any);

      assert.ok(showQuickPickStub.calledOnce);
      const options = showQuickPickStub.firstCall.args[0];
      assert.strictEqual(options.length, 3);

      // Check option labels
      assert.ok(options[0].label.includes('NPL Backend'));
      assert.ok(options[1].label.includes('Static Frontend'));
      assert.ok(options[2].label.includes('Deploy Both'));

      // Check option values
      assert.strictEqual(options[0].value, 'backend');
      assert.strictEqual(options[1].value, 'frontend');
      assert.strictEqual(options[2].value, 'both');
    });

    test('calls deployApplication when backend is selected', async () => {
      showQuickPickStub.resolves({ value: 'backend' });

      const deployStub = sinon.stub(provider, 'deployApplication').resolves();

      await provider.showDeployOptions(mockApplicationItem as any);

      assert.ok(deployStub.calledOnceWith(mockApplicationItem));
    });

    test('calls deployFrontendApplication when frontend is selected', async () => {
      showQuickPickStub.resolves({ value: 'frontend' });

      const deployStub = sinon.stub(provider, 'deployFrontendApplication').resolves();

      await provider.showDeployOptions(mockApplicationItem as any);

      assert.ok(deployStub.calledOnceWith(mockApplicationItem));
    });

    test('calls deployBoth when both is selected', async () => {
      showQuickPickStub.resolves({ value: 'both' });

      const deployBothStub = sinon.stub(provider as any, 'deployBoth').resolves();

      await provider.showDeployOptions(mockApplicationItem as any);

      assert.ok(deployBothStub.calledOnceWith(mockApplicationItem));
    });

    test('shows error when deployment fails', async () => {
      showQuickPickStub.resolves({ value: 'backend' });

      const deployStub = sinon.stub(provider, 'deployApplication').rejects(new Error('Deployment failed'));

      await provider.showDeployOptions(mockApplicationItem as any);

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Deployment failed'));
    });
  });

  suite('deployBoth', () => {
    test('deploys backend then frontend with progress', async () => {
      const deployBackendStub = sinon.stub(provider, 'deployApplication').resolves();
      const deployFrontendStub = sinon.stub(provider, 'deployFrontendApplication').resolves();

      withProgressStub.callsFake(async (options, task) => {
        await task({ report: () => {} });
      });

      await (provider as any).deployBoth(mockApplicationItem as any);

      assert.ok(withProgressStub.calledOnce);
      assert.ok(deployBackendStub.calledOnce);
      assert.ok(deployFrontendStub.calledOnce);
      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('Full deployment'));
    });

    test('shows error when backend deployment fails', async () => {
      const deployBackendStub = sinon.stub(provider, 'deployApplication').rejects(new Error('Backend failed'));

      withProgressStub.callsFake(async (options, task) => {
        await task({ report: () => {} });
      });

      await assert.rejects(
        () => (provider as any).deployBoth(mockApplicationItem as any),
        /Backend failed/
      );
    });
  });

  suite('getFrontendDeploymentRoot', () => {
    test('returns configured frontend sources path', async () => {
      // Remove the existing stub from setup and create a new one
      sinon.restore();

      const configStub = sinon.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string) => key === 'frontendSources' ? '/path/to/frontend' : undefined,
        update: async () => {}
      } as any);

      const result = await (provider as any).getFrontendDeploymentRoot();

      assert.strictEqual(result, '/path/to/frontend');
    });

    test('prompts for frontend/dist folder when found', async () => {
      const fs = require('fs');
      const path = require('path');

      // Stub fs.stat to return directory for frontend/dist
      const statStub = sinon.stub(fs.promises, 'stat').resolves({ isDirectory: () => true });

      // Stub workspace folders
      sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: { fsPath: '/workspace' } }]);

      // Stub path.join to return expected path
      const pathJoinStub = sinon.stub(path, 'join').returns('/workspace/frontend/dist');

      showInformationMessageStub.resolves('Use Frontend/Dist');

      const result = await (provider as any).getFrontendDeploymentRoot();

      assert.strictEqual(result, '/workspace/frontend/dist');
      assert.ok(statStub.calledOnce);
      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('frontend/dist'));
    });

    test('falls back to frontend folder when dist not found', async () => {
      const fs = require('fs');
      const path = require('path');

      // Stub fs.stat to fail for frontend/dist but succeed for frontend
      const statStub = sinon.stub(fs.promises, 'stat')
        .onFirstCall().rejects(new Error('Not found'))
        .onSecondCall().resolves({ isDirectory: () => true });

      // Stub workspace folders
      sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: { fsPath: '/workspace' } }]);

      // Stub path.join to return expected paths
      const pathJoinStub = sinon.stub(path, 'join')
        .onFirstCall().returns('/workspace/frontend/dist')
        .onSecondCall().returns('/workspace/frontend');

      showInformationMessageStub.resolves('Use Frontend Folder');

      const result = await (provider as any).getFrontendDeploymentRoot();

      assert.strictEqual(result, '/workspace/frontend');
      assert.ok(statStub.calledTwice);
      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('frontend'));
    });

    test('shows error when no frontend folders found', async () => {
      const fs = require('fs');
      const path = require('path');

      // Stub fs.stat to fail for both paths
      sinon.stub(fs.promises, 'stat').rejects(new Error('Not found'));

      // Stub workspace folders
      sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: { fsPath: '/workspace' } }]);

      // Stub path.join
      sinon.stub(path, 'join')
        .onFirstCall().returns('/workspace/frontend/dist')
        .onSecondCall().returns('/workspace/frontend');

      showErrorMessageStub.resolves('Configure');

      const result = await (provider as any).getFrontendDeploymentRoot();

      assert.strictEqual(result, undefined);
      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('frontend/dist'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('frontend'));
    });
  });

  suite('offerFrontendConfig', () => {
    test('shows dialog after successful backend deployment', async () => {
      showInformationMessageStub.resolves('Create Config');

      const createConfigStub = sinon.stub(provider as any, 'createFrontendConfig').resolves();

      await (provider as any).offerFrontendConfig(mockApplicationItem as any);

      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('frontend configuration file'));
      assert.ok(createConfigStub.calledOnce);
    });

    test('does nothing when user declines', async () => {
      showInformationMessageStub.resolves('Not Now');

      const createConfigStub = sinon.stub(provider as any, 'createFrontendConfig').resolves();

      await (provider as any).offerFrontendConfig(mockApplicationItem as any);

      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(createConfigStub.notCalled);
    });

    test('handles errors when creating config', async () => {
      showInformationMessageStub.resolves('Create Config');

      const createConfigStub = sinon.stub(provider as any, 'createFrontendConfig').rejects(new Error('Config creation failed'));

      await (provider as any).offerFrontendConfig(mockApplicationItem as any);

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Failed to create frontend config'));
    });
  });

  suite('createFrontendConfig', () => {
    test('creates frontend config file with correct content', async () => {
      // Remove existing stubs to avoid conflicts
      sinon.restore();

      // Re-stub VS Code APIs
      showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
      const openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as any);
      const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves();
      const applyEditStub = sinon.stub(vscode.workspace, 'applyEdit').resolves(true);
      const showInputBoxStub = sinon.stub(vscode.window, 'showInputBox').resolves('iou');

      // Stub workspace folders with a real vscode.Uri
      sinon.stub(vscode.workspace, 'workspaceFolders').value([{
        uri: vscode.Uri.file('/workspace')
      }]);

      // Stub workspace configuration
      const configStub = sinon.stub(vscode.workspace, 'getConfiguration');
      configStub.withArgs('noumena.cloud').returns({
        get: (key: string) => {
          if (key === 'domain') {return 'noumena.cloud';}
          return undefined;
        }
      } as any);

      // Stub tenant lookup
      const getTenantStub = sinon.stub(provider as any, 'getTenantForApplication').resolves({
        id: 'tenant-123',
        name: 'Test Tenant',
        slug: 'testtenant'
      });

      await (provider as any).createFrontendConfig(mockApplicationItem as any);

      assert.ok(showInputBoxStub.calledOnce);
      assert.ok(applyEditStub.calledOnce);
      assert.ok(openTextDocumentStub.calledOnce);
      assert.ok(showTextDocumentStub.calledOnce);
      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('Frontend configuration created'));

            // Verify the content contains the correct tenant-specific URLs
      const editCall = applyEditStub.firstCall;
      const edit = editCall.args[0];
      const insertEdit = edit.entries()[0][1][0];
      const content = insertEdit.newText;



      assert.ok(content.includes('https://engine-testtenant-test-app.noumena.cloud'));
      assert.ok(content.includes('https://keycloak-testtenant-test-app.noumena.cloud'));
      assert.ok(content.includes('NPL_CLIENT_ID = "test-app"'));
      assert.ok(content.includes('/npl/iou/-/openapi.json'));
    });

    test('cancels creation when user cancels package name input', async () => {
      // Remove existing stubs to avoid conflicts
      sinon.restore();

      // Re-stub VS Code APIs
      showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
      const showInputBoxStub = sinon.stub(vscode.window, 'showInputBox').resolves(undefined); // User cancels
      const applyEditStub = sinon.stub(vscode.workspace, 'applyEdit').resolves(true);

      // Stub workspace folders with a real vscode.Uri
      sinon.stub(vscode.workspace, 'workspaceFolders').value([{
        uri: vscode.Uri.file('/workspace')
      }]);

      // Stub tenant lookup
      const getTenantStub = sinon.stub(provider as any, 'getTenantForApplication').resolves({
        id: 'tenant-123',
        name: 'Test Tenant',
        slug: 'testtenant'
      });

      await (provider as any).createFrontendConfig(mockApplicationItem as any);

      assert.ok(showInputBoxStub.calledOnce);
      assert.ok(applyEditStub.notCalled);
      assert.ok(showInformationMessageStub.notCalled);
    });

    test('shows error when no workspace folder', async () => {
      sinon.stub(vscode.workspace, 'workspaceFolders').value([]);

      await (provider as any).createFrontendConfig(mockApplicationItem as any);

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('No workspace folder open'));
    });

    test('shows error when tenant not found', async () => {
      sinon.stub(vscode.workspace, 'workspaceFolders').value([{
        uri: { fsPath: '/workspace', scheme: 'file' }
      }]);

      const getTenantStub = sinon.stub(provider as any, 'getTenantForApplication').resolves(null);

      await (provider as any).createFrontendConfig(mockApplicationItem as any);

      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Could not find tenant information'));
    });
  });
});
