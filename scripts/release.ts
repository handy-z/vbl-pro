import fs from "node:fs";
import path from "node:path";

const releaseDir = path.join(process.cwd(), "release");
const targetReleaseDir = path.join(
  process.cwd(),
  "src-tauri",
  "target",
  "release",
);
const nsisDir = path.join(targetReleaseDir, "bundle", "nsis");


function copyExecutables(dir: string) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith(".exe")) {
      const source = path.join(dir, file);
      const destFile = file.replace(/_[0-9.]+_[a-zA-Z0-9]+/, "");
      const dest = path.join(releaseDir, destFile);
      fs.copyFileSync(source, dest);
      console.log(`Copied ${file} to release/${destFile}`);
    }
  }
}

function clean() {
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
  }
}

clean()

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

copyExecutables(targetReleaseDir);
copyExecutables(nsisDir);
