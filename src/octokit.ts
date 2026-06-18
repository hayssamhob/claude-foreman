import type { ProbotOctokit } from "probot";

/** The authenticated client type Probot hands to handlers and `probot.auth()`. */
export type Octokit = InstanceType<typeof ProbotOctokit>;
