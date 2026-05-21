// One-off diagnostic — dumps every component of the TS chart-1 electric
// total for S03 (AUS / 15yr cash / solar) so the per-segment values can
// be diffed against the R sb_summary. Run:
//   npx vitest run scripts/trace-s03.test.ts

import { describe, it } from "vitest";
import {
  DEFAULT_INPUTS,
  evaluateAllElectricHouse,
  HouseInputs,
  solarBatteryCapex,
  solarBatteryEnergyFlows,
  wholeHomeBatteryDiagnostics,
} from "../src/comparison/model";
import {
  APPLIANCE_CAPEX,
  BATTERY_COST_PER_KWH,
  BATTERY_INSTALLATION_COST,
  FIT_BY_STATE,
  FUEL_PRICES,
  INVERTER_REPLACEMENT_COST,
  SOLAR_PV_COST_PER_KW,
  SWITCHBOARD_UPGRADE_CAPEX,
  VEHICLE_OPTION_DATA,
  VPP_ANNUAL_BENEFIT,
} from "../src/comparison/data";

const SOLAR_KW = 10;
const BATTERY_KWH = 15;

describe("S03 trace (AUS / 15yr cash / solar)", () => {
  it("dumps every cost+credit component", () => {
    const inputs: HouseInputs = {
      ...DEFAULT_INPUTS,
      finance: false,
      solarScenario: "solar",
    };
    const elec = evaluateAllElectricHouse(inputs);
    const flows = solarBatteryEnergyFlows(inputs, SOLAR_KW, BATTERY_KWH);
    const diag = wholeHomeBatteryDiagnostics(inputs);
    const sbCapex = solarBatteryCapex(inputs.state, SOLAR_KW, BATTERY_KWH, 15);
    const fit = FIT_BY_STATE[inputs.state];
    const retail = FUEL_PRICES[inputs.state]!.electricity!.forecast15yr;
    const fitExportPerYear     = flows.fitExportKwhYr * fit;
    const batteryToHomePerYear = flows.batteryToHomeKwhYr * retail;
    const headroomPerYear      = diag.wholesaleAnnualValue;
    const elecSupplyAnnual     = FUEL_PRICES[inputs.state]!.electricity!.daily15yr * 365;

    const applianceCapex =
      APPLIANCE_CAPEX.spaceHeatingHeatPump +
      APPLIANCE_CAPEX.waterHeatingHeatPump +
      APPLIANCE_CAPEX.cooktopInduction +
      SWITCHBOARD_UPGRADE_CAPEX;
    const vehicleCapex = VEHICLE_OPTION_DATA[inputs.vehicleOption].evCapex * inputs.vehicles;
    const pvCapex = SOLAR_PV_COST_PER_KW[inputs.state] * SOLAR_KW + INVERTER_REPLACEMENT_COST;
    const batteryCapex = BATTERY_COST_PER_KWH * BATTERY_KWH + BATTERY_INSTALLATION_COST;
    const totalCapex = applianceCapex + vehicleCapex + pvCapex + batteryCapex;

    console.log("===TS_S03_TRACE===");
    console.log("applianceCapex (HP+HW+ind+switchboard) =", Math.round(applianceCapex));
    console.log("vehicleCapex (1.8 × BYD Dolphin EV)    =", Math.round(vehicleCapex));
    console.log("pvCapex (PV + replacement inverter)    =", Math.round(pvCapex));
    console.log("batteryCapex (15 kWh + install)        =", Math.round(batteryCapex));
    console.log("solarBatteryCapex() (sanity)           =", Math.round(sbCapex));
    console.log("totalCapex                             =", Math.round(totalCapex));
    console.log("");
    console.log("HouseCost.capital                      =", Math.round(elec.capital));
    console.log("HouseCost.interest                     =", Math.round(elec.interest));
    console.log("HouseCost.electricity (net of credit)  =", Math.round(elec.electricity));
    console.log("HouseCost.total                        =", Math.round(elec.total));
    console.log("");
    console.log("--- annualised flows ---");
    console.log("solarGenerationKwhYr   =", Math.round(flows.solarGenerationKwhYr));
    console.log("solarSelfConsumedKwhYr =", Math.round(flows.solarSelfConsumedKwhYr));
    console.log("batteryToHomeKwhYr     =", Math.round(flows.batteryToHomeKwhYr));
    console.log("fitExportKwhYr         =", Math.round(flows.fitExportKwhYr));
    console.log("headroomKwhYr          =", Math.round(flows.headroomKwhYr));
    console.log("");
    console.log("--- per-year $ values ---");
    console.log("fitExportPerYear ($)       =", Math.round(fitExportPerYear));
    console.log("batteryToHomePerYear ($)   =", Math.round(batteryToHomePerYear));
    console.log("headroom wholesalePerYear  =", Math.round(headroomPerYear));
    console.log("elecSupplyAnnual           =", Math.round(elecSupplyAnnual));
    console.log("VPP_ANNUAL_BENEFIT (unused)=", VPP_ANNUAL_BENEFIT);
    console.log("fit $/kWh                  =", fit);
    console.log("retail $/kWh (15yr fcst)   =", retail);
    console.log("===END===");
  });
});
