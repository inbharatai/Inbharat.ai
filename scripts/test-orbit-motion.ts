import assert from 'node:assert/strict';
import { UNOONE_CAPABILITIES, UNOONE_CAPABILITY_RINGS } from '../content/unooneCapabilities';
import { ORBIT_SPEEDS, stepOrbitLabels, orbitLabelsFit, type OrbitBox } from '../components/landing/orbitLayout';
let frames = 0;
for (const width of [280, 350, 468, 520, 620]) {
  const compact = width < 480, span = compact ? width : width - 100;
  let previous: OrbitBox[] | null = null;
  const travel = Array(12).fill(0) as number[];
  for (let frame = 0; frame < 120 * 30; frame++) {
    const seconds = frame / 30;
    const targets = UNOONE_CAPABILITIES.map(capability => {
      const angle = capability.angle * Math.PI / 180 + ORBIT_SPEEDS[capability.ring] * seconds;
      const radius = span * UNOONE_CAPABILITY_RINGS[capability.ring] / 100;
      return { x: width / 2 + radius * Math.cos(angle), y: width / 2 + radius * Math.sin(angle), width: compact ? 61.1 : 94, height: compact ? 28.6 : 44 };
    });
    const next = stepOrbitLabels(targets, previous, width, width, 80, 1 / 30);
    assert.ok(next, 'feasible nominal layout');
    assert.ok(orbitLabelsFit(next, width, width, 80), `non-overlap/bounds/core at ${width}/${frame}`);
    if (previous) for (let i = 0; i < next.length; i++) {
      const move = Math.hypot(next[i].x - previous[i].x, next[i].y - previous[i].y);
      assert.ok(move <= 1.5001, `bounded motion ${width}/${frame}`); travel[i] += move;
    }
    assert.equal(stepOrbitLabels(targets, next, width, width, 80, 0), next, 'paused step preserves exact positions');
    previous = next; frames++;
  }
  assert.ok(travel.every(distance => distance > 50), `all 12 labels genuinely travel at width ${width}`);
}
console.log(`PASS orbit geometry: ${frames} simulated frames; bounded motion, non-overlap, fixed-core clearance and pause continuity. Not a measured browser/device performance claim.`);

// Regression: a running orbit resized to 330px at phase36 previously overlapped
// and then stayed frozen forever. Sweep nonzero initial phases and recovery.
for (let width = 280; width <= 520; width += 10) for (let phase = 0; phase < 300; phase += 3) {
  const compact = width < 480, span = compact ? width : width - 100;
  const make = (time: number) => UNOONE_CAPABILITIES.map(cap => {
    const angle = cap.angle * Math.PI / 180 + ORBIT_SPEEDS[cap.ring] * time;
    const radius = span * UNOONE_CAPABILITY_RINGS[cap.ring] / 100;
    return { x: width / 2 + radius * Math.cos(angle), y: width / 2 + radius * Math.sin(angle), width: compact ? 61.1 : 94, height: compact ? 28.6 : 44 };
  });
  let state = stepOrbitLabels(make(phase), null, width, width, 80, 0);
  assert.ok(state && orbitLabelsFit(state, width, width, 80), `resize initialization ${width}/${phase}`);
  if (width === 330 && [36,39,42,297].includes(phase)) {
    const first = state.map(p => ({ ...p }));
    for (let frame = 1; frame <= 300; frame++) {
      state = stepOrbitLabels(make(phase + frame / 30), state, width, width, 80, 1 / 30);
      assert.ok(state && orbitLabelsFit(state, width, width, 80));
    }
    assert.ok(state.some((p, i) => Math.hypot(p.x - first[i].x, p.y - first[i].y) > 2), 'reinitialized orbit continues moving');
  }
}
assert.equal(stepOrbitLabels([{x:20,y:20,width:100,height:100}], null, 40, 40, 80, 0), null, 'impossible layout returns explicit fallback, not poisoned geometry');
console.log('PASS nonzero-phase resize sweep: 2500 valid initializations, four prior freeze cases recover, impossible geometry has explicit fallback.');
