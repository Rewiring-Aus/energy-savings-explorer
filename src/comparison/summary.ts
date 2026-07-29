// Human-readable summaries of the current household settings.
//
// These exist mainly for the PNG export: once a chart leaves the app as an
// image it loses the control panel, so the card itself has to say which
// household it describes. Titles get the place, captions get the rest.

import {
  DRIVING_LEVEL_LABELS,
  STATE_LABELS,
  Tariff,
  VEHICLE_OPTION_DATA,
} from "src/comparison/data";
import {
  getTariffSpec,
  HouseInputs,
  SolarScenario,
} from "src/comparison/model";

const SCENARIO_TEXT: Record<SolarScenario, string> = {
  grid_only: "no solar",
  solar: "solar",
  solar_optimised: "solar with smart timers",
};

const TARIFF_TEXT: Record<Tariff, string> = {
  flat: "a flat-rate tariff",
  tou: "a time-of-use tariff",
  amber: "a wholesale tariff (evening exports at spot)",
  solar_sharer: "Solar Sharer (free 11am–2pm)",
};

// "Australian" / "NSW" / "NSW 2010" — the adjective that leads a chart title.
// A postcode is shown alongside its state because postcode-precision changes
// the solar yield, so it's a materially different read from the state average.
export function placeLabel(inputs: HouseInputs): string {
  if (inputs.postcode !== undefined) {
    return `${STATE_LABELS[inputs.state]} ${inputs.postcode}`;
  }
  return inputs.state === "AUS" ? "Australian" : STATE_LABELS[inputs.state];
}

export function dwellingNoun(inputs: HouseInputs): string {
  return inputs.dwelling === "apartment" ? "apartment" : "house";
}

// "Australian house" / "NSW 2010 apartment"
export function placeTitle(inputs: HouseInputs): string {
  return `${placeLabel(inputs)} ${dwellingNoun(inputs)}`;
}

// Formats the whole number cleanly but keeps the fractional "average"
// presets (2.7 occupants, 1.8 cars) intact.
function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function vehiclePhrase(inputs: HouseInputs): string {
  const opts = (inputs.vehicleOptions ?? []).filter((o) => o !== "no_car");
  if (inputs.vehicles <= 0 || opts.length === 0) return "no cars";

  const models = opts.map((o) => VEHICLE_OPTION_DATA[o].label).join(", ");
  const count = `${num(inputs.vehicles)} ${inputs.vehicles === 1 ? "car" : "cars"}`;
  const km = DRIVING_LEVEL_LABELS[inputs.drivingLevel];
  // A single listed model with a fractional count is the "average car"
  // preset, so "each" would be misleading — the count is already an average.
  const each = opts.length > 1 ? " each" : "";
  return `${count} (${models}) driving ${km} km a week${each}`;
}

// Line 1: who lives here and what they drive.
export function householdLine(inputs: HouseInputs): string {
  const place = inputs.postcode !== undefined
    ? `${STATE_LABELS[inputs.state]} ${inputs.postcode}`
    : STATE_LABELS[inputs.state];
  const people = `${num(inputs.occupants)} ${inputs.occupants === 1 ? "person" : "people"}`;
  return `${place} · ${dwellingNoun(inputs)} · ${people} · ${vehiclePhrase(inputs)}`;
}

// Line 2: the modelling assumptions behind the numbers. `solar` is passed in
// rather than derived because the appliance charts let the user override the
// whole-home system size.
export function assumptionsLine(
  inputs: HouseInputs,
  solar?: { solarKw: number; batteryKwh: number },
): string {
  const parts: string[] = [];

  if (solar && inputs.solarScenario !== "grid_only") {
    parts.push(`${solar.solarKw} kW solar + ${solar.batteryKwh} kWh battery`);
  } else {
    parts.push(SCENARIO_TEXT[inputs.solarScenario]);
  }

  // Report the RESOLVED tariff, not the requested one: Solar Sharer falls back
  // to time-of-use outside the states that offer it, and an exported chart has
  // no control panel to reveal that.
  const resolved = getTariffSpec(inputs.tariff, inputs.state, inputs.period).tariff;
  parts.push(TARIFF_TEXT[resolved]);
  if (resolved !== inputs.tariff) {
    parts.push(`Solar Sharer not offered in ${STATE_LABELS[inputs.state]}`);
  }

  if (inputs.period === "1year") {
    // Capex is excluded entirely from the 1-year view, so finance terms
    // would be noise here.
    parts.push("1 year of operating costs at current prices");
  } else {
    parts.push(
      inputs.finance
        ? `capex on a ${(inputs.loanRate * 100).toFixed(0)}% ${inputs.loanTerm}-year loan`
        : "capex paid in cash",
    );
    parts.push("15-year totals at forecast prices");
  }

  return parts.join(" · ");
}
