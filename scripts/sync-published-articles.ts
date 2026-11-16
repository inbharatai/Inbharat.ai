/** Build compatibility entrypoint: NO DB clients, credential reads or network writes.
 * A successful build is not a promoted deployment. The authenticated production
 * publication-sync cron reconciles the canonical snapshot after schema activation.
 * The explicit operator CLI is a repair/extra-verification path, not the only path.
 */
console.log('[sync-published-articles] Build is write-free. Production publication-sync cron verifies the deployed canonical snapshot before reconciliation; lifecycle migrations must be applied. See docs/article-publication-lifecycle.md.');
