/** Synthetic controls are assembled at runtime, never stored as full secrets.
 * Assert booleans only so failures cannot echo a matched value.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { scanText } from "./audit-secrets.js";

const key = ["sk", "proj", "aB9xY7qW2zR5mN8pL3cV6dF0"].join("-");
const fixture = ["sk", "live", "1234567890abcdef"].join("_");
const aws = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
const cases: Array<[string, string, boolean]> = [
  ["src/example.ts", `token=${"AbCd1234".repeat(4)}`, true],
  ["src/example.ts", `token=${"ABCD1234".repeat(4)}`, true],
  ["src/example.ts", `token=YOUR_${"ABCD1234".repeat(4)}`, true],
  ["src/example.ts", `token=PASTE_${"ABCD1234".repeat(4)}`, true],
  ["README.md", `OPENAI_API_KEY=<${key}>`, true],
  ["README.md", `OPENAI_API_KEY=sk-...${key}`, true],
  ["src/example.ts", `const key = '${key}'`, true],
  ["scripts/test-growth.ts", `api_key=${fixture}`, false],
  ["scripts/test-growth.ts", `api_key=${fixture}EXTRA`, true],
  ["scripts/test-growth.ts", `${aws}EXTRA`, true],
  ["src/example.ts", `api_key=${fixture}`, true],
  ["scripts/test-growth.ts", `${aws}\n${key}`, true],
  ["README.md", "OPENAI_API_KEY=sk-...", false],
  [".env.example", "SUPABASE_SERVICE_ROLE_KEY=eyJ...", false],
  ["README.md", "OPENAI_API_KEY=os.getenv('OPENAI_API_KEY')", false],
  ["README.md", `OPENAI_API_KEY=os.getenv('OPENAI_API_KEY') + '${key}'`, true],
  ["src/example.ts", "const value = process.env.OPENAI_API_KEY;", false],
  ["README.md", "ordinary documentation", false],
  ["README.md", `-----BEGIN ${"PRIVATE KEY"}-----\nabc\n-----END ${"PRIVATE KEY"}-----`, true],
];
cases.forEach(([file, text, expected], i) => {
  assert.equal(scanText(file, text).length > 0, expected, `secret control ${i + 1}`);
});

// New source files must also scan cleanly before they are staged/tracked.
for (const file of ["scripts/audit-secrets.ts", "scripts/test-audit-secrets.ts", "scripts/ci-checks.ts", "scripts/test-ci-checks.ts"]) {
  assert.equal(scanText(file, readFileSync(file, "utf8")).length === 0, true, `scanner source control: ${file}`);
}

// End-to-end exit-code and output-safety controls in a disposable git index.
// No commits, no remote, no credentials. Untracked local reports are not scanned.
const root = mkdtempSync(join(tmpdir(), "inbharat-secret-controls-"));
const git = (...args: string[]) => {
  const result = spawnSync("git", args, { cwd: root, stdio: "ignore" });
  assert.equal(result.status, 0, "temporary git fixture setup failed");
};
const audit = () => spawnSync(process.execPath, [
  resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/audit-secrets.ts"),
], { cwd: root, encoding: "utf8" });
try {
  git("init", "--quiet");
  writeFileSync(join(root, "fixture.txt"), "ordinary text\n");
  git("add", "fixture.txt");
  assert.equal(audit().status, 0, "clean tracked fixture must pass");
  writeFileSync(join(root, "fixture.txt"), key);
  const failure = audit();
  assert.equal(failure.status, 1, "tracked secret control must fail");
  assert.equal((failure.stdout + failure.stderr).includes(key), false, "scanner output leaked a matched value");
  rmSync(join(root, "fixture.txt"));
  assert.equal(audit().status, 1, "unreadable tracked file must fail closed");
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log(`audit-secrets controls: ${cases.length} detection/masking cases and 4 CLI assertions passed; values withheld`);
