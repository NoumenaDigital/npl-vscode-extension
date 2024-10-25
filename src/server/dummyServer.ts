import { createConnection, TextDocuments, ProposedFeatures, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize(() => {
    console.log('NPL language server initialized');
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Full
        }
    };
});

connection.listen();
