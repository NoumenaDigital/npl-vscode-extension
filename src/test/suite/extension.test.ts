import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as extension from '../../extension';

suite('Extension Test Suite', () => {
	let sandbox: sinon.SinonSandbox;
	
	setup(() => {
		// Create a sinon sandbox for test isolation
		sandbox = sinon.createSandbox();
	});
	
	teardown(() => {
		// Restore all stubs and mocks
		sandbox.restore();
	});

	// Simple test to verify the test setup works
	test('Sample test', () => {
		assert.strictEqual(1 + 1, 2);
	});
}); 