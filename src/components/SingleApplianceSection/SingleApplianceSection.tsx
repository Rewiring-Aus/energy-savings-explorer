import React, { useMemo, useState } from "react";
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ComparisonChart, { ChartBar } from "src/components/ComparisonChart/ComparisonChart";
import {
  ApplianceCategory,
  ApplianceOption,
  APPLIANCE_OPTIONS,
  HouseInputs,
  SolarScenario,
  availableOptions,
  evaluateSingleOption,
} from "src/comparison/model";

interface Props {
  baseInputs: HouseInputs;
}

const CATEGORIES: { value: ApplianceCategory; label: string }[] = [
  { value: "Space Heating", label: "Space heating" },
  { value: "Water Heating", label: "Water heating" },
  { value: "Cooktop",       label: "Cooktop" },
  { value: "Vehicles",      label: "Vehicle" },
];

// "Efficient electric" option per category — the savings box compares each
// fossil option against this one.
function efficientElectricValue(category: ApplianceCategory): string {
  switch (category) {
    case "Space Heating": return "Electric heat pump";
    case "Water Heating": return "Electric heat pump";
    case "Cooktop":       return "Electric induction";
    case "Vehicles":      return "Electric";
  }
}

// Display name for the efficient electric option, used in the savings headline
// (e.g. "Heat pump savings vs gas hot water"). Kept short on purpose.
const ELECTRIC_LABEL: Record<ApplianceCategory, string> = {
  "Space Heating": "Heat pump",
  "Water Heating": "Heat pump",
  "Cooktop":       "Induction",
  "Vehicles":      "EV",
};

// Noun used to describe the appliance/use in the savings headline, lower-case
// so it composes cleanly after the fossil label.
const CATEGORY_NOUN: Record<ApplianceCategory, string> = {
  "Space Heating": "heating",
  "Water Heating": "hot water",
  "Cooktop":       "cooktop",
  "Vehicles":      "car",
};

// Pretty label for each solar scenario, used by the chip in the savings box.
const SCENARIO_LABEL: Record<SolarScenario, string> = {
  grid_only:       "Grid only",
  solar:           "Solar",
  solar_optimised: "Solar optimised",
};

// Display labels for the fossil options included in the savings box. We list
// gas first because LPG is filtered out when reticulated gas is available
// (NT is the only state without gas — there it falls back to LPG).
const FOSSIL_LABELS: Record<ApplianceCategory, { value: string; label: string }[]> = {
  "Space Heating": [
    { value: "Natural gas", label: "gas" },
    { value: "LPG",         label: "LPG" },
  ],
  "Water Heating": [
    { value: "Natural gas", label: "gas" },
    { value: "LPG",         label: "LPG" },
  ],
  Cooktop: [
    { value: "Natural gas", label: "gas" },
    { value: "LPG",         label: "LPG" },
  ],
  Vehicles: [
    { value: "Petrol", label: "petrol" },
    { value: "Diesel", label: "diesel" },
  ],
};

function findOption(category: ApplianceCategory, value: string): ApplianceOption | undefined {
  return APPLIANCE_OPTIONS[category].find((o) => o.value === value);
}

// Sub-$250 values round to the nearest $10 so small bars (e.g. running cost
// of a cooktop) don't all collapse to the same printed figure even when the
// bars visibly differ.
function roundForDisplay(n: number): number {
  const step = Math.abs(n) < 250 ? 10 : 100;
  return Math.round(n / step) * step;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(roundForDisplay(n));
}

const groupSx = {
  flexWrap: "wrap",
  "& .MuiToggleButton-root": {
    textTransform: "none",
    padding: "0.3rem 0.75rem",
    fontSize: "0.9rem",
    borderColor: "#d7d5cd",
    "&.Mui-selected": {
      backgroundColor: "#222222",
      color: "#fff",
      "&:hover": { backgroundColor: "#000" },
    },
  },
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: { xs: "column", sm: "row" },
      alignItems: { xs: "flex-start", sm: "center" },
      gap: { xs: 0.5, sm: 2 },
      marginBottom: "0.75rem",
    }}
  >
    <Typography variant="h5" sx={{ minWidth: "7rem", m: 0 }}>
      {label}
    </Typography>
    <Box sx={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
      {children}
    </Box>
  </Box>
);

interface SavingsLine {
  fossilLabel: string;  // e.g. "gas", "LPG", "petrol"
  value: number;        // fossil − electric (positive = electric saves money)
}

// Small chip (top-right of the green box) that names which solar scenario
// these figures reflect. Without it the box reads as if the savings are
// universal, which is misleading once a user has changed Scenario.
const ScenarioChip: React.FC<{ scenario: SolarScenario }> = ({ scenario }) => (
  <Box
    sx={{
      flex: "0 0 auto",
      padding: "0.15rem 0.5rem",
      backgroundColor: "#fff",
      border: "1px solid #2e7d32",
      borderRadius: "999px",
      fontSize: "0.7rem",
      fontWeight: 600,
      color: "#1b5e20",
      whiteSpace: "nowrap",
      lineHeight: 1.4,
    }}
  >
    {SCENARIO_LABEL[scenario]}
  </Box>
);

const SavingsBox: React.FC<{
  category: ApplianceCategory;
  lines: SavingsLine[];
  noCar: boolean;
  years: number;
  scenario: SolarScenario;
}> = ({ category, lines, noCar, years, scenario }) => {
  if (category === "Vehicles" && noCar) {
    return (
      <Box
        sx={{
          flex: { xs: "1 1 100%", md: "0 0 260px" },
          padding: "1rem",
          backgroundColor: "#f5f4ee",
          border: "1px solid #d7d5cd",
          borderRadius: 2,
          alignSelf: "flex-start",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "space-between" }}>
          <Typography variant="overline" sx={{ display: "block", lineHeight: 1.2 }}>
            Savings
          </Typography>
          <ScenarioChip scenario={scenario} />
        </Box>
        <Typography variant="body2" sx={{ mt: 1, color: "#666" }}>
          Pick a vehicle in Household settings to see savings.
        </Typography>
      </Box>
    );
  }

  const electricLabel = ELECTRIC_LABEL[category];
  const noun = CATEGORY_NOUN[category];

  return (
    <Box
      sx={{
        flex: { xs: "1 1 100%", md: "0 0 260px" },
        padding: "1rem",
        backgroundColor: "#e8f5e9",
        border: "2px solid #2e7d32",
        borderRadius: 2,
        alignSelf: "flex-start",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "space-between" }}>
        <Typography
          variant="overline"
          sx={{ lineHeight: 1.2, color: "#1b5e20" }}
        >
          Savings
        </Typography>
        <ScenarioChip scenario={scenario} />
      </Box>
      {lines.map((line) => {
        const positive = line.value > 0;
        const fg = positive ? "#1b5e20" : "#b71c1c";
        const verb = positive ? "savings" : "extra cost";
        return (
          <Box key={line.fossilLabel} sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ display: "block", color: fg }}>
              {electricLabel} {verb} vs {line.fossilLabel} {noun}
              {years > 1 ? ` over ${years} years` : ""}
            </Typography>
            <Typography
              sx={{ fontSize: "1.6rem", fontWeight: 700, lineHeight: 1.1, color: fg }}
            >
              {formatMoney(Math.abs(line.value))}
            </Typography>
            {years > 1 && (
              <Typography sx={{ fontSize: "0.75rem", color: fg, lineHeight: 1.2 }}>
                {formatMoney(Math.abs(line.value) / years)} / year average
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

const SingleApplianceSection: React.FC<Props> = ({ baseInputs }) => {
  const [category, setCategory] = useState<ApplianceCategory>("Space Heating");
  const [includeCapex, setIncludeCapex] = useState<boolean>(true);
  const period = baseInputs.period;
  const isOneYear = period === "1year";

  const options = useMemo(
    () => availableOptions(baseInputs.state, category),
    [baseInputs.state, category],
  );

  const bars = useMemo<ChartBar[]>(
    () =>
      options.map((opt) => ({
        label: opt.label,
        cost: evaluateSingleOption(baseInputs, {
          category,
          option: opt,
          period,
          includeCapex,
        }),
      })),
    [options, baseInputs, category, period, includeCapex],
  );

  const savingsLines = useMemo<SavingsLine[]>(() => {
    const electricOpt = findOption(category, efficientElectricValue(category));
    if (!electricOpt) return [];
    // Difference of *displayed* (rounded) totals, not the rounded difference.
    // Otherwise the savings figure can disagree with the on-bar totals by
    // tens of dollars and confuse readers who do the subtraction themselves.
    const electricCost = roundForDisplay(evaluateSingleOption(baseInputs, {
      category,
      option: electricOpt,
      period,
      includeCapex: true,
    }).total);
    // For appliance categories, only show LPG when reticulated gas isn't an
    // option in this state (i.e. NT). Otherwise gas already represents the
    // dominant fossil baseline and LPG would just be visual noise.
    const gasAvailable = options.some((o) => o.value === "Natural gas");
    const lines: SavingsLine[] = [];
    for (const f of FOSSIL_LABELS[category]) {
      const fossilOpt = findOption(category, f.value);
      if (!fossilOpt) continue;
      // Skip options not available for the state (e.g. gas in NT).
      if (!options.some((o) => o.value === f.value)) continue;
      // Hide LPG when gas is shown — keeps the box focused on the headline
      // comparison. Vehicles aren't affected (no LPG entry).
      if (f.value === "LPG" && gasAvailable) continue;
      const fossilCost = roundForDisplay(evaluateSingleOption(baseInputs, {
        category,
        option: fossilOpt,
        period,
        includeCapex: true,
      }).total);
      lines.push({ fossilLabel: f.label, value: fossilCost - electricCost });
    }
    return lines;
  }, [category, baseInputs, period, options]);

  const years = period === "1year" ? 1 : 15;
  const costViewLabel = isOneYear
    ? "Operating cost (current prices)"
    : includeCapex ? "Total cost" : "Running cost only";
  const title = `${costViewLabel} — ${category.toLowerCase()} options (${years} year${years === 1 ? "" : "s"})`;

  const noCar = baseInputs.vehicleOption === "no_car";

  return (
    <Box
      sx={{
        marginTop: "1.5rem",
        padding: "1.25rem",
        backgroundColor: "#fff",
        border: "1px solid #d7d5cd",
        borderRadius: 1,
      }}
    >
      <Typography variant="h2" sx={{ mt: 0 }}>
        Compare a single appliance
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
          alignItems: "flex-start",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Row label="Appliance">
            <ToggleButtonGroup
              size="small"
              exclusive
              value={category}
              onChange={(_, v: ApplianceCategory | null) => v && setCategory(v)}
              sx={groupSx}
            >
              {CATEGORIES.map((c) => (
                <ToggleButton key={c.value} value={c.value}>
                  {c.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Row>

          {!isOneYear && (
            <Row label="Cost view">
              <ToggleButtonGroup
                size="small"
                exclusive
                value={includeCapex ? "total" : "running"}
                onChange={(_, v: string | null) => v && setIncludeCapex(v === "total")}
                sx={groupSx}
              >
                <ToggleButton value="total">Total cost</ToggleButton>
                <ToggleButton value="running">Running cost only</ToggleButton>
              </ToggleButtonGroup>
            </Row>
          )}
        </Box>

        <SavingsBox
          category={category}
          lines={savingsLines}
          noCar={noCar}
          years={years}
          scenario={baseInputs.solarScenario}
        />
      </Box>

      <Box sx={{ mt: 2 }}>
        <ComparisonChart title={title} bars={bars} />
      </Box>
    </Box>
  );
};

export default SingleApplianceSection;
