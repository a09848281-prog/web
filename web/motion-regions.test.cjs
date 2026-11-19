const assert = require("node:assert/strict");
const { measureRegions } = require("./motion-regions.js");

function frame(width, height, rgb) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return data;
}

const width = 4;
const height = 2;
const baseline = frame(width, height, [20, 20, 20]);
const rightHalf = { id: "right", name: "右側", x: 0.5, y: 0, w: 0.5, h: 1, enabled: true };

// Movement outside the selected area must not trigger that area.
const outsideOnly = new Uint8ClampedArray(baseline);
outsideOnly[0] = 250;
assert.equal(measureRegions(baseline, outsideOnly, width, height, [rightHalf])[0].ratio, 0);

// Movement inside the selected area must be counted.
const insideOnly = new Uint8ClampedArray(baseline);
insideOnly[(1 * width + 3) * 4] = 250;
const insideResult = measureRegions(baseline, insideOnly, width, height, [rightHalf])[0];
assert.equal(insideResult.changed, 1);
assert.equal(insideResult.total, 4);
assert.equal(insideResult.ratio, 0.25);
assert.equal(insideResult.zoneName, "右側");

// Disabled regions are ignored.
assert.deepEqual(measureRegions(baseline, insideOnly, width, height, [
  { ...rightHalf, enabled: false }
]), []);

// Invalid frame sizes fail closed rather than throwing.
assert.deepEqual(measureRegions(baseline, insideOnly, 0, height, [rightHalf]), []);
assert.deepEqual(measureRegions(null, insideOnly, width, height, [rightHalf]), []);

console.log("Motion region tests passed (5 assertions groups).");
