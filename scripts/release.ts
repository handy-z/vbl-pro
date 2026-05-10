import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const releaseDir = path.join(process.cwd(), "release");
const tauriConfigPath = path.join(process.cwd(), "src-tauri", "tauri.conf.json");
const cargoManifestPath = path.join(process.cwd(), "src-tauri", "Cargo.toml");
const targetReleaseDir = path.join(
  process.cwd(),
  "src-tauri",
  "target",
  "release",
);
const nsisDir = path.join(targetReleaseDir, "bundle", "nsis");
const githubApi = "https://api.github.com";

type ReleaseOptions = {
  build: boolean;
  bumpVersion: boolean;
  exeOnly: boolean;
  manualVersion: string | null;
  noVersionBump: boolean;
  upload: boolean;
};

type GithubRelease = {
  id: number;
  tag_name: string;
  upload_url: string;
  html_url: string;
  draft: boolean;
  assets: GithubAsset[];
};

type GithubAsset = {
  id: number;
  name: string;
};

type TauriConfig = Record<string, unknown> & {
  version?: string;
};

type UploadPrerequisites = Omit<UploadContext, "tag">;

type UploadContext = {
  token: string;
  repo: string;
  tag: string;
  branch: string;
  username: string;
};

class ReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseOptions(args: string[]): ReleaseOptions {
  const options: ReleaseOptions = {
    build: false,
    bumpVersion: false,
    exeOnly: false,
    manualVersion: null,
    noVersionBump: false,
    upload: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--build") {
      options.build = true;
      continue;
    }

    if (arg === "--bump-version") {
      options.bumpVersion = true;
      continue;
    }

    if (arg === "--exe-only") {
      options.exeOnly = true;
      continue;
    }

    if (arg === "--no-version-bump") {
      options.noVersionBump = true;
      continue;
    }

    if (arg === "--upload") {
      options.upload = true;
      continue;
    }

    if (arg === "--version") {
      const version = args[index + 1];
      if (!version) {
        throw new ReleaseError("--version requires a value like 1.2.3.");
      }

      options.manualVersion = version;
      index += 1;
      continue;
    }

    if (arg.startsWith("--version=")) {
      options.manualVersion = arg.slice("--version=".length);
      continue;
    }

    throw new ReleaseError(`Unknown release option: ${arg}`);
  }

  if (options.manualVersion && options.bumpVersion) {
    throw new ReleaseError("Use either --version or --bump-version, not both.");
  }

  if (options.manualVersion && options.noVersionBump) {
    throw new ReleaseError("Use either --version or --no-version-bump, not both.");
  }

  if (options.bumpVersion && options.noVersionBump) {
    throw new ReleaseError(
      "Use either --bump-version or --no-version-bump, not both.",
    );
  }

  return options;
}

function printHelp(): void {
  console.log(`Usage:
  bun scripts/release.ts
  bun scripts/release.ts --upload
  bun scripts/release.ts --build --upload
  bun scripts/release.ts --build --upload --version 1.2.3

Options:
  --build                 Build the Tauri app before collecting artifacts.
  --upload                Upload collected artifacts to a draft GitHub release.
  --version <x.y.z>       Set the release version before building.
  --bump-version          Increment the patch version before building.
  --no-version-bump       Skip the automatic patch bump for --build --upload.
  --exe-only              Collect only the unpackaged executable.
  -h, --help              Show this help text.

Environment:
  RELEASE_VERSION         Default exact version when --version is not passed.
  GITHUB_TOKEN / GH_TOKEN GitHub token with release write permission.`);
}

function copyExecutables(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const copied: string[] = [];
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith(".exe")) {
      const source = path.join(dir, file);
      const destFile = file.replace(/_[0-9.]+_[a-zA-Z0-9]+/, "");
      const dest = path.join(releaseDir, destFile);
      try {
        fs.copyFileSync(source, dest);
      } catch (error) {
        throw new ReleaseError(
          `Could not copy ${file} to release/${destFile}. Close any running release build and retry. ${errorMessage(error)}`,
        );
      }
      copied.push(destFile);
      console.log(`Copied ${file} to release/${destFile}`);
    }
  }
  return copied;
}

function clean(): void {
  if (!fs.existsSync(releaseDir)) {
    return;
  }

  for (const entry of fs.readdirSync(releaseDir)) {
    const target = path.join(releaseDir, entry);
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch (error) {
      throw new ReleaseError(
        `Could not clean release/${entry}. Close any running release build and retry. ${errorMessage(error)}`,
      );
    }
  }
}

function collectArtifacts(options: ReleaseOptions): string[] {
  clean();

  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }

  copyExecutables(targetReleaseDir);
  if (!options.exeOnly) {
    copyExecutables(nsisDir);
  }

  const artifacts = fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(releaseDir, entry.name));

  if (artifacts.length === 0) {
    throw new ReleaseError(
      "No release artifacts were found. Run `tauri build` before uploading.",
    );
  }

  return artifacts;
}

function readTauriConfig(): TauriConfig {
  if (!fs.existsSync(tauriConfigPath)) {
    throw new ReleaseError(`Missing Tauri config at ${tauriConfigPath}`);
  }

  return JSON.parse(fs.readFileSync(tauriConfigPath, "utf8")) as TauriConfig;
}

function readReleaseVersion(): string {
  const config = readTauriConfig();

  if (!config.version) {
    throw new ReleaseError("Missing `version` in src-tauri/tauri.conf.json");
  }

  return normalizeVersion(config.version);
}

function readReleaseTag(): string {
  return `v${readReleaseVersion()}`;
}

function normalizeVersion(version: string): string {
  const normalized = version.trim().replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+$/.test(normalized)) {
    throw new ReleaseError(
      `Invalid version "${version}". Expected x.y.z, for example 1.2.3.`,
    );
  }

  return normalized;
}

function bumpPatchVersion(version: string): string {
  const [majorText, minorText, patchText] = normalizeVersion(version).split(
    ".",
  ) as [string, string, string];
  const major = Number.parseInt(majorText, 10);
  const minor = Number.parseInt(minorText, 10);
  const patch = Number.parseInt(patchText, 10);

  return `${major}.${minor}.${patch + 1}`;
}

function requestedReleaseVersion(options: ReleaseOptions): string | null {
  const envVersion = process.env["RELEASE_VERSION"]?.trim();
  if (options.manualVersion !== null) {
    return normalizeVersion(options.manualVersion);
  }

  if (envVersion) {
    return normalizeVersion(envVersion);
  }

  if (options.bumpVersion) {
    return bumpPatchVersion(readReleaseVersion());
  }

  if (options.build && options.upload && !options.noVersionBump) {
    return bumpPatchVersion(readReleaseVersion());
  }

  return null;
}

function writeTauriConfigVersion(version: string): void {
  const config = readTauriConfig();
  config.version = version;
  fs.writeFileSync(tauriConfigPath, `${JSON.stringify(config, null, 2)}\n`);
}

function writeCargoManifestVersion(version: string): void {
  if (!fs.existsSync(cargoManifestPath)) {
    throw new ReleaseError(`Missing Cargo manifest at ${cargoManifestPath}`);
  }

  const content = fs.readFileSync(cargoManifestPath, "utf8");
  const packageStart = content.indexOf("[package]");
  if (packageStart < 0) {
    throw new ReleaseError("Missing [package] section in src-tauri/Cargo.toml");
  }

  const nextSection = content.indexOf("\n[", packageStart + 1);
  const packageEnd = nextSection < 0 ? content.length : nextSection;
  const beforePackage = content.slice(0, packageStart);
  const packageSection = content.slice(packageStart, packageEnd);
  const afterPackage = content.slice(packageEnd);

  if (!/^version\s*=\s*"[^"]+"/m.test(packageSection)) {
    throw new ReleaseError(
      "Missing package version in src-tauri/Cargo.toml [package] section",
    );
  }

  const updatedPackageSection = packageSection.replace(
    /^version\s*=\s*"[^"]+"/m,
    `version = "${version}"`,
  );

  fs.writeFileSync(
    cargoManifestPath,
    `${beforePackage}${updatedPackageSection}${afterPackage}`,
  );
}

function prepareReleaseVersion(options: ReleaseOptions): void {
  const version = requestedReleaseVersion(options);
  if (!version) {
    return;
  }

  if (!options.build) {
    throw new ReleaseError(
      "Version changes must run before a build. Use `bun run desktop:release -- --version x.y.z`.",
    );
  }

  const currentVersion = readReleaseVersion();
  if (version === currentVersion) {
    console.log(`Release version already ${version}`);
  } else {
    console.log(`Updating release version ${currentVersion} -> ${version}`);
    writeTauriConfigVersion(version);
  }

  writeCargoManifestVersion(version);
}

function runCommand(command: string, args: string[]): void {
  try {
    execFileSync(command, args, { stdio: "inherit" });
  } catch (error) {
    throw new ReleaseError(
      `Command failed: ${command} ${args.join(" ")}. ${errorMessage(error)}`,
    );
  }
}

function buildTauri(options: ReleaseOptions): void {
  if (!options.build) {
    return;
  }

  const buildArgs = options.exeOnly
    ? ["run", "tauri", "build", "--no-bundle"]
    : ["run", "tauri", "build", "--bundles", "nsis"];

  runCommand(process.execPath, buildArgs);
}

function readGit(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch (error) {
    throw new ReleaseError(`Git command failed: git ${args.join(" ")}. ${errorMessage(error)}`);
  }
}

function runGit(args: string[]): void {
  try {
    execFileSync("git", args, { stdio: "inherit" });
  } catch (error) {
    throw new ReleaseError(`Git command failed: git ${args.join(" ")}. ${errorMessage(error)}`);
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

function currentBranch(): string {
  const branch = readGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === "HEAD") {
    throw new ReleaseError(
      "Cannot push release commit from a detached HEAD. Check out a branch first.",
    );
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

function resolveReleaseUsername(repo: string): string {
  const repoOwner = repo.split("/")[0];
  const username =
    normalizeUsername(process.env["RELEASE_USERNAME"]) ??
    normalizeUsername(process.env["GITHUB_ACTOR"]) ??
    normalizeUsername(repoOwner) ??
    normalizeUsername(tryReadGit(["config", "--get", "user.name"]));

  if (!username) {
    throw new ReleaseError(
      "Could not resolve release username. Set RELEASE_USERNAME or GITHUB_ACTOR.",
    );
  }

  return username;
}

function nextReleaseCommitCount(username: string): number {
  const subjects = readGit(["log", "--format=%s"]);
  const releaseMessage = new RegExp(`^@${escapeRegExp(username)} x(\\d+)$`);
  let maxCount = 0;

  for (const subject of subjects.split(/\r?\n/)) {
    const match = releaseMessage.exec(subject.trim());
    const count = match?.[1] ? Number.parseInt(match[1], 10) : 0;
    if (count > maxCount) {
      maxCount = count;
    }
  }

  return maxCount + 1;
}

function defaultReleaseCommitMessage(uploadContext: UploadContext): string {
  return `@${uploadContext.username} x${nextReleaseCommitCount(uploadContext.username)}`;
}

function commitAndPushChanges(uploadContext: UploadContext): void {
  if (hasGitChanges()) {
    const commitMessage =
      process.env["RELEASE_COMMIT_MESSAGE"] ??
      defaultReleaseCommitMessage(uploadContext);

    console.log(`Committing git changes with message: ${commitMessage}`);
    runGit(["add", "-A"]);
    runGit(["commit", "-m", commitMessage]);
  } else {
    console.log("No git changes to commit before release");
  }

  console.log(`Pushing release HEAD to origin/${uploadContext.branch}`);
  runGit(["push", "origin", `HEAD:${uploadContext.branch}`]);
}

function parseGithubRepo(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim();
  const sshMatch = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/.exec(trimmed);
  if (sshMatch?.[1]) return sshMatch[1];

  const urlMatch = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/.exec(
    trimmed,
  );
  if (urlMatch?.[1]) return urlMatch[1];

  return null;
}

function resolveGithubRepo(): string {
  const envRepo = process.env["GITHUB_REPOSITORY"];
  if (envRepo) {
    if (/^[^/\s]+\/[^/\s]+$/.test(envRepo)) {
      return envRepo;
    }

    throw new ReleaseError(
      `Invalid GITHUB_REPOSITORY value: ${envRepo}. Expected owner/repo.`,
    );
  }

  let remoteUrl = "";
  try {
    remoteUrl = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      encoding: "utf8",
    });
  } catch {
    throw new ReleaseError(
      "Could not read git remote `origin`. Set GITHUB_REPOSITORY=owner/repo.",
    );
  }

  const repo = parseGithubRepo(remoteUrl);
  if (!repo) {
    throw new ReleaseError(
      `Could not parse GitHub repo from origin URL: ${remoteUrl.trim()}. Set GITHUB_REPOSITORY=owner/repo.`,
    );
  }

  return repo;
}

function resolveGithubToken(): string {
  const token = process.env["GITHUB_TOKEN"] ?? process.env["GH_TOKEN"];
  if (!token) {
    throw new ReleaseError(
      "Missing GitHub token. Set GITHUB_TOKEN or GH_TOKEN with release write permission.",
    );
  }

  return token;
}

function mimeTypeFor(filePath: string): string {
  if (filePath.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  return "application/octet-stream";
}

async function githubRequest<T>(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-GitHub-Api-Version", "2022-11-28");

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const body = await response.text();
    throw new ReleaseError(
      `GitHub API request failed: ${init.method ?? "GET"} ${url} returned ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function findReleaseByTag(
  token: string,
  repo: string,
  tag: string,
): Promise<GithubRelease | null> {
  const url = `${githubApi}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`;
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  });

  const response = await fetch(url, { headers });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new ReleaseError(
      `GitHub API request failed: GET ${url} returned ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`,
    );
  }

  return (await response.json()) as GithubRelease;
}

async function createDraftRelease(
  token: string,
  repo: string,
  tag: string,
  branch: string,
): Promise<GithubRelease> {
  console.log(`Creating draft GitHub release ${tag}`);

  return githubRequest<GithubRelease>(
    token,
    `${githubApi}/repos/${repo}/releases`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tag_name: tag,
        name: tag,
        target_commitish: branch,
        draft: true,
        prerelease: false,
      }),
    },
  );
}

async function getOrCreateRelease(
  uploadContext: UploadContext,
): Promise<GithubRelease> {
  const { token, repo, tag, branch } = uploadContext;
  const existingRelease = await findReleaseByTag(token, repo, tag);
  if (existingRelease) {
    console.log(`Using existing GitHub release ${tag}`);
    return existingRelease;
  }

  return createDraftRelease(token, repo, tag, branch);
}

async function deleteAsset(
  token: string,
  repo: string,
  asset: GithubAsset,
): Promise<void> {
  console.log(`Replacing existing GitHub release asset ${asset.name}`);

  await githubRequest<void>(
    token,
    `${githubApi}/repos/${repo}/releases/assets/${asset.id}`,
    { method: "DELETE" },
  );
}

async function uploadAsset(
  token: string,
  release: GithubRelease,
  filePath: string,
): Promise<void> {
  const fileName = path.basename(filePath);
  const uploadUrl = release.upload_url.replace(/\{.*$/, "");
  const fileBytes = fs.readFileSync(filePath);
  const body = new Blob([new Uint8Array(fileBytes)], {
    type: mimeTypeFor(filePath),
  });

  await githubRequest<GithubAsset>(
    token,
    `${uploadUrl}?name=${encodeURIComponent(fileName)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": mimeTypeFor(filePath),
      },
      body,
    },
  );

  console.log(`Uploaded release/${fileName}`);
}

function resolveUploadPrerequisites(): UploadPrerequisites {
  const repo = resolveGithubRepo();

  return {
    token: resolveGithubToken(),
    repo,
    branch: currentBranch(),
    username: resolveReleaseUsername(repo),
  };
}

function resolveUploadContext(
  prerequisites: UploadPrerequisites,
): UploadContext {
  return {
    ...prerequisites,
    tag: readReleaseTag(),
  };
}

async function uploadArtifacts(
  uploadContext: UploadContext,
  artifacts: string[],
): Promise<void> {
  const { token, repo } = uploadContext;
  const release = await getOrCreateRelease(uploadContext);

  for (const artifact of artifacts) {
    const fileName = path.basename(artifact);
    const existingAsset = release.assets.find((asset) => asset.name === fileName);
    if (existingAsset) {
      await deleteAsset(token, repo, existingAsset);
    }

    await uploadAsset(token, release, artifact);
  }

  console.log(`GitHub release upload complete: ${release.html_url}`);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const uploadPrerequisites = options.upload ? resolveUploadPrerequisites() : null;

  prepareReleaseVersion(options);
  buildTauri(options);

  const artifacts = collectArtifacts(options);

  if (uploadPrerequisites) {
    const uploadContext = resolveUploadContext(uploadPrerequisites);
    commitAndPushChanges(uploadContext);
    await uploadArtifacts(uploadContext, artifacts);
  }
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exit(1);
});
