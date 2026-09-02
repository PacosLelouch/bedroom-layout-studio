import { execFile } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface RunWorkspace {
  root: string;
  repo: string;
  input: string;
  output: string;
  temp: string;
  logs: string;
}

export class WorkspaceManager {
  readonly #root: string;
  constructor(root: string) {
    if (!path.isAbsolute(root)) throw new Error("AGENT_WORKSPACE_ROOT must be absolute.");
    this.#root = path.resolve(root);
  }

  async create(tenantId: string, runId: string): Promise<RunWorkspace> {
    if (!/^[a-f0-9-]{36}$/i.test(tenantId) || !/^[a-f0-9-]{36}$/i.test(runId)) throw new Error("Workspace tenant and run IDs must be UUIDs.");
    const root = path.resolve(this.#root, tenantId, runId);
    this.#assertOwned(root);
    const workspace = { root, repo: path.join(root, "repo"), input: path.join(root, "input"), output: path.join(root, "output"), temp: path.join(root, "temp"), logs: path.join(root, "logs") };
    await mkdir(root, { recursive: true });
    await Promise.all([workspace.input, workspace.output, workspace.temp, workspace.logs].map((directory) => mkdir(directory, { recursive: true })));
    return workspace;
  }

  async prepareWorktree(workspace: RunWorkspace, repositoryRoot: string, revision: string) {
    this.#assertOwned(workspace.repo);
    if (!path.isAbsolute(repositoryRoot)) throw new Error("AGENT_REPOSITORY_ROOT must be absolute.");
    await run("git", ["-C", repositoryRoot, "worktree", "add", "--detach", workspace.repo, revision], { windowsHide: true });
  }

  async remove(workspace: RunWorkspace, repositoryRoot?: string) {
    this.#assertOwned(workspace.root);
    if (repositoryRoot) {
      try {
        await access(path.join(workspace.repo, ".git"));
        await run("git", ["-C", repositoryRoot, "worktree", "remove", "--force", workspace.repo], { windowsHide: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await rm(workspace.root, { recursive: true, force: true, maxRetries: 3 });
  }

  #assertOwned(candidate: string) {
    const resolved = path.resolve(candidate);
    if (resolved === this.#root || !resolved.startsWith(`${this.#root}${path.sep}`)) throw new Error("Refusing to operate outside the configured run workspace root.");
  }
}
