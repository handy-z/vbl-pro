import { copyFileSync, existsSync, rmSync } from "node:fs";

type Mode = "native" | "build" | "compile" | "check";

const mode = (Bun.argv[2] ?? "build") as Mode;
const binExt = process.platform === "win32" ? ".exe" : "";
const tscBin = `node_modules/.bin/tsc${binExt}`;

const nativeCrates = ["overlay", "pixel", "focus", "input"] as const;

function clean(path: string) {
  rmSync(path, { recursive: true, force: true });
}

async function run(name: string, args: string[]) {
  console.log(`\n$ ${args.join(" ")}`);
  const proc = Bun.spawn(args, {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${name} failed with exit code ${code}`);
  }
}

async function check() {
  await run("typecheck", [tscBin, "--noEmit"]);
}

async function buildNative() {
  await run("native", [
    "cargo",
    "build",
    "--manifest-path",
    "native/Cargo.toml",
    "--workspace",
    "--release",
  ]);

  const ext = process.platform === "win32" ? "dll" : process.platform === "darwin" ? "dylib" : "so";
  const prefix = process.platform === "win32" ? "" : "lib";

  for (const crate of nativeCrates) {
    const source = `native/target/release/${prefix}${crate}.${ext}`;
    const destination = `native/${crate}/${crate}.node`;
    if (!existsSync(source)) {
      throw new Error(`Missing native artifact: ${source}`);
    }
    copyFileSync(source, destination);
  }
}

async function buildApp() {
  clean("build");
  await run("bundle", [
    "bun",
    "build",
    "src/main.ts",
    "--target=bun-windows-x64-modern",
    "--bytecode",
    "--minify",
    "--outdir",
    "./build",
  ]);
}

async function compileApp() {
  clean("release");
  await run("compile", [
    "bun",
    "build",
    "src/main.ts",
    "--compile",
    "--target=bun-windows-x64-modern",
    "--bytecode",
    "--minify",
    "--outfile",
    "./release/vbl-pro.exe",
  ]);
}

if (mode === "check") {
  await check();
} else if (mode === "native") {
  await buildNative();
} else if (mode === "build") {
  await check();
  await buildNative();
  await buildApp();
} else if (mode === "compile") {
  await check();
  await buildNative();
  await compileApp();
} else {
  throw new Error(`Unknown build mode: ${mode}`);
}
