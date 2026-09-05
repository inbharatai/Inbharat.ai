import assert from "node:assert/strict";
import { checkPlan, isActionsBuild } from "./ci-checks.js";

const inactive = [
  {}, { CI: "true" }, { CI: "true", VERCEL: "1" },
  { GITHUB_ACTIONS: "true", GITHUB_JOB: "lint" },
  { GITHUB_ACTIONS: "true", GITHUB_JOB: "test-growth" },
  { GITHUB_ACTIONS: "false", GITHUB_JOB: "build" },
  { GITHUB_JOB: "build" }, { GITHUB_ACTIONS: "true" },
];
for (const env of inactive) {
  assert.equal(isActionsBuild(env), false);
  assert.deepEqual(checkPlan("prebuild", env), []);
  assert.deepEqual(checkPlan("postbuild", env), []);
}
const active = { GITHUB_ACTIONS: "true", GITHUB_JOB: "build" };
assert.deepEqual(checkPlan("prebuild", active), [["run", "audit:prod"]]);
assert.deepEqual(checkPlan("postbuild", active), [
  ["exec", "--", "playwright", "install", "--with-deps", "chromium"],
  ["run", "test:e2e"],
]);
assert.deepEqual(checkPlan("local", {}), [
  ["run", "audit:prod"], ["run", "build:app"], ["run", "audit:seo"],
  ["run", "audit:shell"], ["exec", "--", "playwright", "install", "chromium"],
  ["run", "test:e2e"],
]);
assert.throws(() => checkPlan("invalid", {}));
console.log("ci-checks: routing controls passed (local, Vercel, other Actions jobs, build job)");
