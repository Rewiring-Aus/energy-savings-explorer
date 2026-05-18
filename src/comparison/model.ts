// All-gas vs all-electric household cost comparison.
// Ported from energy_savings_model.R (Energy Savings Model 2026).

import {
  APARTMENT_ENERGY_FACTOR,
  APPLIANCE_CAPEX,
  BATTERY_COST_PER_KWH,
  BATTERY_DEGRADATION_15YR_AVG,
  BATTERY_DEGRADATION_1YR,
  BATTERY_HOUSEHOLD_SAFEGUARD_PCT,
  BATTERY_INSTALLATION_COST,
  BATTERY_ROUND_TRIP_EFFICIENCY,
  BATTERY_USEABLE_CAPACITY_PCT,
  BatterySizeKwh,
  DrivingLevel,
  ENERGY_USE,
  EV_DEDICATED_DOL_KWH,
  FAST_CHARGE_FRACTION,
  FIT_BY_STATE,
  Fuel,
  FUEL_PRICES,
  INVERTER_KW,
  LARGE_SYSTEM_INVERTER_KW,
  LARGE_SYSTEM_SOLAR_KWP,
  kmPerDay,
  OTHER_ELEC_KWH_DAY,
  Season,
  SEASONAL_PEAK_PRICES,
  SEASONS,
  SEASONAL_SOLAR_WEIGHTS,
  SOLAR_DAILY_KWH_PER_KW,
  SOLAR_LCOE_BY_STATE,
  SOLAR_PV_COST_PER_KW,
  SolarSizeKw,
  STATES,
  StateCode,
  SWITCHBOARD_UPGRADE_CAPEX,
  VEHICLE_CAPEX_NEW,
  VEHICLE_EFFICIENCY_WH_KM,
  VehicleClass,
  VehicleOption,
  VEHICLE_OPTION_DATA,
  VPP_ANNUAL_BENEFIT,
  getScalingFactor,
} from "./data";

export type Period = "1year" | "15year";
export type DwellingType = "house" | "apartment";
export type SolarScenario = "grid_only" | "solar" | "solar_optimised";

// Per-appliance share of electricity met directly from on-site solar, keyed
// by household scenario. Mirrors energy_savings_model.R SOLAR_FRACTION_TABLE.
// "other" covers lighting/fridge/electronics — assumed 0% (poor daytime overlap).
// "waterHeatingResistance" is the appliance-type override row in R: electric
// tank has narrower solar overlap than heat pump (shorter, evening-skewed
// draws) but responds well to a timer under load-shifting.
interface SolarFractionByAppliance {
  spaceHeating: number;
  waterHeating: number;             // heat pump (default row in R)
  waterHeatingResistance: number;   // override for "Electric resistance"
  spaceCooling: number;
  cooktop: number;
  vehicles: number;
  other: number;
}

// "other" covers the bundled "Other Cooking" + "Other Electronics" rows from
// the R SOLAR_FRACTION_TABLE. Both R rows hold a flat 1/3 across Solar /
// Solar optimised (refrigeration is 24/7, but daytime washing / dishwashers /
// microwave realistically pulls about a third of that load through the
// solar window).
const OTHER_FRAC_SOLAR = 1 / 3;
export const SOLAR_FRACTION_BY_SCENARIO: Record<SolarScenario, SolarFractionByAppliance> = {
  grid_only:       { spaceHeating: 0,    waterHeating: 0,    waterHeatingResistance: 0,    spaceCooling: 0,    cooktop: 0,    vehicles: 0,    other: 0 },
  solar:           { spaceHeating: 0.15, waterHeating: 0.50, waterHeatingResistance: 0.30, spaceCooling: 0.40, cooktop: 0.10, vehicles: 0.20, other: OTHER_FRAC_SOLAR },
  solar_optimised: { spaceHeating: 0.30, waterHeating: 0.85, waterHeatingResistance: 0.70, spaceCooling: 0.65, cooktop: 0.10, vehicles: 0.45, other: OTHER_FRAC_SOLAR },
};

// Solar PV capex is now sized: state-specific $/kW × system kW (matches the
// per-state Tipping point CSV row "Solar PV cost per kW"). Chart 1 uses the
// fixed WHOLE_HOME_SOLAR_KW below; chart 2 uses the user's solar-size toggle.
// The inverter replacement at year 12 is unchanged.
export const INVERTER_REPLACEMENT_COST = 1800;
export const INVERTER_REPLACEMENT_YEAR = 12;

// Whole-home chart assumes a typical household solar+battery setup whenever
// the user is on "solar" or "solar_optimised" — a 10 kW PV array (capex
// priced at the state's $/kW from SOLAR_PV_COST_PER_KW) and a 12 kWh
// battery. The battery export credit is what makes the "Battery export"
// toggle on chart 1 meaningful.
export const WHOLE_HOME_SOLAR_KW = 10;
export const WHOLE_HOME_BATTERY_KWH = 15;

// How the home battery's exports are valued. "Self-consume" assumes any
// stored solar that can't be self-consumed is exported at the FiT (no VPP /
// arbitrage). "VPP" adds a flat annual benefit (VPP_ANNUAL_BENEFIT) for VPP
// membership. "Wholesale" values the battery's evening-peak
// export headroom at the median 4–8 pm wholesale price (median of
// evening_peak_prices_annual.csv).
export type BatteryValueMode = "self_consume" | "vpp" | "wholesale";

// Tariff applied to home-charged EV kWh (the non-fast-charge, non-solar
// portion). "ev" → dedicated EV plan at EV_DEDICATED_DOL_KWH (flat 8c/kWh).
// "off_peak" → the household's standard off-peak retail rate. Fast-charge
// kWh are always at the public DC rate regardless of this setting.
export type EvTariff = "ev" | "off_peak";

export interface HouseInputs {
  state: StateCode;
  occupants: number;
  vehicles: number;
  vehicleOption: VehicleOption;
  drivingLevel: DrivingLevel;
  dwelling: DwellingType;
  finance: boolean;
  period: Period;
  loanRate: number;
  loanTerm: number;
  solarScenario: SolarScenario;
  batteryValue: BatteryValueMode;
  evTariff: EvTariff;
}

export const DEFAULT_INPUTS: HouseInputs = {
  state: "AUS",
  occupants: 2.7,         // Australian Census average
  vehicles: 1.8,          // ABS vehicles-per-household average
  vehicleOption: "byd_dolphin",
  drivingLevel: "middle", // state-average km/day (R model default)
  dwelling: "house",
  finance: false,
  period: "15year",
  loanRate: 0.07,         // matches R evaluate_household() loan_rate default
  loanTerm: 10,
  solarScenario: "grid_only",
  batteryValue: "wholesale",
  evTariff: "ev",
};

// Per-kWh price of home-charged EV kWh (after solar self-consumption).
// "ev"      → flat dedicated EV plan (EV_DEDICATED_DOL_KWH, no CPI).
// "off_peak" → the household's standard off-peak retail rate.
function evHomeChargePriceKwh(state: StateCode, period: Period, evTariff: EvTariff): number {
  if (evTariff === "ev") return EV_DEDICATED_DOL_KWH;
  return priceFor(state, "electricity_off_peak", period).kwh;
}

export interface HouseCost {
  capital: number;     // $ — capex paid (cash) or principal portion of loan repayments
  interest: number;    // $ — interest portion of loan repayments (0 if cash)
  gas: number;         // $ — gas/LPG appliance opex over the period
  petrol: number;      // $ — petrol/diesel vehicle opex over the period
  electricity: number; // $ — electricity opex over the period
  total: number;
}

export interface ComparisonResult {
  gas: HouseCost;
  electric: HouseCost;
  years: number;
}

// Annuity: equal annual payment that fully amortises `principal` at `rate`
// over `termYears`. Mirrors the R helper annual_loan_payment().
function annualLoanPayment(principal: number, rate: number, termYears: number): number {
  if (principal <= 0) return 0;
  const mr = rate / 12;
  const n = termYears * 12;
  const monthly = (principal * mr) / (1 - Math.pow(1 + mr, -n));
  return monthly * 12;
}

// 1-year view uses today's prices; 15-year view uses the 15-year forecast
// average. The 1-year mode is intended as a snapshot of running costs at
// current rates, so it skips capex and finance entirely (see callers).
function priceFor(state: StateCode, fuel: keyof NonNullable<(typeof FUEL_PRICES)[StateCode]>, period: Period) {
  const row = FUEL_PRICES[state]?.[fuel];
  if (!row) return { kwh: 0, daily: 0 };
  if (period === "1year") return { kwh: row.current, daily: row.dailyToday };
  return { kwh: row.forecast15yr, daily: row.daily15yr };
}

function energy(category: string, type: string, state: StateCode): number {
  return ENERGY_USE[`${category}|${type}`]?.[state] ?? 0;
}

// Per-appliance LCOE charge for self-consumed solar kWh — mirrors R
// evaluate_option(solar_marginal_cost = TRUE). The single-appliance view
// doesn't track the PV system separately, so we amortise the panels' capex
// into the appliance opex at the levelised cost of generation. There is no
// "forgone FiT" component: the FiT flow is independent and only applies to
// kWh that are actually exported (R model L817).
//
// Whole-house callers (evaluateAllElectricHouse / evaluateAllGasHouse) do not
// use this — they track the PV system capex once via solarSystemCapex() and
// treat self-consumed kWh as free at the appliance level (R L1380-1388).
function solarLcoeCost(state: StateCode, solarKwhDay: number, years: number): number {
  if (solarKwhDay <= 0) return 0;
  const lcoe = SOLAR_LCOE_BY_STATE[state] ?? 0;
  return solarKwhDay * 365 * lcoe * years;
}

// Does this state have reticulated natural gas available?
// Fuel prices CSV has no gas row for NT.
function hasNaturalGas(state: StateCode): boolean {
  return FUEL_PRICES[state]?.gas !== undefined;
}

// PV system capex over the analysis horizon: state-specific $/kW × system kW
// plus one inverter replacement if the horizon reaches year 12. Returns 0
// under grid_only. Mirrors solarBatteryCapex() so chart 1 and chart 2 use
// the same per-state hardware pricing.
function solarSystemCapex(
  state: StateCode,
  solarKw: number,
  scenario: SolarScenario,
  years: number,
): number {
  if (scenario === "grid_only") return 0;
  const pv = SOLAR_PV_COST_PER_KW[state] * solarKw;
  const replacement = years >= INVERTER_REPLACEMENT_YEAR ? INVERTER_REPLACEMENT_COST : 0;
  return pv + replacement;
}

// Capex amortises over the 15-year product lifetime: the 1-year view shows
// the annual share (capex/15), the 15-year view shows the full capex.
// When financed, splits each repayment into a (proportional) principal share
// and an interest share so the chart can render them separately.
function computeCapitalAndInterest(
  totalCapex: number,
  inputs: HouseInputs,
  years: number,
): { capital: number; interest: number } {
  if (inputs.finance && totalCapex > 0) {
    const annual = annualLoanPayment(totalCapex, inputs.loanRate, inputs.loanTerm);
    const loanYears = Math.min(years, inputs.loanTerm);
    const totalRepayment = annual * loanYears;
    const principalRepaid = totalCapex * (loanYears / inputs.loanTerm);
    return { capital: principalRepaid, interest: totalRepayment - principalRepaid };
  }
  const capexDivisor = years === 1 ? 15 : 1;
  return { capital: totalCapex / capexDivisor, interest: 0 };
}

// Resolve the vehicle class used for energy/efficiency lookups. Falls back to
// SUV for the "no_car" case (it's never read since vehicleCount becomes 0).
function vehicleClassFromOption(option: VehicleOption): VehicleClass {
  return VEHICLE_OPTION_DATA[option].class ?? "suv";
}

// Number of vehicles to count toward energy + capex. "no_car" overrides the
// numeric vehicles input — picking "No car" zeroes vehicles regardless of
// what the count toggle says.
function effectiveVehicleCount(inputs: HouseInputs): number {
  return inputs.vehicleOption === "no_car" ? 0 : inputs.vehicles;
}

export function evaluateAllGasHouse(inputs: HouseInputs): HouseCost {
  const { state, occupants, dwelling, period, vehicleOption, drivingLevel } = inputs;
  const occScale = getScalingFactor(occupants);
  const dwScale = dwelling === "apartment" ? APARTMENT_ENERGY_FACTOR : 1;
  const years = period === "1year" ? 1 : 15;
  const days = 365 * years;
  const vehicleCount = effectiveVehicleCount(inputs);
  const vClass = vehicleClassFromOption(vehicleOption);
  const km = kmPerDay(state, drivingLevel);

  // NT falls back to LPG (no reticulated gas). Everywhere else uses natural gas.
  const fossil = hasNaturalGas(state) ? "gas" : "lpg";
  const fossilLabelForEnergy = fossil === "gas" ? "Natural gas" : "LPG";
  const fossilCapexHeating = fossil === "gas" ? APPLIANCE_CAPEX.spaceHeatingGas : APPLIANCE_CAPEX.spaceHeatingLpg;
  const fossilCapexWater   = fossil === "gas" ? APPLIANCE_CAPEX.waterHeatingGas : APPLIANCE_CAPEX.waterHeatingLpg;
  const fossilCapexCooktop = fossil === "gas" ? APPLIANCE_CAPEX.cooktopGas       : APPLIANCE_CAPEX.cooktopLpg;

  // Fossil-fuel appliance demand (kWh/day)
  const heatingKwh  = energy("Space Heating", fossilLabelForEnergy, state) * occScale * dwScale;
  const waterKwh    = energy("Water Heating", fossilLabelForEnergy, state) * occScale * dwScale;
  const cooktopKwh  = energy("Cooktop",       fossilLabelForEnergy, state) * occScale * dwScale;
  const fossilDemand = heatingKwh + waterKwh + cooktopKwh;

  // Always-electric loads (no solar in the gas baseline regardless of the
  // user's scenario toggle — mirrors R evaluate_household, where the Gas
  // scenario is pinned to solar = "grid_only" and never installs a PV array).
  const otherKwh   = OTHER_ELEC_KWH_DAY[state] * occScale * dwScale;
  const coolingKwh = energy("Space Cooling", "Heat pump", state) * occScale * dwScale;
  const elecDemand = otherKwh + coolingKwh;

  // Vehicles — ICE (uses petrol price)
  const iceKwhDay = vehicleCount > 0
    ? (VEHICLE_EFFICIENCY_WH_KM[vClass].ice * km) / 1000 * vehicleCount
    : 0;

  const fossilPrice = priceFor(state, fossil, period);
  const elecPrice   = priceFor(state, "electricity", period);
  const petrolPrice = priceFor(state, "petrol", period);

  const gasVolumeCost    = fossilDemand * 365 * fossilPrice.kwh * years;
  const gasSupplyCost    = fossilDemand > 0 ? fossilPrice.daily * days : 0;
  const petrolVolumeCost = iceKwhDay * 365 * petrolPrice.kwh * years;
  const elecVolumeCost   = elecDemand * 365 * elecPrice.kwh * years;
  const elecSupplyCost   = elecPrice.daily * days;

  const gas         = gasVolumeCost + gasSupplyCost;
  const petrol      = petrolVolumeCost;
  const electricity = elecVolumeCost + elecSupplyCost;

  const applianceCapex = fossilCapexHeating + fossilCapexWater + fossilCapexCooktop;
  const vehicleCapex   = vehicleCount > 0
    ? VEHICLE_OPTION_DATA[vehicleOption].iceCapex * vehicleCount
    : 0;
  const totalCapex     = applianceCapex + vehicleCapex;

  // 1-year view is operating-cost only at current prices (no capex, no finance).
  const { capital, interest } = period === "1year"
    ? { capital: 0, interest: 0 }
    : computeCapitalAndInterest(totalCapex, inputs, years);

  return {
    capital,
    interest,
    gas,
    petrol,
    electricity,
    total: capital + interest + gas + petrol + electricity,
  };
}

export function evaluateAllElectricHouse(inputs: HouseInputs): HouseCost {
  const { state, occupants, dwelling, period, solarScenario, vehicleOption, drivingLevel } = inputs;
  const occScale = getScalingFactor(occupants);
  const dwScale = dwelling === "apartment" ? APARTMENT_ENERGY_FACTOR : 1;
  const years = period === "1year" ? 1 : 15;
  const days = 365 * years;
  const vehicleCount = effectiveVehicleCount(inputs);
  const vClass = vehicleClassFromOption(vehicleOption);
  const km = kmPerDay(state, drivingLevel);

  const heatingKwh = energy("Space Heating", "Electric heat pump", state) * occScale * dwScale;
  const coolingKwh = energy("Space Cooling", "Heat pump",          state) * occScale * dwScale;
  const waterKwh   = energy("Water Heating", "Electric heat pump", state) * occScale * dwScale;
  const cooktopKwh = energy("Cooktop",       "Electric induction", state) * occScale * dwScale;
  const otherKwh   = OTHER_ELEC_KWH_DAY[state] * occScale * dwScale;

  // EV charging — split into home-charged (eligible for solar, priced at the
  // off-peak retail rate) and public DC fast-charged (no solar, no supply
  // charge, priced at the fast-charge rate). Mirrors R FAST_CHARGE_FRACTION.
  const evTotalKwhDay = vehicleCount > 0
    ? (VEHICLE_EFFICIENCY_WH_KM[vClass].electric * km) / 1000 * vehicleCount
    : 0;
  const evFastKwhDay  = evTotalKwhDay * FAST_CHARGE_FRACTION;
  const evHomeKwhDay  = evTotalKwhDay - evFastKwhDay;

  const elecPrice        = priceFor(state, "electricity", period);
  const evHomePriceKwh   = evHomeChargePriceKwh(state, period, inputs.evTariff);
  const fastChargePrice  = priceFor(state, "ev_fast_charge", period);

  // Solar only applies to home-charged EV kWh (R: fast-charge kWh leave the
  // home meter entirely so can't be served from rooftop solar).
  //
  // Bottom-up cap: the per-appliance solar fractions describe daytime *demand*
  // for solar; actual self-consumption can't exceed what the PV system
  // generates that day. When aggregate demand exceeds generation we scale
  // every fraction down proportionally — same approach as R
  // get_household_self_sufficiency()'s solar_scale_factor.
  const frac = SOLAR_FRACTION_BY_SCENARIO[solarScenario];
  const solarDemandKwhDay =
    heatingKwh   * frac.spaceHeating +
    coolingKwh   * frac.spaceCooling +
    waterKwh     * frac.waterHeating +
    cooktopKwh   * frac.cooktop +
    otherKwh     * frac.other +
    evHomeKwhDay * frac.vehicles;
  const pvDailyKwh = SOLAR_DAILY_KWH_PER_KW[state] * WHOLE_HOME_SOLAR_KW;
  const solarScale = solarScenario === "grid_only" || solarDemandKwhDay === 0
    ? 1
    : solarDemandKwhDay > pvDailyKwh
      ? pvDailyKwh / solarDemandKwhDay
      : 1;
  const solarKwhDay = solarDemandKwhDay * solarScale;
  const evSolarKwhDay = evHomeKwhDay * frac.vehicles * solarScale;
  // Non-EV electric loads (heating/cooling/water/cooktop/other) priced at flat
  // retail; EV home charging priced at off-peak. Self-consumed solar reduces
  // the *retail-priced* portion only (the load it physically displaces is
  // daytime appliance use, not the overnight EV).
  const nonEvElecKwhDay  = heatingKwh + coolingKwh + waterKwh + cooktopKwh + otherKwh;
  const nonEvSolarKwhDay = solarKwhDay - evSolarKwhDay;
  const nonEvGridKwhDay  = Math.max(nonEvElecKwhDay - nonEvSolarKwhDay, 0);
  const evHomeGridKwhDay = Math.max(evHomeKwhDay - evSolarKwhDay, 0);

  const elecRetailCost   = nonEvGridKwhDay   * 365 * elecPrice.kwh       * years;
  const evHomeChargeCost = evHomeGridKwhDay  * 365 * evHomePriceKwh      * years;
  const evFastChargeCost = evFastKwhDay      * 365 * fastChargePrice.kwh * years;
  const elecSupplyCost   = elecPrice.daily * days;

  // --- Solar + battery credits (chart 1) ---
  // Mirrors R evaluate_solar_battery, which always adds three streams to the
  // household total regardless of any user toggle:
  //   - FiT on daytime excess solar export
  //   - Evening battery → home discharge (stored solar serving appliance load),
  //     valued at retail
  //   - Battery export headroom — valuation depends on the batteryValue mode:
  //       self_consume → 0 (battery rolls over instead of exporting)
  //       vpp          → flat VPP_ANNUAL_BENEFIT
  //       wholesale    → tiered seasonal evening-peak schedule
  // Daytime self-consumption itself is already credited above via the solar-
  // fraction grid-kWh reduction (so we don't add solarSelfConsumedKwh here —
  // would double-count).
  let batteryCredit = 0;
  let batteryCapex = 0;
  if (solarScenario !== "grid_only") {
    const flows = annualBatteryFlows(inputs, WHOLE_HOME_SOLAR_KW, WHOLE_HOME_BATTERY_KWH, years);
    const fit = FIT_BY_STATE[state] ?? 0;
    const fitExportPerYear     = flows.exportKwh * fit;
    const batteryToHomePerYear = flows.batteryDischargeKwh * elecPrice.kwh;
    let headroomPerYear = 0;
    switch (inputs.batteryValue) {
      case "self_consume": headroomPerYear = 0; break;
      case "vpp":          headroomPerYear = VPP_ANNUAL_BENEFIT; break;
      case "wholesale":    headroomPerYear = tieredHeadroomAnnualValue(state, flows, WHOLE_HOME_SOLAR_KW); break;
    }
    batteryCredit = (fitExportPerYear + batteryToHomePerYear + headroomPerYear) * years;
    batteryCapex = BATTERY_COST_PER_KWH * WHOLE_HOME_BATTERY_KWH + BATTERY_INSTALLATION_COST;
  }

  const applianceCapex = APPLIANCE_CAPEX.spaceHeatingHeatPump +
                         APPLIANCE_CAPEX.waterHeatingHeatPump +
                         APPLIANCE_CAPEX.cooktopInduction +
                         SWITCHBOARD_UPGRADE_CAPEX;
  const vehicleCapex   = vehicleCount > 0
    ? VEHICLE_OPTION_DATA[vehicleOption].evCapex * vehicleCount
    : 0;
  const pvCapex        = solarSystemCapex(state, WHOLE_HOME_SOLAR_KW, solarScenario, years);
  // PV + battery capex are always treated as cash, even under the loan toggle.
  // Mirrors R evaluate_household: `total_solar_capex` and `scen_battery_capex`
  // are added directly to `total_cost`, not run through annual_loan_payment.
  // Only appliances + vehicles + switchboard are amortised via the loan.
  const financeableCapex = applianceCapex + vehicleCapex;
  const cashOnlyCapex    = pvCapex + batteryCapex;

  // 1-year view is operating-cost only at current prices (no capex, no finance).
  let capital = 0;
  let interest = 0;
  if (period !== "1year") {
    const fin = computeCapitalAndInterest(financeableCapex, inputs, years);
    capital  = fin.capital + cashOnlyCapex;
    interest = fin.interest;
  }

  // Battery credit reduces the electricity column. Keep it floored at 0 so
  // the chart doesn't render a negative segment.
  const electricity = Math.max(
    elecRetailCost + evHomeChargeCost + evFastChargeCost + elecSupplyCost - batteryCredit,
    0,
  );
  return {
    capital,
    interest,
    gas: 0,
    petrol: 0,
    electricity,
    total: capital + interest + electricity,
  };
}

export function compareHouses(inputs: HouseInputs): ComparisonResult {
  return {
    gas: evaluateAllGasHouse(inputs),
    electric: evaluateAllElectricHouse(inputs),
    years: inputs.period === "1year" ? 1 : 15,
  };
}

// ---------------------------------------------------------------------------
// Single-appliance comparison — mirrors R evaluate_option() with proportional
// supply-charge attribution. Lets the UI chart alternative appliances within
// one function (e.g. gas heater vs heat pump) holding the rest of the
// household fixed.
// ---------------------------------------------------------------------------

export type ApplianceCategory = "Space Heating" | "Water Heating" | "Cooktop" | "Vehicles";

export interface ApplianceOption {
  value: string;   // energy-use CSV "Appliance Type" key
  label: string;   // display label
  fuel: Fuel;
  capex: number;   // installed cost per unit ($)
}

export const APPLIANCE_OPTIONS: Record<ApplianceCategory, ApplianceOption[]> = {
  "Space Heating": [
    { value: "Natural gas",         label: "Gas",               fuel: "gas",         capex: 1500 },
    { value: "LPG",                 label: "LPG",               fuel: "lpg",         capex: 1500 },
    { value: "Electric resistance", label: "Electric resistive",fuel: "electricity", capex: 220 },
    { value: "Electric heat pump",  label: "Heat pump (A/C)",   fuel: "electricity", capex: 3200 },
  ],
  "Water Heating": [
    { value: "Natural gas",         label: "Gas instant",       fuel: "gas",         capex: 1700 },
    { value: "LPG",                 label: "LPG instant",       fuel: "lpg",         capex: 1700 },
    { value: "Electric resistance", label: "Electric tank",     fuel: "electricity", capex: 2600 },
    { value: "Electric heat pump",  label: "Heat pump",         fuel: "electricity", capex: 3900 },
  ],
  Cooktop: [
    { value: "Natural gas",         label: "Gas",               fuel: "gas",         capex: 1200 },
    { value: "LPG",                 label: "LPG",               fuel: "lpg",         capex: 1200 },
    { value: "Electric resistance", label: "Electric",          fuel: "electricity", capex: 1000 },
    { value: "Electric induction",  label: "Induction",         fuel: "electricity", capex: 2200 },
  ],
  // Vehicle capex shown here is a fallback; evaluateSingleOption looks up the
  // option-specific price from VEHICLE_OPTION_DATA at runtime.
  Vehicles: [
    { value: "Petrol",   label: "Petrol", fuel: "petrol",      capex: VEHICLE_CAPEX_NEW.suv.ice },
    { value: "Diesel",   label: "Diesel", fuel: "diesel",      capex: VEHICLE_CAPEX_NEW.suv.ice },
    { value: "Electric", label: "EV",     fuel: "electricity", capex: VEHICLE_CAPEX_NEW.suv.ev },
  ],
};

// Options filtered for state availability (NT has no reticulated natural gas).
export function availableOptions(state: StateCode, category: ApplianceCategory): ApplianceOption[] {
  return APPLIANCE_OPTIONS[category].filter((opt) => {
    if (opt.fuel === "gas") return FUEL_PRICES[state]?.gas !== undefined;
    return true;
  });
}

// Proportional share of electricity supply charge attributable to a function,
// based on an all-electric household mix. Mirrors R get_elec_supply_share:
// vehicle contribution is (1 - FAST_CHARGE_FRACTION) × n_vehicles because
// public DC fast-charge kWh don't pass through the home meter and so don't
// pay into the home supply charge.
function getElecSupplyShare(
  state: StateCode,
  occupants: number,
  category: ApplianceCategory | "Other",
  includeVehicles: boolean,
  vClass: VehicleClass,
  drivingLevel: DrivingLevel,
  vehicleCount: number,
): number {
  const occScale = getScalingFactor(occupants);
  const heating = (energy("Space Heating", "Electric heat pump", state) +
                   energy("Space Cooling", "Heat pump", state)) * occScale;
  const water   = energy("Water Heating", "Electric heat pump", state) * occScale;
  const cooktop = energy("Cooktop",       "Electric induction", state) * occScale;
  const other   = OTHER_ELEC_KWH_DAY[state] * occScale;
  const vehicle = (VEHICLE_EFFICIENCY_WH_KM[vClass].electric * kmPerDay(state, drivingLevel)) / 1000
                  * (1 - FAST_CHARGE_FRACTION) * vehicleCount;

  let total = heating + water + cooktop + other;
  if (includeVehicles) total += vehicle;

  let thisUse = 0;
  switch (category) {
    case "Space Heating": thisUse = heating; break;
    case "Water Heating": thisUse = water; break;
    case "Cooktop":       thisUse = cooktop; break;
    case "Other":         thisUse = other; break;
    case "Vehicles":      thisUse = vehicle; break;
  }
  return total === 0 ? 0 : thisUse / total;
}

// Proportional share of gas supply charge attributable to a function (heating,
// water, cooktop) in an all-gas household.
function getGasSupplyShare(state: StateCode, occupants: number, category: ApplianceCategory): number {
  const occScale = getScalingFactor(occupants);
  const heating = energy("Space Heating", "Natural gas", state) * occScale;
  const water   = energy("Water Heating", "Natural gas", state) * occScale;
  const cooktop = energy("Cooktop",       "Natural gas", state) * occScale;
  const total = heating + water + cooktop;
  if (total === 0) return 0;
  switch (category) {
    case "Space Heating": return heating / total;
    case "Water Heating": return water   / total;
    case "Cooktop":       return cooktop / total;
    default:              return 0;
  }
}

export interface SingleOptionInputs {
  category: ApplianceCategory;
  option: ApplianceOption;
  period: Period;
  includeCapex: boolean;  // "total cost" vs "running cost only"
}

// Per-option unit assumptions for the "compare a single appliance" chart.
// We're showing what a typical setup costs for one of each appliance, not a
// whole household, so we assume:
//   - Resistive heaters: 2 units (small zone coverage; matches R model's
//     n_units=2 on the resistance row in compare_space_heating())
//   - All other heating types (gas, LPG, heat pump): 1 unit
//   - Water heating / cooktop: 1 unit
//   - Vehicles: 1 car (overrides the household's count)
const RESISTIVE_HEATING_UNITS = 2;
const SINGLE_OPTION_VEHICLE_COUNT = 1;

export function evaluateSingleOption(base: HouseInputs, single: SingleOptionInputs): HouseCost {
  const { state, occupants, dwelling, solarScenario, vehicleOption, drivingLevel } = base;
  const { category, option, period, includeCapex } = single;
  const occScale = getScalingFactor(occupants);
  const dwScale = dwelling === "apartment" ? APARTMENT_ENERGY_FACTOR : 1;
  const years = period === "1year" ? 1 : 15;
  const days = 365 * years;
  const vClass = vehicleClassFromOption(vehicleOption);

  // --- Energy (kWh/day) ---
  let energyKwhDay = 0;
  let coolingKwhDay = 0; // separate so we can apply cooling's solar fraction
  if (category === "Vehicles") {
    if (vehicleOption === "no_car") {
      // Household is set to "No car"; show zero so the savings box can prompt
      // the user to pick a vehicle.
      return { capital: 0, interest: 0, gas: 0, petrol: 0, electricity: 0, total: 0 };
    }
    const wh = option.fuel === "electricity"
      ? VEHICLE_EFFICIENCY_WH_KM[vClass].electric
      : VEHICLE_EFFICIENCY_WH_KM[vClass].ice;
    energyKwhDay = (wh * kmPerDay(state, drivingLevel)) / 1000 * SINGLE_OPTION_VEHICLE_COUNT;
  } else {
    energyKwhDay = energy(category, option.value, state) * occScale * dwScale;
    if (category === "Space Heating" && option.value === "Electric heat pump") {
      // Heat pump AC provides cooling too — add the cooling load
      coolingKwhDay = energy("Space Cooling", "Heat pump", state) * occScale * dwScale;
      energyKwhDay += coolingKwhDay;
    }
  }

  // --- EV fast-charge split (R FAST_CHARGE_FRACTION) ---
  // Only EVs split into home + fast-charge kWh. Fast-charge kWh are priced
  // at the public DC rate and aren't eligible for solar. Non-EV paths leave
  // these at 0 so the logic below collapses to the original behaviour.
  let homeKwhDay = energyKwhDay;
  let fastKwhDay = 0;
  if (category === "Vehicles" && option.fuel === "electricity") {
    fastKwhDay = energyKwhDay * FAST_CHARGE_FRACTION;
    homeKwhDay = energyKwhDay - fastKwhDay;
  }

  // --- Volume cost ---
  // Grid kWh: priced at the option's fuel rate (retail electricity for most;
  // off-peak for EV home charging, mirroring R ev_tariff = "home_off_peak").
  // Self-consumed solar kWh: priced at LCOE only (R solar_marginal_cost = TRUE).
  // No "forgone FiT" charge — FiT flow is independent and applies only to
  // actual exports (R L817-818).
  const price = priceFor(state, option.fuel, period);
  let solarKwhDay = 0;
  if (option.fuel === "electricity") {
    const frac = SOLAR_FRACTION_BY_SCENARIO[solarScenario];
    if (category === "Space Heating" && option.value === "Electric heat pump") {
      const heatingOnly = energyKwhDay - coolingKwhDay;
      solarKwhDay = heatingOnly * frac.spaceHeating + coolingKwhDay * frac.spaceCooling;
    } else if (category === "Space Heating") {
      solarKwhDay = energyKwhDay * frac.spaceHeating;
    } else if (category === "Water Heating") {
      // Electric resistance hot water has a narrower solar overlap than
      // heat pump (R model SOLAR_FRACTION_TABLE override row).
      const wFrac = option.value === "Electric resistance"
        ? frac.waterHeatingResistance
        : frac.waterHeating;
      solarKwhDay = energyKwhDay * wFrac;
    } else if (category === "Cooktop") {
      solarKwhDay = energyKwhDay * frac.cooktop;
    } else if (category === "Vehicles") {
      // Only home-charged kWh are eligible for solar.
      solarKwhDay = homeKwhDay * frac.vehicles;
    }
  }
  let volumeCost: number;
  if (category === "Vehicles" && option.fuel === "electricity") {
    // EV home charging — dedicated EV tariff or off-peak retail per the
    // household's evTariff toggle. Mirrors R ev_tariff "ev_dedicated" /
    // "home_off_peak".
    const homeGridKwhDay = homeKwhDay - solarKwhDay;
    const evHomePriceKwh = evHomeChargePriceKwh(state, period, base.evTariff);
    const fastPrice      = priceFor(state, "ev_fast_charge", period);
    volumeCost = homeGridKwhDay * 365 * evHomePriceKwh    * years
               + fastKwhDay     * 365 * fastPrice.kwh     * years
               + solarLcoeCost(state, solarKwhDay, years);
  } else {
    const gridKwhDay = energyKwhDay - solarKwhDay;
    volumeCost = gridKwhDay * 365 * price.kwh * years
               + solarLcoeCost(state, solarKwhDay, years);
  }

  // --- Supply charge (proportional, per R) ---
  // The all-electric denominator that drives the share uses the household's
  // actual vehicle count (mirrors R evaluate_option, which threads n_vehicles
  // through to get_elec_supply_share). The energy term itself stays at 1 car
  // — we're costing one of this appliance, not the whole fleet.
  let gasSupply = 0;
  let elecSupply = 0;
  if (option.fuel === "electricity") {
    const includeVeh = category === "Vehicles";
    const share = getElecSupplyShare(
      state, occupants, category, includeVeh, vClass, drivingLevel,
      effectiveVehicleCount(base),
    );
    const elecPrice = priceFor(state, "electricity", period);
    elecSupply = elecPrice.daily * days * share;
  } else if ((option.fuel === "gas" || option.fuel === "lpg") && category !== "Vehicles") {
    const share = getGasSupplyShare(state, occupants, category);
    gasSupply = price.daily * days * share;
  }

  const isGasFuel  = option.fuel === "gas" || option.fuel === "lpg" || option.fuel === "wood";
  const isPetrolFuel = option.fuel === "petrol" || option.fuel === "diesel";
  const gas         = isGasFuel ? volumeCost + gasSupply : 0;
  const petrol      = isPetrolFuel ? volumeCost : 0;
  const electricity = option.fuel === "electricity" ? volumeCost + elecSupply : 0;

  // --- Capex + finance ---
  // Vehicle capex comes from the option-specific table — option.capex is just
  // a fallback. Other appliances use option.capex directly. 1-year view is
  // operating-only by design, regardless of the includeCapex flag.
  let capital = 0;
  let interest = 0;
  if (includeCapex && period !== "1year") {
    let totalCapex: number;
    if (category === "Vehicles") {
      const perUnit =
        option.fuel === "electricity"
          ? VEHICLE_OPTION_DATA[vehicleOption].evCapex
          : VEHICLE_OPTION_DATA[vehicleOption].iceCapex;
      totalCapex = perUnit * SINGLE_OPTION_VEHICLE_COUNT;
    } else if (category === "Space Heating" && option.value === "Electric resistance") {
      // Resistive heaters cover small zones, so households typically buy a
      // pair (e.g. living + bedroom). Other heater types remain at 1 unit.
      totalCapex = option.capex * RESISTIVE_HEATING_UNITS;
    } else {
      totalCapex = option.capex;
    }
    const fin = computeCapitalAndInterest(totalCapex, base, years);
    capital = fin.capital;
    interest = fin.interest;
  }

  return {
    capital,
    interest,
    gas,
    petrol,
    electricity,
    total: capital + interest + gas + petrol + electricity,
  };
}

export { STATES };

// ---------------------------------------------------------------------------
// Solar + battery evaluation — ported from energy_savings_model.R
// (battery_model.R + evaluate_solar_battery). Returns a HouseCost where:
//   - capital = solar PV + battery hardware + install (amortised the same way
//     as appliance capex: full capex over 15-yr horizon, capex/15 per year on
//     the 1-yr view)
//   - electricity = NEGATIVE of the export + headroom + VPP value over the
//     period (a credit, so it visually subtracts from total)
// total can be negative — i.e. the system pays for itself within the horizon.
// ---------------------------------------------------------------------------

interface SolarBatteryInputs {
  solarKw: number;          // PV size, e.g. 6.6 / 10 / 15
  batteryKwh: number;       // battery rated capacity, e.g. 12 / 20 / 40
  period: Period;
  includeCapex: boolean;
}

// Helper: per-state household-level self-sufficiency for the chosen scenario.
// Mirrors get_household_self_sufficiency() in R — total solar kWh met / total
// electric load kWh, weighted across appliances + home-charged EV kWh. Public
// DC fast-charge kWh leave the home meter, so they don't pass through solar.
function householdSelfSufficiency(inputs: HouseInputs) {
  const { state, occupants, dwelling, solarScenario, vehicleOption, drivingLevel } = inputs;
  const occScale = getScalingFactor(occupants);
  const dwScale = dwelling === "apartment" ? APARTMENT_ENERGY_FACTOR : 1;
  const vClass = vehicleClassFromOption(vehicleOption);
  const vehicleCount = effectiveVehicleCount(inputs);

  const heating  = energy("Space Heating", "Electric heat pump", state) * occScale * dwScale;
  const cooling  = energy("Space Cooling", "Heat pump",          state) * occScale * dwScale;
  const water    = energy("Water Heating", "Electric heat pump", state) * occScale * dwScale;
  const cooktop  = energy("Cooktop",       "Electric induction", state) * occScale * dwScale;
  const other    = OTHER_ELEC_KWH_DAY[state] * occScale * dwScale;
  const evDaily  = vehicleCount > 0
    ? (VEHICLE_EFFICIENCY_WH_KM[vClass].electric * kmPerDay(state, drivingLevel)) / 1000
      * (1 - FAST_CHARGE_FRACTION) * vehicleCount
    : 0;

  const applianceLoad = heating + cooling + water + cooktop + other;
  const totalLoad = applianceLoad + evDaily;

  if (solarScenario === "grid_only" || totalLoad === 0) {
    return { totalPct: 0, applianceLoad, applianceSolar: 0, vehicleLoad: evDaily };
  }

  const frac = SOLAR_FRACTION_BY_SCENARIO[solarScenario];
  const applianceSolar =
    heating * frac.spaceHeating +
    cooling * frac.spaceCooling +
    water   * frac.waterHeating +
    cooktop * frac.cooktop +
    other   * frac.other;
  const vehicleSolar = evDaily * frac.vehicles;

  return {
    totalPct: (applianceSolar + vehicleSolar) / totalLoad,
    applianceLoad,
    applianceSolar,
    vehicleLoad: evDaily,
  };
}

// Single-season battery flow — direct port of one row of battery_model.R.
function batterySeasonRow(args: {
  dailySolarKwh: number;
  dailyConsumptionKwh: number;
  selfSufficiencyPct: number;
  effectiveBatteryKwh: number;
  applianceLoad: number;
  applianceSolar: number;
  solarMultiplier: number;
}): {
  exportKwh: number;
  arbitrageHeadroomKwh: number;
  loadMetBySolarKwh: number;
  storedSolarKwh: number;
} {
  const {
    dailySolarKwh, dailyConsumptionKwh, selfSufficiencyPct,
    effectiveBatteryKwh, applianceLoad, applianceSolar, solarMultiplier,
  } = args;

  const solar = dailySolarKwh * solarMultiplier;
  const loadMetBySolar = Math.min(dailyConsumptionKwh * selfSufficiencyPct, solar);

  // Battery-eligible (appliance) share takes priority over EV solar charging.
  const batteryEligibleSolarConsumed = Math.min(applianceSolar, loadMetBySolar);
  const loadUnmetBySolar = Math.max(applianceLoad - batteryEligibleSolarConsumed, 0);

  const storedSolar = Math.min(
    (solar - loadMetBySolar) * BATTERY_ROUND_TRIP_EFFICIENCY,
    effectiveBatteryKwh,
  );
  const exportKwh = solar - (storedSolar / BATTERY_ROUND_TRIP_EFFICIENCY + loadMetBySolar);

  const arbitrageHeadroomKwh = Math.max(
    storedSolar - storedSolar * BATTERY_HOUSEHOLD_SAFEGUARD_PCT - loadUnmetBySolar,
    0,
  );

  return {
    exportKwh,
    arbitrageHeadroomKwh,
    loadMetBySolarKwh: loadMetBySolar,
    storedSolarKwh: storedSolar,
  };
}

interface AnnualSolarBatteryFlows {
  exportKwh: number;             // kWh/yr exported during the day (no battery)
  headroomKwh: number;           // kWh/yr battery export headroom (evening peak)
  solarSelfConsumedKwh: number;  // kWh/yr direct daytime self-consumption
  batteryDischargeKwh: number;   // kWh/yr battery discharged to home loads
  // Battery throughput. `batteryStoredKwh` is the AC-equivalent output of the
  // battery (= total discharged kWh = batteryDischargeKwh + headroomKwh).
  // Charge (DC-in) = batteryStoredKwh / BATTERY_ROUND_TRIP_EFFICIENCY — the
  // PV-side draw that produced this output, including the round-trip loss.
  batteryStoredKwh: number;
  // Per-season annualised headroom — needed for the tiered seasonal wholesale
  // valuation (each season uses its own peak_hour_1..4 prices).
  seasonalHeadroomKwh: Record<Season, number>;
}

// Inverter capacity (kW) sets the per-hour cap on evening-peak exports —
// large (≥ 10 kWp) systems use a 10 kW inverter, otherwise 5 kW. R model
// auto-derives this from solar_kwp at LARGE_SYSTEM_SOLAR_KWP.
function inverterKwForSystem(solarKw: number): number {
  return solarKw >= LARGE_SYSTEM_SOLAR_KWP ? LARGE_SYSTEM_INVERTER_KW : INVERTER_KW;
}

// Tiered headroom value for one day at one season's prices.
// kWh fill four hourly buckets in price order: the first `tierKwh` kWh earn
// peak_hour_1's price, the next `tierKwh` earn peak_hour_2, etc. Anything
// beyond 4 × tierKwh still leaves via the inverter at peak_hour_4. Mirrors R
// tiered_headroom_value_per_day().
function tieredHeadroomValuePerDay(
  dailyHeadroomKwh: number,
  prices: readonly [number, number, number, number],
  tierKwh: number,
): number {
  let remaining = dailyHeadroomKwh;
  let value = 0;
  for (let i = 0; i < prices.length; i++) {
    const take = Math.min(remaining, tierKwh);
    value += take * prices[i];
    remaining -= take;
    if (remaining <= 0) return value;
  }
  // Spill above 4 × tierKwh/day still exports via the inverter at hour 4.
  if (remaining > 0) value += remaining * prices[prices.length - 1];
  return value;
}

// Annualised $ value of headroom under the tiered evening-peak schedule.
// Sums each season's daily value × days-in-season, using the inverter cap
// implied by the PV system size.
function tieredHeadroomAnnualValue(
  state: StateCode,
  flows: AnnualSolarBatteryFlows,
  solarKw: number,
): number {
  const tierKwh = inverterKwForSystem(solarKw);
  const tariffs = SEASONAL_PEAK_PRICES[state];
  const daysPerSeason = 365 / 4;
  let total = 0;
  for (const s of SEASONS) {
    const seasonHeadroom = flows.seasonalHeadroomKwh[s];
    if (seasonHeadroom <= 0) continue;
    const dailyHeadroom = seasonHeadroom / daysPerSeason;
    total += tieredHeadroomValuePerDay(dailyHeadroom, tariffs[s], tierKwh) * daysPerSeason;
  }
  return total;
}

// Public-facing energy diagnostic — annualised flows + scalar totals for the
// solar/battery sizing in chart 2. Used by the temporary diagnostic box.
export interface SolarBatteryEnergyFlows {
  solarGenerationKwhYr: number;     // kWh/yr generated by the PV array
  consumptionKwhYr: number;         // kWh/yr total household load
  solarSelfConsumedKwhYr: number;   // kWh/yr solar → home (direct daytime)
  batteryToHomeKwhYr: number;       // kWh/yr battery → home (stored solar discharged in evening)
  fitExportKwhYr: number;           // kWh/yr daytime PV overflow exported at FiT
  headroomKwhYr: number;            // kWh/yr battery headroom (only valued in Wholesale mode)
}

export function solarBatteryEnergyFlows(
  inputs: HouseInputs,
  solarKw: number,
  batteryKwh: number,
): SolarBatteryEnergyFlows {
  const years = inputs.period === "1year" ? 1 : 15;
  const flows = annualBatteryFlows(inputs, solarKw, batteryKwh, years);
  const dailySolarKwh = solarKw > 0 ? SOLAR_DAILY_KWH_PER_KW[inputs.state] * solarKw : 0;
  const breakdown = householdSelfSufficiency(inputs);
  const dailyConsumptionKwh = breakdown.applianceLoad + breakdown.vehicleLoad;
  return {
    solarGenerationKwhYr: dailySolarKwh * 365,
    consumptionKwhYr: dailyConsumptionKwh * 365,
    solarSelfConsumedKwhYr: flows.solarSelfConsumedKwh,
    batteryToHomeKwhYr: flows.batteryDischargeKwh,
    fitExportKwhYr: flows.exportKwh,
    headroomKwhYr: flows.headroomKwh,
  };
}

// Annualised solar + battery flows under the seasonal model. Returns the
// four kWh streams the chart needs to value separately:
//   solar self-consumed  → savings at retail
//   battery → home       → savings at retail
//   solar export (day)   → FiT
//   battery headroom     → mode-dependent (FiT / wholesale / VPP flat)
function annualBatteryFlows(
  inputs: HouseInputs,
  solarKw: number,
  batteryKwh: number,
  years: number,
): AnnualSolarBatteryFlows {
  const emptySeasonal: Record<Season, number> = { summer: 0, autumn: 0, winter: 0, spring: 0 };
  const empty: AnnualSolarBatteryFlows = {
    exportKwh: 0, headroomKwh: 0, solarSelfConsumedKwh: 0, batteryDischargeKwh: 0,
    batteryStoredKwh: 0,
    seasonalHeadroomKwh: { ...emptySeasonal },
  };
  if (solarKw <= 0) return empty;
  const dailySolarKwh = SOLAR_DAILY_KWH_PER_KW[inputs.state] * solarKw;
  const breakdown = householdSelfSufficiency(inputs);
  const dailyConsumptionKwh = breakdown.applianceLoad + breakdown.vehicleLoad;
  if (dailyConsumptionKwh === 0) return empty;

  const degradation = years >= 15 ? BATTERY_DEGRADATION_15YR_AVG : BATTERY_DEGRADATION_1YR;
  const effectiveBatteryKwh =
    batteryKwh > 0
      ? batteryKwh * BATTERY_USEABLE_CAPACITY_PCT * Math.pow(1 - degradation, years)
      : 0;

  const weights = SEASONAL_SOLAR_WEIGHTS;
  const meanWeight = (weights.spring + weights.summer + weights.autumn + weights.winter) / 4;
  const seasons: Season[] = ["spring", "summer", "autumn", "winter"];

  const daysPerSeason = 365 / 4;
  const totals: AnnualSolarBatteryFlows = {
    exportKwh: 0, headroomKwh: 0, solarSelfConsumedKwh: 0, batteryDischargeKwh: 0,
    batteryStoredKwh: 0,
    seasonalHeadroomKwh: { ...emptySeasonal },
  };

  for (const s of seasons) {
    const row = batterySeasonRow({
      dailySolarKwh,
      dailyConsumptionKwh,
      selfSufficiencyPct: breakdown.totalPct,
      effectiveBatteryKwh,
      applianceLoad: breakdown.applianceLoad,
      applianceSolar: breakdown.applianceSolar,
      solarMultiplier: weights[s] / meanWeight,
    });
    const seasonHeadroomKwh = row.arbitrageHeadroomKwh * daysPerSeason;
    totals.exportKwh += row.exportKwh * daysPerSeason;
    totals.headroomKwh += seasonHeadroomKwh;
    totals.seasonalHeadroomKwh[s] = seasonHeadroomKwh;
    totals.solarSelfConsumedKwh += row.loadMetBySolarKwh * daysPerSeason;
    totals.batteryStoredKwh += row.storedSolarKwh * daysPerSeason;
    // Battery → home: usable (post-safeguard) stored solar that serves evening
    // appliance load, minus the slice that went to the grid as headroom.
    // Mirrors R: max(stored × (1 - safeguard) - arbitrage_headroom, 0). The
    // safeguard reserve is held back for grid-outage backup and never reaches
    // home appliance load, so we don't credit it here.
    const batteryToHome = Math.max(
      row.storedSolarKwh * (1 - BATTERY_HOUSEHOLD_SAFEGUARD_PCT) -
        row.arbitrageHeadroomKwh,
      0,
    );
    totals.batteryDischargeKwh += batteryToHome * daysPerSeason;
  }

  return totals;
}

// Total system capex for a given solar / battery sizing combination.
// Solar PV cost varies by state ($/kW); battery hardware is per-kWh plus a
// flat installation charge (only when battery > 0). One inverter replacement
// is added on the 15-year horizon (R model behaviour).
export function solarBatteryCapex(
  state: StateCode,
  solarKw: number,
  batteryKwh: number,
  years: number,
): number {
  let capex = 0;
  if (solarKw > 0) {
    capex += SOLAR_PV_COST_PER_KW[state] * solarKw;
    if (years >= INVERTER_REPLACEMENT_YEAR) capex += INVERTER_REPLACEMENT_COST;
  }
  if (batteryKwh > 0) {
    capex += BATTERY_COST_PER_KWH * batteryKwh + BATTERY_INSTALLATION_COST;
  }
  return capex;
}

// Per-segment financial breakdown of a solar+battery system over the chosen
// period. All values are positive $; netCost is signed (negative = savings).
//
// solarToHome:  daytime self-consumption × retail electricity price
// solarExport:  surplus solar exported during the day × FiT
// batteryToHome: stored solar discharged to home loads × retail price
// batteryToGrid: battery export headroom × FiT or wholesale (mode-dependent)
// vppBonus:     flat VPP_ANNUAL_BENEFIT × years (VPP mode only)
export interface SolarBatteryCost {
  capital: number;
  interest: number;
  solarToHome: number;
  solarExport: number;
  batteryToHome: number;
  batteryToGrid: number;
  vppBonus: number;
  netCost: number;  // capex − total savings (signed)
}

// Solar+battery savings + capex broken down by stream so the chart can render
// each in its own colour. The mode parameter overrides base.batteryValue —
// chart 2 calls this once per mode to plot all three side-by-side.
export function evaluateSolarBatteryBreakdown(
  base: HouseInputs,
  sb: SolarBatteryInputs,
  mode: BatteryValueMode = base.batteryValue,
): SolarBatteryCost {
  const { state, period } = base;
  const { solarKw, batteryKwh, includeCapex } = sb;
  const years = period === "1year" ? 1 : 15;

  const flows = annualBatteryFlows(base, solarKw, batteryKwh, years);

  // Retail electricity price (the same one chart 1 charges for grid kWh).
  const elecPrice = priceFor(state, "electricity", period);
  const retail = elecPrice.kwh;
  const fit = FIT_BY_STATE[state] ?? 0;

  // --- Per-year values ---
  const solarToHomePerYear     = flows.solarSelfConsumedKwh * retail;
  const solarExportPerYear     = flows.exportKwh            * fit;
  const batteryToHomePerYear   = flows.batteryDischargeKwh  * retail;

  // Battery-export valuation — depends on the chosen mode.
  // Self-consume: headroom is NOT intentionally discharged to the grid. The
  //   battery just rolls over to the next day; only the daytime "excess"
  //   (solar not self-consumed and not stored) leaves at FiT — and that's
  //   counted separately as solarExport.
  // VPP: same as self-consume on the battery side, plus a flat annual
  //   membership benefit (per Tipping point CSV).
  // Wholesale: headroom kWh are traded in the evening peak under the tiered
  //   seasonal schedule, capped per hour by the household inverter (R
  //   tiered_headroom_value_per_day × seasonal mean peak_hour_1..4 prices).
  let batteryToGridPerYear = 0;
  let vppPerYear = 0;
  if (batteryKwh > 0) {
    switch (mode) {
      case "self_consume":
        batteryToGridPerYear = 0;
        break;
      case "vpp":
        batteryToGridPerYear = 0;
        vppPerYear = VPP_ANNUAL_BENEFIT;
        break;
      case "wholesale":
        batteryToGridPerYear = tieredHeadroomAnnualValue(state, flows, solarKw);
        break;
    }
  }

  // --- Total over the period ---
  const solarToHome   = solarToHomePerYear   * years;
  const solarExport   = solarExportPerYear   * years;
  const batteryToHome = batteryToHomePerYear * years;
  const batteryToGrid = batteryToGridPerYear * years;
  const vppBonus      = vppPerYear           * years;
  const totalSavings  = solarToHome + solarExport + batteryToHome + batteryToGrid + vppBonus;

  // --- Capex ---
  const totalCapex = solarBatteryCapex(state, solarKw, batteryKwh, years);
  let capital = 0;
  let interest = 0;
  if (includeCapex && period !== "1year") {
    const fin = computeCapitalAndInterest(totalCapex, base, years);
    capital = fin.capital;
    interest = fin.interest;
  } else if (includeCapex && period === "1year") {
    capital = totalCapex / 15;
  }

  return {
    capital,
    interest,
    solarToHome,
    solarExport,
    batteryToHome,
    batteryToGrid,
    vppBonus,
    netCost: capital + interest - totalSavings,
  };
}

// Diagnostics for the battery component of chart 1 — surfaces the annual
// headroom kWh and per-mode credit values so the user can see whether the
// toggle is actually shifting anything (it only shifts when headroom > 0 and
// the per-mode rate differs from FiT). The wholesale rate is now a blended
// $/kWh derived from the tiered seasonal valuation: annual value ÷ headroom.
export interface WholeHomeBatteryDiagnostics {
  active: boolean;
  solarKw: number;
  batteryKwh: number;
  // Annual PV-side flow split. The four downstream values sum to the array's
  // nameplate generation (sans round-trip losses on the battery leg):
  //   generation = self-consumed + battery-charge + export + headroom
  solarGenerationKwhPerYear: number;     // raw array output
  solarSelfConsumedKwhPerYear: number;   // direct daytime → home
  batteryChargeKwhPerYear: number;       // DC-in to the battery
  exportKwhPerYear: number;              // daytime FiT export
  headroomKwhPerYear: number;            // battery → grid surplus (evening peak)
  // Battery discharge (AC-out): what the battery actually delivers to home +
  // grid. Charge - discharge is the round-trip loss.
  batteryDischargeKwhPerYear: number;
  fitPriceKwh: number;
  wholesalePriceKwh: number;       // blended avg ($/kWh) from the tiered valuation
  selfConsumeAnnualValue: number;  // 0
  vppAnnualValue: number;          // VPP_ANNUAL_BENEFIT
  wholesaleAnnualValue: number;    // tiered seasonal headroom value
}

export function wholeHomeBatteryDiagnostics(inputs: HouseInputs): WholeHomeBatteryDiagnostics {
  const empty: WholeHomeBatteryDiagnostics = {
    active: false,
    solarKw: WHOLE_HOME_SOLAR_KW,
    batteryKwh: WHOLE_HOME_BATTERY_KWH,
    solarGenerationKwhPerYear: 0,
    solarSelfConsumedKwhPerYear: 0,
    batteryChargeKwhPerYear: 0,
    exportKwhPerYear: 0,
    headroomKwhPerYear: 0,
    batteryDischargeKwhPerYear: 0,
    fitPriceKwh: FIT_BY_STATE[inputs.state] ?? 0,
    wholesalePriceKwh: 0,
    selfConsumeAnnualValue: 0,
    vppAnnualValue: 0,
    wholesaleAnnualValue: 0,
  };
  if (inputs.solarScenario === "grid_only") return empty;

  const years = inputs.period === "1year" ? 1 : 15;
  const flows = annualBatteryFlows(inputs, WHOLE_HOME_SOLAR_KW, WHOLE_HOME_BATTERY_KWH, years);
  const fit = FIT_BY_STATE[inputs.state] ?? 0;
  const wholesaleAnnual = tieredHeadroomAnnualValue(inputs.state, flows, WHOLE_HOME_SOLAR_KW);
  const blendedWholesale = flows.headroomKwh > 0 ? wholesaleAnnual / flows.headroomKwh : 0;
  // Discharge = AC-out total (load-serving + headroom). Charge = DC-in draw
  // = discharge / round-trip efficiency; the gap is the round-trip loss.
  const dischargeKwh = flows.batteryStoredKwh;
  const chargeKwh = dischargeKwh / BATTERY_ROUND_TRIP_EFFICIENCY;
  const generationKwh = SOLAR_DAILY_KWH_PER_KW[inputs.state] * WHOLE_HOME_SOLAR_KW * 365;
  return {
    active: true,
    solarKw: WHOLE_HOME_SOLAR_KW,
    batteryKwh: WHOLE_HOME_BATTERY_KWH,
    solarGenerationKwhPerYear: generationKwh,
    solarSelfConsumedKwhPerYear: flows.solarSelfConsumedKwh,
    batteryChargeKwhPerYear: chargeKwh,
    exportKwhPerYear: flows.exportKwh,
    headroomKwhPerYear: flows.headroomKwh,
    batteryDischargeKwhPerYear: dischargeKwh,
    fitPriceKwh: fit,
    wholesalePriceKwh: blendedWholesale,
    // Self-consume: battery is not exported (headroom rolls over).
    selfConsumeAnnualValue: 0,
    // VPP: flat membership benefit, no headroom discharge.
    vppAnnualValue: VPP_ANNUAL_BENEFIT,
    // Wholesale: tiered seasonal headroom valuation.
    wholesaleAnnualValue: wholesaleAnnual,
  };
}

// Backwards-compatible HouseCost wrapper for callers that just want a single
// number per cost segment (the savings collapse into a single negative
// `electricity` value). Used by the savings chip — the breakdown view uses
// evaluateSolarBatteryBreakdown directly.
export function evaluateSolarBattery(base: HouseInputs, sb: SolarBatteryInputs): HouseCost {
  const b = evaluateSolarBatteryBreakdown(base, sb);
  const totalSavings =
    b.solarToHome + b.solarExport + b.batteryToHome + b.batteryToGrid + b.vppBonus;
  return {
    capital: b.capital,
    interest: b.interest,
    gas: 0,
    petrol: 0,
    electricity: -totalSavings,
    total: b.netCost,
  };
}
