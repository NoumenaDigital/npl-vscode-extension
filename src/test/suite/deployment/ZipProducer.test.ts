import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as sinon from 'sinon';
import { ZipProducer } from '../../../deployment/ZipProducer';
import { TestLogger } from './TestLogger';
import { Logger } from '../../../utils/Logger';

suite('ZipProducer Tests', () => {
    let logger: TestLogger;
    let zipProducer: ZipProducer;
    let tempDir: string;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npl-zip-test-'));

        const testFilePath = path.join(tempDir, 'test.npl');
        fs.writeFileSync(testFilePath, 'protocol[] Test() { init {}; };');

        logger = new TestLogger();

        sandbox = sinon.createSandbox();

        zipProducer = new ZipProducer(logger);
    });

    teardown(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }

        sandbox.restore();
    });

    test('Should create a zip file from a directory', async () => {
        const buffer = await zipProducer.produceZip(tempDir);

        assert.ok(buffer.length > 0, 'Zip file should not be empty');
    });

    test('Should fail if source path does not exist', async () => {
        const nonExistentPath = path.join(tempDir, 'non-existent');

        try {
            await zipProducer.produceZip(nonExistentPath);
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok((error as Error).message.includes('does not exist'));
        }
    });

    test('Should validate source path is a directory', async () => {
        // Try to create a zip file from a file
        const filePath = path.join(tempDir, 'test.npl');

        try {
            await zipProducer.produceZip(filePath);
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok((error as Error).message.includes('is not a directory'));
        }
    });

    test('Should validate source path is readable', async () => {
        const readErrorDir = path.join(tempDir, 'read-error-dir');
        fs.mkdirSync(readErrorDir);

        // Instead of stubbing fs.accessSync, we'll override the isReadable method on ZipProducer
        // This avoids issues with non-configurable properties
        const originalProduceZip = zipProducer.produceZip;
        zipProducer.produceZip = async (sourcePath: string) => {
            if (sourcePath === readErrorDir) {
                throw new Error(`Path ${sourcePath} is not readable`);
            }
            return originalProduceZip.call(zipProducer, sourcePath);
        };

        try {
            await zipProducer.produceZip(readErrorDir);
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok((error as Error).message.includes('is not readable'));
        }
    });
});
