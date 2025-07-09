import * as vscode from 'vscode';

/**
 * Returns the NOUMENA Cloud portal API base URL, ensuring no trailing slash and appending `/api`.
 */
export function getApiBase(): string {
  const domain = vscode.workspace.getConfiguration('noumena.cloud').get<string>('domain');
  if (domain && domain.trim().length > 0) {
    return `https://portal.${domain}/api`;
  }
  return 'https://portal.noumena.cloud/api';
}
