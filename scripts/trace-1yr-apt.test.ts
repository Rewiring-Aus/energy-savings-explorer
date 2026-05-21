// Diagnostic: dump 1-year all-electric running costs for house vs apartment
// across all three solar scenarios so we can see what's included and where
// the credit floor bites.

import { describe, it } from "vitest";
import {
  compareHouses,
  DEFAULT_INPUTS,
  evaluateAllElectricHouse,
  HouseInputs,
  SolarScenario,
  solarBatteryEnergyFlows,
  WHOLE_HOME_SOLAR_KW,
  WHOLE_HOME_BATTERY_KWH,
} from "../src/comparison/model";
import { FIT_BY_STATE, FUEL_PRICES } from "../src/comparison/data";

function dump(label: string, inputs: HouseInputs) {
  const elec = evaluateAllElectricHouse(inputs);
  const flows = solarBatteryEnergyFlows(inputs, WHOLE_HOME_SOLAR_KW, WHOLE_HOME_BATTERY_KWH);
  const fit = FIT_BY_STATE[inputs.state];
  const retail = FUEL_PRICES[inputs.state]!.electricity!.current;
  const supply = FUEL_PRICES[inputs.state]!.electricity!.dailyToday;
  const fitYr = flows.fitExportKwhYr * fit;
  const btoh = flows.batteryToHomeKwhYr * retail;
  console.log(`--- ${label} ---`);
  console.log(`  electricity total: $${elec.electricity.toFixed(2)}`);
  console.log(`  capital / interest: $${elec.capital.toFixed(2)} / $${elec.interest.toFixed(2)}`);
  console.log(`  -- breakdown of the gross electricity bill (before credits) --`);
  console.log(`    supply $/yr   : $${(supply * 365).toFixed(2)} (= $${supply}/day × 365)`);
  console.log(`    PV gen kWh/yr : ${flows.solarGenerationKwhYr.toFixed(0)}`);
  console.log(`    consumption   : ${flows.consumptionKwhYr.toFixed(0)} kWh/yr`);
  console.log(`    self-consumed : ${flows.solarSelfConsumedKwhYr.toFixed(0)} kWh/yr`);
  console.log(`    battery→home  : ${flows.batteryToHomeKwhYr.toFixed(0)} kWh/yr`);
  console.log(`    FiT export    : ${flows.fitExportKwhYr.toFixed(0)} kWh/yr × $${fit.toFixed(4)} = $${fitYr.toFixed(2)}/yr`);
  console.log(`    battery→home credit @ retail: $${btoh.toFixed(2)}/yr`);
}

describe("1-year all-electric running cost trace", () => {
  it("dumps house + apartment for each solar scenario", () => {
    const scenarios: SolarScenario[] = ["grid_only", "solar", "solar_optimised"];
    for (const s of scenarios) {
      console.log(`\n========== solarScenario = ${s} ==========`);
      dump(
        "House (2.7 occ, 1.8 BYD, 1-yr cash)",
        { ...DEFAULT_INPUTS, period: "1year", finance: false, solarScenario: s },
      );
      dump(
        "Apartment (1 occ, 1.8 BYD, 1-yr cash)",
        { ...DEFAULT_INPUTS, period: "1year", finance: false, solarScenario: s, dwelling: "apartment", occupants: 1 },
      );
    }
  });
});
