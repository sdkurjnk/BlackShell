// Publishes the per-platform engine packages, then the main launcher package that
// pulls them as os/cpu-gated optionalDependencies (the esbuild/swc pattern). Each
// engine binary is ~90MB, so shipping them as one fat package blows past npm's size
// limit; splitting lets npm install only the host's platform package.
//
// Run from the publish job after `npm run build:ts`, with NODE_AUTH_TOKEN set:
//   node scripts/publish-packages.mjs <version>   (version = vX.Y.Z or X.Y.Z)
// DRY_RUN=1 appends --dry-run to every publish (no upload) for local checks.
import { execFileSync } from "node:child_process";
import {
  readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, chmodSync, readdirSync,
} from "node:fs";
import { join } from "node:path";

const SCOPE = "@sdkurjnk";
const ARTIFACTS = "vendor-artifacts"; // download-artifact tree: engine-<vendor>/<exe>
const dryRun = !!process.env.DRY_RUN;

const version = (process.argv[2] || "").replace(/^v/, "");
if (!/^\d+\.\d+\.\d+/.test(version)) {
  throw new Error(`usage: publish-packages.mjs <version>; got '${process.argv[2]}'`);
}

function publish(cwd) {
  // shell on Windows so `npm` resolves to npm.cmd (Node blocks spawning .cmd
  // directly); the publish job itself runs on Linux where this is a plain exec.
  execFileSync("npm", ["publish", ...(dryRun ? ["--dry-run"] : [])], {
    stdio: "inherit", cwd, shell: process.platform === "win32",
  });
}

// vendor = `${platform}-${arch}` (platform may be 'win32', so split on the last '-').
const vendors = readdirSync(ARTIFACTS)
  .filter((d) => d.startsWith("engine-"))
  .map((d) => d.slice("engine-".length));

rmSync("packages", { recursive: true, force: true });

const names = [];
for (const vendor of vendors) {
  const cut = vendor.lastIndexOf("-");
  const platform = vendor.slice(0, cut);
  const arch = vendor.slice(cut + 1);
  const exe = platform === "win32" ? "blackshell-engine.exe" : "blackshell-engine";
  const name = `${SCOPE}/blackshell-${vendor}`;

  const dir = join("packages", vendor);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(ARTIFACTS, `engine-${vendor}`, exe), join(dir, exe));
  if (platform !== "win32") {
    chmodSync(join(dir, exe), 0o755); // upload-artifact drops the exec bit
  }
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name,
    version,
    description: `BlackShell self-contained engine binary for ${platform}-${arch}.`,
    os: [platform],
    cpu: [arch],
    files: [exe],
    license: "MIT",
    // Must match the build repo or npm rejects the provenance bundle (E422).
    repository: { type: "git", url: "git+https://github.com/sdkurjnk/BlackShell.git" },
    // provenance needs CI OIDC; omit it for a local --dry-run so the run completes.
    publishConfig: { access: "public", ...(dryRun ? {} : { provenance: true }) },
  }, null, 2) + "\n");

  console.log(`publishing ${name}@${version}`);
  publish(dir);
  names.push(name);
}

// Main package: pin the version and the optional per-platform deps, then publish.
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = version;
pkg.optionalDependencies = Object.fromEntries(names.sort().map((n) => [n, version]));
if (dryRun && pkg.publishConfig) {
  delete pkg.publishConfig.provenance;
}
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

console.log(`publishing ${pkg.name}@${version} (optionalDependencies: ${names.length})`);
publish(".");
