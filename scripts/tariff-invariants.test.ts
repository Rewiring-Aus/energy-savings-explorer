// Tariff-refactor invariants, from TARIFF_PORT_TO_TS.md §7.
//
// These are the sanity checks the R model asserts about the tariff switch. They
// are cheap and they catch the two failure modes that are easy to reintroduce:
// dispatching solar before the free window (which makes solar_optimised come out
// WORSE than solar), and letting the battery credit exceed what was actually
// billed (which fabricates household income).
//
// Run with: npx vitest run scripts/tariff-invariants.test.ts

import { describe, expect, it } from "vitest";
import {
  compareHouses,
  DEFAULT_INPUTS,
  getTariffSpec,
  householdBreakdown,
  HouseInputs,
  seasonalBatteryTrace,
  SolarScenario,
  wholeHomeBatteryDiagnostics,
  wholeHomePreset,
} from "../src/comparison/model";
import {
  BATTERY_HOUSEHOLD_SAFEGUARD_PCT,
  SOLAR_SHARER_CAP_KWH_DAY,
  SOLAR_SHARER_STATES,
  STATES,
  StateCode,
  TARIFFS,
  Tariff,
} from "../src/comparison/data";

// The doc's §7 reference household: AUS, 2.7 occupants, 2 vehicles (SUV +
// hatch), 15-year, 6%/15yr loan, 10 kW solar + 15 kWh battery, safeguard 0.
const REF: HouseInputs = {
  ...DEFAULT_INPUTS,
  state: "AUS",
  occupants: 2.7,
  vehicles: 2,
  vehicleOptions: ["byd_sealion", "byd_dolphin"],
  finance: true,
  loanRate: 0.06,
  loanTerm: 15,
  period: "15year",
};

const SCENARIOS: SolarScenario[] = ["grid_only", "solar", "solar_optimised"];

function annualSavings(inputs: HouseInputs): number {
  const r = compareHouses(inputs);
  return (r.gas.total - r.electric.total) / 15;
}

describe("tariff spec resolution", () => {
  it("derives Solar Sharer eligibility from the price rows, not a hardcoded list", () => {
    // Exactly the states with an electricity_sso_free row.
    expect([...SOLAR_SHARER_STATES].sort()).toEqual(["ACT", "AUS", "NSW", "QLD", "SA"]);
  });

  it("falls back to tou in ineligible states and reports the resolved tariff", () => {
    for (const state of STATES) {
      const spec = getTariffSpec("solar_sharer", state, "15year");
      if (SOLAR_SHARER_STATES.includes(state)) {
        expect(spec.tariff).toBe("solar_sharer");
        expect(spec.freeWindow).toBe(true);
        expect(spec.freeCapKwhDay).toBe(SOLAR_SHARER_CAP_KWH_DAY);
      } else {
        // Silent fallback — the returned tariff is what was actually used.
        expect(spec.tariff).toBe("tou");
        expect(spec.freeWindow).toBe(false);
        expect(spec.freeCapKwhDay).toBe(0);
      }
    }
  });

  it("gives Solar Sharer its own, higher daily supply charge", () => {
    // The standing cost of the free window. Missing this makes the plan look
    // free: NSW is $2.1263 vs $1.3905 flat, +$269/yr.
    const sso = getTariffSpec("solar_sharer", "NSW", "1year");
    const flat = getTariffSpec("flat", "NSW", "1year");
    expect(sso.dailyCharge).toBeCloseTo(2.1263, 4);
    expect(flat.dailyCharge).toBeCloseTo(1.3905, 4);
    expect((sso.dailyCharge - flat.dailyCharge) * 365).toBeGreaterThan(250);
  });

  it("makes amber identical to tou on imports, differing only on evening export", () => {
    for (const state of STATES) {
      const tou = getTariffSpec("tou", state, "15year");
      const amber = getTariffSpec("amber", state, "15year");
      expect(amber.importDolKwh).toBe(tou.importDolKwh);
      expect(amber.evDolKwh).toBe(tou.evDolKwh);
      expect(amber.dailyCharge).toBe(tou.dailyCharge);
      expect(tou.exportEvening).toBe("fit");
      expect(amber.exportEvening).toBe("wholesale_peak");
    }
  });
});

describe("§7 expected results", () => {
  // Full tariff × scenario matrix, read straight out of evaluate_household() on
  // the reference household (2026-07-29). Every cell below was verified against
  // R and agrees to within $1/yr, so the tolerance is deliberately tight — this
  // is the guard that catches drift in either direction.
  //
  // NB: TARIFF_PORT_TO_TS.md §7's net_annual_opex table lists solar_sharer as
  // "~2,674" for BOTH solar and solar_optimised, described as a "~$0 gap". That
  // row is stale: R itself returns 2,667 / 2,369, and the doc's own savings table
  // (4,222 vs 4,519) implies exactly the $297 gap those opex figures produce.
  // The savings table is the reliable one.
  const R_SAVINGS: Record<Tariff, Record<SolarScenario, number>> = {
    flat:         { grid_only: 2717, solar: 3560, solar_optimised: 3959 },
    tou:          { grid_only: 3294, solar: 3541, solar_optimised: 3839 },
    amber:        { grid_only: 3294, solar: 3541, solar_optimised: 3839 },
    solar_sharer: { grid_only: 3532, solar: 4222, solar_optimised: 4519 },
  };
  const R_NET_OPEX: Record<Tariff, Record<SolarScenario, number>> = {
    flat:         { grid_only: 6252, solar: 3404, solar_optimised: 3005 },
    tou:          { grid_only: 5350, solar: 3097, solar_optimised: 2800 },
    amber:        { grid_only: 5350, solar: 3097, solar_optimised: 2800 },
    solar_sharer: { grid_only: 5361, solar: 2667, solar_optimised: 2369 },
  };
  const TOL = 3;  // $/yr — absorbs the rounded-constant residuals in data.ts

  for (const tariff of TARIFFS) {
    for (const scenario of SCENARIOS) {
      it(`${tariff} / ${scenario} matches R`, () => {
        const inputs = { ...REF, tariff, solarScenario: scenario };
        expect(annualSavings(inputs)).toBeCloseTo(R_SAVINGS[tariff][scenario], -0.5);
        expect(Math.abs(annualSavings(inputs) - R_SAVINGS[tariff][scenario]))
          .toBeLessThanOrEqual(TOL);
        const netOpex = compareHouses(inputs).electric.electricity / 15;
        expect(Math.abs(netOpex - R_NET_OPEX[tariff][scenario]))
          .toBeLessThanOrEqual(TOL);
      });
    }
  }
});

describe("sanity invariants", () => {
  it("never makes solar_optimised worse than solar, on any tariff", () => {
    // This is THE regression guard for the dispatch order. Serving in-window
    // load from solar before the free window cannibalises the free window 1:1
    // (both are $0) while stripping the battery of stored energy — a real loss —
    // which made solar_optimised come out worse than solar.
    for (const tariff of TARIFFS) {
      const solar = annualSavings({ ...REF, tariff, solarScenario: "solar" });
      const optimised = annualSavings({ ...REF, tariff, solarScenario: "solar_optimised" });
      expect(optimised).toBeGreaterThanOrEqual(solar - 1); // -1 for float noise
    }
  });

  it("keeps amber and tou apart only by the value of evening exports", () => {
    for (const scenario of SCENARIOS) {
      const tou = compareHouses({ ...REF, tariff: "tou", solarScenario: scenario });
      const amber = compareHouses({ ...REF, tariff: "amber", solarScenario: scenario });
      // Same imports, same supply charge → the gas side is untouched, and the
      // electric side moves only by the evening-export credit.
      expect(amber.gas.total).toBeCloseTo(tou.gas.total, 6);
      if (scenario === "grid_only") {
        expect(amber.electric.total).toBeCloseTo(tou.electric.total, 6);
      } else {
        // Amber can only ever be >= tou on export value, so it costs <= tou.
        expect(amber.electric.total).toBeLessThanOrEqual(tou.electric.total + 1);
      }
    }
  });

  it("does not let free-window kWh fall as solar rises within a scenario", () => {
    // Free-window demand must not depend on any computed solar quantity — that
    // is what keeps the free-window and solar calculations non-circular. It
    // legitimately changes ACROSS scenarios (the sso column changes), but within
    // one scenario adding solar must not shrink it.
    for (const scenario of SCENARIOS) {
      const inputs = { ...REF, tariff: "solar_sharer" as Tariff, solarScenario: scenario };
      const noPv = householdBreakdown(inputs, "electric", 0);
      const bigPv = householdBreakdown(inputs, "electric", 1000);
      expect(bigPv.free.totalKwh).toBeCloseTo(noPv.free.totalKwh, 8);
    }
  });

  it("partitions usable stored solar exactly three ways", () => {
    // house load + EV + evening export == storedSolar × (1 - safeguard).
    // The evening-export leg is the residual and must NEVER be dropped —
    // previously it didn't exist when arbitrage was off, silently discarding it.
    for (const tariff of TARIFFS) {
      const rows = seasonalBatteryTrace(
        { ...REF, tariff, solarScenario: "solar_optimised" }, 10, 15,
      );
      expect(rows.length).toBe(4);
      for (const row of rows) {
        const partition = row.battery_to_home_kwh + row.battery_to_ev_kwh
          + row.arbitrage_headroom_kwh;
        const pool = row.stored_solar_kwh * (1 - BATTERY_HOUSEHOLD_SAFEGUARD_PCT);
        expect(partition).toBeCloseTo(pool, 8);
      }
    }
  });

  it("holds the free window under its household cap", () => {
    // All loads compete for one 24 kWh/day budget. At realistic sizes the cap
    // does not bind (~8-11 kWh/day against 24) — the per-load sso shares are the
    // binding constraint — but the cap must still hold when it does bite.
    for (const state of SOLAR_SHARER_STATES as StateCode[]) {
      for (const scenario of SCENARIOS) {
        const bd = householdBreakdown(
          { ...REF, state, tariff: "solar_sharer", solarScenario: scenario },
          "electric",
        );
        expect(bd.free.totalKwh).toBeLessThanOrEqual(SOLAR_SHARER_CAP_KWH_DAY + 1e-9);
        expect(bd.free.totalKwh).toBeGreaterThan(0);
      }
    }
  });

  it("charges no free-window energy on tariffs without a free window", () => {
    for (const tariff of ["flat", "tou", "amber"] as Tariff[]) {
      const bd = householdBreakdown(
        { ...REF, tariff, solarScenario: "solar_optimised" }, "electric",
      );
      expect(bd.free.totalKwh).toBe(0);
      expect(bd.free.applianceKwh).toBe(0);
      expect(bd.free.vehicleKwh).toBe(0);
    }
  });

  it("keeps free window + solar inside the min_retail floor", () => {
    // free + solar <= load × (1 - min_retail) per load. min_retail is currently
    // 0 everywhere, so this reduces to "never over-serve a load", which is the
    // property that stops storage appearing to eliminate a load entirely.
    for (const scenario of SCENARIOS) {
      const bd = householdBreakdown(
        { ...REF, tariff: "solar_sharer", solarScenario: scenario }, "electric", 100,
      );
      expect(bd.free.applianceKwh + bd.applianceSolarKwh)
        .toBeLessThanOrEqual(bd.applianceLoadKwh + 1e-9);
      expect(bd.free.vehicleKwh + bd.vehicleSolarKwh)
        .toBeLessThanOrEqual(bd.vehicleLoadKwh + 1e-9);
    }
  });

  it("credits the battery no more than the load it can actually displace", () => {
    // The battery is credited for displacing paid grid kWh. If the eligible load
    // isn't netted of free-window kWh, the battery gets paid for displacing
    // energy that was never charged for — measured at ~$339/yr of invented
    // income in R before the fix.
    for (const tariff of TARIFFS) {
      const inputs = { ...REF, tariff, solarScenario: "solar_optimised" };
      const { solarKw, batteryKwh } = wholeHomePreset(inputs.dwelling);
      const diag = wholeHomeBatteryDiagnostics(inputs);
      const bd = householdBreakdown(inputs, "electric",
        (diag.solarGenerationKwhPerYear / 365));

      // Appliance side: what the battery served must fit inside the load that
      // was actually billed (total, less free-window and less daytime solar).
      const paidApplianceKwhYr = Math.max(
        bd.applianceLoadKwh - bd.applianceSolarKwh - bd.free.applianceKwh, 0) * 365;
      expect(diag.batteryToHomeKwhPerYear).toBeLessThanOrEqual(paidApplianceKwhYr + 1e-6);

      // Vehicle side: same rule.
      const paidEvKwhYr = Math.max(
        bd.vehicleLoadKwh - bd.vehicleSolarKwh - bd.free.vehicleKwh, 0) * 365;
      expect(diag.batteryToEvKwhPerYear).toBeLessThanOrEqual(paidEvKwhYr + 1e-6);

      expect(solarKw).toBeGreaterThan(0);
      expect(batteryKwh).toBeGreaterThan(0);
    }
  });

  it("sends surplus stored solar to the car, not the grid, at every tariff's prices", () => {
    // Dispatch order is derived from prices, not a flag: the EV wins whenever
    // its avoided import (24-33c) beats the evening export (2-14c), which is
    // always, at every tariff. Deriving it means the model can't be put into an
    // economically incoherent state.
    for (const tariff of TARIFFS) {
      const diag = wholeHomeBatteryDiagnostics({
        ...REF, tariff, solarScenario: "solar_optimised",
      });
      expect(diag.batteryToEvKwhPerYear).toBeGreaterThan(0);
    }
  });

  it("never pays below the feed-in tariff for an amber evening export", () => {
    // Late peak hours fall under the FiT (NSW hour 4 is 2.1c against a 5c FiT),
    // and no household would export below its floor.
    for (const state of ["NSW", "VIC", "QLD", "SA", "AUS"] as StateCode[]) {
      const diag = wholeHomeBatteryDiagnostics({
        ...REF, state, tariff: "amber", solarScenario: "solar_optimised",
      });
      if (diag.headroomKwhPerYear <= 0) continue;
      expect(diag.eveningExportPriceKwh).toBeGreaterThanOrEqual(diag.fitPriceKwh - 1e-9);
    }
  });
});
