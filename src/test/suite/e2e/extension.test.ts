import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as fs from 'fs';

suite('Extension E2E Test Suite', () => {
	let sandbox: sinon.SinonSandbox;
	let syntaxErrorFilePath: string;
	let validFilePath: string;

	setup(async () => {
		sandbox = sinon.createSandbox();

		// Check for GitHub token, log warning if not available
		const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
		if (!token) {
			console.warn('WARNING: No GitHub token found in environment variables. This may cause rate limiting issues in CI.');
			console.warn('Set GITHUB_TOKEN or GH_TOKEN environment variable with a valid GitHub PAT to avoid this.');
		}

		const rootPath = path.resolve(__dirname, '../../../');

		// Note: The fixtures path needs to be correctly mapped to the compiled location
		syntaxErrorFilePath = path.join(rootPath, 'test', 'fixtures', 'syntax-error.npl');
		validFilePath = path.join(rootPath, 'test', 'fixtures', 'no-syntax-error.npl');

		// Define the fixtures path in the output directory - properly referencing using __dirname
		const outDirFixturesPath = path.join(rootPath, 'src', 'test', 'fixtures');
		const outSyntaxErrorFilePath = path.join(outDirFixturesPath, 'syntax-error.npl');
		const outValidFilePath = path.join(outDirFixturesPath, 'no-syntax-error.npl');

		// Ensure the directory exists
		if (!fs.existsSync(outDirFixturesPath)) {
			fs.mkdirSync(outDirFixturesPath, { recursive: true });
		}

		// Copy the fixture files to the output directory
		if (fs.existsSync(syntaxErrorFilePath)) {
			fs.copyFileSync(syntaxErrorFilePath, outSyntaxErrorFilePath);
		}

		if (fs.existsSync(validFilePath)) {
			fs.copyFileSync(validFilePath, outValidFilePath);
		}

		// Use the output fixtures
		syntaxErrorFilePath = outSyntaxErrorFilePath;
		validFilePath = outValidFilePath;

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

		// Create a promise that resolves when diagnostics are updated
		const diagnosticsPromise = new Promise<vscode.Diagnostic[]>(resolve => {
			const disposable = vscode.languages.onDidChangeDiagnostics(e => {
				if (e.uris.some(uri => uri.toString() === document.uri.toString())) {
					const diagnostics = vscode.languages.getDiagnostics(document.uri);
					if (diagnostics.length > 0) {
						disposable.dispose();
						resolve(diagnostics);
					}
				}
			});

			setTimeout(() => {
				disposable.dispose();
				resolve(vscode.languages.getDiagnostics(document.uri));
			}, 8000);
		});

		const diagnostics = await diagnosticsPromise;

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

		// For valid files, we need to wait a reasonable time to ensure no diagnostics appear
		// Use a promise that resolves after a timeout or when diagnostics change
		const result = await new Promise<boolean>(resolve => {
			let hasDiagnostics = false;

			const disposable = vscode.languages.onDidChangeDiagnostics(e => {
				if (e.uris.some(uri => uri.toString() === document.uri.toString())) {
					const diagnostics = vscode.languages.getDiagnostics(document.uri);
					if (diagnostics.length > 0) {
						hasDiagnostics = true;
						disposable.dispose();
						resolve(false);
					}
				}
			});

			// After a reasonable wait time, if no diagnostics appeared, the test passes
			setTimeout(() => {
				disposable.dispose();
				resolve(!hasDiagnostics);
			}, 5000);
		});

		// If result is false, diagnostics were found
		assert.strictEqual(result, true, 'Unexpected diagnostics were reported for valid file');

		const diagnostics = vscode.languages.getDiagnostics(document.uri);
		assert.strictEqual(diagnostics.length, 0,
			`Expected no diagnostics, but found ${diagnostics.length}: ${diagnostics.map(d => d.message).join(', ')}`);
	});
});
