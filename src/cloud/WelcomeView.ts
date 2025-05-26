import * as vscode from 'vscode';

export class WelcomeView implements vscode.WebviewViewProvider {
  public static readonly viewType = 'noumena.cloud.welcome';

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlContent();

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'login':
            vscode.commands.executeCommand('noumena.cloud.login');
            break;
        }
      },
      undefined,
      []
    );
  }

  private getHtmlContent(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>NOUMENA Cloud</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          padding: 20px;
          line-height: 1.5;
        }
        h2 {
          font-weight: normal;
          margin-top: 0;
          margin-bottom: 12px;
        }
        p {
          margin-bottom: 16px;
        }
        .button {
          display: inline-block;
          padding: 8px 12px;
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          text-decoration: none;
          border-radius: 2px;
          cursor: pointer;
          border: none;
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
        }
        .button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        .link {
          color: var(--vscode-textLink-foreground);
          text-decoration: none;
        }
        .link:hover {
          text-decoration: underline;
        }
        .container {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Welcome to NOUMENA Cloud</h2>
        <p>Connect to your NOUMENA Cloud account to view applications to which you can deploy your NPL code.</p>
        <button class="button" id="login-button">Sign in to NOUMENA Cloud</button>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        document.getElementById('login-button').addEventListener('click', () => {
          vscode.postMessage({ command: 'login' });
        });
      </script>
    </body>
    </html>`;
  }
}
