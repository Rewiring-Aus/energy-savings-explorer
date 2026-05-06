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

export type Fuel = "electricity" | "gas" | "lpg" | "wood" | "petrol" | "diesel";

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
// average_km_per_day_by_state.csv
// ---------------------------------------------------------------------------

export const KM_PER_DAY: Record<StateCode, number> = {
  AUS: 36.4, NSW: 36.2, ACT: 35.1, NT: 35.9, QLD: 36.9,
  SA: 35.0, TAS: 33.1, VIC: 38.0, WA: 33.8,
};

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
    electricity: { current: 0.3403, forecast15yr: 0.3980, dailyToday: 1.3308, daily15yr: 1.5567 },
    gas:         { current: 0.1968, forecast15yr: 0.2458, dailyToday: 0.7396, daily15yr: 0.9238 },
    lpg:         { current: 0.2542, forecast15yr: 0.3175, dailyToday: 0.2948, daily15yr: 0.3682 },
    petrol:      { current: 0.1896, forecast15yr: 0.2139, dailyToday: 0,      daily15yr: 0 },
    diesel:      { current: 0.1734, forecast15yr: 0.1957, dailyToday: 0,      daily15yr: 0 },
  },
  NSW: {
    electricity: { current: 0.3788, forecast15yr: 0.4431, dailyToday: 1.3905, daily15yr: 1.6265 },
    gas:         { current: 0.1526, forecast15yr: 0.1906, dailyToday: 0.7228, daily15yr: 0.9028 },
    lpg:         { current: 0.2743, forecast15yr: 0.3426, dailyToday: 0.2841, daily15yr: 0.3549 },
    petrol:      { current: 0.1899, forecast15yr: 0.2143, dailyToday: 0,      daily15yr: 0 },
    diesel:      { current: 0.1728, forecast15yr: 0.1950, dailyToday: 0,      daily15yr: 0 },
  },
  VIC: {
    electricity: { current: 0.2884, forecast15yr: 0.3373, dailyToday: 1.1780, daily15yr: 1.3779 },
    gas:         { current: 0.1304, forecast15yr: 0.1629, dailyToday: 0.8927, daily15yr: 1.1150 },
    lpg:         { current: 0.2271, forecast15yr: 0.2837, dailyToday: 0.3082, daily15yr: 0.3850 },
    petrol:      { current: 0.1897, forecast15yr: 0.2140, dailyToday: 0,      daily15yr: 0 },
    diesel:      { current: 0.1743, forecast15yr: 0.1967, dailyToday: 0,      daily15yr: 0 },
  },
  QLD: {
    electricity: { current: 0.3333, forecast15yr: 0.3899, dailyToday: 1.5959, daily15yr: 1.8667 },
    gas:         { current: 0.2065, forecast15yr: 0.2579, dailyToday: 0.7051, daily15yr: 0.8807 },
    lpg:         { current: 0.2425, forecast15yr: 0.3029, dailyToday: 0.2975, daily15yr: 0.3716 },
    petrol:      { current: 0.1928, forecast15yr: 0.2175, dailyToday: 0,      daily15yr: 0 },
    diesel:      { current: 0.1741, forecast15yr: 0.1964, dailyToday: 0,      daily15yr: 0 },
  },
  SA: {
    electricity: { current: 0.4376, forecast15yr: 0.5119, dailyToday: 1.2228, daily15yr: 1.4303 },
    gas:         { current: 0.1885, forecast15yr: 0.2354, dailyToday: 0.8521, daily15yr: 1.0643 },
    lpg:         { current: 0.2515, forecast15yr: 0.3141, dailyToday: 0.3044, daily15yr: 0.3802 },
    petrol:      { current: 0.1839, forecast15yr: 0.2075, dailyToday: 0,      daily15yr: 0 },
    diesel:      { current: 0.1722, forecast15yr: 0.1943, dailyToday: 0,      daily15yr: 0 },
  },
  WA: {
    electricity: { current: 0.3237, forecast15yr: 0.3786, dailyToday: 1.1605, daily15yr: 1.3574 },
    gas:         { current: 0.4968, forecast15yr: 0.6205, dailyToday: 0.3903, daily15yr: 0.4875 },
    lpg:         { current: 0.2840, forecast15yr: 0.3547, dailyToday: 0.2685, daily15yr: 0.3354 },
    petrol:      { current: 0.1848, forecast15yr: 0.2085, dailyToday: 0,      daily15yr: 0 },
    diesel:      { current: 0.1710, forecast15yr: 0.1929, dailyToday: 0,      daily15yr: 0 },
  },
  TAS: {
    electricity: { current: 0.2789, forecast15yr: 0.3262, dailyToday: 1.3486, daily15yr: 1.5775 },
    gas:         { current: 0.1867, forecast15yr: 0.2332, dailyToday: 0.7139, daily15yr: 0.8917 },
    lpg:         { current: 0.2433, forecast15yr: 0.3039, dailyToday: 0.3592, daily15yr: 0.4487 },
    petrol:      { current: 0.1892, forecast15yr: 0.2135, dailyToday: 0,      daily15yr: 0 },
    diesel:      { current: 0.1737, forecast15yr: 0.1960, dailyToday: 0,      daily15yr: 0 },
  },
  ACT: {
    electricity: { current: 0.3127, forecast15yr: 0.3658, dailyToday: 1.2741, daily15yr: 1.4903 },
    gas:         { current: 0.1486, forecast15yr: 0.1856, dailyToday: 0.7630, daily15yr: 0.9530 },
    lpg:         { current: 0.2588, forecast15yr: 0.3233, dailyToday: 0.2841, daily15yr: 0.3549 },
    petrol:      { current: 0.1899, forecast15yr: 0.2143, dailyToday: 0,      daily15yr: 0 },
    diesel:      { current: 0.1728, forecast15yr: 0.1950, dailyToday: 0,      daily15yr: 0 },
  },
  NT: {
    electricity: { current: 0.3008, forecast15yr: 0.3518, dailyToday: 0.5931, daily15yr: 0.6937 },
    // No reticulated natural gas in NT
    lpg:         { current: 0.3198, forecast15yr: 0.3994, dailyToday: 0.2923, daily15yr: 0.3651 },
    petrol:      { current: 0.2071, forecast15yr: 0.2337, dailyToday: 0,      daily15yr: 0 },
    diesel:      { current: 0.1941, forecast15yr: 0.2190, dailyToday: 0,      daily15yr: 0 },
  },
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
