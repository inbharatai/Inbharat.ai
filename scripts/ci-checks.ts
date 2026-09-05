/** Keep the checked-in workflow unchanged: npm lifecycle hooks add CI gates.
 * Automatic browser/audit work is ONLY for GITHUB_ACTIONS=true + GITHUB_JOB=build.
 * CI=true alone (including Vercel) is deliberately insufficient.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function isActionsBuild(env: NodeJS.ProcessEnv): boolean {
  return env.GITHUB_ACTIONS === "true" && env.GITHUB_JOB === "build";
}

export function checkPlan(mode: string, env: NodeJS.ProcessEnv): string[][] {
  const browser = [
    ["exec", "--", "playwright", "install", ...(isActionsBuild(env) ? ["--with-deps"] : []), "chromium"],
    ["run", "test:e2e"],
  ];
  switch (mode) {
    case "prebuild": return isActionsBuild(env) ? [["run", "audit:prod"]] : [];
    case "postbuild": return isActionsBuild(env) ? browser : [];
    // Explicit local equivalent; build:app avoids recursive lifecycle hooks.
    // The existing Actions workflow itself runs the SEO and shell-crawl gates.
    case "local": return [
      ["run", "audit:prod"], ["run", "build:app"],
      ["run", "audit:seo"], ["run", "audit:shell"], ...browser,
    ];
    default: throw new Error("ci-checks: unknown mode");
  }
}

function main(): void {
  const mode = process.argv[2];
  const plan = checkPlan(mode, process.env);
  if (!plan.length) {
    console.log(`ci-checks: ${mode} skipped (not the GitHub Actions build job)`);
    return;
  }
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("ci-checks: invoke through npm run");
  // CI checks never need deployment credentials, even for the local equivalent.
  // Do not pass arbitrary inherited API keys/tokens to a build or browser.
  const env: NodeJS.ProcessEnv = {};
  for (const name of ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "PLAYWRIGHT_BROWSERS_PATH", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  Object.assign(env, {
    CI: "true", VITE_SUPABASE_URL: "https://placeholder.supabase.co",
    VITE_SUPABASE_ANON_KEY: "placeholder", PLAYWRIGHT_HTML_OPEN: "never",
  });
  for (const args of plan) {
    console.log(`ci-checks: npm ${args.join(" ")}`);
    const result = spawnSync(process.execPath, [npmCli, ...args], { stdio: "inherit", env });
    if (result.error || result.status !== 0) {
      console.error("ci-checks: command failed");
      process.exit(result.status || 1);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
