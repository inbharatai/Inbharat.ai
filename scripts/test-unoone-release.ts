import assert from 'node:assert/strict';
import { approvedArtifact, UNOONE_RELEASES, type ApprovedReleaseArtifact, type PlatformRelease } from '../content/unooneRelease';
let checks = 0;
const fixture: ApprovedReleaseArtifact = { platform: 'android', approved: true, signed: true, version: '1.0.0', url: 'https://downloads.example.org/unoone.apk', sha256: 'a'.repeat(64), bytes: 123456, approvedOn: '2026-11-16', signingIdentity: 'Fixture publisher', requirements: ['Fixture device matrix'], setupUrl: 'https://example.org/setup', releaseNotesUrl: 'https://example.org/notes', licenseUrl: 'https://example.org/license', supportUrl: 'https://example.org/support' };
const base = UNOONE_RELEASES.find(release => release.id === 'android')!;
const input = (artifact: unknown): PlatformRelease => ({ ...base, artifact: artifact as ApprovedReleaseArtifact });
function rejected(artifact: unknown, label: string) { let result: unknown; assert.doesNotThrow(() => { result = approvedArtifact(input(artifact)); }, label); assert.equal(result, null, label); checks++; }
assert.equal(approvedArtifact(input(fixture)), fixture); checks++;
for (const release of UNOONE_RELEASES) { assert.equal(release.artifact, null, 'No final public binary was supplied for this change set'); assert.equal(approvedArtifact(release), null); checks++; }
for (const invalid of [null, undefined, {}, [], true, 'fixture']) rejected(invalid, `Reject malformed artifact: ${JSON.stringify(invalid)}`);
for (const key of Object.keys(fixture)) { const broken = { ...fixture } as Record<string, unknown>; delete broken[key]; rejected(broken, `Missing ${key}`); }
for (const field of ['version','url','sha256','approvedOn','signingIdentity','setupUrl','releaseNotesUrl','licenseUrl','supportUrl']) for (const bad of [null, 42, {}, '']) rejected({ ...fixture, [field]: bad }, `Wrong type/empty ${field}`);
for (const bad of [null, false, {}, 'device', [], [42], [' ']]) rejected({ ...fixture, requirements: bad }, 'Invalid requirements');
for (const bytes of [0, -1, 1.5, NaN, Infinity, '123456']) rejected({ ...fixture, bytes }, 'Invalid bytes');
for (const sha256 of ['abc','g'.repeat(64),'a'.repeat(63)]) rejected({ ...fixture, sha256 }, 'Invalid checksum');
for (const approvedOn of ['2026-13-01','2026-02-30','2026-00-01','2026-11-16T00:00:00Z']) rejected({ ...fixture, approvedOn }, 'Invalid approval date');
for (const url of ['http://example.org/file.apk','javascript:alert(1)','data:application/octet-stream,fixture','https://fixture@example.org/file.apk','https://:fixture@example.org/file.apk','https://localhost/file.apk','https://127.0.0.1/file.apk','https://10.0.0.1/file.apk','https://172.20.0.1/file.apk','https://169.254.169.254/file.apk','https://[::1]/file.apk','https://[fc00::1]/file.apk']) rejected({ ...fixture, url }, 'Non-public release URL shape');
rejected({ ...fixture, platform: 'windows' }, 'Platform mismatch');
rejected({ ...fixture, approved: false }, 'Approval required');
rejected({ ...fixture, signed: false }, 'Signing declaration required');
console.log(`PASS release configuration: ${checks} checks. Hermetic fixtures only; no binary signing, device qualification, hosting or availability verification implied.`);
