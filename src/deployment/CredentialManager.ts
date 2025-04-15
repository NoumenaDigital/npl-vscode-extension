import * as vscode from "vscode";
import { ILogger } from "../utils/Logger";

export enum AuthType {
  Basic = "basic",
  Azure = "azure"
}

export class CredentialManager {
  private logger: ILogger;
  private secretStorage: vscode.SecretStorage;

  constructor(logger: ILogger, context: vscode.ExtensionContext) {
    this.logger = logger;
    this.secretStorage = context.secrets;
  }

  private getCredentialKey(baseUrl: string, username: string): string {
    return `${baseUrl}|${username}`;
  }

  private getTokenKey(baseUrl: string, username: string): string {
    return `token|${baseUrl}|${username}`;
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

  public async storeToken(baseUrl: string, username: string, token: string): Promise<void> {
    try {
      const key = this.getTokenKey(baseUrl, username);
      await this.secretStorage.store(key, token);
    } catch (error) {
      this.logger.logError("Failed to store token", error);
      throw error;
    }
  }

  public async getToken(baseUrl: string, username: string): Promise<string | undefined> {
    try {
      const key = this.getTokenKey(baseUrl, username);
      return await this.secretStorage.get(key);
    } catch (error) {
      this.logger.logError("Failed to retrieve token", error);
      return undefined;
    }
  }

  public async deleteToken(baseUrl: string, username: string): Promise<void> {
    try {
      const key = this.getTokenKey(baseUrl, username);
      await this.secretStorage.delete(key);
    } catch (error) {
      this.logger.logError("Failed to delete token", error);
      throw error;
    }
  }

  public async cleanAllCredentials(baseUrl: string, username: string): Promise<void> {
    try {
      await this.deletePassword(baseUrl, username);
      await this.deleteToken(baseUrl, username);
    } catch (error) {
      this.logger.logError("Failed to clean credentials", error);
      throw error;
    }
  }
}
