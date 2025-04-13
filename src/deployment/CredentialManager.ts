import * as vscode from "vscode";
import { Logger } from "../utils/Logger";

export class CredentialManager {
  private logger: Logger;
  private secretStorage: vscode.SecretStorage;

  constructor(logger: Logger, context: vscode.ExtensionContext) {
    this.logger = logger;
    this.secretStorage = context.secrets;
  }

  private getCredentialKey(baseUrl: string, username: string): string {
    return `${baseUrl}|${username}`;
  }

  public async storePassword(baseUrl: string, username: string, password: string): Promise<void> {
    try {
      const key = this.getCredentialKey(baseUrl, username);
      await this.secretStorage.store(key, password);
    } catch (error) {
      this.logger.logError("Failed to store password", error);
      throw error;
    }
  }

  public async getPassword(baseUrl: string, username: string): Promise<string | undefined> {
    try {
      const key = this.getCredentialKey(baseUrl, username);
      return await this.secretStorage.get(key);
    } catch (error) {
      this.logger.logError("Failed to retrieve password", error);
      return undefined;
    }
  }

  public async deletePassword(baseUrl: string, username: string): Promise<void> {
    try {
      const key = this.getCredentialKey(baseUrl, username);
      await this.secretStorage.delete(key);
    } catch (error) {
      this.logger.logError("Failed to delete password", error);
      throw error;
    }
  }
}
