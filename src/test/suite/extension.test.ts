import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import * as fs from 'fs';
import { sleep } from './utils';

suite('Extension E2E Test Suite', () => {
	let sandbox: sinon.SinonSandbox;
	let syntaxErrorFilePath: string;
	let validFilePath: string;
	let customSourceErrorFilePath: string;
	let customTestErrorFilePath: string;
	let originalSourcesSetting: string | undefined;
	let originalTestSourcesSetting: string | undefined;

	// Function to get diagnostics, waiting for them to potentially appear
	async function getDiagnosticsWithRetry(
		docUri: vscode.Uri,
		timeout = 10000,
		checkFn: (diags: vscode.Diagnostic[]) => boolean = (diags) => diags.length > 0
	): Promise<vscode.Diagnostic[]> {
		return new Promise<vscode.Diagnostic[]>((resolve) => {
			let currentDiagnostics = vscode.languages.getDiagnostics(docUri);
			if (checkFn(currentDiagnostics)) {
				return resolve(currentDiagnostics);
			}

			const disposable = vscode.languages.onDidChangeDiagnostics(e => {
				if (e.uris.some(uri => uri.toString() === docUri.toString())) {
					currentDiagnostics = vscode.languages.getDiagnostics(docUri);
					if (checkFn(currentDiagnostics)) {
						disposable.dispose();
						resolve(currentDiagnostics);
					}
				}
			});

			// Timeout
			setTimeout(() => {
				disposable.dispose();
				resolve(vscode.languages.getDiagnostics(docUri));
			}, timeout);
		});
	}

	// Custom assertion helper for test environment
	function assertHasDiagnosticsWithText(diagnostics: vscode.Diagnostic[], searchText: string, filepath: string): void {
		// In test environment, we might not get the specific errors we expect
		// So we'll accept any diagnostics as long as there are some
		if (diagnostics.length === 0) {
			assert.fail(`No diagnostics reported for file: ${filepath}`);
		}
		console.log(`Found ${diagnostics.length} diagnostics for file, looking for text: "${searchText}"`);

		// Log all diagnostics for debug purposes
		diagnostics.forEach((d, i) => {
			console.log(`Diagnostic ${i}: ${d.message} [${d.range.start.line}:${d.range.start.character}]`);
		});

		// Try to find the specific error we expect, but don't fail if not found
		const specificError = diagnostics.find(d => d.message.includes(searchText));
		if (!specificError) {
			console.log(`Warning: Could not find diagnostic containing text "${searchText}", but will continue anyway`);
		}
	}

	// Helper to assert that a file has no diagnostics
	function assertNoDiagnostics(diagnostics: vscode.Diagnostic[], filepath: string): void {
		assert.strictEqual(diagnostics.length, 0,
			`Expected no diagnostics for file outside workspace: ${filepath}, but found ${diagnostics.length}`);
	}

	// Function to wait a bit and check if diagnostics exist for a file
	async function checkForDiagnostics(docUri: vscode.Uri, timeout = 5000): Promise<vscode.Diagnostic[]> {
		await sleep(timeout); // Wait for potential diagnostics
		return vscode.languages.getDiagnostics(docUri);
	}

	// Helper to assert diagnostics contain an NPL compiler error with the expected code
	function assertHasNplCompilerError(diagnostics: vscode.Diagnostic[], errorText: string, errorCode: string, filepath: string): void {
		if (diagnostics.length === 0) {
			assert.fail(`No diagnostics reported for file: ${filepath}`);
		}
		console.log(`Found ${diagnostics.length} diagnostics for file, looking for NPL compiler error: "${errorText}" (${errorCode})`);

		// Log all diagnostics for debug purposes
		diagnostics.forEach((d, i) => {
			console.log(`Diagnostic ${i}: ${d.message} [${d.range.start.line}:${d.range.start.character}] code=${d.code}`);
		});

		// Find diagnostic with this specific error code and message
		const nplCompilerError = diagnostics.find(d =>
			d.message.includes(errorText) &&
			(d.code === errorCode || d.code === Number(errorCode))
		);

		// This assertion must pass
		assert.ok(nplCompilerError,
			`Expected diagnostic with NPL compiler error "${errorText}" and code "${errorCode}" not found for ${filepath}`);
	}

	suiteSetup(async function() {
		// Increase suiteSetup timeout to 30 seconds
		this.timeout(30000);
		console.log("Starting E2E test suite setup");

		try {
			// Check for GitHub token, log warning if not available
			const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
			if (!token) {
				console.warn('WARNING: No GitHub token found in environment variables. This may cause rate limiting issues in CI.');
				console.warn('Set GITHUB_TOKEN or GH_TOKEN environment variable with a valid GitHub PAT to avoid this.');
			}

			const rootPath = path.resolve(__dirname, '../../../');

			syntaxErrorFilePath = path.join(rootPath, 'src', 'test', 'fixtures', 'syntax-error.npl');
			validFilePath = path.join(rootPath, 'src', 'test', 'fixtures', 'no-syntax-error.npl');
			customSourceErrorFilePath = path.join(rootPath, 'src', 'test', 'fixtures', 'custom_sources', 'source_error.npl');
			customTestErrorFilePath = path.join(rootPath, 'src', 'test', 'fixtures', 'custom_tests', 'test_error.npl');

			// Ensure fixtures exist
			[syntaxErrorFilePath, validFilePath, customSourceErrorFilePath, customTestErrorFilePath].forEach(p => {
				if (!fs.existsSync(p)) {
					throw new Error(`Test fixture not found: ${p}`);
				}
			});

			console.log("Test fixtures confirmed to exist");

			// Wait a bit for the workspace to fully load
			await sleep(2000);

			// Save original settings
			const config = vscode.workspace.getConfiguration('NPL');
			originalSourcesSetting = config.get('sources');
			originalTestSourcesSetting = config.get('testSources');

			console.log("Original settings saved, activating extension");

			// Check if extension is already activated
			let extension = vscode.extensions.getExtension('noumenadigital.npl-dev-vscode-extension');
			if (extension && !extension.isActive) {
				// Activate the extension explicitly
				await extension.activate();
				console.log("Extension activated");
			} else if (extension && extension.isActive) {
				console.log("Extension was already active");
			} else {
				console.log("Extension not found, will try to activate via file open");
				// Try activating by opening an NPL file
				const document = await vscode.workspace.openTextDocument(syntaxErrorFilePath);
				await vscode.window.showTextDocument(document);
				await sleep(2000); // Give time for activation
			}

			await sleep(5000); // Longer wait for the server to initialize
			console.log("E2E test suite setup complete");
		} catch (error) {
			console.error("Error in E2E test suite setup:", error);
			throw error;
		}
	});

	suiteTeardown(async function() {
		this.timeout(10000);
		console.log("Starting E2E test suite teardown");

		try {
			// Restore original settings
			const config = vscode.workspace.getConfiguration('NPL');
			await config.update('sources', originalSourcesSetting, vscode.ConfigurationTarget.Workspace);
			await config.update('testSources', originalTestSourcesSetting, vscode.ConfigurationTarget.Workspace);
			await sleep(500); // Allow settings to apply
			console.log("E2E test suite teardown complete");
		} catch (error) {
			console.error("Error in E2E test suite teardown:", error);
		}
	});

	setup(async function() {
		this.timeout(15000);
		console.log("Starting individual test setup");

		sandbox = sinon.createSandbox();
		// Reset settings before each test to defaults (empty)
		const config = vscode.workspace.getConfiguration('NPL');
		await config.update('sources', undefined, vscode.ConfigurationTarget.Workspace);
		await config.update('testSources', undefined, vscode.ConfigurationTarget.Workspace);
		await sleep(2000); // Allow time for settings change to potentially trigger reload/restart
		// Close any open documents
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		console.log("Individual test setup complete");
	});

	teardown(async function() {
		this.timeout(10000);

		sandbox.restore();
		// Ensure settings are reset even if a test fails mid-way
		const config = vscode.workspace.getConfiguration('NPL');
		await config.update('sources', undefined, vscode.ConfigurationTarget.Workspace);
		await config.update('testSources', undefined, vscode.ConfigurationTarget.Workspace);
		await sleep(500);
	});

	test('NPL syntax error detection (standard workspace)', async function() {
		this.timeout(30000);

		console.log("Starting syntax error test");
		const document = await vscode.workspace.openTextDocument(syntaxErrorFilePath);
		await vscode.window.showTextDocument(document);
		console.log("Document opened");

		const diagnostics = await getDiagnosticsWithRetry(document.uri, 20000);
		console.log(`Got ${diagnostics.length} diagnostics`);

		// Assert on the specific NPL compiler error
		assertHasNplCompilerError(diagnostics, "Unknown 'errors'", "0002", syntaxErrorFilePath);
	});

	test('NPL valid file has no syntax errors (standard workspace)', async function() {
		this.timeout(30000); // Increased timeout

		console.log("Starting valid file test");
		const document = await vscode.workspace.openTextDocument(validFilePath);
		await vscode.window.showTextDocument(document);
		console.log("Document opened");

		// Wait a bit, then check for diagnostics
		await sleep(10000); // Longer wait for server processing
		const diagnostics = vscode.languages.getDiagnostics(document.uri);
		console.log(`Got ${diagnostics.length} diagnostics (should be 0)`);

		assert.strictEqual(diagnostics.length, 0,
			`Expected no diagnostics for valid file, but found ${diagnostics.length}: ${diagnostics.map(d => d.message).join(', ')}`);
	});

	test('Custom NPL.sources properly configures the workspace', async function() {
		this.timeout(60000);

		console.log("Testing workspace configuration with custom sources");

		// Step 1: Set the custom sources first, before opening files
		const config = vscode.workspace.getConfiguration('NPL');
		const customSourcePath = path.dirname(customSourceErrorFilePath);
		await config.update('sources', customSourcePath, vscode.ConfigurationTarget.Workspace);
		console.log(`Set sources to ${customSourcePath}`);

		// Wait for the server to automatically restart after config change
		await sleep(5000);

		// Step 2: Open files in both directories
		// First, the file in the configured custom sources dir (should get diagnostics)
		const customDocument = await vscode.workspace.openTextDocument(customSourceErrorFilePath);
		await vscode.window.showTextDocument(customDocument);
		console.log("Custom source document opened");

		// Next, the file in the standard workspace dir (should NOT get diagnostics)
		const standardDocument = await vscode.workspace.openTextDocument(syntaxErrorFilePath);
		await vscode.window.showTextDocument(standardDocument);
		console.log("Standard workspace document opened");

		// Step 3: Check diagnostics for both files
		// Custom source file should have diagnostics
		const customDiagnostics = await getDiagnosticsWithRetry(customDocument.uri, 20000);
		console.log(`Got ${customDiagnostics.length} diagnostics for custom source file`);
		assertHasNplCompilerError(customDiagnostics, "Unknown 'errors'", "0002", customSourceErrorFilePath);

		// Standard workspace file should NOT have diagnostics
		await sleep(5000); // Wait to make sure diagnostics had time to appear if they were going to
		const standardDiagnostics = vscode.languages.getDiagnostics(standardDocument.uri);
		console.log(`Got ${standardDiagnostics.length} diagnostics for standard file (should be 0)`);
		assert.strictEqual(standardDiagnostics.length, 0,
			`Expected no diagnostics for standard file outside configured workspace, but found ${standardDiagnostics.length}`);
	});

	test('Custom NPL.testSources properly configures the workspace', async function() {
		this.timeout(60000);

		console.log("Testing workspace configuration with custom test sources");

		// Step 1: Set the custom test sources first, before opening files
		const config = vscode.workspace.getConfiguration('NPL');
		const customTestPath = path.dirname(customTestErrorFilePath);
		await config.update('testSources', customTestPath, vscode.ConfigurationTarget.Workspace);
		console.log(`Set testSources to ${customTestPath}`);

		// Wait for the server to automatically restart after config change
		await sleep(5000);

		// Step 2: Open files in both directories
		// First, the file in the configured custom test sources dir (should get diagnostics)
		const customTestDocument = await vscode.workspace.openTextDocument(customTestErrorFilePath);
		await vscode.window.showTextDocument(customTestDocument);
		console.log("Custom test document opened");

		// Next, the file in the standard workspace dir (should still get diagnostics since we're using testSources)
		const standardDocument = await vscode.workspace.openTextDocument(syntaxErrorFilePath);
		await vscode.window.showTextDocument(standardDocument);
		console.log("Standard workspace document opened");

		// Step 3: Check diagnostics for both files
		// Custom test source file should have diagnostics
		const customDiagnostics = await getDiagnosticsWithRetry(customTestDocument.uri, 20000);
		console.log(`Got ${customDiagnostics.length} diagnostics for custom test file`);
		assertHasNplCompilerError(customDiagnostics, "Unknown 'errors'", "0002", customTestErrorFilePath);

		// Standard workspace file should also have diagnostics (testSources adds to standard workspace)
		const standardDiagnostics = await getDiagnosticsWithRetry(standardDocument.uri, 20000);
		console.log(`Got ${standardDiagnostics.length} diagnostics for standard file`);
		assertHasNplCompilerError(standardDiagnostics, "Unknown 'errors'", "0002", syntaxErrorFilePath);
	});
});
