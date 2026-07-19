import * as vscode from "vscode";

import type { Logger } from "../services/Logger";

interface GitHubDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface StoredGitHubToken {
  accessToken: string;
  scope?: string;
}

const SECRET_KEY = "githubOAuthToken";

export class GitHubAuthService {
  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger
  ) {}

  public async signIn(): Promise<void> {
    const config = vscode.workspace.getConfiguration("aiMerge.github");
    const webBaseUrl = config.get<string>("webBaseUrl", "https://github.com").replace(/\/+$/, "");
    const clientId = config.get<string>("oauthClientId", "").trim();
    const scopes = config.get<string[]>("oauthScopes", ["repo", "read:user"]);

    if (!clientId) {
      throw new Error("Set aiMerge.github.oauthClientId before signing in.");
    }

    const deviceCode = await this.requestDeviceCode(webBaseUrl, clientId, scopes);
    await vscode.env.clipboard.writeText(deviceCode.user_code);
    await vscode.window.showInformationMessage(
      `GitHub sign-in code copied: ${deviceCode.user_code}`,
      "Open GitHub"
    );
    await vscode.env.openExternal(vscode.Uri.parse(deviceCode.verification_uri));

    const token = await this.pollForToken(webBaseUrl, clientId, deviceCode);
    await this.context.secrets.store(SECRET_KEY, JSON.stringify({
      accessToken: token.access_token,
      scope: token.scope
    } satisfies StoredGitHubToken));
    this.logger.info("GitHub OAuth sign-in completed.");
    await vscode.window.showInformationMessage("GitHub sign-in completed.");
  }

  public async signOut(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
    this.logger.info("GitHub OAuth token removed.");
  }

  public async getAccessToken(): Promise<string | undefined> {
    const stored = await this.readStoredToken();
    return stored?.accessToken;
  }

  private async requestDeviceCode(
    webBaseUrl: string,
    clientId: string,
    scopes: string[]
  ): Promise<GitHubDeviceCodeResponse> {
    const response = await fetch(`${webBaseUrl}/login/device/code`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: scopes.join(" ")
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub device code request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json() as GitHubDeviceCodeResponse;
  }

  private async pollForToken(
    webBaseUrl: string,
    clientId: string,
    deviceCode: GitHubDeviceCodeResponse
  ): Promise<Required<Pick<GitHubTokenResponse, "access_token">> & GitHubTokenResponse> {
    let intervalMs = Math.max(deviceCode.interval, 1) * 1000;
    const expiresAt = Date.now() + deviceCode.expires_in * 1000;

    while (Date.now() < expiresAt) {
      await this.delay(intervalMs);

      const response = await fetch(`${webBaseUrl}/login/oauth/access_token`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client_id: clientId,
          device_code: deviceCode.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        })
      });

      if (!response.ok) {
        throw new Error(`GitHub token request failed: ${response.status} ${response.statusText}`);
      }

      const token = await response.json() as GitHubTokenResponse;
      if (token.access_token) {
        return token as Required<Pick<GitHubTokenResponse, "access_token">> & GitHubTokenResponse;
      }

      if (token.error === "authorization_pending") {
        continue;
      }

      if (token.error === "slow_down") {
        intervalMs += 5_000;
        continue;
      }

      throw new Error(token.error_description ?? token.error ?? "GitHub OAuth failed.");
    }

    throw new Error("GitHub OAuth device code expired.");
  }

  private async readStoredToken(): Promise<StoredGitHubToken | undefined> {
    const raw = await this.context.secrets.get(SECRET_KEY);
    if (!raw) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return undefined;
      }

      const candidate = parsed as Partial<StoredGitHubToken>;
      return typeof candidate.accessToken === "string"
        ? {
            accessToken: candidate.accessToken,
            scope: candidate.scope
          }
        : undefined;
    } catch {
      return undefined;
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
