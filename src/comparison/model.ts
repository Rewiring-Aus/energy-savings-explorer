// All-gas vs all-electric household cost comparison.
// Ported from energy_savings_model.R (Energy Savings Model 2026).

import {
  APARTMENT_ENERGY_FACTOR,
  APPLIANCE_CAPEX,
  ENERGY_USE,
  Fuel,
  FUEL_PRICES,
  KM_PER_DAY,
  OTHER_ELEC_KWH_DAY,
  STATES,
  StateCode,
  VEHICLE_CAPEX_NEW,
  VEHICLE_EFFICIENCY_WH_KM,
  VehicleClass,
  VehicleOption,
  VEHICLE_OPTION_DATA,
  getScalingFactor,
} from "./data";

export type Period = "1year" | "15year";
export type DwellingType = "house" | "apartment";
export type SolarScenario = "grid_only" | "solar" | "solar_optimised";

// Per-appliance share of electricity met directly from on-site solar, keyed
// by household scenario. Mirrors energy_savings_model.R SOLAR_FRACTION_TABLE.
// "other" covers lighting/fridge/electronics — assumed 0% (poor daytime overlap).
interface SolarFractionByAppliance {
  spaceHeating: number;
  waterHeating: number;
  spaceCooling: number;
  cooktop: number;
  vehicles: number;
  other: number;
}

export const SOLAR_FRACTION_BY_SCENARIO: Record<SolarScenario, SolarFractionByAppliance> = {
  grid_only:       { spaceHeating: 0,    waterHeating: 0,    spaceCooling: 0,    cooktop: 0,    vehicles: 0,    other: 0 },
  solar:           { spaceHeating: 0.15, waterHeating: 0.50, spaceCooling: 0.40, cooktop: 0.10, vehicles: 0.20, other: 0 },
  solar_optimised: { spaceHeating: 0.30, waterHeating: 0.85, spaceCooling: 0.65, cooktop: 0.10, vehicles: 0.45, other: 0 },
};

// Solar system capex applied whenever scenario is "solar" or "solar_optimised".
// Power is free at the point of use (§4A.3 in METHODOLOGY.md); the capex is
// the PV system plus one inverter replacement at year 12 of a 15-year horizon.
export const SOLAR_SYSTEM_CAPEX = 5500;
export const INVERTER_REPLACEMENT_COST = 1800;
export const INVERTER_REPLACEMENT_YEAR = 12;

export interface HouseInputs {
  state: StateCode;
  occupants: number;
  vehicles: number;
  vehicleOption: VehicleOption;
  dwelling: DwellingType;
  finance: boolean;
  period: Period;
  loanRate: number;
  loanTerm: number;
  solarScenario: SolarScenario;
}

export const DEFAULT_INPUTS: HouseInputs = {
  state: "AUS",
  occupants: 2.7,         // Australian Census average
  vehicles: 1.8,          // ABS vehicles-per-household average
  vehicleOption: "byd_dolphin",
  dwelling: "house",
  finance: false,
  period: "15year",
  loanRate: 0.07,
  loanTerm: 10,
  solarScenario: "grid_only",
};

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

// Does this state have reticulated natural gas available?
// Fuel prices CSV has no gas row for NT.
function hasNaturalGas(state: StateCode): boolean {
  return FUEL_PRICES[state]?.gas !== undefined;
}

// PV system capex over the analysis horizon. Includes one inverter
// replacement if the horizon reaches year 12. Returns 0 under grid_only.
function solarSystemCapex(scenario: SolarScenario, years: number): number {
  if (scenario === "grid_only") return 0;
  const replacement = years >= INVERTER_REPLACEMENT_YEAR ? INVERTER_REPLACEMENT_COST : 0;
  return SOLAR_SYSTEM_CAPEX + replacement;
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
  const { state, occupants, dwelling, period, solarScenario, vehicleOption } = inputs;
  const occScale = getScalingFactor(occupants);
  const dwScale = dwelling === "apartment" ? APARTMENT_ENERGY_FACTOR : 1;
  const years = period === "1year" ? 1 : 15;
  const days = 365 * years;
  const vehicleCount = effectiveVehicleCount(inputs);
  const vClass = vehicleClassFromOption(vehicleOption);

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

  // Always-electric loads
  const otherKwh   = OTHER_ELEC_KWH_DAY[state] * occScale * dwScale;
  const coolingKwh = energy("Space Cooling", "Heat pump", state) * occScale * dwScale;
  const elecDemand = otherKwh + coolingKwh;

  // Vehicles — ICE (uses petrol price)
  const iceKwhDay = vehicleCount > 0
    ? (VEHICLE_EFFICIENCY_WH_KM[vClass].ice * KM_PER_DAY[state]) / 1000 * vehicleCount
    : 0;

  const fossilPrice = priceFor(state, fossil, period);
  const elecPrice   = priceFor(state, "electricity", period);
  const petrolPrice = priceFor(state, "petrol", period);

  // Solar split applies to electric loads only (cooling + other).
  const frac = SOLAR_FRACTION_BY_SCENARIO[solarScenario];
  const solarKwhDay = coolingKwh * frac.spaceCooling + otherKwh * frac.other;
  const gridElecKwhDay = elecDemand - solarKwhDay;

  const gasVolumeCost    = fossilDemand * 365 * fossilPrice.kwh * years;
  const gasSupplyCost    = fossilDemand > 0 ? fossilPrice.daily * days : 0;
  const petrolVolumeCost = iceKwhDay * 365 * petrolPrice.kwh * years;
  const elecVolumeCost   = gridElecKwhDay * 365 * elecPrice.kwh * years;
  const elecSupplyCost   = elecPrice.daily * days;

  const gas         = gasVolumeCost + gasSupplyCost;
  const petrol      = petrolVolumeCost;
  const electricity = elecVolumeCost + elecSupplyCost;

  const applianceCapex = fossilCapexHeating + fossilCapexWater + fossilCapexCooktop;
  const vehicleCapex   = vehicleCount > 0
    ? VEHICLE_OPTION_DATA[vehicleOption].iceCapex * vehicleCount
    : 0;
  const pvCapex        = solarSystemCapex(solarScenario, years);
  const totalCapex     = applianceCapex + vehicleCapex + pvCapex;

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
  const { state, occupants, dwelling, period, solarScenario, vehicleOption } = inputs;
  const occScale = getScalingFactor(occupants);
  const dwScale = dwelling === "apartment" ? APARTMENT_ENERGY_FACTOR : 1;
  const years = period === "1year" ? 1 : 15;
  const days = 365 * years;
  const vehicleCount = effectiveVehicleCount(inputs);
  const vClass = vehicleClassFromOption(vehicleOption);

  const heatingKwh = energy("Space Heating", "Electric heat pump", state) * occScale * dwScale;
  const coolingKwh = energy("Space Cooling", "Heat pump",          state) * occScale * dwScale;
  const waterKwh   = energy("Water Heating", "Electric heat pump", state) * occScale * dwScale;
  const cooktopKwh = energy("Cooktop",       "Electric induction", state) * occScale * dwScale;
  const otherKwh   = OTHER_ELEC_KWH_DAY[state] * occScale * dwScale;

  const evKwhDay = vehicleCount > 0
    ? (VEHICLE_EFFICIENCY_WH_KM[vClass].electric * KM_PER_DAY[state]) / 1000 * vehicleCount
    : 0;

  const elecPrice = priceFor(state, "electricity", period);

  const frac = SOLAR_FRACTION_BY_SCENARIO[solarScenario];
  const solarKwhDay =
    heatingKwh * frac.spaceHeating +
    coolingKwh * frac.spaceCooling +
    waterKwh   * frac.waterHeating +
    cooktopKwh * frac.cooktop +
    otherKwh   * frac.other +
    evKwhDay   * frac.vehicles;
  const totalElecKwhDay = heatingKwh + coolingKwh + waterKwh + cooktopKwh + otherKwh + evKwhDay;
  const gridKwhDay = totalElecKwhDay - solarKwhDay;

  const elecVolumeCost  = gridKwhDay * 365 * elecPrice.kwh * years;
  const elecSupplyCost  = elecPrice.daily * days;

  const applianceCapex = APPLIANCE_CAPEX.spaceHeatingHeatPump +
                         APPLIANCE_CAPEX.waterHeatingHeatPump +
                         APPLIANCE_CAPEX.cooktopInduction;
  const vehicleCapex   = vehicleCount > 0
    ? VEHICLE_OPTION_DATA[vehicleOption].evCapex * vehicleCount
    : 0;
  const pvCapex        = solarSystemCapex(solarScenario, years);
  const totalCapex     = applianceCapex + vehicleCapex + pvCapex;

  // 1-year view is operating-cost only at current prices (no capex, no finance).
  const { capital, interest } = period === "1year"
    ? { capital: 0, interest: 0 }
    : computeCapitalAndInterest(totalCapex, inputs, years);

  return {
    capital,
    interest,
    gas: 0,
    petrol: 0,
    electricity: elecVolumeCost + elecSupplyCost,
    total: capital + interest + elecVolumeCost + elecSupplyCost,
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
// based on an all-electric household mix (1-vehicle baseline, matching R).
function getElecSupplyShare(
  state: StateCode,
  occupants: number,
  category: ApplianceCategory | "Other",
  includeVehicles: boolean,
  vClass: VehicleClass,
): number {
  const occScale = getScalingFactor(occupants);
  const heating = (energy("Space Heating", "Electric heat pump", state) +
                   energy("Space Cooling", "Heat pump", state)) * occScale;
  const water   = energy("Water Heating", "Electric heat pump", state) * occScale;
  const cooktop = energy("Cooktop",       "Electric induction", state) * occScale;
  const other   = OTHER_ELEC_KWH_DAY[state] * occScale;
  const vehicle = (VEHICLE_EFFICIENCY_WH_KM[vClass].electric * KM_PER_DAY[state]) / 1000;

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
//   - Space heating: 2 heater units (most homes need more than one zone)
//   - Water heating / cooktop: 1 unit
//   - Vehicles: 1 car (overrides the household's count)
const HEATING_UNITS = 2;
const SINGLE_OPTION_VEHICLE_COUNT = 1;

export function evaluateSingleOption(base: HouseInputs, single: SingleOptionInputs): HouseCost {
  const { state, occupants, dwelling, solarScenario, vehicleOption } = base;
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
    energyKwhDay = (wh * KM_PER_DAY[state]) / 1000 * SINGLE_OPTION_VEHICLE_COUNT;
  } else {
    energyKwhDay = energy(category, option.value, state) * occScale * dwScale;
    if (category === "Space Heating" && option.value === "Electric heat pump") {
      // Heat pump AC provides cooling too — add the cooling load
      coolingKwhDay = energy("Space Cooling", "Heat pump", state) * occScale * dwScale;
      energyKwhDay += coolingKwhDay;
    }
  }

  // --- Volume cost (solar kWh priced at $0 for electric options) ---
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
      solarKwhDay = energyKwhDay * frac.waterHeating;
    } else if (category === "Cooktop") {
      solarKwhDay = energyKwhDay * frac.cooktop;
    } else if (category === "Vehicles") {
      solarKwhDay = energyKwhDay * frac.vehicles;
    }
  }
  const gridKwhDay = energyKwhDay - solarKwhDay;
  const volumeCost = gridKwhDay * 365 * price.kwh * years;

  // --- Supply charge (proportional, per R) ---
  let gasSupply = 0;
  let elecSupply = 0;
  if (option.fuel === "electricity") {
    const includeVeh = category === "Vehicles";
    const share = getElecSupplyShare(state, occupants, category, includeVeh, vClass);
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
    } else if (category === "Space Heating") {
      totalCapex = option.capex * HEATING_UNITS;
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
