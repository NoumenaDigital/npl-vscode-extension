import { workspace, ExtensionContext } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    const serverOptions: ServerOptions = {
        run: { module: context.asAbsolutePath('out/server/dummyServer.js'), transport: TransportKind.ipc },
        debug: { module: context.asAbsolutePath('out/server/dummyServer.js'), transport: TransportKind.ipc }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'npl' }],
    };

    client = new LanguageClient('nplLanguageServer', 'NPL Language Server', serverOptions, clientOptions);
    client.start();
}

export function deactivate(): Thenable<void> | undefined {
    return client ? client.stop() : undefined;
}
