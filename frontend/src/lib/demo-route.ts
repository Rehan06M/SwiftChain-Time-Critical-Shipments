export type DemoPoint = [number, number];

// Resume from the current position instead of replaying
// the approved route from its original starting point.
export function remainingDemoPath(
  points: DemoPoint[],
  current: DemoPoint
): DemoPoint[] {
  let bestIndex = 0;
  let bestDistance = Infinity;

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const scale = Math.cos(current[1] * Math.PI / 180);

    const dx = (end[0] - start[0]) * scale;
    const dy = end[1] - start[1];
    const px = (current[0] - start[0]) * scale;
    const py = current[1] - start[1];

    const length = dx * dx + dy * dy;
    const fraction = length > 0
      ? Math.max(0, Math.min(1, (px * dx + py * dy) / length))
      : 0;

    const distance =
      (px - dx * fraction) ** 2 +
      (py - dy * fraction) ** 2;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return [current, ...points.slice(bestIndex + 1)];
}

export function demoPointAt(
  points: DemoPoint[],
  progress: number
): DemoPoint {
  const lengths = points.slice(1).map((point, index) => {
    const start = points[index]!;
    const scale = Math.cos(
      ((start[1] + point[1]) / 2) * Math.PI / 180
    );

    return Math.hypot(
      (point[0] - start[0]) * scale,
      point[1] - start[1]
    );
  });

  let remaining =
    lengths.reduce((total, length) => total + length, 0) *
    Math.max(0, Math.min(1, progress));

  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;

    if (length > 0 && remaining <= length) {
      const fraction = remaining / length;
      const start = points[index]!;
      const end = points[index + 1]!;

      return [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ];
    }

    remaining -= length;
  }

  return points[points.length - 1]!;
}