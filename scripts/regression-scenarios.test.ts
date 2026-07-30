// Regression check: runs the canonical 10 scenarios through compareHouses()
// and prints a CSV table to stdout. The matching R script
// (scripts/regression-scenarios.R) runs the same 10 scenarios through
// evaluate_household() and prints the same shape. Diff the two outputs to
// spot any TS↔R drift after either side is edited.
//
// Run with: npx vitest run scripts/regression-scenarios.test.ts
//
// See scripts/REGRESSION.md for the constant alignment R needs.

import { describe, it } from "vitest";
import { compareHouses, DEFAULT_INPUTS, HouseInputs } from "../src/comparison/model";

interface Scenario {
  id: string;
  description: string;
  overrides: Partial<HouseInputs>;
}

// 10 scenarios covering: state variation, finance, all three solar modes,
// vehicle toggle, dwelling type, occupancy. All other inputs sit at
// DEFAULT_INPUTS (1.8 BYD Dolphin, EV tariff, wholesale battery, 200-300 km).
//
// finance and solarScenario are pinned per-row so this suite stays anchored
// even when DEFAULT_INPUTS shifts (it landed on loan + solar_optimised on
// 2026-05-18; rows still need to test cash / grid_only / solar regardless).
const SCENARIOS: Scenario[] = [
  { id: "S01", description: "AUS / 15yr cash / grid only",        overrides: { finance: false, solarScenario: "grid_only" } },
  { id: "S02", description: "AUS / 15yr loan / grid only",        overrides: { finance: true,  solarScenario: "grid_only" } },
  { id: "S03", description: "AUS / 15yr cash / solar",            overrides: { finance: false, solarScenario: "solar" } },
  { id: "S04", description: "AUS / 15yr loan / solar",            overrides: { finance: true,  solarScenario: "solar" } },
  { id: "S05", description: "AUS / 15yr cash / solar_optimised",  overrides: { finance: false, solarScenario: "solar_optimised" } },
  { id: "S06", description: "NSW / 15yr cash / solar",            overrides: { finance: false, solarScenario: "solar", state: "NSW" } },
  { id: "S07", description: "WA / 15yr cash / grid only",         overrides: { finance: false, solarScenario: "grid_only", state: "WA" } },
  { id: "S08", description: "NT / 15yr cash / grid only (LPG)",   overrides: { finance: false, solarScenario: "grid_only", state: "NT" } },
  { id: "S09", description: "AUS no-car / 15yr cash / solar",     overrides: { finance: false, solarScenario: "solar", vehicleOptions: [], vehicles: 0 } },
  { id: "S10", description: "AUS apartment / 1 occ / 15yr cash / solar", overrides: { finance: false, solarScenario: "solar", dwelling: "apartment", occupants: 1 } },
  // Fractional vehicle count over a 2-car mixed fleet — the case where TS and R
  // used to diverge silently. TS scaled only car #1 (dropping the SUV, which
  // inflated savings ~$1,000/yr); R ignored the count entirely. Both now spread
  // the count across the configured mix, so this row must match.
  { id: "S11", description: "AUS 1.8 cars / 15yr cash / solar", overrides: { finance: false, solarScenario: "solar", vehicles: 1.8 } },
];

function round0(n: number): number {
  return Math.round(n);
}

describe("R-comparison regression scenarios", () => {
  it("prints CSV for diff vs scripts/regression-scenarios.R", () => {
    const lines: string[] = [];
    lines.push("id,description,gas_capital,gas_interest,gas_gas,gas_petrol,gas_electricity,gas_total,electric_capital,electric_interest,electric_electricity,electric_total,savings_15yr");
    for (const s of SCENARIOS) {
      const inputs: HouseInputs = { ...DEFAULT_INPUTS, ...s.overrides };
      const r = compareHouses(inputs);
      const savings = r.gas.total - r.electric.total;
      lines.push([
        s.id,
        JSON.stringify(s.description),
        round0(r.gas.capital),
        round0(r.gas.interest),
        round0(r.gas.gas),
        round0(r.gas.petrol),
        round0(r.gas.electricity),
        round0(r.gas.total),
        round0(r.electric.capital),
        round0(r.electric.interest),
        round0(r.electric.electricity),
        round0(r.electric.total),
        round0(savings),
      ].join(","));
    }
    // Vitest captures console output; flag the start/end so diffing the
    // log is straightforward.
    console.log("===BEGIN_TS_REGRESSION_CSV===");
    console.log(lines.join("\n"));
    console.log("===END_TS_REGRESSION_CSV===");
  });
});
