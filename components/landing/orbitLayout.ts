export type OrbitBox = { x: number; y: number; width: number; height: number };
export const ORBIT_SPEEDS = { 1: .06, 2: -.04, 3: .025 } as const;

/** Keep upright labels in the diagram and separate them from the fixed core.
 * This affects label placement only, never product state or telemetry. */
export function arrangeOrbitLabels(targets: OrbitBox[], width: number, height: number, coreSize: number): OrbitBox[] {
  const boxes = targets.map(p => ({ ...p }));
  const cx = width / 2, cy = height / 2, gap = 4;
  const constrain = (p: OrbitBox) => {
    p.x = Math.max(p.width / 2 + 1, Math.min(width - p.width / 2 - 1, p.x));
    p.y = Math.max(p.height / 2 + 1, Math.min(height - p.height / 2 - 1, p.y));
    const dx = p.x - cx, dy = p.y - cy;
    const bx = coreSize / 2 + p.width / 2 + gap, by = coreSize / 2 + p.height / 2 + gap;
    if (Math.abs(dx) < bx && Math.abs(dy) < by) {
      const factor = Math.min(bx / Math.max(.001, Math.abs(dx)), by / Math.max(.001, Math.abs(dy)));
      p.x = cx + dx * factor; p.y = cy + dy * factor;
    }
  };
  for (let iteration = 0; iteration < 128; iteration++) {
    boxes.forEach(constrain);
    let overlap = false;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const bx = (a.width + b.width) / 2 + gap, by = (a.height + b.height) / 2 + gap;
      if (Math.abs(dx) >= bx || Math.abs(dy) >= by) continue;
      overlap = true;
      // A tiny deterministic tangent breaks collinear edge/core deadlocks.
      if (Math.abs(dy) < .5) dy = (j % 2 ? 1 : -1) * .5;
      if (Math.abs(dx) < .5) dx = (i % 2 ? 1 : -1) * .5;
      const factor = Math.min(bx / Math.abs(dx), by / Math.abs(dy)) - 1;
      a.x -= dx * factor / 2; b.x += dx * factor / 2;
      a.y -= dy * factor / 2; b.y += dy * factor / 2;
    }
    if (!overlap) break;
  }
  boxes.forEach(constrain);
  return boxes;
}

export function orbitLabelsFit(boxes: OrbitBox[], width: number, height: number, coreSize: number): boolean {
  for (const p of boxes) {
    if (p.x - p.width / 2 < -.1 || p.x + p.width / 2 > width + .1 || p.y - p.height / 2 < -.1 || p.y + p.height / 2 > height + .1) return false;
    const dx = Math.max(0, Math.abs(p.x - width / 2) - p.width / 2);
    const dy = Math.max(0, Math.abs(p.y - height / 2) - p.height / 2);
    if (Math.hypot(dx, dy) < coreSize / 2) return false;
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (Math.abs(boxes[i].x - boxes[j].x) < (boxes[i].width + boxes[j].width) / 2 && Math.abs(boxes[i].y - boxes[j].y) < (boxes[i].height + boxes[j].height) / 2) return false;
  }
  return true;
}

/** Time-based attraction plus a bounded, collision-checked step avoids snaps
 * when two different-speed rings pass each other. No timers/DOM/state here. */
export function stepOrbitLabels(targets: OrbitBox[], previous: OrbitBox[] | null, width: number, height: number, coreSize: number, seconds: number): OrbitBox[] | null {
  if (previous && !orbitLabelsFit(previous, width, height, coreSize)) previous = null;
  if (previous && seconds <= 0) return previous;
  const attraction = 1 - Math.exp(-4 * seconds);
  const input = previous ? targets.map((p, i) => ({ ...p, x: previous[i].x + (p.x - previous[i].x) * attraction, y: previous[i].y + (p.y - previous[i].y) * attraction })) : targets;
  const solved = arrangeOrbitLabels(input, width, height, coreSize);
  if (!previous) return orbitLabelsFit(solved, width, height, coreSize) ? solved : packOrbitLabels(targets, width, height, coreSize);
  let placed = previous.map(p => ({ ...p }));
  // Resolve each label independently: a crowded pair must not freeze every
  // other ring. Bounded steps retain continuity rather than teleporting pills.
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < solved.length; i++) {
    const from = placed[i], to = solved[i];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    let fraction = Math.min(1, Math.max(.05, seconds * 22.5) / Math.max(.001, distance));
    for (let attempt = 0; attempt < 9; attempt++) {
      const candidate = placed.map((p, j) => j === i ? { ...p, x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction } : p);
      if (orbitLabelsFit(candidate, width, height, coreSize)) { placed = candidate; break; }
      fraction /= 2;
    }
  }
  return placed;
}

/** Rare resize/text-size recovery: place larger labels first in the nearest
 * valid free slots. Never admit a poisoned overlapping initial layout. If the
 * space is physically insufficient, the caller exposes its native text list. */
function packOrbitLabels(targets: OrbitBox[], width: number, height: number, coreSize: number): OrbitBox[] | null {
  const result: OrbitBox[] = Array(targets.length);
  const placed: OrbitBox[] = [];
  const order = targets.map((p, i) => ({ p, i })).sort((a, b) => b.p.width * b.p.height - a.p.width * a.p.height || a.i - b.i);
  for (const { p, i } of order) {
    let best: OrbitBox | null = null, distance = Infinity;
    for (let y = p.height / 2 + 1; y <= height - p.height / 2 - 1; y += 4) for (let x = p.width / 2 + 1; x <= width - p.width / 2 - 1; x += 4) {
      const score = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (score >= distance) continue;
      const candidate = { ...p, x, y };
      // Retain a small clearance for interpolation, not merely touching boxes.
      if (orbitLabelsFit([...placed, candidate].map(box => ({ ...box, width: box.width + 2, height: box.height + 2 })), width, height, coreSize + 2)) { best = candidate; distance = score; }
    }
    if (!best) return null;
    result[i] = best; placed.push(best);
  }
  return orbitLabelsFit(result, width, height, coreSize) ? result : null;
}
