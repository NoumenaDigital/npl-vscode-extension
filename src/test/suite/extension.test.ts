import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as fs from 'fs';

suite('Extension Test Suite', () => {
	let sandbox: sinon.SinonSandbox;
	let syntaxErrorFilePath: string;
	let validFilePath: string;

	setup(async () => {
		sandbox = sinon.createSandbox();

		const rootPath = path.resolve(__dirname, '../../../');

		syntaxErrorFilePath = path.join(rootPath, 'src', 'test', 'fixtures', 'syntax-error.npl');
		validFilePath = path.join(rootPath, 'src', 'test', 'fixtures', 'no-syntax-error.npl');

		if (!fs.existsSync(syntaxErrorFilePath)) {
			throw new Error(`Test fixture not found: ${syntaxErrorFilePath}`);
		}

		if (!fs.existsSync(validFilePath)) {
			throw new Error(`Test fixture not found: ${validFilePath}`);
		}
	});

	teardown(() => {
		sandbox.restore();
	});

	test('NPL syntax error detection', async function() {
		this.timeout(10000);

		const document = await vscode.workspace.openTextDocument(syntaxErrorFilePath);
		await vscode.window.showTextDocument(document);

		await new Promise(resolve => setTimeout(resolve, 2000));

		const diagnostics = await waitForDiagnostics(document.uri, 8000);

		assert.strictEqual(diagnostics.length > 0, true, 'No diagnostics were reported');

		const syntaxError = diagnostics.find(diagnostic => {
			const messageMatch = diagnostic.message.includes("Unknown 'test'");
			const lineMatch = diagnostic.range.start.line === 2;

			return messageMatch && lineMatch;
		});

		assert.notStrictEqual(syntaxError, undefined,
			`Expected syntax error with message "Unknown 'test'" on line 3`);

		assert.ok(
			syntaxError?.code === "0002" || syntaxError?.code === 2,
			`Expected error code 0002, got ${syntaxError?.code}`
		);
	});

	test('NPL valid file has no syntax errors', async function() {
		this.timeout(10000);

		const document = await vscode.workspace.openTextDocument(validFilePath);
		await vscode.window.showTextDocument(document);

		await new Promise(resolve => setTimeout(resolve, 5000));

		const diagnostics = vscode.languages.getDiagnostics(document.uri);

		assert.strictEqual(diagnostics.length, 0,
			`Expected no diagnostics, but found ${diagnostics.length}: ${diagnostics.map(d => d.message).join(', ')}`);
	});
});

async function waitForDiagnostics(uri: vscode.Uri, timeout = 5000): Promise<vscode.Diagnostic[]> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		const diagnostics = vscode.languages.getDiagnostics(uri);
		if (diagnostics.length > 0) {
			return diagnostics;
		}

		await new Promise(resolve => setTimeout(resolve, 100));
	}

	return vscode.languages.getDiagnostics(uri);
}
