// Data ported from the Energy Savings Model 2026 R scripts.
// Source CSVs live at:
//   Research/Data/Clean data - for internal use/Energy savings report data/Model input data

export const STATES = [
  "AUS",
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "WA",
  "TAS",
  "ACT",
  "NT",
] as const;
export type StateCode = (typeof STATES)[number];

export const STATE_LABELS: Record<StateCode, string> = {
  AUS: "Australia",
  NSW: "NSW",
  VIC: "VIC",
  QLD: "QLD",
  SA: "SA",
  WA: "WA",
  TAS: "TAS",
  ACT: "ACT",
  NT: "NT",
};

export type Fuel =
  | "electricity"
  | "electricity_off_peak"
  | "ev_fast_charge"
  | "gas"
  | "lpg"
  | "wood"
  | "petrol"
  | "diesel";

// ---------------------------------------------------------------------------
// average_energy_use_by_appliance_and_state.csv (kWh/day)
// ---------------------------------------------------------------------------

type EnergyRow = Record<StateCode, number>;

export const ENERGY_USE: Record<string, EnergyRow> = {
  "Space Heating|Electric heat pump": {
    AUS: 3.3, NSW: 2.273, ACT: 8.531, NT: 0.263, QLD: 1.253,
    SA: 2.745, TAS: 7.362, VIC: 6.007, WA: 1.969,
  },
  "Space Heating|Electric resistance": {
    AUS: 12.8, NSW: 9.09, ACT: 31.20, NT: 1.11, QLD: 5.16,
    SA: 10.98, TAS: 26.92, VIC: 23.34, WA: 7.87,
  },
  "Space Heating|Natural gas": {
    AUS: 16.0, NSW: 11.36, ACT: 39.00, NT: 1.39, QLD: 6.44,
    SA: 13.72, TAS: 33.65, VIC: 29.18, WA: 9.84,
  },
  "Space Heating|LPG": {
    AUS: 16.0, NSW: 11.36, ACT: 39.00, NT: 1.39, QLD: 6.44,
    SA: 13.72, TAS: 33.65, VIC: 29.18, WA: 9.84,
  },
  "Space Heating|Wood": {
    AUS: 19.7, NSW: 13.99, ACT: 48.00, NT: 1.71, QLD: 7.93,
    SA: 16.89, TAS: 41.42, VIC: 35.91, WA: 12.12,
  },
  "Space Cooling|Heat pump": {
    AUS: 0.94, NSW: 0.77, ACT: 0.74, NT: 7.58, QLD: 1.89,
    SA: 0.63, TAS: 0.09, VIC: 0.10, WA: 1.65,
  },
  "Water Heating|Electric heat pump": {
    AUS: 1.83, NSW: 1.76, ACT: 2.00, NT: 1.27, QLD: 1.64,
    SA: 1.81, TAS: 1.90, VIC: 2.05, WA: 1.84,
  },
  "Water Heating|Electric resistance": {
    AUS: 6.75, NSW: 6.54, ACT: 6.80, NT: 4.99, QLD: 6.28,
    SA: 6.75, TAS: 6.46, VIC: 7.41, WA: 6.84,
  },
  "Water Heating|Natural gas": {
    AUS: 7.93, NSW: 7.69, ACT: 7.99, NT: 5.86, QLD: 7.38,
    SA: 7.93, TAS: 7.59, VIC: 8.70, WA: 8.04,
  },
  "Water Heating|LPG": {
    AUS: 7.93, NSW: 7.69, ACT: 7.99, NT: 5.86, QLD: 7.38,
    SA: 7.93, TAS: 7.59, VIC: 8.70, WA: 8.04,
  },
  "Cooktop|Electric resistance": {
    AUS: 0.94, NSW: 0.95, ACT: 0.88, NT: 0.99, QLD: 0.93,
    SA: 1.00, TAS: 1.00, VIC: 0.92, WA: 0.97,
  },
  "Cooktop|Electric induction": {
    AUS: 0.85, NSW: 0.86, ACT: 0.80, NT: 0.90, QLD: 0.84,
    SA: 0.91, TAS: 0.91, VIC: 0.83, WA: 0.87,
  },
  "Cooktop|Natural gas": {
    AUS: 2.20, NSW: 2.21, ACT: 2.07, NT: 2.32, QLD: 2.17,
    SA: 2.35, TAS: 2.34, VIC: 2.14, WA: 2.26,
  },
  "Cooktop|LPG": {
    AUS: 2.20, NSW: 2.21, ACT: 2.07, NT: 2.32, QLD: 2.17,
    SA: 2.35, TAS: 2.34, VIC: 2.14, WA: 2.26,
  },
};

// "Other Cooking" + "Other Electronics" categories: always-electric loads
// (refrigeration, dishwashers, microwave, ovens, uprights, washers & dryers,
//  lighting, other appliances). Pool Equipment is excluded.
export const OTHER_ELEC_KWH_DAY: Record<StateCode, number> = {
  AUS: 2.06 + 0.30 + 0.30 + 0.34 + 0.39 + 0.44 + 0.91 + 3.86,
  NSW: 2.07 + 0.30 + 0.30 + 0.34 + 0.39 + 0.44 + 0.91 + 3.97,
  ACT: 1.93 + 0.28 + 0.29 + 0.33 + 0.37 + 0.42 + 0.87 + 3.89,
  NT:  2.17 + 0.31 + 0.32 + 0.36 + 0.41 + 0.46 + 0.95 + 4.11,
  QLD: 2.03 + 0.30 + 0.30 + 0.34 + 0.38 + 0.44 + 0.90 + 3.75,
  SA:  2.21 + 0.32 + 0.32 + 0.36 + 0.41 + 0.46 + 0.96 + 3.79,
  TAS: 2.22 + 0.32 + 0.32 + 0.37 + 0.42 + 0.47 + 0.96 + 3.78,
  VIC: 2.01 + 0.29 + 0.30 + 0.34 + 0.38 + 0.44 + 0.90 + 3.87,
  WA:  2.10 + 0.31 + 0.31 + 0.35 + 0.40 + 0.45 + 0.93 + 3.76,
};

// ---------------------------------------------------------------------------
// vehicle_average_efficiency_by_class.csv (Wh/km) — per vehicle class
// AUS-level values; ICE values now reflect the calibrated SMVU figures.
// ---------------------------------------------------------------------------

export type VehicleClass = "suv" | "sedan" | "hatchback";

export const VEHICLE_CLASSES: VehicleClass[] = ["suv", "sedan", "hatchback"];

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = {
  suv: "SUV",
  sedan: "Sedan",
  hatchback: "Hatchback",
};

export const VEHICLE_EFFICIENCY_WH_KM: Record<VehicleClass, { electric: number; ice: number }> = {
  suv:       { electric: 190.8, ice: 1019.2 },
  sedan:     { electric: 173.9, ice: 1036.8 },
  hatchback: { electric: 161.8, ice: 831.6 },
};

// ---------------------------------------------------------------------------
// average_km_per_day_by_state.csv — three driving levels per state.
// "middle" is the state average (canonical R default); "low" / "high" are
// 60% / 140% of middle (matches the columns in the CSV).
// ---------------------------------------------------------------------------

export type DrivingLevel = "low" | "middle" | "high";

export const DRIVING_LEVELS: DrivingLevel[] = ["low", "middle", "high"];

// Labels reflect typical km-per-week ranges that map onto the three CSV
// columns (low ≈ 150 km/wk, middle ≈ 250 km/wk, high ≈ 350 km/wk for AUS).
export const DRIVING_LEVEL_LABELS: Record<DrivingLevel, string> = {
  low: "100–200",
  middle: "200–300",
  high: "300+",
};

export const KM_PER_DAY_BY_LEVEL: Record<StateCode, Record<DrivingLevel, number>> = {
  AUS: { low: 21.84, middle: 36.4,  high: 50.96 },
  NSW: { low: 21.72, middle: 36.2,  high: 50.68 },
  ACT: { low: 21.06, middle: 35.1,  high: 49.14 },
  NT:  { low: 21.54, middle: 35.9,  high: 50.26 },
  QLD: { low: 22.14, middle: 36.9,  high: 51.66 },
  SA:  { low: 21.0,  middle: 35.0,  high: 49.0 },
  TAS: { low: 19.86, middle: 33.1,  high: 46.34 },
  VIC: { low: 22.8,  middle: 38.0,  high: 53.2 },
  WA:  { low: 20.28, middle: 33.8,  high: 47.32 },
};

export function kmPerDay(state: StateCode, level: DrivingLevel): number {
  return KM_PER_DAY_BY_LEVEL[state][level];
}

// ---------------------------------------------------------------------------
// fuel_prices_by_state_simple.csv
// ---------------------------------------------------------------------------

export interface FuelPrice {
  current: number;        // $/kWh, today
  forecast15yr: number;   // $/kWh, 15-year average
  dailyToday: number;     // $/day supply charge today (0 for volume-only fuels)
  daily15yr: number;      // $/day supply charge 15-yr avg
}

export const FUEL_PRICES: Record<StateCode, Partial<Record<Fuel, FuelPrice>>> = {
  AUS: {
    electricity:          { current: 0.3403, forecast15yr: 0.3980, dailyToday: 1.3308, daily15yr: 1.5567 },
    electricity_off_peak: { current: 0.2603, forecast15yr: 0.3045, dailyToday: 0,      daily15yr: 0 },
    ev_fast_charge:       { current: 0.6500, forecast15yr: 0.7603, dailyToday: 0,      daily15yr: 0 },
    gas:                  { current: 0.1575, forecast15yr: 0.1967, dailyToday: 0.7398, daily15yr: 0.9241 },
    lpg:                  { current: 0.2542, forecast15yr: 0.3175, dailyToday: 0.2948, daily15yr: 0.3682 },
    petrol:               { current: 0.1896, forecast15yr: 0.2139, dailyToday: 0,      daily15yr: 0 },
    diesel:               { current: 0.1734, forecast15yr: 0.1957, dailyToday: 0,      daily15yr: 0 },
  },
  NSW: {
    electricity:          { current: 0.3788, forecast15yr: 0.4431, dailyToday: 1.3905, daily15yr: 1.6265 },
    electricity_off_peak: { current: 0.2841, forecast15yr: 0.3323, dailyToday: 0,      daily15yr: 0 },
    ev_fast_charge:       { current: 0.6500, forecast15yr: 0.7603, dailyToday: 0,      daily15yr: 0 },
    gas:                  { current: 0.1526, forecast15yr: 0.1906, dailyToday: 0.7228, daily15yr: 0.9028 },
    lpg:                  { current: 0.2743, forecast15yr: 0.3426, dailyToday: 0.2841, daily15yr: 0.3549 },
    petrol:               { current: 0.1899, forecast15yr: 0.2143, dailyToday: 0,      daily15yr: 0 },
    diesel:               { current: 0.1728, forecast15yr: 0.1950, dailyToday: 0,      daily15yr: 0 },
  },
  VIC: {
    electricity:          { current: 0.2884, forecast15yr: 0.3373, dailyToday: 1.1780, daily15yr: 1.3779 },
    electricity_off_peak: { current: 0.2327, forecast15yr: 0.2722, dailyToday: 0,      daily15yr: 0 },
    ev_fast_charge:       { current: 0.6500, forecast15yr: 0.7603, dailyToday: 0,      daily15yr: 0 },
    gas:                  { current: 0.1304, forecast15yr: 0.1629, dailyToday: 0.8927, daily15yr: 1.1150 },
    lpg:                  { current: 0.2271, forecast15yr: 0.2837, dailyToday: 0.3082, daily15yr: 0.3850 },
    petrol:               { current: 0.1897, forecast15yr: 0.2140, dailyToday: 0,      daily15yr: 0 },
    diesel:               { current: 0.1743, forecast15yr: 0.1967, dailyToday: 0,      daily15yr: 0 },
  },
  QLD: {
    electricity:          { current: 0.3333, forecast15yr: 0.3899, dailyToday: 1.5959, daily15yr: 1.8667 },
    electricity_off_peak: { current: 0.2577, forecast15yr: 0.3014, dailyToday: 0,      daily15yr: 0 },
    ev_fast_charge:       { current: 0.6500, forecast15yr: 0.7603, dailyToday: 0,      daily15yr: 0 },
    gas:                  { current: 0.2065, forecast15yr: 0.2579, dailyToday: 0.7051, daily15yr: 0.8807 },
    lpg:                  { current: 0.2425, forecast15yr: 0.3029, dailyToday: 0.2975, daily15yr: 0.3716 },
    petrol:               { current: 0.1928, forecast15yr: 0.2175, dailyToday: 0,      daily15yr: 0 },
    diesel:               { current: 0.1741, forecast15yr: 0.1964, dailyToday: 0,      daily15yr: 0 },
  },
  SA: {
    electricity:          { current: 0.4376, forecast15yr: 0.5119, dailyToday: 1.2228, daily15yr: 1.4303 },
    electricity_off_peak: { current: 0.3252, forecast15yr: 0.3804, dailyToday: 0,      daily15yr: 0 },
    ev_fast_charge:       { current: 0.6500, forecast15yr: 0.7603, dailyToday: 0,      daily15yr: 0 },
    gas:                  { current: 0.1885, forecast15yr: 0.2354, dailyToday: 0.8521, daily15yr: 1.0643 },
    lpg:                  { current: 0.2515, forecast15yr: 0.3141, dailyToday: 0.3044, daily15yr: 0.3802 },
    petrol:               { current: 0.1839, forecast15yr: 0.2075, dailyToday: 0,      daily15yr: 0 },
    diesel:               { current: 0.1722, forecast15yr: 0.1943, dailyToday: 0,      daily15yr: 0 },
  },
  WA: {
    electricity:          { current: 0.3237, forecast15yr: 0.3786, dailyToday: 1.1605, daily15yr: 1.3574 },
    electricity_off_peak: { current: 0.2369, forecast15yr: 0.2771, dailyToday: 0,      daily15yr: 0 },
    ev_fast_charge:       { current: 0.6500, forecast15yr: 0.7603, dailyToday: 0,      daily15yr: 0 },
    gas:                  { current: 0.1184, forecast15yr: 0.1479, dailyToday: 0.3920, daily15yr: 0.4896 },
    lpg:                  { current: 0.2840, forecast15yr: 0.3547, dailyToday: 0.2685, daily15yr: 0.3354 },
    petrol:               { current: 0.1848, forecast15yr: 0.2085, dailyToday: 0,      daily15yr: 0 },
    diesel:               { current: 0.1710, forecast15yr: 0.1929, dailyToday: 0,      daily15yr: 0 },
  },
  TAS: {
    electricity:          { current: 0.2789, forecast15yr: 0.3262, dailyToday: 1.3486, daily15yr: 1.5775 },
    electricity_off_peak: { current: 0.1669, forecast15yr: 0.1952, dailyToday: 0,      daily15yr: 0 },
    ev_fast_charge:       { current: 0.6500, forecast15yr: 0.7603, dailyToday: 0,      daily15yr: 0 },
    gas:                  { current: 0.1867, forecast15yr: 0.2332, dailyToday: 0.7139, daily15yr: 0.8917 },
    lpg:                  { current: 0.2433, forecast15yr: 0.3039, dailyToday: 0.3592, daily15yr: 0.4487 },
    petrol:               { current: 0.1892, forecast15yr: 0.2135, dailyToday: 0,      daily15yr: 0 },
    diesel:               { current: 0.1737, forecast15yr: 0.1960, dailyToday: 0,      daily15yr: 0 },
  },
  ACT: {
    electricity:          { current: 0.3127, forecast15yr: 0.3658, dailyToday: 1.2741, daily15yr: 1.4903 },
    electricity_off_peak: { current: 0.2841, forecast15yr: 0.3323, dailyToday: 0,      daily15yr: 0 },
    ev_fast_charge:       { current: 0.6500, forecast15yr: 0.7603, dailyToday: 0,      daily15yr: 0 },
    gas:                  { current: 0.1486, forecast15yr: 0.1856, dailyToday: 0.7630, daily15yr: 0.9530 },
    lpg:                  { current: 0.2588, forecast15yr: 0.3233, dailyToday: 0.2841, daily15yr: 0.3549 },
    petrol:               { current: 0.1899, forecast15yr: 0.2143, dailyToday: 0,      daily15yr: 0 },
    diesel:               { current: 0.1728, forecast15yr: 0.1950, dailyToday: 0,      daily15yr: 0 },
  },
  NT: {
    electricity:          { current: 0.3008, forecast15yr: 0.3518, dailyToday: 0.5931, daily15yr: 0.6937 },
    electricity_off_peak: { current: 0.2453, forecast15yr: 0.2869, dailyToday: 0,      daily15yr: 0 },
    ev_fast_charge:       { current: 0.6500, forecast15yr: 0.7603, dailyToday: 0,      daily15yr: 0 },
    // No reticulated natural gas in NT
    lpg:                  { current: 0.3198, forecast15yr: 0.3994, dailyToday: 0.2923, daily15yr: 0.3651 },
    petrol:               { current: 0.2071, forecast15yr: 0.2337, dailyToday: 0,      daily15yr: 0 },
    diesel:               { current: 0.1941, forecast15yr: 0.2190, dailyToday: 0,      daily15yr: 0 },
  },
};

// Fraction of total EV energy obtained at DC fast chargers (Econnex 2025).
// Fast-charged kWh: priced at ev_fast_charge, not eligible for solar, NOT in
// the home electricity supply-charge denominator. The remaining (1 - this)
// is home charging, priced per the household's evTariff setting (see
// EV_DEDICATED_DOL_KWH below or the per-state electricity_off_peak row).
export const FAST_CHARGE_FRACTION = 0.15;

// Dedicated EV tariff ($/kWh) — flat retail rate offered on a separately
// metered EV-only circuit. Applied to home-charged, non-solar EV kWh when
// the household selects the "EV" tariff toggle (HouseInputs.evTariff = "ev").
// Held flat in nominal terms, so 1-year and 15-year values are identical.
// Mirrors R EV_OFF_PEAK_DOL_KWH (R fallback is 5c; we use 8c for AU 2026).
export const EV_DEDICATED_DOL_KWH = 0.08;

// ---------------------------------------------------------------------------
// solar_lcoe_by_state.csv — levelised cost ($/kWh) of self-generated solar.
// Uses the 8% interest-rate row (matches R model SOLAR_LCOE_INTEREST_RATE).
// ---------------------------------------------------------------------------

export const SOLAR_LCOE_BY_STATE: Record<StateCode, number> = {
  AUS: 0.0315,   // "AUS (pop-weighted)" row in CSV
  NSW: 0.0300,
  VIC: 0.0358,
  QLD: 0.0268,
  SA:  0.0316,
  WA:  0.0296,
  TAS: 0.0510,
  ACT: 0.0245,
  NT:  0.0474,
};

// ---------------------------------------------------------------------------
// fuel_prices_by_state_simple.csv — "solar_export" rows: feed-in tariff ($/kWh).
// FiT is held flat over time, so 1-year and 15-year values are identical.
// ---------------------------------------------------------------------------

export const FIT_BY_STATE: Record<StateCode, number> = {
  AUS: 0.0346,
  NSW: 0.05,
  VIC: 0.02,
  QLD: 0.03,
  SA:  0.03,
  WA:  0.02,
  TAS: 0.0878,
  ACT: 0.04,
  NT:  0.0933,
};

// ---------------------------------------------------------------------------
// energy_consumption_scaling_factors.csv
// ---------------------------------------------------------------------------

const SCALING_POINTS: { occupants: number; factor: number }[] = [
  { occupants: 1,   factor: 0.56 },
  { occupants: 2,   factor: 0.90 },
  { occupants: 2.7, factor: 1.00 },
  { occupants: 3,   factor: 1.03 },
  { occupants: 4,   factor: 1.07 },
  { occupants: 5,   factor: 1.37 },
];

export function getScalingFactor(n: number): number {
  const pts = SCALING_POINTS;
  if (n <= pts[0].occupants) return pts[0].factor;
  if (n >= pts[pts.length - 1].occupants) return pts[pts.length - 1].factor;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (n >= a.occupants && n <= b.occupants) {
      const frac = (n - a.occupants) / (b.occupants - a.occupants);
      return a.factor + frac * (b.factor - a.factor);
    }
  }
  return 1;
}

// ---------------------------------------------------------------------------
// APARTMENT_ENERGY_FACTOR — apartments use ~21% less energy than houses
// (ABS / AEMO data, applied as a multiplier on appliance energy use)
// ---------------------------------------------------------------------------

export const APARTMENT_ENERGY_FACTOR = 0.79;

// ---------------------------------------------------------------------------
// Solar + battery sizing & costs — sourced from
//   Tipping point 2026 - input data - FINAL product prices.csv
//   solar_lcoe_by_state.csv          (capacity factor → daily kWh per kW)
//   evening_peak_prices_annual.csv    (median wholesale 4–8 pm price)
// ---------------------------------------------------------------------------

// Solar PV cost ($/kW installed) — varies by state. Sourced from the 8%
// interest-rate row of solar_lcoe_by_state.csv (which is what the R model
// reads via SOLAR_LCOE_INTEREST_RATE). 4-decimal precision for the
// pop-weighted AUS row; integer for the per-state rows (CSV is integer there).
export const SOLAR_PV_COST_PER_KW: Record<StateCode, number> = {
  AUS: 690.3472, ACT: 533, NSW: 649, NT: 1490, QLD: 689,
  SA:  701,      TAS: 921, VIC: 679, WA: 750,
};

// Solar generation per kW per day, derived from the per-state capacity factor
// in solar_lcoe_by_state.csv (capacity_factor × 24 h). Year-1 figures —
// matches the 0.04 first-year degradation default in battery_model.R.
// 4-decimal precision to keep displayed totals within ~$10 of R's output;
// the raw CSV capacity factors run to 6+ decimals.
export const SOLAR_DAILY_KWH_PER_KW: Record<StateCode, number> = {
  AUS: 4.3859, NSW: 4.3126, ACT: 4.4549, NT:  5.7797, QLD: 5.0715,
  SA:  4.3782, TAS: 3.4516, VIC: 3.7567, WA:  4.9536,
};

// One-off battery installation cost (per Tipping point CSV, row "Battery installation").
export const BATTERY_INSTALLATION_COST = 2300;

// Battery hardware cost per kWh — subsidised value (post-rebate).
// Unsubsidised list price would be $940/kWh.
export const BATTERY_COST_PER_KWH = 620;

// VPP annual benefit ($) — flat payment from VPP participation.
export const VPP_ANNUAL_BENEFIT = 300;

// Seasonal evening-peak ($/kWh) by state — four hourly tiers (4-8 pm) across
// the four Australian seasons. Built from evening_peak_prices_monthly.csv by
// averaging peak_hour_1..4 over the months in each season (summer = Dec/Jan/
// Feb, autumn = Mar/Apr/May, winter = Jun/Jul/Aug, spring = Sep/Oct/Nov).
// Used by the tiered headroom valuation in "Wholesale" mode: the household's
// inverter capacity sets the per-hour cap on exports, so the first inverter_kw
// kWh earn hour 1's price, the next inverter_kw earn hour 2's price, etc.
// States missing from the monthly CSV (AUS, NT, ACT) fall back to "National".
export type Season = "summer" | "autumn" | "winter" | "spring";
export const SEASONS: Season[] = ["summer", "autumn", "winter", "spring"];

// One row of peak_hour_1..4_kwh prices ($/kWh).
export type PeakTierPrices = readonly [number, number, number, number];

const NATIONAL_SEASONAL_PEAK: Record<Season, PeakTierPrices> = {
  summer: [0.111199, 0.082917, 0.059692, 0.043643],
  autumn: [0.133191, 0.112397, 0.084942, 0.061245],
  winter: [0.178779, 0.142599, 0.111791, 0.084050],
  spring: [0.116882, 0.079282, 0.048200, 0.026896],
};

export const SEASONAL_PEAK_PRICES: Record<StateCode, Record<Season, PeakTierPrices>> = {
  AUS: NATIONAL_SEASONAL_PEAK,
  NSW: {
    summer: [0.085041, 0.060187, 0.034026, 0.024593],
    autumn: [0.128257, 0.108848, 0.068151, 0.043985],
    winter: [0.186013, 0.141268, 0.104075, 0.066294],
    spring: [0.115813, 0.068006, 0.025820, 0.010120],
  },
  VIC: {
    summer: [0.059178, 0.043675, 0.024563, 0.008345],
    autumn: [0.115115, 0.097146, 0.073922, 0.045906],
    winter: [0.169191, 0.139783, 0.108664, 0.081080],
    spring: [0.085946, 0.061950, 0.032012, 0.011707],
  },
  QLD: {
    summer: [0.083542, 0.059984, 0.031265, 0.021804],
    autumn: [0.123579, 0.103266, 0.055248, 0.030815],
    winter: [0.168917, 0.128348, 0.069669, 0.033213],
    spring: [0.099977, 0.048594, 0.010772, -0.001378],
  },
  SA: {
    summer: [0.147395, 0.081491, 0.036998, 0.005319],
    autumn: [0.134691, 0.111666, 0.087245, 0.053968],
    winter: [0.208182, 0.142743, 0.113576, 0.084026],
    spring: [0.097298, 0.070937, 0.038684, 0.012105],
  },
  WA: {
    summer: [0.152133, 0.123514, 0.104266, 0.085004],
    autumn: [0.160292, 0.132188, 0.117137, 0.101717],
    winter: [0.166914, 0.148936, 0.137487, 0.120276],
    spring: [0.192175, 0.143918, 0.113107, 0.080731],
  },
  TAS: {
    summer: [0.098968, 0.088055, 0.082457, 0.075430],
    autumn: [0.129230, 0.116275, 0.103731, 0.086293],
    winter: [0.173458, 0.154518, 0.137275, 0.119410],
    spring: [0.054688, 0.041881, 0.032000, 0.021156],
  },
  ACT: NATIONAL_SEASONAL_PEAK,
  NT:  NATIONAL_SEASONAL_PEAK,
};

// Inverter capacity (kW) caps each hour's exportable kWh during the four-hour
// evening peak. Small/mid residential systems (≤ ~6.6 kWp) typically run a
// 5 kW inverter; ≥ 10 kWp systems usually have a 10 kW inverter and can push
// 10 kWh into each peak hour.
export const INVERTER_KW = 5;
export const LARGE_SYSTEM_INVERTER_KW = 10;
export const LARGE_SYSTEM_SOLAR_KWP = 10;

// Solar + battery sizes offered in the UI single-appliance toggle.
export const SOLAR_KW_OPTIONS = [6.6, 10, 15] as const;
export type SolarSizeKw = (typeof SOLAR_KW_OPTIONS)[number];

export const BATTERY_KWH_OPTIONS = [15, 20, 30, 40] as const;
export type BatterySizeKwh = (typeof BATTERY_KWH_OPTIONS)[number];

// Battery model parameters (battery_model.R)
export const BATTERY_ROUND_TRIP_EFFICIENCY = 0.90;
export const BATTERY_HOUSEHOLD_SAFEGUARD_PCT = 0.10;
export const BATTERY_USEABLE_CAPACITY_PCT = 0.90;
export const BATTERY_DEGRADATION_1YR = 0.04;
export const BATTERY_DEGRADATION_15YR_AVG = 0.022;
export const BATTERY_MIN_GRID_PCT = 0.10;

// Relative solar generation by season (battery_model.R seasonal weights).
export const SEASONAL_SOLAR_WEIGHTS = {
  spring: 2,
  summer: 3,
  autumn: 2,
  winter: 1,
} as const;

// ---------------------------------------------------------------------------
// vehicle_costs_2026.csv — weighted avg base price by class & new/used,
// plus specific BYD models. The ICE alternative for used and BYD options
// uses the new ICE class average (no used-ICE data is collected).
// ---------------------------------------------------------------------------

export const VEHICLE_CAPEX_NEW: Record<VehicleClass, { ev: number; ice: number }> = {
  suv:       { ev: 58701, ice: 39493 },
  sedan:     { ev: 54945, ice: 35290 },
  hatchback: { ev: 33657, ice: 29960 },
};

export type VehicleOption =
  | "no_car"
  | "hatchback_new"
  | "hatchback_used"
  | "byd_dolphin"
  | "sedan_new"
  | "sedan_used"
  | "byd_seal"
  | "suv_new"
  | "suv_used"
  | "byd_sealion";

export interface VehicleSpec {
  label: string;
  class: VehicleClass | null; // null only for "no_car"
  evCapex: number;
  iceCapex: number;
}

export const VEHICLE_OPTIONS: VehicleOption[] = [
  "no_car",
  "hatchback_new",
  "hatchback_used",
  "byd_dolphin",
  "sedan_new",
  "sedan_used",
  "byd_seal",
  "suv_new",
  "suv_used",
  "byd_sealion",
];

export const VEHICLE_OPTION_DATA: Record<VehicleOption, VehicleSpec> = {
  no_car:         { label: "No car",         class: null,        evCapex: 0,     iceCapex: 0 },
  hatchback_new:  { label: "New hatchback",  class: "hatchback", evCapex: 33657, iceCapex: 29960 },
  hatchback_used: { label: "Used hatchback", class: "hatchback", evCapex: 21182, iceCapex: 29960 },
  byd_dolphin:    { label: "BYD Dolphin",    class: "hatchback", evCapex: 29990, iceCapex: 29960 },
  sedan_new:      { label: "New sedan",      class: "sedan",     evCapex: 54945, iceCapex: 35290 },
  sedan_used:     { label: "Used sedan",     class: "sedan",     evCapex: 30000, iceCapex: 35290 },
  byd_seal:       { label: "BYD Seal",       class: "sedan",     evCapex: 49990, iceCapex: 35290 },
  suv_new:        { label: "New SUV",        class: "suv",       evCapex: 58701, iceCapex: 39493 },
  suv_used:       { label: "Used SUV",       class: "suv",       evCapex: 41562, iceCapex: 39493 },
  byd_sealion:    { label: "BYD Sealion",    class: "suv",       evCapex: 54990, iceCapex: 39493 },
};

// ---------------------------------------------------------------------------
// Two-step vehicle selector — class first ("No car" / Hatchback / Sedan /
// SUV), then variant (Average new / Average used / BYD model). Maps to the
// flat VehicleOption used by the model layer.
// ---------------------------------------------------------------------------

export type VehicleClassChoice = "no_car" | VehicleClass;
export type VehicleVariant = "new" | "used" | "byd";

export const VEHICLE_CLASS_CHOICES: VehicleClassChoice[] = [
  "no_car",
  "hatchback",
  "sedan",
  "suv",
];

export const VEHICLE_CLASS_CHOICE_LABELS: Record<VehicleClassChoice, string> = {
  no_car: "No car",
  hatchback: "Hatchback",
  sedan: "Sedan",
  suv: "SUV",
};

export const VEHICLE_VARIANTS: VehicleVariant[] = ["new", "used", "byd"];

export const BYD_MODEL_BY_CLASS: Record<VehicleClass, string> = {
  hatchback: "BYD Dolphin",
  sedan: "BYD Seal",
  suv: "BYD Sealion",
};

export function variantLabel(variant: VehicleVariant, vClass: VehicleClass): string {
  if (variant === "new")  return "Average new";
  if (variant === "used") return "Average used";
  return BYD_MODEL_BY_CLASS[vClass];
}

export function toVehicleOption(vClass: VehicleClassChoice, variant: VehicleVariant): VehicleOption {
  if (vClass === "no_car") return "no_car";
  switch (vClass) {
    case "hatchback":
      return variant === "used" ? "hatchback_used" : variant === "byd" ? "byd_dolphin" : "hatchback_new";
    case "sedan":
      return variant === "used" ? "sedan_used"     : variant === "byd" ? "byd_seal"    : "sedan_new";
    case "suv":
      return variant === "used" ? "suv_used"       : variant === "byd" ? "byd_sealion" : "suv_new";
  }
}

export function classFromOption(opt: VehicleOption): VehicleClassChoice {
  if (opt === "no_car") return "no_car";
  return VEHICLE_OPTION_DATA[opt].class as VehicleClass;
}

export function variantFromOption(opt: VehicleOption): VehicleVariant {
  if (opt === "no_car") return "new";
  if (opt === "byd_dolphin" || opt === "byd_seal" || opt === "byd_sealion") return "byd";
  if (opt.endsWith("_used")) return "used";
  return "new";
}

// ---------------------------------------------------------------------------
// Tipping point 2026 - input data - FINAL product prices.csv
// Appliance total-installed costs (R model defaults match these)
// ---------------------------------------------------------------------------

export const APPLIANCE_CAPEX = {
  spaceHeatingHeatPump: 3200,
  spaceHeatingGas: 1500,
  spaceHeatingLpg: 1500,
  waterHeatingHeatPump: 3900,
  waterHeatingGas: 1700,
  waterHeatingLpg: 1700,
  cooktopInduction: 2200,
  cooktopGas: 1200,
  cooktopLpg: 1200,
};

// Standalone split-system AC capex added to fossil-heated scenarios. All-
// electric scenarios bundle cooling into the heat pump heating row (one unit
// covers both), so no separate AC is needed there. Mirrors R model
// cooling_only_capex.
export const COOLING_ONLY_CAPEX = 2000;

// One-off switchboard upgrade added to all-electric scenarios to cover the
// cumulative load of heat pump heating + heat pump HW + induction + EV
// charging. Mirrors R model switchboard_upgrade_capex.
export const SWITCHBOARD_UPGRADE_CAPEX = 2500;
