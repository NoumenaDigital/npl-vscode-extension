import * as vscode from 'vscode';

export class AuthenticationProvider implements vscode.TreeDataProvider<AuthItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<AuthItem | undefined | null | void> = new vscode.EventEmitter<AuthItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<AuthItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private isLoggedIn = false;
  private username: string | undefined;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AuthItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AuthItem): Thenable<AuthItem[]> {
    if (!this.isLoggedIn) {
      return Promise.resolve([]);
    }

    if (!element) {
            // Root level - just show applications
      return Promise.resolve([
        new AuthItem(
          'Applications',
          vscode.TreeItemCollapsibleState.Collapsed
        )
      ]);
    } else if (element.label === 'Applications') {
      // Placeholder for applications - will be filled in later
      return Promise.resolve([
        new AuthItem(
          'Loading applications...',
          vscode.TreeItemCollapsibleState.None
        )
      ]);
    }

    return Promise.resolve([]);
  }

  setLoggedIn(username: string): void {
    this.isLoggedIn = true;
    this.username = username;
    this.refresh();
  }

  setLoggedOut(): void {
    this.isLoggedIn = false;
    this.username = undefined;
    this.refresh();
  }
}

class AuthItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
  }
}
