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

// Display labels for the fossil options included in the savings box.
const FOSSIL_LABELS: Record<ApplianceCategory, { value: string; label: string }[]> = {
  "Space Heating": [
    { value: "Natural gas", label: "Gas" },
    { value: "LPG",         label: "LPG" },
  ],
  "Water Heating": [
    { value: "Natural gas", label: "Gas" },
    { value: "LPG",         label: "LPG" },
  ],
  Cooktop: [
    { value: "Natural gas", label: "Gas" },
    { value: "LPG",         label: "LPG" },
  ],
  Vehicles: [
    { value: "Petrol", label: "Petrol" },
    { value: "Diesel", label: "Diesel" },
  ],
};

function findOption(category: ApplianceCategory, value: string): ApplianceOption | undefined {
  return APPLIANCE_OPTIONS[category].find((o) => o.value === value);
}

function formatMoney(n: number): string {
  const rounded = Math.round(n / 100) * 100;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(rounded);
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

interface SavingsLine { label: string; value: number; }

const SavingsBox: React.FC<{
  category: ApplianceCategory;
  lines: SavingsLine[];
  noCar: boolean;
  years: number;
}> = ({ category, lines, noCar, years }) => {
  if (category === "Vehicles" && noCar) {
    return (
      <Box
        sx={{
          flex: { xs: "1 1 100%", md: "0 0 240px" },
          padding: "1rem",
          backgroundColor: "#f5f4ee",
          border: "1px solid #d7d5cd",
          borderRadius: 2,
          alignSelf: "flex-start",
        }}
      >
        <Typography variant="overline" sx={{ display: "block", lineHeight: 1.2 }}>
          Savings vs fossil options
        </Typography>
        <Typography variant="body2" sx={{ mt: 1, color: "#666" }}>
          Pick a vehicle in Household settings to see savings.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: { xs: "1 1 100%", md: "0 0 240px" },
        padding: "1rem",
        backgroundColor: "#e8f5e9",
        border: "2px solid #2e7d32",
        borderRadius: 2,
        alignSelf: "flex-start",
      }}
    >
      <Typography
        variant="overline"
        sx={{ display: "block", lineHeight: 1.2, color: "#1b5e20" }}
      >
        Savings vs fossil options
      </Typography>
      {lines.map((line) => {
        const positive = line.value > 0;
        const fg = positive ? "#1b5e20" : "#b71c1c";
        return (
          <Box key={line.label} sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ display: "block", color: fg }}>
              {positive ? "Save" : "Extra cost"} vs {line.label}
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
    const electricCost = evaluateSingleOption(baseInputs, {
      category,
      option: electricOpt,
      period,
      includeCapex: true,
    }).total;
    const lines: SavingsLine[] = [];
    for (const f of FOSSIL_LABELS[category]) {
      const fossilOpt = findOption(category, f.value);
      if (!fossilOpt) continue;
      // Skip gas options where the state has no reticulated gas.
      if (!options.some((o) => o.value === f.value)) continue;
      const fossilCost = evaluateSingleOption(baseInputs, {
        category,
        option: fossilOpt,
        period,
        includeCapex: true,
      }).total;
      lines.push({ label: f.label, value: fossilCost - electricCost });
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

        <SavingsBox category={category} lines={savingsLines} noCar={noCar} years={years} />
      </Box>

      <Box sx={{ mt: 2 }}>
        <ComparisonChart title={title} bars={bars} />
      </Box>
    </Box>
  );
};

export default SingleApplianceSection;
