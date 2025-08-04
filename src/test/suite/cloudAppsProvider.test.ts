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
    },
    tenantSlug: 'test-tenant',
    tenantAppSlug: 'test-tenant/test-app'
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

  suite('deployApplication', () => {
    test('shows success message by default', async () => {
      sinon.stub(provider as any, 'getDeploymentRoot').resolves('/path/to/root');
      sinon.stub(require('../../utils/ZipUtil'), 'createArchiveBuffer').resolves(Buffer.from('test'));
      sinon.stub((provider as any).deployer, 'deployArchiveBuffer').resolves();

      await provider.deployApplication(mockApplicationItem as any);

      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('Backend deployment'));
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('completed successfully'));
    });

    test('does not show success message when showSuccessMessage is false', async () => {
      sinon.stub(provider as any, 'getDeploymentRoot').resolves('/path/to/root');
      sinon.stub(require('../../utils/ZipUtil'), 'createArchiveBuffer').resolves(Buffer.from('test'));
      sinon.stub((provider as any).deployer, 'deployArchiveBuffer').resolves();

      await provider.deployApplication(mockApplicationItem as any, false);

      assert.ok(showInformationMessageStub.notCalled);
    });

    test('returns silently when no deployment root found', async () => {
      sinon.stub(provider as any, 'getDeploymentRoot').resolves(undefined);
      const createArchiveStub = sinon.stub(require('../../utils/ZipUtil'), 'createArchiveBuffer');
      const deployArchiveStub = sinon.stub((provider as any).deployer, 'deployArchiveBuffer');

      await provider.deployApplication(mockApplicationItem as any);

      // Should return without calling archive creation or deployment
      assert.ok(createArchiveStub.notCalled);
      assert.ok(deployArchiveStub.notCalled);
      assert.ok(showInformationMessageStub.notCalled);
    });
  });

  suite('deployFrontendApplication', () => {
    test('shows success message by default', async () => {
      sinon.stub(provider as any, 'getFrontendDeploymentRoot').resolves('/path/to/frontend');
      sinon.stub(require('../../utils/ZipUtil'), 'createArchiveBuffer').resolves(Buffer.from('test'));
      sinon.stub((provider as any).deployer, 'deployWebsiteBuffer').resolves();

      await provider.deployFrontendApplication(mockApplicationItem as any);

      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('Frontend deployment'));
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('completed successfully'));
    });

    test('does not show success message when showSuccessMessage is false', async () => {
      sinon.stub(provider as any, 'getFrontendDeploymentRoot').resolves('/path/to/frontend');
      sinon.stub(require('../../utils/ZipUtil'), 'createArchiveBuffer').resolves(Buffer.from('test'));
      sinon.stub((provider as any).deployer, 'deployWebsiteBuffer').resolves();

      await provider.deployFrontendApplication(mockApplicationItem as any, false);

      assert.ok(showInformationMessageStub.notCalled);
    });

    test('returns silently when no frontend deployment root found', async () => {
      sinon.stub(provider as any, 'getFrontendDeploymentRoot').resolves(undefined);
      const createArchiveStub = sinon.stub(require('../../utils/ZipUtil'), 'createArchiveBuffer');
      const deployWebsiteStub = sinon.stub((provider as any).deployer, 'deployWebsiteBuffer');

      await provider.deployFrontendApplication(mockApplicationItem as any);

      // Should return without calling archive creation or deployment
      assert.ok(createArchiveStub.notCalled);
      assert.ok(deployWebsiteStub.notCalled);
      assert.ok(showInformationMessageStub.notCalled);
    });
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
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Deployment to test-tenant/test-app failed'));
    });
  });

  suite('deployBoth', () => {
    test('deploys backend and frontend successfully', async () => {
      const deployBackendStub = sinon.stub(provider, 'deployApplication').resolves();
      const deployFrontendStub = sinon.stub(provider, 'deployFrontendApplication').resolves();

      withProgressStub.callsFake(async (options, task) => {
        await task({ report: () => {} });
      });

      await (provider as any).deployBoth(mockApplicationItem as any);

      assert.ok(withProgressStub.calledOnce);
      assert.ok(deployBackendStub.calledOnceWith(mockApplicationItem, false));
      assert.ok(deployFrontendStub.calledOnceWith(mockApplicationItem, false));
      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('Full deployment'));
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('completed successfully'));
    });

    test('shows error when only backend deployment fails', async () => {
      const deployBackendStub = sinon.stub(provider, 'deployApplication').rejects(new Error('Backend error: 422'));
      const deployFrontendStub = sinon.stub(provider, 'deployFrontendApplication').resolves();

      withProgressStub.callsFake(async (options, task) => {
        await task({ report: () => {} });
      });

      await (provider as any).deployBoth(mockApplicationItem as any);

      assert.ok(deployBackendStub.calledOnce);
      assert.ok(deployFrontendStub.calledOnce);
      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Backend deployment to test-tenant/test-app failed'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Backend error: 422'));
    });

    test('shows error when only frontend deployment fails', async () => {
      const deployBackendStub = sinon.stub(provider, 'deployApplication').resolves();
      const deployFrontendStub = sinon.stub(provider, 'deployFrontendApplication').rejects(new Error('Frontend error'));

      withProgressStub.callsFake(async (options, task) => {
        await task({ report: () => {} });
      });

      await (provider as any).deployBoth(mockApplicationItem as any);

      assert.ok(deployBackendStub.calledOnce);
      assert.ok(deployFrontendStub.calledOnce);
      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Frontend deployment to test-tenant/test-app failed'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Frontend error'));
    });

    test('shows error when both deployments fail', async () => {
      const deployBackendStub = sinon.stub(provider, 'deployApplication').rejects(new Error('Backend error'));
      const deployFrontendStub = sinon.stub(provider, 'deployFrontendApplication').rejects(new Error('Frontend error'));

      withProgressStub.callsFake(async (options, task) => {
        await task({ report: () => {} });
      });

      await (provider as any).deployBoth(mockApplicationItem as any);

      assert.ok(deployBackendStub.calledOnce);
      assert.ok(deployFrontendStub.calledOnce);
      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Both deployments to test-tenant/test-app failed'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Backend: Backend error'));
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('Frontend: Frontend error'));
    });

    test('continues with frontend deployment even if backend fails', async () => {
      const deployBackendStub = sinon.stub(provider, 'deployApplication').rejects(new Error('Backend failed'));
      const deployFrontendStub = sinon.stub(provider, 'deployFrontendApplication').resolves();

      withProgressStub.callsFake(async (options, task) => {
        await task({ report: () => {} });
      });

      await (provider as any).deployBoth(mockApplicationItem as any);

      // Ensure both deployment methods were called
      assert.ok(deployBackendStub.calledOnce);
      assert.ok(deployFrontendStub.calledOnce);

      // Ensure frontend was called after backend failed
      assert.ok(deployBackendStub.calledBefore(deployFrontendStub));
    });

    test('reports correct progress messages when both deployments succeed', async () => {
      const deployBackendStub = sinon.stub(provider, 'deployApplication').resolves();
      const deployFrontendStub = sinon.stub(provider, 'deployFrontendApplication').resolves();
      const progressReportStub = sinon.stub();

      withProgressStub.callsFake(async (options, task) => {
        await task({ report: progressReportStub });
      });

      await (provider as any).deployBoth(mockApplicationItem as any);

      // Verify progress messages in the correct order
      assert.ok(progressReportStub.getCall(0).calledWith({ message: 'Deploying backend...' }));
      assert.ok(progressReportStub.getCall(1).calledWith({ message: 'Backend deployed successfully.' }));
      assert.ok(progressReportStub.getCall(2).calledWith({ message: 'Deploying frontend...' }));
      assert.ok(progressReportStub.getCall(3).calledWith({ message: 'Frontend deployed successfully.' }));
      assert.strictEqual(progressReportStub.callCount, 4);
    });

    test('reports correct progress messages when backend fails but frontend succeeds', async () => {
      const deployBackendStub = sinon.stub(provider, 'deployApplication').rejects(new Error('Backend failed'));
      const deployFrontendStub = sinon.stub(provider, 'deployFrontendApplication').resolves();
      const progressReportStub = sinon.stub();

      withProgressStub.callsFake(async (options, task) => {
        await task({ report: progressReportStub });
      });

      await (provider as any).deployBoth(mockApplicationItem as any);

      // Verify progress messages in the correct order
      assert.ok(progressReportStub.getCall(0).calledWith({ message: 'Deploying backend...' }));
      assert.ok(progressReportStub.getCall(1).calledWith({ message: 'Backend deployment failed.' }));
      assert.ok(progressReportStub.getCall(2).calledWith({ message: 'Deploying frontend (backend failed)...' }));
      assert.ok(progressReportStub.getCall(3).calledWith({ message: 'Frontend deployed successfully.' }));
      assert.strictEqual(progressReportStub.callCount, 4);
    });

    test('reports correct progress messages when both deployments fail', async () => {
      const deployBackendStub = sinon.stub(provider, 'deployApplication').rejects(new Error('Backend failed'));
      const deployFrontendStub = sinon.stub(provider, 'deployFrontendApplication').rejects(new Error('Frontend failed'));
      const progressReportStub = sinon.stub();

      withProgressStub.callsFake(async (options, task) => {
        await task({ report: progressReportStub });
      });

      await (provider as any).deployBoth(mockApplicationItem as any);

      // Verify progress messages in the correct order
      assert.ok(progressReportStub.getCall(0).calledWith({ message: 'Deploying backend...' }));
      assert.ok(progressReportStub.getCall(1).calledWith({ message: 'Backend deployment failed.' }));
      assert.ok(progressReportStub.getCall(2).calledWith({ message: 'Deploying frontend (backend failed)...' }));
      assert.ok(progressReportStub.getCall(3).calledWith({ message: 'Frontend deployment failed.' }));
      assert.strictEqual(progressReportStub.callCount, 4);
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
      sinon.stub(fs.promises, 'stat').resolves({ isDirectory: () => true });

      // Stub workspace folders
      sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: { fsPath: '/workspace' } }]);

      // Stub path.join to return expected path
      sinon.stub(path, 'join').returns('/workspace/frontend/dist');

      showInformationMessageStub.resolves('Use frontend/dist');

      const result = await (provider as any).getFrontendDeploymentRoot();

      assert.strictEqual(result, '/workspace/frontend/dist');
      assert.ok(showInformationMessageStub.calledOnce);
      assert.ok(showInformationMessageStub.firstCall.args[0].includes('frontend/dist'));
    });

    test('shows error when frontend/dist not found', async () => {
      const fs = require('fs');
      const path = require('path');

      // Stub fs.stat to fail for frontend/dist
      sinon.stub(fs.promises, 'stat').rejects(new Error('Not found'));

      // Stub workspace folders
      sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: { fsPath: '/workspace' } }]);

      // Stub path.join to return expected path
      sinon.stub(path, 'join').returns('/workspace/frontend/dist');

      showErrorMessageStub.resolves('Configure');

      const result = await (provider as any).getFrontendDeploymentRoot();

      assert.strictEqual(result, undefined);
      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('frontend/dist'));
      assert.ok(!showErrorMessageStub.firstCall.args[0].includes('frontend folder'));
    });

    test('shows error when no frontend/dist folder found', async () => {
      const fs = require('fs');
      const path = require('path');

      // Stub fs.stat to fail for frontend/dist
      sinon.stub(fs.promises, 'stat').rejects(new Error('Not found'));

      // Stub workspace folders
      sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: { fsPath: '/workspace' } }]);

      // Stub path.join
      sinon.stub(path, 'join').returns('/workspace/frontend/dist');

      showErrorMessageStub.resolves('Configure');

      const result = await (provider as any).getFrontendDeploymentRoot();

      assert.strictEqual(result, undefined);
      assert.ok(showErrorMessageStub.calledOnce);
      assert.ok(showErrorMessageStub.firstCall.args[0].includes('frontend/dist'));
      assert.ok(!showErrorMessageStub.firstCall.args[0].includes('frontend folder'));
    });
  });
});
