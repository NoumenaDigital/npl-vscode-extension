import * as vscode from 'vscode';

/**
 * Returns the NOUMENA Cloud portal API base URL, ensuring no trailing slash and appending `/api`.
 */
export function getApiBase(): string {
  const portal = vscode.workspace.getConfiguration('noumena.cloud').get<string>('portalUrl');
  if (portal && portal.trim().length > 0) {
    return portal.replace(/\/+$/, '') + '/api';
  }
  return 'https://portal.noumena.cloud/api';
}
