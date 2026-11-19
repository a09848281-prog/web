/* Non-AI motion detection: compare sampled RGB pixels only inside user-drawn normalized rectangles. */
(function (root) {
  "use strict";

  function clamp(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
  }

  function measureRegions(previous, current, width, height, regions, pixelThreshold) {
    const w = Math.floor(Number(width));
    const h = Math.floor(Number(height));
    const threshold = Number.isFinite(Number(pixelThreshold)) ? Math.max(0, Number(pixelThreshold)) : 54;
    if (!previous || !current || !Number.isInteger(w) || !Number.isInteger(h) ||
        w < 1 || h < 1 || previous.length !== w * h * 4 || current.length !== w * h * 4 ||
        !Array.isArray(regions)) return [];

    const output = [];
    regions.forEach(function (region, index) {
      if (!region || region.enabled === false) return;
      const x = clamp(region.x, 0, 1);
      const y = clamp(region.y, 0, 1);
      const regionWidth = clamp(region.w, 0, 1 - x);
      const regionHeight = clamp(region.h, 0, 1 - y);
      const left = Math.max(0, Math.min(w - 1, Math.floor(x * w)));
      const top = Math.max(0, Math.min(h - 1, Math.floor(y * h)));
      const right = Math.max(left + 1, Math.min(w, Math.ceil((x + regionWidth) * w)));
      const bottom = Math.max(top + 1, Math.min(h, Math.ceil((y + regionHeight) * h)));
      let changed = 0;
      let total = 0;

      for (let py = top; py < bottom; py += 1) {
        for (let px = left; px < right; px += 1) {
          const offset = (py * w + px) * 4;
          const difference =
            Math.abs(current[offset] - previous[offset]) +
            Math.abs(current[offset + 1] - previous[offset + 1]) +
            Math.abs(current[offset + 2] - previous[offset + 2]);
          if (difference > threshold) changed += 1;
          total += 1;
        }
      }

      output.push({
        zoneId: String(region.id || ("region-" + (index + 1))),
        zoneName: String(region.name || ("範囲 " + (index + 1))),
        changed: changed,
        total: total,
        ratio: total > 0 ? changed / total : 0
      });
    });
    return output;
  }

  const api = Object.freeze({ measureRegions: measureRegions });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.RemoteCameraMotion = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
