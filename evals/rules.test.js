// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkWarranty } from "../src/warranty.js";

const fleet = JSON.parse(readFileSync(new URL("../data/fleet.json", import.meta.url)));
const { as_of, cases } = JSON.parse(readFileSync(new URL("./rule-cases.json", import.meta.url)));

for (const c of cases) {
  test(c.name, () => {
    const vehicle = fleet.find((v) => v.vin === c.input.vin);
    const r = checkWarranty({ ...c.input, vehicle, asOf: new Date(as_of + "T00:00:00Z") });
    assert.equal(r.decision, c.expect, `${r.decision}: ${r.reasons.join(" ")}`);
  });
}
