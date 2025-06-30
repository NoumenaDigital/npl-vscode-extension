import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { detectAndSetMigrationDescriptor } from '../../cloud/MigrationDescriptorDetector';
import { Logger } from '../../utils/Logger';

suite('MigrationDescriptorDetector Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockLogger: sinon.SinonStubbedInstance<Logger>;

  // Helper to create a mock WorkspaceFolder
  const createWorkspaceFolder = (fsPath: string): vscode.WorkspaceFolder => ({
    uri: vscode.Uri.file(fsPath),
    name: 'workspace',
    index: 0
  });

  setup(() => {
    sandbox = sinon.createSandbox();
    mockLogger = sandbox.createStubInstance(Logger);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('Automatically sets migrationDescriptor when exactly one file is found', async () => {
    const wsFolder = createWorkspaceFolder('/tmp/project');

    const fileUri = vscode.Uri.file('/tmp/project/migration.yml');
    sandbox.stub(vscode.workspace, 'findFiles').resolves([fileUri]);

    const getStub = sandbox.stub().withArgs('migrationDescriptor').returns(undefined);
    const updateStub = sandbox.stub().resolves();
    sandbox.stub(vscode.workspace, 'getConfiguration').returns({ get: getStub, update: updateStub } as any);

    await detectAndSetMigrationDescriptor(mockLogger as unknown as Logger, [wsFolder]);

    assert.strictEqual(updateStub.calledOnce, true, 'update should be called');
    assert.strictEqual(updateStub.firstCall.args[0], 'migrationDescriptor');
    assert.strictEqual(updateStub.firstCall.args[1], fileUri.fsPath);
  });

  test('Does nothing when multiple migration files are found', async () => {
    const wsFolder = createWorkspaceFolder('/tmp/project');

    const fileUri1 = vscode.Uri.file('/tmp/project/migration.yml');
    const fileUri2 = vscode.Uri.file('/tmp/project/other/migration.yml');
    sandbox.stub(vscode.workspace, 'findFiles').resolves([fileUri1, fileUri2]);

    const getStub = sandbox.stub().withArgs('migrationDescriptor').returns(undefined);
    const updateStub = sandbox.stub().resolves();
    sandbox.stub(vscode.workspace, 'getConfiguration').returns({ get: getStub, update: updateStub } as any);

    await detectAndSetMigrationDescriptor(mockLogger as unknown as Logger, [wsFolder]);

    assert.strictEqual(updateStub.called, false, 'update should not be called');
  });

  test('Does nothing when migrationDescriptor already set', async () => {
    const wsFolder = createWorkspaceFolder('/tmp/project');

    sandbox.stub(vscode.workspace, 'findFiles').resolves([]);

    const getStub = sandbox.stub().withArgs('migrationDescriptor').returns('/already/set/path');
    const updateStub = sandbox.stub().resolves();
    sandbox.stub(vscode.workspace, 'getConfiguration').returns({ get: getStub, update: updateStub } as any);

    await detectAndSetMigrationDescriptor(mockLogger as unknown as Logger, [wsFolder]);

    assert.strictEqual(updateStub.called, false, 'update should not be called when already set');
  });
});
