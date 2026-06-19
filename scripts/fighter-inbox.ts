#!/usr/bin/env node

import { execSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    agent: { type: "string" },
    repo: { type: "string" },
    "mark-read": { type: "boolean" },
  },
});

const agent = values.agent;
if (!agent) {
  console.error("Usage: npx tsx scripts/fighter-inbox.ts --agent <name> [--repo <owner/repo>] [--mark-read]");
  process.exit(1);
}

function runGh(cmd: string): any {
  const out = execSync(`gh ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!out.trim()) return null;
  return JSON.parse(out);
}

let repo = values.repo;
if (!repo) {
  const repoInfo = runGh(`repo view --json nameWithOwner`);
  if (!repoInfo || !repoInfo.nameWithOwner) {
    console.error("Could not determine current repository. Are you in a git directory? Or pass --repo.");
    process.exit(1);
  }
  repo = repoInfo.nameWithOwner;
}

let meInfo;
try {
  meInfo = runGh(`api user`);
} catch (err) {
  console.error("Not authenticated — run `gh auth login` first");
  process.exit(1);
}
const me = meInfo.login;

// Fetch labeled issues/PRs
const labelSearch = runGh(`search issues --state open --repo ${repo} "label:agent:${agent}" --json number,title`);
// Fetch involved issues/PRs
const involvedSearch = runGh(`search issues --state open --repo ${repo} "involves:@me" --json number,title`);

const allIssues = new Map();
if (Array.isArray(labelSearch)) labelSearch.forEach((i: any) => allIssues.set(i.number, i));
if (Array.isArray(involvedSearch)) involvedSearch.forEach((i: any) => allIssues.set(i.number, i));

interface UnreadMsg {
  issue: number;
  title: string;
  commentId: number;
  author: string;
  body: string;
  time: string;
}

const unread: UnreadMsg[] = [];

for (const issue of allIssues.values()) {
  let comments;
  try {
    comments = runGh(`api repos/${repo}/issues/${issue.number}/comments`);
  } catch (err) {
    continue;
  }
  
  if (!Array.isArray(comments)) continue;

  for (const c of comments) {
    if (c.user.login === me) continue; // skip my own comments

    let reactions;
    try {
      reactions = runGh(`api repos/${repo}/issues/comments/${c.id}/reactions`);
    } catch (err) {
      continue;
    }

    const reacted = Array.isArray(reactions) && reactions.some((r: any) => r.user.login === me);
    
    if (!reacted) {
      unread.push({
        issue: issue.number,
        title: issue.title,
        commentId: c.id,
        author: c.user.login,
        body: c.body,
        time: c.created_at,
      });
    }
  }
}

unread.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
const capped = unread.slice(0, 20);

console.log(`[inbox] ${unread.length} unread messages for ${agent}\n`);

for (const msg of capped) {
  console.log(`#${msg.issue} (${msg.title}) — ${msg.author}, ${getTimeAgo(msg.time)}`);
  console.log(msg.body.split("\n").map((line: string) => `  > ${line}`).join("\n"));
  console.log("");
  
  if (values["mark-read"]) {
    try {
      execSync(`gh api --method POST -H "Accept: application/vnd.github+json" repos/${repo}/issues/comments/${msg.commentId}/reactions -f content='+1'`, { stdio: "ignore" });
    } catch (e) {
      // ignore reaction failures
    }
  }
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
