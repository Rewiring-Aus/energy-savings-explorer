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
  COOLING_ONLY_CAPEX,
  DrivingLevel,
  ENERGY_USE,
  FAST_CHARGE_FRACTION,
  FIT_BY_STATE,
  Fuel,
  FUEL_PRICES,
  HEATER_COUNT_BY_STATE,
  INVERTER_KW,
  isSolarSharerState,
  LARGE_SYSTEM_INVERTER_KW,
  LARGE_SYSTEM_SOLAR_KWP,
  kmPerDay,
  OTHER_COOKING_KWH_DAY,
  OTHER_ELEC_KWH_DAY,
  OTHER_ELECTRONICS_KWH_DAY,
  Season,
  SEASONAL_PEAK_PRICES,
  SEASONS,
  SEASONAL_SOLAR_WEIGHTS,
  SOLAR_LCOE_BY_STATE,
  SOLAR_PV_COST_PER_KW,
  SOLAR_SHARER_CAP_KWH_DAY,
  getSolarDailyKwhPerKw,
  SolarSizeKw,
  STATES,
  StateCode,
  SWITCHBOARD_UPGRADE_CAPEX,
  Tariff,
  VEHICLE_CAPEX_NEW,
  VEHICLE_EFFICIENCY_WH_KM,
  VEHICLE_MAINTENANCE_ANNUAL,
  VehicleClass,
  VehicleOption,
  VEHICLE_OPTION_DATA,
  getApplianceSubsidies,
  getScalingFactor,
} from "./data";

export type Period = "1year" | "15year";
export type DwellingType = "house" | "apartment";
export type SolarScenario = "grid_only" | "solar" | "solar_optimised";

// Direct port of energy_savings_model.R SOLAR_FRACTION_TABLE. One row per
// category, with optional "Category|Appliance Type" override rows that take
// precedence (currently only electric-resistance hot water, which has a
// narrower solar overlap than a heat pump but responds well to a timer).
//
// Three groups of columns:
//
//  grid_only / solar / solar_optimised
//      Share of the load met directly from on-site solar.
//
//  sso_grid_only / sso_solar / sso_solar_optimised
//      Share of the load that can realistically be drawn inside the 3-hour
//      11am-2pm Solar Sharer free window. Same question the solar columns ask,
//      but for a 3-hour block rather than the ~8-hour solar day — so the values
//      sit below solar_optimised for everything except vehicles (a car parked
//      at home absorbs a 3-hour block more readily than it spreads charging
//      across the whole solar window).
//
//      NOTE the semantics differ from the solar columns: sso_grid_only is NOT
//      zero. A household with no panels can still use the free window — it's
//      their only cheap energy — it just does so less deliberately. The
//      gradient is about automation and intent, not solar presence.
//
//      SENSITIVITY: the Vehicles row dominates. Swinging it 0 -> 0.8 moves
//      annual savings by ~$1,050/yr in grid_only. Tune that row first.
//
//  min_retail
//      Floor on the share of the load that must be bought at the tariff's
//      standard rate whatever solar, battery and free-window capacity exist.
//      Covers unavoidable round-the-clock draw. Applied LAST, so free window +
//      solar + battery can never cover more than (1 - min_retail) of a load.
//      Currently 0 on every row, so the floor is inert — the mechanism is
//      wired because the values are expected to change.
export interface SolarFractionRow {
  grid_only: number;
  solar: number;
  solar_optimised: number;
  sso_grid_only: number;
  sso_solar: number;
  sso_solar_optimised: number;
  min_retail: number;
}

// Other Cooking / Other Electronics hold a flat 1/3 across both solar
// scenarios: refrigeration is 24/7, but daytime washing / dishwashers /
// microwave realistically pulls about a third of that load through the window.
const OTHER_FRAC_SOLAR = 1 / 3;

const SOLAR_FRACTION_TABLE: Record<string, SolarFractionRow> = {
  // Timer/diverter-driven: a grid_only home is unlikely to have installed one,
  // an optimised home already has.
  "Water Heating":                     { grid_only: 0, solar: 0.50,            solar_optimised: 0.85,            sso_grid_only: 0.20, sso_solar: 0.35, sso_solar_optimised: 0.50, min_retail: 0 },
  "Water Heating|Electric resistance": { grid_only: 0, solar: 0.40,            solar_optimised: 0.70,            sso_grid_only: 0.15, sso_solar: 0.28, sso_solar_optimised: 0.40, min_retail: 0 },
  // Space conditioning barely shifts at the best of times.
  "Space Heating":                     { grid_only: 0, solar: 0.15,            solar_optimised: 0.30,            sso_grid_only: 0.05, sso_solar: 0.10, sso_solar_optimised: 0.15, min_retail: 0 },
  "Space Cooling":                     { grid_only: 0, solar: 0.40,            solar_optimised: 0.65,            sso_grid_only: 0.15, sso_solar: 0.22, sso_solar_optimised: 0.30, min_retail: 0 },
  // Dinner-time load — unshiftable regardless of sophistication.
  "Cooktop":                           { grid_only: 0, solar: 0.10,            solar_optimised: 0.10,            sso_grid_only: 0.05, sso_solar: 0.05, sso_solar_optimised: 0.05, min_retail: 0 },
  "Other Cooking":                     { grid_only: 0, solar: OTHER_FRAC_SOLAR, solar_optimised: OTHER_FRAC_SOLAR, sso_grid_only: 0.05, sso_solar: 0.08, sso_solar_optimised: 0.10, min_retail: 0 },
  // Mostly passive 24/7 draw; whatever lands in the window does so by chance.
  "Other Electronics":                 { grid_only: 0, solar: OTHER_FRAC_SOLAR, solar_optimised: OTHER_FRAC_SOLAR, sso_grid_only: 0.12, sso_solar: 0.13, sso_solar_optimised: 0.15, min_retail: 0 },
  "Pool Equipment":                    { grid_only: 0, solar: 0.60,            solar_optimised: 0.85,            sso_grid_only: 0.25, sso_solar: 0.35, sso_solar_optimised: 0.50, min_retail: 0 },
  // THE DOMINANT ASSUMPTION — see the sensitivity note above.
  "Vehicles":                          { grid_only: 0, solar: 0.10,            solar_optimised: 0.25,            sso_grid_only: 0.25, sso_solar: 0.40, sso_solar_optimised: 0.55, min_retail: 0 },
};

const ZERO_FRACTION_ROW: SolarFractionRow = {
  grid_only: 0, solar: 0, solar_optimised: 0,
  sso_grid_only: 0, sso_solar: 0, sso_solar_optimised: 0, min_retail: 0,
};

// Look up one row, preferring an appliance-type-specific override over the
// category default. Mirrors R .solar_table_lookup().
function fractionRow(category: string, applianceType?: string): SolarFractionRow {
  if (applianceType) {
    const override = SOLAR_FRACTION_TABLE[`${category}|${applianceType}`];
    if (override) return override;
  }
  return SOLAR_FRACTION_TABLE[category] ?? ZERO_FRACTION_ROW;
}

function getSolarFraction(category: string, scenario: SolarScenario, applianceType?: string): number {
  return fractionRow(category, applianceType)[scenario];
}

function getMinRetailFraction(category: string, applianceType?: string): number {
  return fractionRow(category, applianceType).min_retail;
}

// Share of a load actually served free, once the min_retail floor is honoured.
// Free-window energy dispatches BEFORE solar, so this depends only on the load
// itself — not on how much solar is available. That's what keeps the
// free-window and solar calculations non-circular. Mirrors R
// free_window_share().
function freeWindowShare(
  category: string,
  scenario: SolarScenario,
  applianceType?: string,
  freeWindowScale = 1,
): number {
  const row = fractionRow(category, applianceType);
  const share = Math.min(row[`sso_${scenario}`], 1 - row.min_retail);
  return Math.max(share, 0) * freeWindowScale;
}

// Legacy per-appliance view of the solar columns, still consumed by the chart
// footers. Derived from SOLAR_FRACTION_TABLE so there is one source of truth.
export interface SolarFractionByAppliance {
  spaceHeating: number;
  waterHeating: number;             // heat pump (default row)
  waterHeatingResistance: number;   // "Electric resistance" override row
  spaceCooling: number;
  cooktop: number;
  vehicles: number;
  other: number;
}

export const SOLAR_FRACTION_BY_SCENARIO: Record<SolarScenario, SolarFractionByAppliance> =
  Object.fromEntries(
    (["grid_only", "solar", "solar_optimised"] as SolarScenario[]).map((s) => [
      s,
      {
        spaceHeating:           getSolarFraction("Space Heating", s),
        waterHeating:           getSolarFraction("Water Heating", s),
        waterHeatingResistance: getSolarFraction("Water Heating", s, "Electric resistance"),
        spaceCooling:           getSolarFraction("Space Cooling", s),
        cooktop:                getSolarFraction("Cooktop", s),
        vehicles:               getSolarFraction("Vehicles", s),
        other:                  getSolarFraction("Other Electronics", s),
      },
    ]),
  ) as Record<SolarScenario, SolarFractionByAppliance>;

// Solar PV capex is now sized: state-specific $/kW × system kW (matches the
// per-state Tipping point CSV row "Solar PV cost per kW"). Chart 1 uses the
// dwelling-aware preset below; chart 2 uses the user's solar-size toggle.
// The inverter replacement at year 12 is unchanged.
export const INVERTER_REPLACEMENT_COST = 1800;
export const INVERTER_REPLACEMENT_YEAR = 12;

// Whole-home chart assumes a typical solar+battery setup whenever the user
// is on "solar" or "solar_optimised". Sizing varies by dwelling — a detached
// house has the roof + cumulative load for a 10 kW + 15 kWh setup; an
// apartment is a smaller roof + smaller load, so a 5 kW + 8 kWh sizing is
// more representative. Capex is priced at the state's $/kW from
// SOLAR_PV_COST_PER_KW × the preset kW. The battery export credit is what
// makes the "Battery export" toggle on chart 1 meaningful.
export function wholeHomePreset(dwelling: DwellingType): { solarKw: number; batteryKwh: number } {
  return dwelling === "apartment"
    ? { solarKw: 5,  batteryKwh: 8  }
    : { solarKw: 10, batteryKwh: 15 };
}

// Cap on the share of TOTAL EV energy that may be billed at the tariff's EV
// rate (R `ev_tariff_share`). Survives the tariff refactor as an internal
// realism dial for a household that can only shift part of its charging onto
// the cheap window. EV kWh resolve in four blocks, carved out in this order:
//   fast_charge_fraction × total → public DC fast-charge price (never capped)
//   solar + free-window shares   → no grid cost (never capped)
//   residual, up to the cap      → the tariff's EV rate
//   anything still left          → the tariff's import rate
// The cap denominator is total EV demand, NOT home-charged kWh, so raising
// solar self-consumption eats into the expensive residual first.
//
// 1 = uncapped, matching the R model default and the canonical comparisons run.
// Note that under the single-tariff model evDolKwh === importDolKwh for every
// tariff, so the two blocks are priced identically and the cap is currently
// inert; it is kept wired because that may not stay true.
export const EV_TARIFF_SHARE = 1;

export interface HouseInputs {
  state: StateCode;
  // Optional 4-digit Australian postcode. When set, postcode-level inputs
  // (solar capacity factor by postcode) override the state default; other
  // model inputs still resolve at the state level. Cleared when the user
  // picks a state directly from the dropdown.
  postcode?: number;
  occupants: number;
  vehicles: number;
  // Per-car configuration. Length equals the (integer) vehicles count; for
  // the fractional "average" presets (e.g. 1.8) the array carries a single
  // entry that's applied with the fractional weight. Empty array → no cars.
  vehicleOptions: VehicleOption[];
  drivingLevel: DrivingLevel;
  dwelling: DwellingType;
  finance: boolean;
  period: Period;
  loanRate: number;
  loanTerm: number;
  solarScenario: SolarScenario;
  // The household's retail electricity plan. Single switch replacing the former
  // battery-export mode / EV-tariff pair — see getTariffSpec. Note the same
  // tariff applies to the gas scenario too (R does the same): a gas home still
  // uses ~9.5 kWh/day of electricity, so the plan matters there as well.
  tariff: Tariff;
  // VPP enrolment. Gates the NSW ($50/kWh) and WA battery subsidies only —
  // mirrors R's `battery_vpp` argument. Has no effect on export pricing, which
  // is now a property of the tariff.
  batteryVpp: boolean;
}

export const DEFAULT_INPUTS: HouseInputs = {
  state: "AUS",
  occupants: 3,           // round preset; the dropdown still offers 2.7 (avg)
  vehicles: 2,            // round preset; the dropdown still offers 1.8 (avg)
  vehicleOptions: ["byd_dolphin", "byd_sealion"],
  drivingLevel: "middle", // state-average km/day (R model default)
  dwelling: "house",
  finance: true,
  period: "15year",
  loanRate: 0.06,         // matches R evaluate_household() loan_rate default
  loanTerm: 15,           // matches R evaluate_household() loan_term default
  solarScenario: "solar_optimised",
  tariff: "solar_sharer", // matches R evaluate_household() tariff default
  batteryVpp: false,      // matches R battery_vpp default
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

// ---------------------------------------------------------------------------
// Tariff resolution — the single place tariff → pricing is decided
// ---------------------------------------------------------------------------
// Direct port of R get_tariff_spec(). Every price that depends on the
// household's retail plan is resolved here and threaded down, so imports,
// credits and the supply charge cannot drift apart. Do NOT read tariff rates
// anywhere else.
//
// Three things that are easy to get wrong:
//
//  - solar_sharer has its OWN daily supply charge, and it is much higher
//    (NSW $2.1263 vs $1.3905 flat, +$269/yr). That is the standing cost of the
//    free window. Every other tariff uses the flat "electricity" row's charge.
//    Missing this makes Solar Sharer look free.
//  - amber is identical to tou on imports. The only difference is the evening
//    export price.
//  - the electricity_sso_peak row is never read. All residual energy prices at
//    off-peak. Deliberate — see the known-gaps note in TARIFF_PORT_TO_TS.md.
export interface TariffSpec {
  tariff: Tariff;        // RESOLVED — may differ from the request, see fallback
  importDolKwh: number;  // appliance grid imports outside any free window
  evDolKwh: number;      // EV home charging outside any free window
  dailyCharge: number;   // $/day supply charge — comes from the TARIFF, not the flat row
  freeWindow: boolean;
  freeCapKwhDay: number; // 24 when freeWindow, else 0
  exportEvening: "fit" | "wholesale_peak";
}

// Requesting solar_sharer in a state that doesn't offer it silently resolves to
// "tou" — that household's best available alternative. The returned `tariff`
// reports what was actually used, so the UI can label the fallback honestly
// rather than implying coverage.
export function getTariffSpec(tariff: Tariff, state: StateCode, period: Period): TariffSpec {
  const resolved: Tariff =
    tariff === "solar_sharer" && !isSolarSharerState(state) ? "tou" : tariff;

  const flatRow = priceFor(state, "electricity", period);

  if (resolved === "solar_sharer") {
    const offPeak = priceFor(state, "electricity_sso_off_peak", period);
    const freeRow = priceFor(state, "electricity_sso_free", period);
    return {
      tariff: resolved,
      importDolKwh: offPeak.kwh,
      evDolKwh: offPeak.kwh,
      dailyCharge: freeRow.daily,
      freeWindow: true,
      freeCapKwhDay: SOLAR_SHARER_CAP_KWH_DAY,
      exportEvening: "fit",
    };
  }

  const importDolKwh = resolved === "flat"
    ? flatRow.kwh
    : priceFor(state, "electricity_off_peak", period).kwh;

  return {
    tariff: resolved,
    importDolKwh,
    evDolKwh: importDolKwh,
    dailyCharge: flatRow.daily,
    freeWindow: false,
    freeCapKwhDay: 0,
    exportEvening: resolved === "amber" ? "wholesale_peak" : "fit",
  };
}

// ---------------------------------------------------------------------------
// Household load profile + free-window / min_retail allocation
// ---------------------------------------------------------------------------
// Ports R compute_household_loads(), get_household_min_retail() and
// get_household_free_window(). These three must agree with each other and with
// the appliance-level pricing: energy the free window already supplied at $0 is
// not energy solar needs to cover or the battery can be credited with
// displacing. Without netting it out the battery credit exceeds what the
// appliance rows were charged, inventing household income.

export interface ApplianceLoads {
  heating: number;
  cooling: number;
  hotwater: number;
  cooking: number;
  otherCooking: number;
  otherElec: number;
}

type LoadKey = keyof ApplianceLoads;

const LOAD_KEYS: LoadKey[] = [
  "heating", "cooling", "hotwater", "cooking", "otherCooking", "otherElec",
];

// SOLAR_FRACTION_TABLE category for each load. Mirrors R
// FREE_WINDOW_CATEGORIES. Vehicles are handled separately (not an appliance).
const LOAD_CATEGORY: Record<LoadKey, string> = {
  heating:      "Space Heating",
  cooling:      "Space Cooling",
  hotwater:     "Water Heating",
  cooking:      "Cooktop",
  otherCooking: "Other Cooking",
  otherElec:    "Other Electronics",
};

export interface HouseholdLoads {
  applianceLoads: ApplianceLoads;
  vehicleLoadKwh: number;   // home-charged EV kWh/day only
}

function zeroByLoad(): Record<LoadKey, number> {
  return { heating: 0, cooling: 0, hotwater: 0, cooking: 0, otherCooking: 0, otherElec: 0 };
}

// Per-scenario electric load profile. Fossil categories contribute zero
// electric load, so they don't enlarge the solar denominator, claim free-window
// budget, or absorb battery discharge. Space Cooling is always electric.
export function householdLoads(
  inputs: HouseInputs,
  houseType: HouseType = "electric",
): HouseholdLoads {
  const { state, occupants, dwelling, drivingLevel } = inputs;
  const occScale = getScalingFactor(occupants);
  const dwScale = dwelling === "apartment" ? APARTMENT_ENERGY_FACTOR : 1;
  const scale = occScale * dwScale;
  const isGas = houseType === "gas";

  const km = kmPerDay(state, drivingLevel);
  // Home-charged share only — fast-charge kWh don't pass through the home
  // meter, so they can't be solar-self-consumed or drawn in the free window.
  const vehicleLoadKwh = isGas ? 0 : vehicleEntries(inputs).reduce(
    (sum, e) => sum + (VEHICLE_EFFICIENCY_WH_KM[e.vClass].electric * km) / 1000
                      * (1 - FAST_CHARGE_FRACTION) * e.weight,
    0,
  );

  return {
    applianceLoads: {
      heating:      isGas ? 0 : energy("Space Heating", "Electric heat pump", state) * scale,
      cooling:      energy("Space Cooling", "Heat pump", state) * scale,
      hotwater:     isGas ? 0 : energy("Water Heating", "Electric heat pump", state) * scale,
      cooking:      isGas ? 0 : energy("Cooktop", "Electric induction", state) * scale,
      otherCooking: OTHER_COOKING_KWH_DAY[state] * scale,
      otherElec:    OTHER_ELECTRONICS_KWH_DAY[state] * scale,
    },
    vehicleLoadKwh,
  };
}

export interface MinRetailResult {
  byLoad: Record<LoadKey, number>;
  applianceKwh: number;
  vehicleKwh: number;
}

// Daily kWh of each load that must be bought at the standard rate no matter
// what on-site supply exists. Applied LAST, so free window + solar + battery
// together can never cover more than (1 - min_retail) of a load. Unlike the
// free window this is tariff-independent: the floor is a physical statement
// about the load, not about the retail plan.
export function householdMinRetail(loads: HouseholdLoads): MinRetailResult {
  const byLoad = zeroByLoad();
  let applianceKwh = 0;
  for (const key of LOAD_KEYS) {
    const loadKwh = loads.applianceLoads[key];
    if (loadKwh <= 0) continue;
    byLoad[key] = loadKwh * getMinRetailFraction(LOAD_CATEGORY[key]);
    applianceKwh += byLoad[key];
  }
  const vehicleKwh = loads.vehicleLoadKwh > 0
    ? loads.vehicleLoadKwh * getMinRetailFraction("Vehicles")
    : 0;
  return { byLoad, applianceKwh, vehicleKwh };
}

export interface FreeWindowResult {
  scaleFactor: number;             // pro-rata cap when demand exceeds the daily cap
  byLoad: Record<LoadKey, number>; // daily free kWh per appliance load
  applianceKwh: number;
  vehicleKwh: number;
  totalKwh: number;
}

const NO_FREE_WINDOW: FreeWindowResult = {
  scaleFactor: 0, byLoad: zeroByLoad(), applianceKwh: 0, vehicleKwh: 0, totalKwh: 0,
};

// Household free-window breakdown for one scenario.
//
// All loads compete for ONE daily budget, so the allocation cannot be made
// per-appliance — an appliance can't know what the others claimed. Compute
// total eligible demand across every load, then scale every load back pro-rata
// if it exceeds the cap, exactly as solar demand is capped at generation.
//
// At realistic sizes the cap does NOT bind (~8-11 kWh/day demand against 24),
// so the per-load sso shares are the binding constraint. That is deliberate:
// without them, 24 kWh is 90%+ of an all-electric household's daily load, so
// "free up to the cap" collapses to "free" and cuts modelled bills by 75-80%.
//
// solarScenario only selects which sso_ column to read — it does not depend on
// any computed solar quantity, which is what keeps this independent of
// householdSelfSufficiency() rather than circular with it.
export function householdFreeWindow(
  loads: HouseholdLoads,
  solarScenario: SolarScenario,
  spec: TariffSpec,
): FreeWindowResult {
  if (!spec.freeWindow) return { ...NO_FREE_WINDOW, byLoad: zeroByLoad() };

  const eligible = zeroByLoad();
  let applianceEligible = 0;
  for (const key of LOAD_KEYS) {
    const loadKwh = loads.applianceLoads[key];
    if (loadKwh <= 0) continue;
    eligible[key] = loadKwh * freeWindowShare(LOAD_CATEGORY[key], solarScenario);
    applianceEligible += eligible[key];
  }
  const vehicleEligible = loads.vehicleLoadKwh > 0
    ? loads.vehicleLoadKwh * freeWindowShare("Vehicles", solarScenario)
    : 0;

  const demand = applianceEligible + vehicleEligible;
  if (spec.freeCapKwhDay <= 0 || demand <= 0) {
    return { ...NO_FREE_WINDOW, byLoad: zeroByLoad() };
  }
  const scaleFactor = demand > spec.freeCapKwhDay ? spec.freeCapKwhDay / demand : 1;

  const byLoad = zeroByLoad();
  for (const key of LOAD_KEYS) byLoad[key] = eligible[key] * scaleFactor;

  return {
    scaleFactor,
    byLoad,
    applianceKwh: applianceEligible * scaleFactor,
    vehicleKwh: vehicleEligible * scaleFactor,
    totalKwh: demand * scaleFactor,
  };
}

// Per-unit-of-load dispatch: free window, then solar, both inside the
// min_retail floor. These are PRIORITY CEILINGS, not additive shares — they
// always total exactly 100% of the load.
//
//   serveable = load * (1 - min_retail)
//   free      = min(load * ssoShare * freeScale, serveable)
//   solar     = min(load * solarFrac * solarScale, serveable - free)
//   paidGrid  = load - free - solar
//
// So solarFrac no longer applies at face value: solar_optimised = 0.85 for hot
// water means "up to 85%", and lands at 50% once the free window has taken its
// 50%. Free-window grid is $0 with NO opportunity cost, whereas a solar kWh
// spent on load is one that can't charge the battery (displacing 24-33c paid
// grid) or be exported — so free goes first and solar takes the remainder.
//
// Getting this backwards (solar first) produces a visible bug: raising solar
// self-consumption cannibalises the free window 1:1 while stripping the battery
// of stored energy, making solar_optimised come out WORSE than solar.
function dispatchLoad(args: {
  loadKwh: number;
  category: string;
  applianceType?: string;
  solarScenario: SolarScenario;
  spec: TariffSpec;
  freeScale: number;
  solarScale: number;
}): { freeKwh: number; solarKwh: number; paidGridKwh: number } {
  const { loadKwh, category, applianceType, solarScenario, spec, freeScale, solarScale } = args;
  if (loadKwh <= 0) return { freeKwh: 0, solarKwh: 0, paidGridKwh: 0 };

  const serveable = Math.max(loadKwh * (1 - getMinRetailFraction(category, applianceType)), 0);

  const freeKwh = spec.freeWindow
    ? Math.min(loadKwh * freeWindowShare(category, solarScenario, applianceType, freeScale), serveable)
    : 0;

  const solarKwh = Math.min(
    loadKwh * getSolarFraction(category, solarScenario, applianceType) * solarScale,
    Math.max(serveable - freeKwh, 0),
  );

  return { freeKwh, solarKwh, paidGridKwh: loadKwh - freeKwh - solarKwh };
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
// + initial inverter unit + mid-life replacement at year 12 (only when the
// horizon is at least that long). Returns 0 under grid_only. Mirrors R model
// has_solar_or_battery inverter accounting in evaluate_solar_battery — both
// units are charged whenever the household has solar or a battery.
function solarSystemCapex(
  state: StateCode,
  solarKw: number,
  scenario: SolarScenario,
  years: number,
): number {
  if (scenario === "grid_only") return 0;
  const pv = SOLAR_PV_COST_PER_KW[state] * solarKw;
  const inverterUnits = years >= INVERTER_REPLACEMENT_YEAR ? 2 : 1;
  return pv + inverterUnits * INVERTER_REPLACEMENT_COST;
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
// SUV for the "no_car" case (callers shouldn't be passing it).
function vehicleClassFromOption(option: VehicleOption): VehicleClass {
  return VEHICLE_OPTION_DATA[option].class ?? "suv";
}

// Normalise the per-car configuration to a list of {option, class, weight}.
// Integer vehicle counts produce one entry per car with weight 1; the
// fractional "average" preset (e.g. 1.8) produces a single entry whose
// weight is the fractional count (energy + capex scale linearly).
export interface VehicleEntry {
  option: VehicleOption;
  vClass: VehicleClass;
  weight: number;
}

export function vehicleEntries(inputs: HouseInputs): VehicleEntry[] {
  const count = inputs.vehicles;
  if (count <= 0) return [];
  const opts = (inputs.vehicleOptions ?? []).filter((o) => o !== "no_car");
  if (opts.length === 0) return [];

  if (!Number.isInteger(count)) {
    const opt = opts[0];
    return [{ option: opt, vClass: vehicleClassFromOption(opt), weight: count }];
  }

  const result: VehicleEntry[] = [];
  for (let i = 0; i < count; i++) {
    const opt = opts[i] ?? opts[opts.length - 1];
    result.push({ option: opt, vClass: vehicleClassFromOption(opt), weight: 1 });
  }
  return result;
}


export function evaluateAllGasHouse(inputs: HouseInputs): HouseCost {
  const { state, occupants, dwelling, period, drivingLevel } = inputs;
  const occScale = getScalingFactor(occupants);
  const dwScale = dwelling === "apartment" ? APARTMENT_ENERGY_FACTOR : 1;
  const years = period === "1year" ? 1 : 15;
  const days = 365 * years;
  const entries = vehicleEntries(inputs);
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

  // The household's tariff applies to the gas home too — R runs one tariff
  // across all six scenarios. This matters: a gas home still draws ~9.5 kWh/day
  // (split AC + baseload), so it pays the tariff's import rate and its supply
  // charge. Solar Sharer is therefore the WORST tariff for a gas household,
  // which inflates the electrification saving by ~$194/yr; combined with the gas
  // home being assigned the sso_grid_only column (~$56/yr) the savings
  // differential carries a ~5% upward bias. Deliberately retained to match R —
  // state it in methodology rather than silently diverging here.
  const spec = getTariffSpec(inputs.tariff, state, period);
  // The gas home has no PV, so it's pinned to grid_only for the free-window
  // column lookup. Free-window kWh still cost $0, so they come out of the paid
  // total.
  const gasHouseFree = householdFreeWindow(
    householdLoads(inputs, "gas"),
    "grid_only",
    spec,
  );
  const elecPaidKwhDay = Math.max(elecDemand - gasHouseFree.applianceKwh, 0);

  // Vehicles — ICE (uses petrol price). Per-car efficiency × km/day × weight.
  const iceKwhDay = entries.reduce(
    (sum, e) => sum + (VEHICLE_EFFICIENCY_WH_KM[e.vClass].ice * km) / 1000 * e.weight,
    0,
  );
  const iceMaintenancePerYear = entries.reduce(
    (sum, e) => sum + VEHICLE_MAINTENANCE_ANNUAL[e.vClass].ice * e.weight,
    0,
  );

  const fossilPrice = priceFor(state, fossil, period);
  const petrolPrice = priceFor(state, "petrol", period);

  const gasVolumeCost    = fossilDemand * 365 * fossilPrice.kwh * years;
  const gasSupplyCost    = fossilDemand > 0 ? fossilPrice.daily * days : 0;
  const petrolVolumeCost = iceKwhDay * 365 * petrolPrice.kwh * years;
  const elecVolumeCost   = elecPaidKwhDay * 365 * spec.importDolKwh * years;
  const elecSupplyCost   = spec.dailyCharge * days;
  const iceMaintenanceCost = iceMaintenancePerYear * years;

  const gas         = gasVolumeCost + gasSupplyCost;
  // Vehicle maintenance rolls into the "petrol" segment (fuel + service +
  // tyres + consumables are all vehicle-running costs from the chart's
  // perspective).
  const petrol      = petrolVolumeCost + iceMaintenanceCost;
  const electricity = elecVolumeCost + elecSupplyCost;

  // Fossil-heated households still need cooling — add a standalone split-AC
  // capex alongside the fossil heating + water + cooktop kit. Mirrors R model
  // cooling_only_capex in evaluate_household. The cooling kWh is already in
  // elecDemand above. Heating capex scales by the state's typical heater
  // count (Heater_numbers_by_state.csv) — energy is unchanged because
  // ENERGY_USE is already whole-of-household.
  const nHeaters = HEATER_COUNT_BY_STATE[state];
  const applianceCapex =
    fossilCapexHeating * nHeaters +
    fossilCapexWater +
    fossilCapexCooktop +
    COOLING_ONLY_CAPEX;
  const vehicleCapex   = entries.reduce(
    (sum, e) => sum + VEHICLE_OPTION_DATA[e.option].iceCapex * e.weight,
    0,
  );
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
  const { state, dwelling, period, solarScenario, drivingLevel } = inputs;
  const years = period === "1year" ? 1 : 15;
  const days = 365 * years;
  const entries = vehicleEntries(inputs);
  const km = kmPerDay(state, drivingLevel);
  const { solarKw: presetSolarKw, batteryKwh: presetBatteryKwh } = wholeHomePreset(dwelling);

  const pvDailyKwh = solarScenario === "grid_only"
    ? 0
    : getSolarDailyKwhPerKw(state, inputs.postcode) * presetSolarKw;
  // Resolves the tariff, builds the load profile, allocates the free window and
  // the min_retail floor, then splits what's left across solar and paid grid.
  const bd = householdBreakdown(inputs, "electric", pvDailyKwh);
  const spec = bd.spec;

  // EV charging — split into home-charged (eligible for solar and the free
  // window) and public DC fast-charged (no solar, no supply charge, priced at
  // the fast-charge rate). Per-car efficiencies are summed so mixed fleets
  // compute the right total kWh/day.
  const evTotalKwhDay = entries.reduce(
    (sum, e) => sum + (VEHICLE_EFFICIENCY_WH_KM[e.vClass].electric * km) / 1000 * e.weight,
    0,
  );
  const evMaintenancePerYear = entries.reduce(
    (sum, e) => sum + VEHICLE_MAINTENANCE_ANNUAL[e.vClass].electric * e.weight,
    0,
  );
  const evFastKwhDay = evTotalKwhDay * FAST_CHARGE_FRACTION;
  const evHomeKwhDay = bd.vehicleLoadKwh;   // == evTotalKwhDay × (1 - fast fraction)

  const fastChargePrice = priceFor(state, "ev_fast_charge", period);

  // Appliance grid kWh: total load less what the free window and solar served.
  // Free-window kWh are grid-sourced but cost $0, so they come out of the PAID
  // total while staying inside grid kWh for emissions purposes.
  const nonEvPaidGridKwhDay = Math.max(
    bd.applianceLoadKwh - bd.applianceSolarKwh - bd.free.applianceKwh,
    0,
  );
  const evPaidHomeGridKwhDay = Math.max(
    evHomeKwhDay - bd.vehicleSolarKwh - bd.free.vehicleKwh,
    0,
  );

  // EV_TARIFF_SHARE caps how much of the car's demand can be billed at the
  // tariff's EV rate; the rest falls back to the import rate. Struck against
  // TOTAL (not home-charged) kWh — see the constant.
  const evRateCapKwhDay = Math.max(EV_TARIFF_SHARE, 0) * evTotalKwhDay;
  const evRateKwhDay = Math.min(evPaidHomeGridKwhDay, evRateCapKwhDay);
  const evOtherKwhDay = evPaidHomeGridKwhDay - evRateKwhDay;

  const elecRetailCost = nonEvPaidGridKwhDay * 365 * spec.importDolKwh * years;
  const evHomeChargeCost =
    (evRateKwhDay * spec.evDolKwh + evOtherKwhDay * spec.importDolKwh) * 365 * years;
  const evFastChargeCost = evFastKwhDay * 365 * fastChargePrice.kwh * years;
  // The daily supply charge comes from the TARIFF, not the flat "electricity"
  // row: Solar Sharer carries its own materially higher standing charge, which
  // is the standing cost of the free window and has to be billed alongside it
  // or the plan looks free.
  const elecSupplyCost = spec.dailyCharge * days;

  // --- Solar + battery credits ---
  // Three streams, all always-on (no user toggle — the tariff decides how each
  // is priced):
  //   - FiT on daytime excess solar export
  //   - battery → home discharge, credited at the tariff's import rate
  //   - battery → EV, credited at the tariff's EV rate
  //   - evening export residual: tiered wholesale under amber, else flat FiT
  //
  // The battery credits CANCEL rather than add income: the appliance/EV pricing
  // above bills every grid kWh including battery-served ones, so the credit is
  // struck at exactly the same rate to net those kWh to $0. Capex is charged
  // separately. If the two sides read different rates the difference becomes
  // fabricated household revenue — which is why both read `spec`.
  //
  // Daytime self-consumption is already credited above by reducing paid grid
  // kWh, so it isn't added here (that would double-count).
  let batteryCredit = 0;
  let batteryCapex = 0;
  if (solarScenario !== "grid_only") {
    const flows = annualBatteryFlows(inputs, presetSolarKw, presetBatteryKwh, years);
    const fit = FIT_BY_STATE[state] ?? 0;
    const fitExportPerYear = flows.exportKwh * fit;
    const batteryToHomePerYear = flows.batteryDischargeKwh * spec.importDolKwh;
    const batteryToEvPerYear = batteryEvAnnualValue({
      batteryEvKwhPerYear: flows.batteryEvChargeKwh,
      evHomeGridKwhDay: evPaidHomeGridKwhDay,
      evTotalKwhDay,
      spec,
    });
    const eveningExportPerYear = eveningExportAnnualValue(state, spec, flows, presetSolarKw);
    batteryCredit = (fitExportPerYear + batteryToHomePerYear + batteryToEvPerYear
                     + eveningExportPerYear) * years;
    // Chart 1 always pairs the home battery with a fresh PV install, so the
    // install crew is already on site and the marginal battery installation
    // cost is 0. Mirrors R evaluate_solar_battery:
    // installation_cost <- if (solar_kwp > 0) 0 else binfo$installation.
    batteryCapex = BATTERY_COST_PER_KWH * presetBatteryKwh;
  }

  // State appliance subsidies (Appliance_subsidies.csv). Heat pump rebate
  // fires once per heat pump appliance category (space heating + water
  // heating), regardless of how many heating units are installed — mirrors
  // R get_appliance_subsidy. Solar PV rebate is a flat $ off the install;
  // battery rebate is $/kWh × battery size and only fires under VPP enrolment
  // (HouseInputs.batteryVpp — mirrors R's battery_vpp). Capex floors at 0.
  const subsidies = getApplianceSubsidies(state, dwelling, inputs.batteryVpp);
  const heatPumpSubsidyTotal = subsidies.heatPumpPerAppliance * 2; // space + water
  // Heating capex scales by the state's typical heater count
  // (Heater_numbers_by_state.csv) — one reverse-cycle AC per heating zone.
  // Energy is whole-of-household so it doesn't change.
  const nHeaters = HEATER_COUNT_BY_STATE[state];
  const applianceCapex = Math.max(
    0,
    APPLIANCE_CAPEX.spaceHeatingHeatPump * nHeaters +
      APPLIANCE_CAPEX.waterHeatingHeatPump +
      APPLIANCE_CAPEX.cooktopInduction +
      SWITCHBOARD_UPGRADE_CAPEX -
      heatPumpSubsidyTotal,
  );
  const vehicleCapex   = entries.reduce(
    (sum, e) => sum + VEHICLE_OPTION_DATA[e.option].evCapex * e.weight,
    0,
  );
  const pvCapexRaw = solarSystemCapex(state, presetSolarKw, solarScenario, years);
  const pvCapex    = solarScenario !== "grid_only"
    ? Math.max(0, pvCapexRaw - subsidies.solarPv)
    : pvCapexRaw;
  const batteryCapexNet = Math.max(0, batteryCapex - subsidies.batteryPerKwh * presetBatteryKwh);
  const totalCapex     = applianceCapex + vehicleCapex + pvCapex + batteryCapexNet;

  // 1-year view is operating-cost only at current prices (no capex, no finance).
  const { capital, interest } = period === "1year"
    ? { capital: 0, interest: 0 }
    : computeCapitalAndInterest(totalCapex, inputs, years);

  // EV maintenance (service + tyres + consumables) is rolled into the
  // electricity column alongside fuel + supply (mirrors R annual_opex,
  // which sums all three).
  const evMaintenanceCost = evMaintenancePerYear * years;
  // Battery credit reduces the electricity column. Keep it floored at 0 so
  // the chart doesn't render a negative segment.
  const electricity = Math.max(
    elecRetailCost + evHomeChargeCost + evFastChargeCost + elecSupplyCost + evMaintenanceCost - batteryCredit,
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
    { value: "Electric heat pump",  label: "Air conditioner",   fuel: "electricity", capex: 3200 },
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
// vehicle contribution is (1 - FAST_CHARGE_FRACTION) × per-class Wh/km × km
// summed across the fleet, because public DC fast-charge kWh don't pass
// through the home meter and so don't pay into the home supply charge.
function getElecSupplyShare(
  state: StateCode,
  occupants: number,
  category: ApplianceCategory | "Other",
  includeVehicles: boolean,
  entries: VehicleEntry[],
  drivingLevel: DrivingLevel,
): number {
  const occScale = getScalingFactor(occupants);
  // Chart 2 treats Space Heating as heating-only (cooling is shown only in
  // chart 1). The cooling load still exists on the meter, so it stays in the
  // denominator — but it isn't attributed to the Space Heating bucket.
  const heating = energy("Space Heating", "Electric heat pump", state) * occScale;
  const cooling = energy("Space Cooling", "Heat pump",          state) * occScale;
  const water   = energy("Water Heating", "Electric heat pump", state) * occScale;
  const cooktop = energy("Cooktop",       "Electric induction", state) * occScale;
  const other   = OTHER_ELEC_KWH_DAY[state] * occScale;
  const km = kmPerDay(state, drivingLevel);
  const vehicle = entries.reduce(
    (sum, e) => sum + (VEHICLE_EFFICIENCY_WH_KM[e.vClass].electric * km) / 1000
                      * (1 - FAST_CHARGE_FRACTION) * e.weight,
    0,
  );

  let total = heating + cooling + water + cooktop + other;
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
// We're showing what a typical setup costs for one of each appliance, so:
//   - Space heating gas / LPG / heat pump: N units, where N = HEATER_COUNT_BY_STATE[state].
//   - Space heating resistive: N × 2 units. Resistive units cover a smaller
//     zone each, so households install roughly twice as many per heating zone.
//   Mirrors R compare_space_heating(), which passes n_units = get_heater_count(state)
//   for gas/LPG/heat pump and n_units = get_heater_count(state) * 2 for resistive.
//   Energy use is whole-of-household so it doesn't scale — only capex does.
//   - Water heating / cooktop: 1 unit
//   - Vehicles: 1 car (overrides the household's count)
const RESISTIVE_UNITS_PER_HEATER = 2;
const SINGLE_OPTION_VEHICLE_COUNT = 1;

export function evaluateSingleOption(base: HouseInputs, single: SingleOptionInputs): HouseCost {
  const { state, occupants, dwelling, solarScenario, drivingLevel } = base;
  const { category, option, period, includeCapex } = single;
  const occScale = getScalingFactor(occupants);
  const dwScale = dwelling === "apartment" ? APARTMENT_ENERGY_FACTOR : 1;
  const years = period === "1year" ? 1 : 15;
  const days = 365 * years;
  // Chart 3 always shows the cost of ONE car using the household's first
  // configured vehicle (the user's primary pick). Mixed fleets are
  // represented in chart 1; this chart compares a single appliance.
  const householdEntries = vehicleEntries(base);
  const primary = householdEntries[0];
  const primaryOption = primary?.option ?? "byd_dolphin";
  const vClass = primary?.vClass ?? vehicleClassFromOption(primaryOption);

  // --- Energy (kWh/day) ---
  // Chart 2 compares appliances like-for-like: Space Heating is heating-only
  // (no cooling bundled into the heat pump path), so gas vs heat pump is a
  // fair heating-vs-heating comparison. Cooling is still counted in chart 1's
  // whole-house totals.
  let energyKwhDay = 0;
  if (category === "Vehicles") {
    if (householdEntries.length === 0) {
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
  // Grid kWh: priced at the tariff's import rate (or the tariff's EV rate for
  // EV home charging) — never the flat "electricity" row unless the tariff is
  // flat. Free-window kWh cost $0. Self-consumed solar kWh: priced at LCOE only
  // (R solar_marginal_cost = TRUE), since a single-appliance comparison has
  // nowhere else to put the PV system's capex. No "forgone FiT" charge — the FiT
  // flow is independent and applies only to kWh actually exported.
  const price = priceFor(state, option.fuel, period);
  const spec = getTariffSpec(base.tariff, state, period);

  // Free window, then solar, both inside the min_retail floor. Standalone
  // callers leave both scale factors at 1 (the historical assumption that the
  // household has enough PV, and that this load alone doesn't exhaust the
  // household's free-window budget). Only home-charged EV kWh are eligible.
  const dispatchable = category === "Vehicles" ? homeKwhDay : energyKwhDay;
  const { freeKwh: freeKwhDay, solarKwh: solarKwhDay } = option.fuel === "electricity"
    ? dispatchLoad({
        loadKwh: dispatchable,
        category,
        applianceType: category === "Vehicles" ? undefined : option.value,
        solarScenario,
        spec,
        freeScale: 1,
        solarScale: 1,
      })
    : { freeKwh: 0, solarKwh: 0 };

  // Grid kWh bought inside the free window are zero-cost but still grid-sourced,
  // so they come out of the PAID total only.
  const paidHomeGridKwhDay = Math.max(dispatchable - solarKwhDay - freeKwhDay, 0);

  let volumeCost: number;
  if (category === "Vehicles" && option.fuel === "electricity") {
    const fastPrice = priceFor(state, "ev_fast_charge", period);
    // Cap the EV-rate block at EV_TARIFF_SHARE of TOTAL demand (energyKwhDay
    // includes the fast-charge portion); the residual falls back to the tariff's
    // import rate. Matches the whole-house path and R evaluate_option().
    const rateCapKwhDay = Math.max(EV_TARIFF_SHARE, 0) * energyKwhDay;
    const rateKwhDay    = Math.min(paidHomeGridKwhDay, rateCapKwhDay);
    const otherKwhDay   = paidHomeGridKwhDay - rateKwhDay;
    volumeCost = (rateKwhDay * spec.evDolKwh + otherKwhDay * spec.importDolKwh) * 365 * years
               + fastKwhDay * 365 * fastPrice.kwh * years
               + solarLcoeCost(state, solarKwhDay, years);
  } else if (option.fuel === "electricity") {
    volumeCost = paidHomeGridKwhDay * 365 * spec.importDolKwh * years
               + solarLcoeCost(state, solarKwhDay, years);
  } else {
    volumeCost = energyKwhDay * 365 * price.kwh * years;
  }

  // --- Supply charge (proportional, per R) ---
  // The all-electric denominator that drives the share uses the household's
  // actual fleet (mirrors R evaluate_option, which threads n_vehicles through
  // to get_elec_supply_share). The energy term itself stays at 1 car — we're
  // costing one of this appliance, not the whole fleet.
  //
  // The daily rate comes from the tariff spec, not the flat "electricity" row:
  // Solar Sharer's standing charge is materially higher and has to be billed
  // alongside the free window or the plan looks free.
  let gasSupply = 0;
  let elecSupply = 0;
  if (option.fuel === "electricity") {
    const includeVeh = category === "Vehicles";
    const share = getElecSupplyShare(
      state, occupants, category, includeVeh, householdEntries, drivingLevel,
    );
    elecSupply = spec.dailyCharge * days * share;
  } else if ((option.fuel === "gas" || option.fuel === "lpg") && category !== "Vehicles") {
    const share = getGasSupplyShare(state, occupants, category);
    gasSupply = price.daily * days * share;
  }

  const isGasFuel  = option.fuel === "gas" || option.fuel === "lpg" || option.fuel === "wood";
  const isPetrolFuel = option.fuel === "petrol" || option.fuel === "diesel";
  // Maintenance is appended to the relevant fuel column further down once
  // vehicleMaintenanceCost is computed (Vehicles category only).
  let gas         = isGasFuel ? volumeCost + gasSupply : 0;
  let petrol      = isPetrolFuel ? volumeCost : 0;
  let electricity = option.fuel === "electricity" ? volumeCost + elecSupply : 0;

  // --- State appliance subsidies (Heat pump rebate from Appliance_subsidies.csv)
  // The single-appliance heat pump rows attract the heat pump subsidy in
  // states like VIC. Solar PV / battery rebates don't fire here — those are
  // tracked on chart 1 + chart 2 where the PV / battery capex actually lives.
  const subsidies = getApplianceSubsidies(state, dwelling, base.batteryVpp);
  const heatPumpEligible =
    (category === "Space Heating" || category === "Water Heating") &&
    option.value === "Electric heat pump";

  // --- Vehicle maintenance — operational, rolled into the fuel segment of
  // the chart. ICE → petrol column, EV → electricity column.
  let vehicleMaintenanceCost = 0;
  if (category === "Vehicles") {
    const perYear = option.fuel === "electricity"
      ? VEHICLE_MAINTENANCE_ANNUAL[vClass].electric
      : VEHICLE_MAINTENANCE_ANNUAL[vClass].ice;
    vehicleMaintenanceCost = perYear * SINGLE_OPTION_VEHICLE_COUNT * years;
  }

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
          ? VEHICLE_OPTION_DATA[primaryOption].evCapex
          : VEHICLE_OPTION_DATA[primaryOption].iceCapex;
      totalCapex = perUnit * SINGLE_OPTION_VEHICLE_COUNT;
    } else if (category === "Space Heating") {
      // Heater capex scales by the state's typical heater count (gas, LPG,
      // resistive, heat pump alike — one unit per heating zone). Resistive
      // doubles on top of that because each unit covers a smaller area.
      // Energy is whole-of-household so this only affects capex.
      const heaterUnits = option.value === "Electric resistance"
        ? HEATER_COUNT_BY_STATE[state] * RESISTIVE_UNITS_PER_HEATER
        : HEATER_COUNT_BY_STATE[state];
      totalCapex = option.capex * heaterUnits;
    } else {
      totalCapex = option.capex;
    }
    if (heatPumpEligible) {
      totalCapex = Math.max(0, totalCapex - subsidies.heatPumpPerAppliance);
    }
    const fin = computeCapitalAndInterest(totalCapex, base, years);
    capital = fin.capital;
    interest = fin.interest;
  }

  if (vehicleMaintenanceCost > 0) {
    if (option.fuel === "electricity") electricity += vehicleMaintenanceCost;
    else if (isPetrolFuel)            petrol      += vehicleMaintenanceCost;
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

// Two consumption profiles flow through the solar+battery chart:
//   "electric" — fully electrified household (default; used everywhere else)
//   "gas"      — gas heating + gas water + gas cooktop + petrol vehicles, so
//                only cooling + other electric appliances draw from the grid
export type HouseType = "electric" | "gas";

// Everything the household-level calculations share: the resolved tariff, the
// per-scenario electric load profile, the free-window and min_retail
// allocations, and the solar split those two leave behind.
//
// Assembled in R's order, which matters: the free window dispatches FIRST, so
// solar only claims load the free window hasn't already covered. Computing it
// the other way round makes the two cannibalise each other (both are $0) while
// stripping the battery of stored energy.
export interface HouseholdBreakdown {
  spec: TariffSpec;
  loads: HouseholdLoads;
  free: FreeWindowResult;
  minRetail: MinRetailResult;
  applianceLoadKwh: number;
  applianceSolarKwh: number;
  vehicleLoadKwh: number;
  vehicleSolarKwh: number;
  solarDemandKwh: number;    // before the generation cap
  solarScaleFactor: number;  // bottom-up cap: generation / demand, ≤ 1
  totalPct: number;          // self-sufficiency
}

// Mirrors R get_household_self_sufficiency(), wrapped together with the
// load/free-window/min_retail steps that always precede it.
//
// `availableSolarKwh` is daily PV generation. Pass undefined to leave
// self-consumption uncapped (scale = 1).
export function householdBreakdown(
  inputs: HouseInputs,
  houseType: HouseType = "electric",
  availableSolarKwh?: number,
): HouseholdBreakdown {
  const { solarScenario, state, period } = inputs;
  const spec = getTariffSpec(inputs.tariff, state, period);
  const loads = householdLoads(inputs, houseType);
  const free = householdFreeWindow(loads, solarScenario, spec);
  const minRetail = householdMinRetail(loads);

  const applianceLoadKwh = LOAD_KEYS.reduce((sum, k) => sum + loads.applianceLoads[k], 0);
  const vehicleLoadKwh = loads.vehicleLoadKwh;
  const totalLoad = applianceLoadKwh + vehicleLoadKwh;

  if (solarScenario === "grid_only" || totalLoad === 0) {
    return {
      spec, loads, free, minRetail,
      applianceLoadKwh, applianceSolarKwh: 0,
      vehicleLoadKwh, vehicleSolarKwh: 0,
      solarDemandKwh: 0,
      solarScaleFactor: solarScenario === "grid_only" ? 0 : 1,
      totalPct: 0,
    };
  }

  // Per-load solar demand, bounded below by the min_retail floor and by what
  // the free window already served: free + solar <= load * (1 - min_retail).
  let applianceSolarDemand = 0;
  for (const key of LOAD_KEYS) {
    const loadKwh = loads.applianceLoads[key];
    if (loadKwh <= 0) continue;
    const category = LOAD_CATEGORY[key];
    const serveable = Math.max(loadKwh - minRetail.byLoad[key], 0);
    applianceSolarDemand += Math.min(
      loadKwh * getSolarFraction(category, solarScenario),
      Math.max(serveable - free.byLoad[key], 0),
    );
  }
  const vehicleSolarDemand = Math.min(
    vehicleLoadKwh * getSolarFraction("Vehicles", solarScenario),
    Math.max(vehicleLoadKwh - minRetail.vehicleKwh - free.vehicleKwh, 0),
  );
  const solarDemandKwh = applianceSolarDemand + vehicleSolarDemand;

  // Bottom-up cap: actual self-consumption can't exceed what the PV generates
  // on the day.
  let solarScaleFactor = 1;
  if (availableSolarKwh !== undefined) {
    if (availableSolarKwh <= 0) solarScaleFactor = 0;
    else if (solarDemandKwh > availableSolarKwh) solarScaleFactor = availableSolarKwh / solarDemandKwh;
  }

  const applianceSolarKwh = applianceSolarDemand * solarScaleFactor;
  const vehicleSolarKwh = vehicleSolarDemand * solarScaleFactor;

  return {
    spec, loads, free, minRetail,
    applianceLoadKwh, applianceSolarKwh,
    vehicleLoadKwh, vehicleSolarKwh,
    solarDemandKwh, solarScaleFactor,
    totalPct: (applianceSolarKwh + vehicleSolarKwh) / totalLoad,
  };
}

// Single-season battery flow — direct port of one row of battery_model.R.
//
// Stored solar partitions THREE ways in strict priority, and the three outputs
// sum exactly to storedSolar × (1 - safeguard) so they can be summed without
// double-counting:
//
//   1. house load  — battery-eligible load not met by solar or the free window
//   2. EV          — capped at the EV's unmet home-charging load
//   3. evening export — the residual; NEVER dropped
//
// Order between 2 and 3 is decided by comparing prices (`surplusEvFirst`), not
// by a caller flag. In practice the EV always wins (avoided import 24-33c vs
// evening export 2-14c), but deriving it means the model can't be put into an
// economically incoherent state. Previously step 3 didn't exist when arbitrage
// was off and that residual was silently discarded.
function batterySeasonRow(args: {
  dailySolarKwh: number;
  dailyConsumptionKwh: number;
  selfSufficiencyPct: number;
  effectiveBatteryKwh: number;
  batteryEligibleLoadKwh: number;        // net of free window + min_retail
  batteryEligibleSolarTargetKwh: number;
  evUnmetLoadKwh: number;                // net of solar, free window + min_retail
  surplusEvFirst: boolean;
  solarMultiplier: number;
}): {
  exportKwh: number;
  batterySelfConsumptionKwh: number;
  batteryEvChargeKwh: number;
  arbitrageHeadroomKwh: number;
  loadMetBySolarKwh: number;
  storedSolarKwh: number;
} {
  const {
    dailySolarKwh, dailyConsumptionKwh, selfSufficiencyPct, effectiveBatteryKwh,
    batteryEligibleLoadKwh, batteryEligibleSolarTargetKwh, evUnmetLoadKwh,
    surplusEvFirst, solarMultiplier,
  } = args;

  const solar = dailySolarKwh * solarMultiplier;
  const loadMetBySolar = Math.min(dailyConsumptionKwh * selfSufficiencyPct, solar);

  // Battery-eligible (appliance) loads get priority over non-eligible loads
  // (the EV) when solar is scarce.
  const batteryEligibleSolarConsumed = Math.min(batteryEligibleSolarTargetKwh, loadMetBySolar);
  const loadUnmetBySolar = Math.max(batteryEligibleLoadKwh - batteryEligibleSolarConsumed, 0);

  const storedSolar = Math.min(
    (solar - loadMetBySolar) * BATTERY_ROUND_TRIP_EFFICIENCY,
    effectiveBatteryKwh,
  );
  const exportKwh = solar - (storedSolar / BATTERY_ROUND_TRIP_EFFICIENCY + loadMetBySolar);

  // Usable stored solar after the household reserve is held back — the pool
  // that gets partitioned three ways.
  const usableStored = storedSolar * (1 - BATTERY_HOUSEHOLD_SAFEGUARD_PCT);

  // 1. House load first.
  const batterySelfConsumptionKwh = Math.min(usableStored, loadUnmetBySolar);
  // 2. Whatever is left after the house is satisfied.
  const surplusStored = Math.max(usableStored - loadUnmetBySolar, 0);
  // 3. Surplus routing, higher-value use first. The EV can only absorb its
  //    unmet home-charging load; the evening export window is unbounded here
  //    (the inverter tier cap is applied when the export is valued).
  let batteryEvChargeKwh = 0;
  let arbitrageHeadroomKwh = surplusStored;
  if (surplusEvFirst) {
    batteryEvChargeKwh = Math.min(surplusStored, Math.max(evUnmetLoadKwh, 0));
    arbitrageHeadroomKwh = surplusStored - batteryEvChargeKwh;
  }

  return {
    exportKwh,
    batterySelfConsumptionKwh,
    batteryEvChargeKwh,
    arbitrageHeadroomKwh,
    loadMetBySolarKwh: loadMetBySolar,
    storedSolarKwh: storedSolar,
  };
}

interface AnnualSolarBatteryFlows {
  exportKwh: number;             // kWh/yr exported during the day (no battery)
  headroomKwh: number;           // kWh/yr battery → evening export (the residual)
  solarSelfConsumedKwh: number;  // kWh/yr direct daytime self-consumption
  batteryDischargeKwh: number;   // kWh/yr battery discharged to home loads
  batteryEvChargeKwh: number;    // kWh/yr battery discharged to the EV
  // Battery throughput. `batteryStoredKwh` is the AC-equivalent output of the
  // battery (= total discharged kWh = batteryDischargeKwh + batteryEvChargeKwh
  // + headroomKwh). Charge (DC-in) = batteryStoredKwh /
  // BATTERY_ROUND_TRIP_EFFICIENCY — the PV-side draw that produced this output,
  // including the round-trip loss.
  batteryStoredKwh: number;
  // Per-season annualised headroom — needed for the tiered seasonal wholesale
  // valuation (each season uses its own peak_hour_1..4 prices).
  seasonalHeadroomKwh: Record<Season, number>;
}

// Usable share of a battery's nameplate capacity over the analysis horizon.
// Time-AVERAGED, not end-of-life: a 15-year run should be sized on the mean
// capacity across those years (~86% of nameplate at 2.2%/yr), because the
// battery only reaches its end-of-life ~72% in the final year. Linear
// approximation between year-0 capacity (1) and year-N capacity ((1-d)^N),
// within ~1% of the exact exponential integral at these rates. Mirrors
// battery_model.R avg_capacity_factor.
function batteryCapacityFactor(degradation: number, years: number): number {
  return (1 + Math.pow(1 - degradation, years)) / 2;
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
//
// `fitFloor` applies the feed-in tariff as a per-tier floor: a household would
// not accept a wholesale tier below the FiT it could otherwise get, and the late
// peak hours do fall under it (NSW hour 4 ≈ 2.1c against a 5c FiT). Mirrors R
// `mutate(across(starts_with("peak_hour_"), ~ pmax(.x, fit_price_kwh)))`.
function tieredHeadroomAnnualValue(
  state: StateCode,
  flows: AnnualSolarBatteryFlows,
  solarKw: number,
  fitFloor = 0,
): number {
  const tierKwh = inverterKwForSystem(solarKw);
  const tariffs = SEASONAL_PEAK_PRICES[state];
  const daysPerSeason = 365 / 4;
  let total = 0;
  for (const s of SEASONS) {
    const seasonHeadroom = flows.seasonalHeadroomKwh[s];
    if (seasonHeadroom <= 0) continue;
    const dailyHeadroom = seasonHeadroom / daysPerSeason;
    const floored = tariffs[s].map((p) => Math.max(p, fitFloor)) as unknown as
      readonly [number, number, number, number];
    total += tieredHeadroomValuePerDay(dailyHeadroom, floored, tierKwh) * daysPerSeason;
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
  batteryToEvKwhYr: number;         // kWh/yr battery → EV
  freeWindowKwhYr: number;          // kWh/yr drawn free in the 11am–2pm window (Solar Sharer)
  fitExportKwhYr: number;           // kWh/yr daytime PV overflow exported at FiT
  headroomKwhYr: number;            // kWh/yr battery → evening export (the residual)
}

export function solarBatteryEnergyFlows(
  inputs: HouseInputs,
  solarKw: number,
  batteryKwh: number,
): SolarBatteryEnergyFlows {
  const years = inputs.period === "1year" ? 1 : 15;
  const flows = annualBatteryFlows(inputs, solarKw, batteryKwh, years);
  const dailySolarKwh = solarKw > 0 ? getSolarDailyKwhPerKw(inputs.state, inputs.postcode) * solarKw : 0;
  const bd = householdBreakdown(inputs, "electric", dailySolarKwh);
  const dailyConsumptionKwh = bd.applianceLoadKwh + bd.vehicleLoadKwh;
  return {
    solarGenerationKwhYr: dailySolarKwh * 365,
    consumptionKwhYr: dailyConsumptionKwh * 365,
    solarSelfConsumedKwhYr: flows.solarSelfConsumedKwh,
    batteryToHomeKwhYr: flows.batteryDischargeKwh,
    batteryToEvKwhYr: flows.batteryEvChargeKwh,
    freeWindowKwhYr: bd.free.totalKwh * 365,
    fitExportKwhYr: flows.exportKwh,
    headroomKwhYr: flows.headroomKwh,
  };
}

// Diagnostic — per-season battery model output. Mirrors what R returns as
// sb$battery_seasonal so the two implementations can be diffed row-by-row.
// All values are PER DAY for that season (R reports the same way).
export interface SeasonalBatteryRow {
  season: Season;
  solar_multiplier: number;
  daily_solar_generation_kwh: number;
  appliance_solar_kwh: number;     // daily appliance kWh met by solar (post-cap)
  load_met_by_solar_kwh: number;   // daily total kWh met by solar (incl. EV)
  stored_solar_kwh: number;
  export_kwh: number;
  // The three-way partition of usable stored solar. These sum exactly to
  // stored_solar_kwh × (1 - safeguard) — asserted below.
  battery_to_home_kwh: number;
  battery_to_ev_kwh: number;
  arbitrage_headroom_kwh: number;
}

export function seasonalBatteryTrace(
  inputs: HouseInputs,
  solarKw: number,
  batteryKwh: number,
): SeasonalBatteryRow[] {
  const years = inputs.period === "1year" ? 1 : 15;
  if (solarKw <= 0) return [];
  const dailySolarKwh = getSolarDailyKwhPerKw(inputs.state, inputs.postcode) * solarKw;
  const bd = householdBreakdown(inputs, "electric", dailySolarKwh);
  const dailyConsumptionKwh = bd.applianceLoadKwh + bd.vehicleLoadKwh;
  if (dailyConsumptionKwh === 0) return [];

  const degradation = years >= 15 ? BATTERY_DEGRADATION_15YR_AVG : BATTERY_DEGRADATION_1YR;
  const effectiveBatteryKwh =
    batteryKwh > 0
      ? batteryKwh * BATTERY_USEABLE_CAPACITY_PCT * batteryCapacityFactor(degradation, years)
      : 0;

  const batteryEligibleLoadKwh = Math.max(
    bd.applianceLoadKwh - bd.free.applianceKwh - bd.minRetail.applianceKwh, 0);
  const evUnmetLoadKwh = Math.max(
    bd.vehicleLoadKwh - bd.vehicleSolarKwh - bd.free.vehicleKwh - bd.minRetail.vehicleKwh, 0);
  const surplusEvFirst = evUnmetLoadKwh > 0
    && bd.spec.evDolKwh >= eveningMarginalPrice(inputs.state, bd.spec);

  const weights = SEASONAL_SOLAR_WEIGHTS;
  const meanWeight = (weights.spring + weights.summer + weights.autumn + weights.winter) / 4;
  const seasons: Season[] = ["spring", "summer", "autumn", "winter"];

  return seasons.map((s) => {
    const solarMultiplier = weights[s] / meanWeight;
    const row = batterySeasonRow({
      dailySolarKwh,
      dailyConsumptionKwh,
      selfSufficiencyPct: bd.totalPct,
      effectiveBatteryKwh,
      batteryEligibleLoadKwh,
      batteryEligibleSolarTargetKwh: bd.applianceSolarKwh,
      evUnmetLoadKwh,
      surplusEvFirst,
      solarMultiplier,
    });
    return {
      season: s,
      solar_multiplier: solarMultiplier,
      daily_solar_generation_kwh: dailySolarKwh * solarMultiplier,
      appliance_solar_kwh: bd.applianceSolarKwh,
      load_met_by_solar_kwh: row.loadMetBySolarKwh,
      stored_solar_kwh: row.storedSolarKwh,
      export_kwh: row.exportKwh,
      battery_to_home_kwh: row.batterySelfConsumptionKwh,
      battery_to_ev_kwh: row.batteryEvChargeKwh,
      arbitrage_headroom_kwh: row.arbitrageHeadroomKwh,
    };
  });
}

// Representative evening export price used only to decide the surplus dispatch
// ORDER: the best evening tier under amber, otherwise the flat FiT. Mirrors R
// evening_marginal_price in evaluate_solar_battery.
function eveningMarginalPrice(state: StateCode, spec: TariffSpec): number {
  const fit = FIT_BY_STATE[state] ?? 0;
  if (spec.exportEvening !== "wholesale_peak") return fit;
  const prices = SEASONAL_PEAK_PRICES[state];
  return Math.max(...SEASONS.map((s) => prices[s][0]));
}

// Annualised solar + battery flows under the seasonal model. Returns the kWh
// streams the household total needs to value separately:
//   solar self-consumed  → already free at the appliance level
//   battery → home       → credited at the tariff's import rate
//   battery → EV         → credited at the tariff's EV rate
//   solar export (day)   → FiT
//   evening export       → FiT, or tiered wholesale under amber
function annualBatteryFlows(
  inputs: HouseInputs,
  solarKw: number,
  batteryKwh: number,
  years: number,
  houseType: HouseType = "electric",
): AnnualSolarBatteryFlows {
  const emptySeasonal: Record<Season, number> = { summer: 0, autumn: 0, winter: 0, spring: 0 };
  const empty: AnnualSolarBatteryFlows = {
    exportKwh: 0, headroomKwh: 0, solarSelfConsumedKwh: 0, batteryDischargeKwh: 0,
    batteryEvChargeKwh: 0, batteryStoredKwh: 0,
    seasonalHeadroomKwh: { ...emptySeasonal },
  };
  if (solarKw <= 0) return empty;
  const dailySolarKwh = getSolarDailyKwhPerKw(inputs.state, inputs.postcode) * solarKw;
  const breakdown = householdBreakdown(inputs, houseType, dailySolarKwh);
  const dailyConsumptionKwh = breakdown.applianceLoadKwh + breakdown.vehicleLoadKwh;
  if (dailyConsumptionKwh === 0) return empty;

  const degradation = years >= 15 ? BATTERY_DEGRADATION_15YR_AVG : BATTERY_DEGRADATION_1YR;
  const effectiveBatteryKwh =
    batteryKwh > 0
      ? batteryKwh * BATTERY_USEABLE_CAPACITY_PCT * batteryCapacityFactor(degradation, years)
      : 0;

  // Free-window energy is already supplied at $0, so it has to come out of the
  // load the battery is credited with covering — otherwise the battery is paid
  // for displacing kWh that were never charged for, and the credit exceeds what
  // the appliance side billed. Same for the min_retail floor, which must be
  // bought from the grid however much storage exists.
  const batteryEligibleLoadKwh = Math.max(
    breakdown.applianceLoadKwh - breakdown.free.applianceKwh - breakdown.minRetail.applianceKwh,
    0,
  );
  const evUnmetLoadKwh = Math.max(
    breakdown.vehicleLoadKwh - breakdown.vehicleSolarKwh
      - breakdown.free.vehicleKwh - breakdown.minRetail.vehicleKwh,
    0,
  );

  // Dispatch order decided by price, not by a caller flag.
  const surplusEvFirst = evUnmetLoadKwh > 0
    && breakdown.spec.evDolKwh >= eveningMarginalPrice(inputs.state, breakdown.spec);

  const weights = SEASONAL_SOLAR_WEIGHTS;
  const meanWeight = (weights.spring + weights.summer + weights.autumn + weights.winter) / 4;
  const seasons: Season[] = ["spring", "summer", "autumn", "winter"];

  const daysPerSeason = 365 / 4;
  const totals: AnnualSolarBatteryFlows = {
    exportKwh: 0, headroomKwh: 0, solarSelfConsumedKwh: 0, batteryDischargeKwh: 0,
    batteryEvChargeKwh: 0, batteryStoredKwh: 0,
    seasonalHeadroomKwh: { ...emptySeasonal },
  };

  for (const s of seasons) {
    const row = batterySeasonRow({
      dailySolarKwh,
      dailyConsumptionKwh,
      selfSufficiencyPct: breakdown.totalPct,
      effectiveBatteryKwh,
      batteryEligibleLoadKwh,
      batteryEligibleSolarTargetKwh: breakdown.applianceSolarKwh,
      evUnmetLoadKwh,
      surplusEvFirst,
      solarMultiplier: weights[s] / meanWeight,
    });
    const seasonHeadroomKwh = row.arbitrageHeadroomKwh * daysPerSeason;
    totals.exportKwh += row.exportKwh * daysPerSeason;
    totals.headroomKwh += seasonHeadroomKwh;
    totals.seasonalHeadroomKwh[s] = seasonHeadroomKwh;
    totals.solarSelfConsumedKwh += row.loadMetBySolarKwh * daysPerSeason;
    totals.batteryStoredKwh += row.storedSolarKwh * daysPerSeason;
    totals.batteryDischargeKwh += row.batterySelfConsumptionKwh * daysPerSeason;
    totals.batteryEvChargeKwh += row.batteryEvChargeKwh * daysPerSeason;
  }

  return totals;
}

// Value of the battery's evening export. Under amber the household settles at
// wholesale: tiered through the 4-hour evening peak, capped per hour by the
// inverter, using seasonal mean prices — but WITH THE FiT AS A PER-TIER FLOOR.
// The floor is needed because late peak hours fall below the FiT (NSW hour 4 is
// 2.1c against a 5c FiT) and no household would export below its floor.
// Every other tariff exports at the flat FiT.
function eveningExportAnnualValue(
  state: StateCode,
  spec: TariffSpec,
  flows: AnnualSolarBatteryFlows,
  solarKw: number,
): number {
  const fit = FIT_BY_STATE[state] ?? 0;
  if (spec.exportEvening !== "wholesale_peak") return flows.headroomKwh * fit;
  return tieredHeadroomAnnualValue(state, flows, solarKw, fit);
}

// Credit for stored solar diverted to the car. Valued at the rate the EV would
// otherwise have paid, so the credit exactly cancels the grid cost the vehicle
// side still bills. With EV_TARIFF_SHARE < 1 the EV's home charging is billed in
// two blocks, and a household would deplete the EXPENSIVE (over-cap) block
// first — so we do too. At share = 1 the expensive block is empty and this
// collapses to a flat EV-rate credit.
function batteryEvAnnualValue(args: {
  batteryEvKwhPerYear: number;
  evHomeGridKwhDay: number;
  evTotalKwhDay: number;
  spec: TariffSpec;
}): number {
  const { batteryEvKwhPerYear, evHomeGridKwhDay, evTotalKwhDay, spec } = args;
  if (batteryEvKwhPerYear <= 0) return 0;

  const rateCapKwhDay = Math.max(EV_TARIFF_SHARE, 0) * evTotalKwhDay;
  const overCapKwhYear = Math.max(evHomeGridKwhDay - rateCapKwhDay, 0) * 365;

  const fromOverCap = Math.min(batteryEvKwhPerYear, overCapKwhYear);
  const fromEvRate = batteryEvKwhPerYear - fromOverCap;
  return fromOverCap * spec.importDolKwh + fromEvRate * spec.evDolKwh;
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
  }
  if (batteryKwh > 0) {
    // Installation labour is only charged for standalone battery retrofits.
    // When PV is being installed at the same time the crew is already on
    // site, so the marginal install cost is 0. Mirrors R model.
    const installation = solarKw > 0 ? 0 : BATTERY_INSTALLATION_COST;
    capex += BATTERY_COST_PER_KWH * batteryKwh + installation;
  }
  // Inverter — one unit installed with the system, plus a mid-life
  // replacement at year 12 (only if the horizon reaches it). Charged
  // whenever the household has solar OR a battery, mirroring R
  // has_solar_or_battery in evaluate_solar_battery.
  if (solarKw > 0 || batteryKwh > 0) {
    const inverterUnits = years >= INVERTER_REPLACEMENT_YEAR ? 2 : 1;
    capex += inverterUnits * INVERTER_REPLACEMENT_COST;
  }
  return capex;
}

// Per-segment financial breakdown of a solar+battery system over the chosen
// period. All values are positive $; netCost is signed (negative = savings).
//
// solarToHome:   daytime self-consumption × the tariff's import rate
// solarExport:   surplus solar exported during the day × FiT
// batteryToHome: stored solar discharged to home loads × the tariff's import rate
// batteryToEv:   stored solar diverted to the car × the tariff's EV rate
// batteryToGrid: the evening-export residual — tiered wholesale under amber
//                (with the FiT as a per-tier floor), flat FiT otherwise
export interface SolarBatteryCost {
  capital: number;
  interest: number;
  solarToHome: number;
  solarExport: number;
  batteryToHome: number;
  batteryToEv: number;
  batteryToGrid: number;
  netCost: number;  // capex − total savings (signed)
}

// Solar+battery savings + capex broken down by stream so the chart can render
// each in its own colour. Every stream is now always-on: how each is PRICED
// follows from base.tariff rather than a separate user toggle.
export function evaluateSolarBatteryBreakdown(
  base: HouseInputs,
  sb: SolarBatteryInputs,
  houseType: HouseType = "electric",
): SolarBatteryCost {
  const { state, period } = base;
  const { solarKw, batteryKwh, includeCapex } = sb;
  const years = period === "1year" ? 1 : 15;

  const flows = annualBatteryFlows(base, solarKw, batteryKwh, years, houseType);
  const dailySolarKwh = solarKw > 0
    ? getSolarDailyKwhPerKw(state, base.postcode) * solarKw
    : 0;
  const bd = householdBreakdown(base, houseType, dailySolarKwh);
  const spec = bd.spec;
  const fit = FIT_BY_STATE[state] ?? 0;

  // --- Per-year values ---
  // Displaced grid kWh are worth the tariff's import rate — the rate they would
  // otherwise have been billed at, so credit and charge cancel exactly.
  const solarToHomePerYear   = flows.solarSelfConsumedKwh * spec.importDolKwh;
  const solarExportPerYear   = flows.exportKwh            * fit;
  const batteryToHomePerYear = flows.batteryDischargeKwh  * spec.importDolKwh;

  const evPaidHomeGridKwhDay = Math.max(
    bd.vehicleLoadKwh - bd.vehicleSolarKwh - bd.free.vehicleKwh, 0);
  // Gross back up through the fast-charge constant to recover total EV demand —
  // the base the EV_TARIFF_SHARE cap is a share of (R does the same).
  const evTotalKwhDay = FAST_CHARGE_FRACTION < 1
    ? bd.vehicleLoadKwh / (1 - FAST_CHARGE_FRACTION)
    : 0;
  const batteryToEvPerYear = batteryEvAnnualValue({
    batteryEvKwhPerYear: flows.batteryEvChargeKwh,
    evHomeGridKwhDay: evPaidHomeGridKwhDay,
    evTotalKwhDay,
    spec,
  });

  const batteryToGridPerYear = eveningExportAnnualValue(state, spec, flows, solarKw);

  // --- Total over the period ---
  const solarToHome   = solarToHomePerYear   * years;
  const solarExport   = solarExportPerYear   * years;
  const batteryToHome = batteryToHomePerYear * years;
  const batteryToEv   = batteryToEvPerYear   * years;
  const batteryToGrid = batteryToGridPerYear * years;
  const totalSavings  = solarToHome + solarExport + batteryToHome + batteryToEv + batteryToGrid;

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
    batteryToEv,
    batteryToGrid,
    netCost: capital + interest - totalSavings,
  };
}

// Diagnostics for the battery component of chart 1 — surfaces the annual kWh
// flows and the prices the tariff resolved to, so it's visible what the tariff
// selection is actually doing. `resolvedTariff` reports what was USED, which is
// not always what was requested (Solar Sharer falls back to tou outside
// SOLAR_SHARER_STATES).
export interface WholeHomeBatteryDiagnostics {
  active: boolean;
  solarKw: number;
  batteryKwh: number;
  resolvedTariff: Tariff;
  requestedTariff: Tariff;
  // Annual PV-side flow split. The downstream values sum to the array's
  // nameplate generation (sans round-trip losses on the battery leg):
  //   generation = self-consumed + battery-charge + export
  solarGenerationKwhPerYear: number;     // raw array output
  solarSelfConsumedKwhPerYear: number;   // direct daytime → home
  batteryChargeKwhPerYear: number;       // DC-in to the battery
  exportKwhPerYear: number;              // daytime FiT export
  // The three-way partition of usable stored solar.
  batteryToHomeKwhPerYear: number;
  batteryToEvKwhPerYear: number;
  headroomKwhPerYear: number;            // evening export residual
  // Battery discharge (AC-out): what the battery actually delivers.
  // Charge - discharge is the round-trip loss.
  batteryDischargeKwhPerYear: number;
  // Free-window energy — the most legible explanation of why Solar Sharer
  // differs. 0 on every other tariff.
  freeWindowKwhPerDay: number;
  freeWindowCapKwhPerDay: number;
  freeWindowBinding: boolean;            // true when the household cap bit
  importPriceKwh: number;
  fitPriceKwh: number;
  eveningExportPriceKwh: number;         // blended $/kWh actually received
  eveningExportAnnualValue: number;
}

export function wholeHomeBatteryDiagnostics(inputs: HouseInputs): WholeHomeBatteryDiagnostics {
  const { solarKw: presetSolarKw, batteryKwh: presetBatteryKwh } = wholeHomePreset(inputs.dwelling);
  const years = inputs.period === "1year" ? 1 : 15;
  const spec = getTariffSpec(inputs.tariff, inputs.state, inputs.period);
  const pvDailyKwh = inputs.solarScenario === "grid_only"
    ? 0
    : getSolarDailyKwhPerKw(inputs.state, inputs.postcode) * presetSolarKw;
  const bd = householdBreakdown(inputs, "electric", pvDailyKwh);
  const fit = FIT_BY_STATE[inputs.state] ?? 0;

  const base = {
    solarKw: presetSolarKw,
    batteryKwh: presetBatteryKwh,
    resolvedTariff: spec.tariff,
    requestedTariff: inputs.tariff,
    freeWindowKwhPerDay: bd.free.totalKwh,
    freeWindowCapKwhPerDay: spec.freeCapKwhDay,
    // The cap binds only when demand exceeded it and everything was scaled back.
    freeWindowBinding: spec.freeWindow && bd.free.scaleFactor < 1,
    importPriceKwh: spec.importDolKwh,
    fitPriceKwh: fit,
  };

  if (inputs.solarScenario === "grid_only") {
    return {
      ...base,
      active: false,
      solarGenerationKwhPerYear: 0,
      solarSelfConsumedKwhPerYear: 0,
      batteryChargeKwhPerYear: 0,
      exportKwhPerYear: 0,
      batteryToHomeKwhPerYear: 0,
      batteryToEvKwhPerYear: 0,
      headroomKwhPerYear: 0,
      batteryDischargeKwhPerYear: 0,
      eveningExportPriceKwh: 0,
      eveningExportAnnualValue: 0,
    };
  }

  const flows = annualBatteryFlows(inputs, presetSolarKw, presetBatteryKwh, years);
  const eveningValue = eveningExportAnnualValue(inputs.state, spec, flows, presetSolarKw);
  // Discharge = AC-out total. Charge = DC-in draw = discharge / round-trip
  // efficiency; the gap is the round-trip loss.
  const dischargeKwh = flows.batteryStoredKwh;
  return {
    ...base,
    active: true,
    solarGenerationKwhPerYear: pvDailyKwh * 365,
    solarSelfConsumedKwhPerYear: flows.solarSelfConsumedKwh,
    batteryChargeKwhPerYear: dischargeKwh / BATTERY_ROUND_TRIP_EFFICIENCY,
    exportKwhPerYear: flows.exportKwh,
    batteryToHomeKwhPerYear: flows.batteryDischargeKwh,
    batteryToEvKwhPerYear: flows.batteryEvChargeKwh,
    headroomKwhPerYear: flows.headroomKwh,
    batteryDischargeKwhPerYear: dischargeKwh,
    eveningExportPriceKwh: flows.headroomKwh > 0 ? eveningValue / flows.headroomKwh : 0,
    eveningExportAnnualValue: eveningValue,
  };
}

// Backwards-compatible HouseCost wrapper for callers that just want a single
// number per cost segment (the savings collapse into a single negative
// `electricity` value). Used by the savings chip — the breakdown view uses
// evaluateSolarBatteryBreakdown directly.
export function evaluateSolarBattery(base: HouseInputs, sb: SolarBatteryInputs): HouseCost {
  const b = evaluateSolarBatteryBreakdown(base, sb);
  const totalSavings =
    b.solarToHome + b.solarExport + b.batteryToHome + b.batteryToEv + b.batteryToGrid;
  return {
    capital: b.capital,
    interest: b.interest,
    gas: 0,
    petrol: 0,
    electricity: -totalSavings,
    total: b.netCost,
  };
}
