> **Content correction — 16 November 2026:** Earlier company-specific outage losses, runner counts, deployment frequencies, timings and failure-rate claims had no supporting logs in the review materials. They are not retained as measured results. The original publication date is preserved; the guide now separates engineering practice from evidence of InBharat operations.

# CI/CD: The Difference Between Deploying Every Day and Deploying Every Month

CI/CD makes release work reviewable and repeatable. It does not mean that passing tests prove every change is safe.

## Three related practices

| Practice | Purpose | Production approval |
| --- | --- | --- |
| Continuous integration | Build and test integrated changes frequently | Not a deployment decision by itself |
| Continuous delivery | Keep a validated artifact ready to release | Usually explicit approval |
| Continuous deployment | Release eligible changes automatically | Policy-based automated gate |

## A practical pipeline

1. Review a small change and its tests.
2. Run lint, type checks and unit tests.
3. Test integration boundaries and important user journeys.
4. Scan dependencies, code and secrets with configured tools.
5. Build a versioned artifact once and record its source revision.
6. Deploy that artifact to staging and run smoke tests.
7. Apply the appropriate production approval and rollout policy.
8. Watch errors, latency and relevant business signals.
9. Stop, roll back or roll forward if the release exceeds agreed limits.

This is a recommended pattern, not a statement that every InBharat repository implements each step. Keep deployment credentials scoped and short-lived where possible; production access should not be available to every pull-request build.

## Testing and release confidence

Unit tests catch local failures, integration tests exercise boundaries, and end-to-end tests cover important workflows. Manual review still matters for accessibility, UX, security design and new failure modes. A fast pipeline is valuable, but there is no universal fifteen-minute test budget.

Scanners find classes of known problems, not all vulnerabilities or leaked credentials. A clean run is evidence about those checks on that revision, not a security certificate. Flaky tests need diagnosis, not silent removal.

## Artifacts, environments and data

Promote the same artifact across environments while separating configuration and credentials. Aim for representative staging conditions without copying production personal data by default. Synthetic or appropriately protected test data needs its own access and retention rules.

## Recovery is a separate capability

A rollback may not reverse database migrations, external messages or other irreversible effects. Test backups, restore procedures, migration compatibility and incident communication. Automated rollback needs meaningful thresholds and a known-safe target.

## Measure the outcome

Track deployment frequency, change failure rate, lead time and recovery time with a defined denominator and observation period. Compare equivalent changes and disclose exclusions. The earlier article’s numeric anecdotes are not a validated benchmark; publish actual logs before claiming improvements.

## Frequently Asked Questions

**What is the difference between CI, delivery and deployment?**
CI integrates and tests changes. Continuous delivery keeps a release ready for approval. Continuous deployment automatically releases changes that meet a defined policy.

**Does a passing pipeline guarantee a safe release?**
No. Tests and scanners cover defined cases; staging, approval, monitoring and recovery controls address additional risks.

**How long should a pipeline take?**
Measure it for the project. Parallelize independent checks and remove waste without dropping critical validation; no fixed push-to-production time is promised.

**Can every change be rolled back?**
No. Database changes and external side effects may require a roll-forward or recovery procedure. Rehearse the relevant paths before relying on them.

---
*Reeturaj Goswami — InBharat.ai*
