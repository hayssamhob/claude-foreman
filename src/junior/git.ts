import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "../config.js";

/**
 * Git plumbing for the in-process junior's workspaces. One clone per repo
 * under `data/workspaces/`, refreshed on every run. The installation token
 * is passed securely via `GIT_CONFIG_*` environment variables instead of
 * the remote URL, ensuring it is never saved to `.git/config` or leaked in logs.
 */

export class GitError extends Error {}

export async function git(args: string[], cwd: string, envOverrides?: Record<string, string>): Promise<string> {
  return new Promise((res, reject) => {
    const env = envOverrides ? { ...process.env, ...envOverrides } : process.env;
    const child = spawn("git", args, { cwd, env, windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(new GitError(e.message)));
    child.on("close", (code) => {
      if (code === 0) res(out.trim());
      else reject(new GitError(`git ${args.join(" ")} exited ${code}: ${err.trim() || out.trim()}`));
    });
  });
}

export function workspaceDir(repoFull: string): string {
  return resolve(config.workspacesDir, repoFull.replace("/", "__"));
}

function getAuthEnv(token: string): Record<string, string> {
  const b64 = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${b64}`,
  };
}

/** Clone the repo if missing, else refresh: fetch using secure environment variables. */
export async function ensureWorkspace(repoFull: string, token: string): Promise<string> {
  const dir = workspaceDir(repoFull);
  const url = `https://github.com/${repoFull}.git`;
  const env = getAuthEnv(token);
  
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(resolve(config.workspacesDir), { recursive: true });
    await git(["clone", url, dir], resolve(config.workspacesDir), env);
  } else {
    await git(["remote", "set-url", "origin", url], dir);
    await git(["fetch", "origin", "--prune"], dir, env);
  }
  return dir;
}

/**
 * Check out the task branch with a clean tree. If the branch already exists
 * on the remote (resumed work / revision round), continue from its tip;
 * otherwise start fresh from the default branch.
 */
export async function checkoutTaskBranch(dir: string, branch: string, baseBranch: string): Promise<void> {
  await git(["reset", "--hard"], dir);
  await git(["clean", "-fd"], dir);
  const remoteExists = await git(["rev-parse", "--verify", "--quiet", `origin/${branch}`], dir)
    .then(() => true)
    .catch(() => false);
  await git(["checkout", "-B", branch, remoteExists ? `origin/${branch}` : `origin/${baseBranch}`], dir);
}

/** Stage and commit everything; returns the new short SHA, or null when the tree is clean. */
export async function commitAll(dir: string, message: string): Promise<string | null> {
  await git(["add", "-A"], dir);
  const status = await git(["status", "--porcelain"], dir);
  if (!status) return null;
  await git(
    [
      "-c",
      "user.name=claude (foreman fighter)",
      "-c",
      "user.email=foreman-fighter@users.noreply.github.com",
      "commit",
      "-m",
      message,
    ],
    dir
  );
  return git(["rev-parse", "--short=10", "HEAD"], dir);
}

export async function headSha(dir: string): Promise<string> {
  return git(["rev-parse", "HEAD"], dir);
}

export async function push(dir: string, branch: string, token: string): Promise<void> {
  await git(["push", "origin", `${branch}:${branch}`], dir, getAuthEnv(token));
}
