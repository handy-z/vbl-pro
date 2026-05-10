import process from "node:process";
import { execFileSync } from "node:child_process";

type CommitOptions = {
  message: string | null;
  push: boolean;
};

class CommitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommitError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readGit(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch (error) {
    throw new CommitError(`Git command failed: git ${args.join(" ")}. ${errorMessage(error)}`);
  }
}

function runGit(args: string[]): void {
  try {
    execFileSync("git", args, { stdio: "inherit" });
  } catch (error) {
    throw new CommitError(`Git command failed: git ${args.join(" ")}. ${errorMessage(error)}`);
  }
}

function tryReadGit(args: string[]): string | null {
  try {
    const output = execFileSync("git", args, { encoding: "utf8" }).trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

function hasGitChanges(): boolean {
  return readGit(["status", "--porcelain"]).length > 0;
}

function hasStagedChanges(): boolean {
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"]);
    return false;
  } catch {
    return true;
  }
}

function currentBranch(): string {
  const branch = readGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === "HEAD") {
    throw new CommitError("Cannot push from a detached HEAD. Check out a branch first.");
  }

  return branch;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUsername(value: string | null | undefined): string | null {
  const username = value?.trim().replace(/^@/, "").replace(/\s+/g, "-");
  return username ? username : null;
}

function resolveUsername(): string {
  const username =
    normalizeUsername(process.env["COMMIT_USERNAME"]) ??
    normalizeUsername(process.env["GITHUB_ACTOR"]) ??
    normalizeUsername(tryReadGit(["config", "--get", "user.name"]));

  if (!username) {
    throw new CommitError("Could not resolve commit username. Set COMMIT_USERNAME.");
  }

  return username;
}

function nextCommitCount(username: string): number {
  const subjects = tryReadGit(["log", "--format=%s"]) ?? "";
  const commitMessage = new RegExp(`^@${escapeRegExp(username)} x(\\d+)$`);
  let maxCount = 0;

  for (const subject of subjects.split(/\r?\n/)) {
    const match = commitMessage.exec(subject.trim());
    const count = match?.[1] ? Number.parseInt(match[1], 10) : 0;
    if (count > maxCount) {
      maxCount = count;
    }
  }

  return maxCount + 1;
}

function defaultCommitMessage(): string {
  const username = resolveUsername();
  return `@${username} x${nextCommitCount(username)}`;
}

function parseOptions(args: string[]): CommitOptions {
  const messageParts: string[] = [];
  let push = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--push" || arg === "-p") {
      push = true;
      continue;
    }

    if (arg === "--message" || arg === "-m") {
      const message = args[index + 1];
      if (!message) {
        throw new CommitError(`${arg} requires a commit message.`);
      }
      messageParts.push(message);
      index += 1;
      continue;
    }

    messageParts.push(arg);
  }

  const cliMessage = messageParts.join(" ").trim();
  const envMessage = process.env["COMMIT_MESSAGE"]?.trim();

  return {
    message: cliMessage || envMessage || null,
    push,
  };
}

function printHelp(): void {
  console.log(`Usage:
  bun run commit
  bun run commit -- "commit message"
  bun run commit -- -m "commit message" --push

Options:
  -m, --message <message>  Use a specific commit message.
  -p, --push               Push HEAD to the current origin branch after commit.
  -h, --help               Show this help text.

Environment:
  COMMIT_MESSAGE           Default message when no CLI message is passed.
  COMMIT_USERNAME          Username for generated messages like @name x2.`);
}

function commit(options: CommitOptions): void {
  if (!hasGitChanges()) {
    console.log("No git changes to commit.");
    return;
  }

  const message = options.message ?? defaultCommitMessage();
  console.log(`Committing git changes with message: ${message}`);

  runGit(["add", "-A"]);

  if (!hasStagedChanges()) {
    console.log("No staged changes to commit.");
    return;
  }

  runGit(["commit", "-m", message]);

  if (options.push) {
    const branch = currentBranch();
    console.log(`Pushing commit to origin/${branch}`);
    runGit(["push", "origin", `HEAD:${branch}`]);
  }
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  commit(options);
}

try {
  main();
} catch (error) {
  console.error(errorMessage(error));
  process.exit(1);
}
