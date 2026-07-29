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
  FIT_BY_STATE,
  HEATER_COUNT_BY_STATE,
  INVERTER_REPLACEMENT_COST,
  SOLAR_PV_COST_PER_KW,
  SWITCHBOARD_UPGRADE_CAPEX,
  VEHICLE_OPTION_DATA,
} from "../src/comparison/data";
import { getTariffSpec, vehicleEntries } from "../src/comparison/model";

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
    // Displaced grid kWh are worth the TARIFF's import rate, not the flat
    // "electricity" row — and the supply charge comes from the tariff too.
    const spec = getTariffSpec(inputs.tariff, inputs.state, inputs.period);
    const fitExportPerYear     = flows.fitExportKwhYr * fit;
    const batteryToHomePerYear = flows.batteryToHomeKwhYr * spec.importDolKwh;
    const batteryToEvPerYear   = flows.batteryToEvKwhYr * spec.evDolKwh;
    const eveningExportPerYear = diag.eveningExportAnnualValue;
    const elecSupplyAnnual     = spec.dailyCharge * 365;

    // Heating capex scales by the state's typical heater count.
    const applianceCapex =
      APPLIANCE_CAPEX.spaceHeatingHeatPump * HEATER_COUNT_BY_STATE[inputs.state] +
      APPLIANCE_CAPEX.waterHeatingHeatPump +
      APPLIANCE_CAPEX.cooktopInduction +
      SWITCHBOARD_UPGRADE_CAPEX;
    const vehicleCapex = vehicleEntries(inputs).reduce(
      (sum, e) => sum + VEHICLE_OPTION_DATA[e.option].evCapex * e.weight, 0);
    const pvCapex = SOLAR_PV_COST_PER_KW[inputs.state] * SOLAR_KW + INVERTER_REPLACEMENT_COST;
    // No install charge: the crew is already on site for the PV.
    const batteryCapex = BATTERY_COST_PER_KWH * BATTERY_KWH;
    const totalCapex = applianceCapex + vehicleCapex + pvCapex + batteryCapex;

    console.log("===TS_S03_TRACE===");
    console.log("applianceCapex (HP+HW+ind+switchboard) =", Math.round(applianceCapex));
    console.log("vehicleCapex (household EV fleet)      =", Math.round(vehicleCapex));
    console.log("pvCapex (PV + replacement inverter)    =", Math.round(pvCapex));
    console.log("batteryCapex (15 kWh, no install)      =", Math.round(batteryCapex));
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
    console.log("batteryToEvKwhYr       =", Math.round(flows.batteryToEvKwhYr));
    console.log("freeWindowKwhYr        =", Math.round(flows.freeWindowKwhYr));
    console.log("fitExportKwhYr         =", Math.round(flows.fitExportKwhYr));
    console.log("headroomKwhYr          =", Math.round(flows.headroomKwhYr));
    console.log("");
    console.log("--- per-year $ values ---");
    console.log("fitExportPerYear ($)       =", Math.round(fitExportPerYear));
    console.log("batteryToHomePerYear ($)   =", Math.round(batteryToHomePerYear));
    console.log("batteryToEvPerYear ($)     =", Math.round(batteryToEvPerYear));
    console.log("eveningExportPerYear ($)   =", Math.round(eveningExportPerYear));
    console.log("elecSupplyAnnual           =", Math.round(elecSupplyAnnual));
    console.log("");
    console.log("tariff (requested -> used) =", inputs.tariff, "->", spec.tariff);
    console.log("fit $/kWh                  =", fit);
    console.log("import $/kWh (from tariff)  =", spec.importDolKwh);
    console.log("===END===");
  });
});
