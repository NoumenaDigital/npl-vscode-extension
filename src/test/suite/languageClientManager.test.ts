import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { LanguageClientManager } from '../../client/LanguageClientManager';
import { Logger } from '../../utils/Logger';
import { ServerManager } from '../../server/ServerManager';
import * as path from 'path';

suite('LanguageClientManager Test Suite', () => {
  let sandbox: sinon.SinonSandbox;
  let mockLogger: sinon.SinonStubbedInstance<Logger>;
  let mockServerManager: sinon.SinonStubbedInstance<ServerManager>;
  let clientManager: LanguageClientManager;

  setup(() => {
    sandbox = sinon.createSandbox();
    mockLogger = sandbox.createStubInstance(Logger);
    mockServerManager = sandbox.createStubInstance(ServerManager);
    clientManager = new LanguageClientManager(mockLogger as unknown as Logger, mockServerManager as unknown as ServerManager);
  });

  teardown(() => {
    sandbox.restore();
  });

  // Helper to create mock WorkspaceFolder objects
  const createMockWorkspaceFolder = (fsPath: string, name: string, index: number): vscode.WorkspaceFolder => ({
    uri: vscode.Uri.file(fsPath),
    name: name,
    index: index
  });

  test('buildWorkspaceFoldersList - Uses VS Code folders when settings are empty', () => {
    const workspacePath = path.normalize('/workspace/project1');
    const vscodeFolders = [
      createMockWorkspaceFolder(workspacePath, 'project1', 0)
    ];
    const result = (clientManager as any).buildWorkspaceFoldersList(undefined, undefined, vscodeFolders);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(path.normalize(result[0].uri.fsPath), workspacePath);
    assert.strictEqual(result[0].name, 'project1');
  });

  test('buildWorkspaceFoldersList - Uses NPL.sources setting', () => {
    const sourcesPath = path.normalize('/custom/sources');
    const result = (clientManager as any).buildWorkspaceFoldersList(sourcesPath, undefined, []);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(path.normalize(result[0].uri.fsPath), sourcesPath);
    assert.strictEqual(result[0].name, 'NPL Sources');
  });

   test('buildWorkspaceFoldersList - Uses NPL.sources and ignores VS Code folders', () => {
     const sourcesPath = path.normalize('/custom/sources');
     const vscodeFolders = [
       createMockWorkspaceFolder('/workspace/project1', 'project1', 0)
     ];
     const result = (clientManager as any).buildWorkspaceFoldersList(sourcesPath, undefined, vscodeFolders);

     assert.strictEqual(result.length, 1);
     assert.strictEqual(path.normalize(result[0].uri.fsPath), sourcesPath);
     assert.strictEqual(result[0].name, 'NPL Sources');
   });

  test('buildWorkspaceFoldersList - Adds NPL.testSources setting', () => {
    const sourcesPath = path.normalize('/custom/sources');
    const testSourcesPath = path.normalize('/custom/tests');
    const result = (clientManager as any).buildWorkspaceFoldersList(sourcesPath, testSourcesPath, []);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(path.normalize(result[0].uri.fsPath), sourcesPath);
    assert.strictEqual(result[0].name, 'NPL Sources');
    assert.strictEqual(path.normalize(result[1].uri.fsPath), testSourcesPath);
    assert.strictEqual(result[1].name, 'NPL Test Sources');
  });

  test('buildWorkspaceFoldersList - Uses VS Code folders and adds NPL.testSources', () => {
     const workspacePath = path.normalize('/workspace/project1');
     const vscodeFolders = [
       createMockWorkspaceFolder(workspacePath, 'project1', 0)
     ];
    const testSourcesPath = path.normalize('/custom/tests');
     const result = (clientManager as any).buildWorkspaceFoldersList(undefined, testSourcesPath, vscodeFolders);

     assert.strictEqual(result.length, 2);
     assert.strictEqual(path.normalize(result[0].uri.fsPath), workspacePath);
     assert.strictEqual(result[0].name, 'project1');
     assert.strictEqual(path.normalize(result[1].uri.fsPath), testSourcesPath);
     assert.strictEqual(result[1].name, 'NPL Test Sources');
  });

  test('buildWorkspaceFoldersList - Does not duplicate testSources if inside sources', () => {
    const sourcesPath = path.normalize('/custom/path');
    const testSourcesPath = path.join(sourcesPath, 'tests'); // Use path.join for platform independence
    const result = (clientManager as any).buildWorkspaceFoldersList(sourcesPath, testSourcesPath, []);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(path.normalize(result[0].uri.fsPath), sourcesPath);
    assert.strictEqual(result[0].name, 'NPL Sources');
  });

  test('buildWorkspaceFoldersList - Does not duplicate testSources if inside VS Code workspace folders', () => {
    const workspacePath = path.normalize('/workspace/project1');
    const testSourcesPath = path.join(workspacePath, 'tests'); // Use path.join
    const vscodeFolders = [
      createMockWorkspaceFolder(workspacePath, 'project1', 0)
    ];
    const result = (clientManager as any).buildWorkspaceFoldersList(undefined, testSourcesPath, vscodeFolders);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(path.normalize(result[0].uri.fsPath), workspacePath);
    assert.strictEqual(result[0].name, 'project1');
  });

  test('buildWorkspaceFoldersList - Handles empty settings and no VS Code folders', () => {
    const result = (clientManager as any).buildWorkspaceFoldersList(undefined, undefined, undefined);
    assert.strictEqual(result.length, 0);
  });
});
