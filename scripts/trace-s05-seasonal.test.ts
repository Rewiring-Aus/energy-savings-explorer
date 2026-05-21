// Per-season battery model trace for S05 (AUS / 15yr cash / solar_optimised).
// Mirrors R's sb$battery_seasonal so the two can be diffed row-by-row.

import { describe, it } from "vitest";
import {
  DEFAULT_INPUTS,
  HouseInputs,
  seasonalBatteryTrace,
} from "../src/comparison/model";

const SOLAR_KW = 10;
const BATTERY_KWH = 15;

describe("S05 seasonal battery trace", () => {
  it("dumps per-season battery rows", () => {
    const inputs: HouseInputs = {
      ...DEFAULT_INPUTS,
      finance: false,
      solarScenario: "solar_optimised",
    };
    const rows = seasonalBatteryTrace(inputs, SOLAR_KW, BATTERY_KWH);
    console.log("===TS_S05_SEASONAL===");
    console.log("season,solar_mult,daily_solar_kwh,appliance_solar_kwh,load_met_by_solar_kwh,stored_solar_kwh,export_kwh,arbitrage_headroom_kwh,battery_to_home_kwh");
    for (const r of rows) {
      console.log(
        [
          r.season,
          r.solar_multiplier.toFixed(4),
          r.daily_solar_generation_kwh.toFixed(4),
          r.appliance_solar_kwh.toFixed(4),
          r.load_met_by_solar_kwh.toFixed(4),
          r.stored_solar_kwh.toFixed(4),
          r.export_kwh.toFixed(4),
          r.arbitrage_headroom_kwh.toFixed(4),
          r.battery_to_home_kwh.toFixed(4),
        ].join(","),
      );
    }
    console.log("===END===");
  });
});
