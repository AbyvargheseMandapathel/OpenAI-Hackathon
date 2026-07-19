export class GitHubRepositoryResolver {
  public inferRepository(remoteUrl: string, webBaseUrl: string): string | undefined {
    const normalizedRemote = remoteUrl.trim();
    if (normalizedRemote.length === 0) {
      return undefined;
    }

    return this.fromHttpRemote(normalizedRemote, webBaseUrl) ?? this.fromSshRemote(normalizedRemote);
  }

  private fromHttpRemote(remoteUrl: string, webBaseUrl: string): string | undefined {
    try {
      const remote = new URL(remoteUrl);
      const web = new URL(webBaseUrl);
      if (remote.hostname !== web.hostname) {
        return undefined;
      }

      const repo = remote.pathname.replace(/^\/+/, "").replace(/\.git$/, "");
      return this.isOwnerRepo(repo) ? repo : undefined;
    } catch {
      return undefined;
    }
  }

  private fromSshRemote(remoteUrl: string): string | undefined {
    const match = /^(?:ssh:\/\/)?git@[^:/]+[:/](?<repo>.+?)(?:\.git)?$/.exec(remoteUrl);
    const repo = match?.groups?.repo;
    return repo && this.isOwnerRepo(repo) ? repo : undefined;
  }

  private isOwnerRepo(value: string): boolean {
    return /^[^/\s]+\/[^/\s]+$/.test(value);
  }
}
