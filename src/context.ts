import type { Octokit } from "./octokit.js";
import { splitRepo } from "./github.js";

export interface ContextPacket {
  labels: string[];      // all repo label names
  fileTree: string[];    // top-level file/dir names
  gotchas: string | null; // raw content of gotchas.md, null if absent
}

export async function assembleContextPacket(
  octokit: Octokit,
  repo: string
): Promise<ContextPacket> {
  const { owner, repo: name } = splitRepo(repo);
  const [labelsRes, treeRes, gotchasRes] = await Promise.allSettled([
    octokit.rest.issues.listLabelsForRepo({ owner, repo: name, per_page: 100 }),
    octokit.rest.git.getTree({ owner, repo: name, tree_sha: "HEAD", recursive: "0" }),
    octokit.rest.repos.getContent({ owner, repo: name, path: "gotchas.md" }).catch(() => null),
  ]);

  const labels = labelsRes.status === "fulfilled" 
    ? labelsRes.value.data.map((l: any) => l.name)
    : [];

  const fileTree = treeRes.status === "fulfilled"
    ? treeRes.value.data.tree.map((t: any) => t.path).filter((p: string | undefined): p is string => !!p)
    : [];

  let gotchas: string | null = null;
  if (gotchasRes.status === "fulfilled" && gotchasRes.value) {
    const data = gotchasRes.value.data as any;
    if (data.content) {
      gotchas = Buffer.from(data.content, "base64").toString();
    }
  }

  return { labels, fileTree, gotchas };
}

export function formatContextPacket(p: ContextPacket): string {
  let md = "## Ground truth (assembled at dispatch — read-free from GitHub)\n\n";
  
  md += "### Labels\n";
  if (p.labels.length > 0) {
    md += p.labels.map(l => `- \`${l}\``).join("\n") + "\n\n";
  } else {
    md += "(none)\n\n";
  }

  md += "### File tree (top level)\n";
  if (p.fileTree.length > 0) {
    md += p.fileTree.map(f => `- \`${f}\``).join("\n") + "\n\n";
  } else {
    md += "(none)\n\n";
  }

  if (p.gotchas) {
    md += "### Gotchas\n";
    md += p.gotchas + "\n";
  }

  return md;
}
