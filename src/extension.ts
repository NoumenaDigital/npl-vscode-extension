import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, TransportKind, StreamInfo } from 'vscode-languageclient/node';
import * as net from 'net';

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
  const serverOptions = (): Promise<StreamInfo> => {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: 'localhost', port: 5007 }, () => {
        resolve({
          reader: socket,
          writer: socket,
        });
      });
      socket.on('error', (err) => reject(err));
    });
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
