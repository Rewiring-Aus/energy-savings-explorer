import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import rough from "roughjs";
import ComparisonChart, { ChartBar } from "src/components/ComparisonChart/ComparisonChart";
import {
  ApplianceCategory,
  ApplianceOption,
  APPLIANCE_OPTIONS,
  BatteryValueMode,
  HouseInputs,
  SolarScenario,
  SolarBatteryCost,
  availableOptions,
  evaluateSingleOption,
  evaluateSolarBatteryBreakdown,
  solarBatteryCapex,
  solarBatteryEnergyFlows,
} from "src/comparison/model";
import {
  BATTERY_KWH_OPTIONS,
  BatterySizeKwh,
  SOLAR_KW_OPTIONS,
  SolarSizeKw,
} from "src/comparison/data";

interface Props {
  baseInputs: HouseInputs;
}

// "Solar+Battery" is a synthetic category that lives only in the UI — the
// underlying model uses evaluateSolarBattery() rather than the appliance
// option machinery.
type Category = ApplianceCategory | "Solar+Battery";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "Space Heating",  label: "Space heating" },
  { value: "Water Heating",  label: "Water heating" },
  { value: "Cooktop",        label: "Cooktop" },
  { value: "Vehicles",       label: "Vehicle" },
  { value: "Solar+Battery",  label: "Solar + battery" },
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

// Display rounding tiered to keep small numbers legible without implying
// false precision on big ones:
//   |n| < $250  → nearest $10  (so a $187 cooktop bill doesn't snap to $200)
//   |n| < $500  → nearest $50
//   otherwise  → nearest $100
function roundForDisplay(n: number): number {
  const abs = Math.abs(n);
  const step = abs < 250 ? 10 : abs < 500 ? 50 : 100;
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

// Pretty label for the battery export mode shown in the savings chip.
const BATTERY_VALUE_LABEL: Record<BatteryValueMode, string> = {
  self_consume: "Self-consume",
  vpp: "VPP",
  wholesale: "Wholesale",
};

// Chart 2 segment keys — savings only. Capex is summarised separately above
// the chart since it's identical across all three bars.
type SbSegmentKey =
  | "solarToHome"
  | "solarExport"
  | "batteryToHome"
  | "batteryToGrid"
  | "vppBonus";

const SB_SEGMENT_COLORS: Record<SbSegmentKey, string> = {
  solarToHome:   "#F0CF61",  // yellow     — solar self-consumption (retail saved)
  solarExport:   "#E58E26",  // amber      — daytime FiT export
  batteryToHome: "#2e7d32",  // green      — battery → home (retail saved)
  batteryToGrid: "#1976d2",  // blue       — battery → grid (FiT or wholesale)
  vppBonus:      "#7B1FA2",  // purple     — flat VPP membership benefit
};

const SB_SEGMENT_LABELS: Record<SbSegmentKey, string> = {
  solarToHome:   "Solar → home (retail saved)",
  solarExport:   "Solar → grid (FiT)",
  batteryToHome: "Battery → home (retail saved)",
  batteryToGrid: "Battery → grid",
  vppBonus:      "VPP membership",
};

// Stable hachure seeds (rough.js needs a fixed seed per fill so paint stays
// stable between renders).
const SB_SEGMENT_SEED: Record<SbSegmentKey, number> = {
  solarToHome: 41, solarExport: 67,
  batteryToHome: 89, batteryToGrid: 103, vppBonus: 137,
};

const SAVINGS_KEYS: SbSegmentKey[] = [
  "solarToHome", "solarExport", "batteryToHome", "batteryToGrid", "vppBonus",
];

const BATTERY_VALUE_MODES: BatteryValueMode[] = ["self_consume", "vpp", "wholesale"];

function sbRoundForDisplay(n: number): number {
  const abs = Math.abs(n);
  const step = abs < 250 ? 10 : abs < 500 ? 50 : 100;
  return Math.round(n / step) * step;
}

function sbFormatMoney(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(sbRoundForDisplay(n));
}

interface SbSegment {
  key: SbSegmentKey;
  value: number;
  segPx: number;
}

// One bar in the battery chart — savings only, stacked upward from the
// baseline. Capex is summarised in the header (same for all three bars).
const SbBar: React.FC<{
  breakdown: SolarBatteryCost;
  modeLabel: string;
  maxPx: number;       // px height available for the bar
  scale: number;       // $/px
}> = ({ breakdown, modeLabel, maxPx, scale }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ label: string; value: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const totalSavings =
    breakdown.solarToHome + breakdown.solarExport +
    breakdown.batteryToHome + breakdown.batteryToGrid + breakdown.vppBonus;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || width <= 0) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const rc = rough.svg(svg);
    const ns = "http://www.w3.org/2000/svg";

    const drawSegment = (
      x: number, y: number, w: number, h: number,
      key: SbSegmentKey, value: number,
    ) => {
      if (h <= 0) return;
      const node = rc.rectangle(x, y, w, h, {
        fill: SB_SEGMENT_COLORS[key],
        fillStyle: "hachure",
        hachureGap: 3,
        hachureAngle: 41,
        fillWeight: 1.6,
        roughness: 1.4,
        stroke: "#222",
        strokeWidth: 1.2,
        seed: SB_SEGMENT_SEED[key],
      });
      svg.appendChild(node);
      if (h > 22) {
        const text = document.createElementNS(ns, "text");
        text.setAttribute("x", String(x + w / 2));
        text.setAttribute("y", String(y + h / 2));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("font-size", "11");
        text.setAttribute("font-weight", "700");
        text.setAttribute("fill", "#222");
        text.setAttribute("stroke", "#fff");
        text.setAttribute("stroke-width", "3");
        text.setAttribute("stroke-linejoin", "round");
        text.setAttribute("paint-order", "stroke fill");
        text.style.pointerEvents = "none";
        text.textContent = sbFormatMoney(value);
        svg.appendChild(text);
      }

      // Transparent hit-area on top of the segment so hover works anywhere
      // in the rectangle, not just on the hachure strokes themselves.
      const hit = document.createElementNS(ns, "rect");
      hit.setAttribute("x", String(x));
      hit.setAttribute("y", String(y));
      hit.setAttribute("width", String(w));
      hit.setAttribute("height", String(h));
      hit.setAttribute("fill", "transparent");
      hit.style.cursor = "default";
      const segLabel = SB_SEGMENT_LABELS[key];
      const segValue = value;
      hit.addEventListener("mousemove", (e: MouseEvent) => {
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect) return;
        setHover({
          label: segLabel,
          value: segValue,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      });
      hit.addEventListener("mouseleave", () => setHover(null));
      svg.appendChild(hit);
    };

    // Savings stack upward from the baseline (y = maxPx).
    let y = maxPx;
    for (const key of SAVINGS_KEYS) {
      const v = breakdown[key];
      if (v <= 0) continue;
      const h = v / scale;
      y -= h;
      drawSegment(0, y, width, h, key, v);
    }
  }, [width, breakdown, maxPx, scale]);

  return (
    <Box
      sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, minWidth: 0 }}
    >
      <Typography variant="h5" sx={{ m: 0, textAlign: "center", fontSize: "0.95rem" }}>
        {modeLabel}
      </Typography>
      <Typography
        sx={{ m: 0, textAlign: "center", fontSize: "1.25rem", fontWeight: 700, color: "#1b5e20" }}
      >
        {sbFormatMoney(totalSavings)}
      </Typography>
      <Box
        ref={wrapRef}
        sx={{ width: "100%", maxWidth: 200, height: maxPx, position: "relative" }}
      >
        <svg ref={svgRef} width={width} height={maxPx} style={{ display: "block" }} />
        {hover && (
          <Box
            sx={{
              position: "absolute",
              left: hover.x + 12,
              top: hover.y + 12,
              padding: "0.3rem 0.55rem",
              backgroundColor: "#222",
              color: "#fff",
              borderRadius: 1,
              fontSize: "0.75rem",
              fontWeight: 600,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 10,
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            }}
          >
            {hover.label}: {sbFormatMoney(hover.value)}
          </Box>
        )}
      </Box>
    </Box>
  );
};

const SbLegend: React.FC = () => (
  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, justifyContent: "center", mt: 2 }}>
    {SAVINGS_KEYS.map((key) => (
      <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
        <Box
          sx={{
            width: 14, height: 14,
            backgroundColor: SB_SEGMENT_COLORS[key],
            borderRadius: 0.5,
          }}
        />
        <Typography variant="caption" sx={{ fontSize: "0.7rem" }}>
          {SB_SEGMENT_LABELS[key]}
        </Typography>
      </Box>
    ))}
  </Box>
);

// Amortising annuity (mirrors annualLoanPayment in model.ts). Used only for
// the chart 2 cost header — the calc itself is in the model.
function annuityPayment(principal: number, rate: number, termYears: number): number {
  if (principal <= 0) return 0;
  const mr = rate / 12;
  const n = termYears * 12;
  const monthly = (principal * mr) / (1 - Math.pow(1 + mr, -n));
  return monthly * 12;
}

// Chart 2 — three savings-only bars, one per battery export mode. The
// system's upfront cost is identical across modes so it's stated once in
// the header rather than repeated in each bar.
const SolarBatteryChart: React.FC<{
  baseInputs: HouseInputs;
  solarKw: SolarSizeKw;
  batteryKwh: BatterySizeKwh;
  title: string;
}> = ({ baseInputs, solarKw, batteryKwh, title }) => {
  const years = baseInputs.period === "1year" ? 1 : 15;
  const sb = {
    solarKw, batteryKwh,
    period: baseInputs.period,
    includeCapex: true,
  };
  const breakdowns = BATTERY_VALUE_MODES.map((m) => ({
    mode: m,
    breakdown: evaluateSolarBatteryBreakdown(baseInputs, sb, m),
  }));

  // Single capex figure — identical across the three modes.
  const totalCapex = solarBatteryCapex(baseInputs.state, solarKw, batteryKwh, years);

  // Finance summary (only shown when Finance = Loan)
  const annual = baseInputs.finance
    ? annuityPayment(totalCapex, baseInputs.loanRate, baseInputs.loanTerm)
    : 0;
  const totalLoanCost = annual * baseInputs.loanTerm;

  const BAR_PX = 280;
  const maxSavings = Math.max(
    ...breakdowns.map((b) =>
      b.breakdown.solarToHome + b.breakdown.solarExport +
      b.breakdown.batteryToHome + b.breakdown.batteryToGrid + b.breakdown.vppBonus,
    ),
    1,
  );
  const scale = maxSavings / BAR_PX;

  return (
    <Box sx={{ padding: "1.5rem", backgroundColor: "#fff", border: "1px solid #d7d5cd", borderRadius: 1 }}>
      <Typography variant="h2" sx={{ textAlign: "center", mt: 0, mb: 0.5 }}>
        {title}
      </Typography>

      {/* Upfront cost summary — same for all three bars, stated once. */}
      <Box
        sx={{
          textAlign: "center",
          padding: "0.5rem 0.75rem",
          backgroundColor: "#f5f4ee",
          border: "1px dashed #d7d5cd",
          borderRadius: 0.75,
          mb: 1.5,
        }}
      >
        <Typography variant="caption" sx={{ display: "block", fontWeight: 700, color: "#444" }}>
          Upfront cost: {sbFormatMoney(totalCapex)} ({solarKw} kW solar + {batteryKwh} kWh battery)
        </Typography>
        {baseInputs.finance && (
          <Typography variant="caption" sx={{ display: "block", color: "#555", lineHeight: 1.4 }}>
            Financed at {(baseInputs.loanRate * 100).toFixed(1)}% over {baseInputs.loanTerm} yrs →{" "}
            {sbFormatMoney(annual)}/yr · total {sbFormatMoney(totalLoanCost)}
          </Typography>
        )}
      </Box>

      <Typography variant="caption" sx={{ display: "block", textAlign: "center", color: "#555", mb: 1 }}>
        Savings over {years === 1 ? "1 year" : `${years} years`} by battery export mode
      </Typography>
      <Box sx={{ display: "flex", gap: { xs: 1, sm: 2 }, justifyContent: "center", alignItems: "flex-end", mt: 2 }}>
        {breakdowns.map(({ mode, breakdown }) => (
          <SbBar
            key={mode}
            modeLabel={BATTERY_VALUE_LABEL[mode]}
            breakdown={breakdown}
            maxPx={BAR_PX}
            scale={scale}
          />
        ))}
      </Box>
      <SbLegend />

      {/* TEMPORARY DIAGNOSTIC: underlying energy flows per column.
          Same numeric flows feed all 3 columns; only the headroom row varies
          (the others differ only in how the kWh are valued in $). */}
      <EnergyDiagnosticTable
        baseInputs={baseInputs}
        solarKw={solarKw}
        batteryKwh={batteryKwh}
      />
    </Box>
  );
};

const EnergyDiagnosticTable: React.FC<{
  baseInputs: HouseInputs;
  solarKw: SolarSizeKw;
  batteryKwh: BatterySizeKwh;
}> = ({ baseInputs, solarKw, batteryKwh }) => {
  const [open, setOpen] = useState(false);
  const flows = solarBatteryEnergyFlows(baseInputs, solarKw, batteryKwh);
  const fmt = (n: number) =>
    `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(n)} kWh`;
  const periodLabel = baseInputs.period === "1year" ? "annual" : "annual (during 15-yr horizon)";
  // Rows are identical across modes except "Solar exported wholesale" which
  // is zero in Self-consume / VPP and the headroom in Wholesale.
  const rows: { label: string; vals: [string, string, string] }[] = [
    {
      label: "Solar generation",
      vals: [fmt(flows.solarGenerationKwhYr), fmt(flows.solarGenerationKwhYr), fmt(flows.solarGenerationKwhYr)],
    },
    {
      label: "Total consumption",
      vals: [fmt(flows.consumptionKwhYr), fmt(flows.consumptionKwhYr), fmt(flows.consumptionKwhYr)],
    },
    {
      label: "Solar → home (direct)",
      vals: [fmt(flows.solarSelfConsumedKwhYr), fmt(flows.solarSelfConsumedKwhYr), fmt(flows.solarSelfConsumedKwhYr)],
    },
    {
      label: "Solar → home (via battery)",
      vals: [fmt(flows.batteryToHomeKwhYr), fmt(flows.batteryToHomeKwhYr), fmt(flows.batteryToHomeKwhYr)],
    },
    {
      label: "Solar exported (FiT)",
      vals: [fmt(flows.fitExportKwhYr), fmt(flows.fitExportKwhYr), fmt(flows.fitExportKwhYr)],
    },
    {
      label: "Solar exported (Wholesale)",
      vals: [fmt(0), fmt(0), fmt(flows.headroomKwhYr)],
    },
  ];

  return (
    <Box
      sx={{
        mt: 2,
        padding: "0.75rem 1rem",
        backgroundColor: "#f5f4ee",
        border: "1px dashed #d7d5cd",
        borderRadius: 0.75,
        fontSize: "0.78rem",
      }}
    >
      <Box
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        sx={{ cursor: "pointer", userSelect: "none", "&:hover": { color: "#000" } }}
      >
        <Typography
          variant="caption"
          sx={{ display: "block", fontWeight: 700, color: "#444" }}
        >
          <Box
            component="span"
            sx={{
              display: "inline-block",
              width: "0.9em",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
          >
            ▸
          </Box>{" "}
          Diagnostic — underlying energy flows ({periodLabel}, {solarKw} kW solar + {batteryKwh} kWh battery)
        </Typography>
      </Box>
      {open && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(180px, 1.4fr) repeat(3, minmax(110px, 1fr))",
            columnGap: 1.5,
            rowGap: 0.3,
            color: "#333",
            fontVariantNumeric: "tabular-nums",
            mt: 0.5,
          }}
        >
          <Box sx={{ fontWeight: 700, fontSize: "0.72rem", color: "#666" }} />
          <Box sx={{ fontWeight: 700, fontSize: "0.72rem", color: "#666", textAlign: "right" }}>Self-consume</Box>
          <Box sx={{ fontWeight: 700, fontSize: "0.72rem", color: "#666", textAlign: "right" }}>VPP</Box>
          <Box sx={{ fontWeight: 700, fontSize: "0.72rem", color: "#666", textAlign: "right" }}>Wholesale</Box>
          {rows.map((row) => (
            <React.Fragment key={row.label}>
              <Box>{row.label}</Box>
              <Box sx={{ textAlign: "right" }}>{row.vals[0]}</Box>
              <Box sx={{ textAlign: "right" }}>{row.vals[1]}</Box>
              <Box sx={{ textAlign: "right" }}>{row.vals[2]}</Box>
            </React.Fragment>
          ))}
        </Box>
      )}
    </Box>
  );
};

const SingleApplianceSection: React.FC<Props> = ({ baseInputs }) => {
  const [category, setCategory] = useState<Category>("Space Heating");
  const [includeCapex, setIncludeCapex] = useState<boolean>(true);
  // Solar + battery sizing — only used when category === "Solar+Battery".
  const [solarKw, setSolarKw] = useState<SolarSizeKw>(10);
  const [batteryKwh, setBatteryKwh] = useState<BatterySizeKwh>(15);
  const period = baseInputs.period;
  const isOneYear = period === "1year";
  const years = period === "1year" ? 1 : 15;

  // Solar + battery branch is rendered separately; the appliance-comparison
  // path below stays unchanged.
  const isSolarBattery = category === "Solar+Battery";

  const options = useMemo(
    () =>
      isSolarBattery
        ? []
        : availableOptions(baseInputs.state, category as ApplianceCategory),
    [baseInputs.state, category, isSolarBattery],
  );

  const bars = useMemo<ChartBar[]>(
    () =>
      isSolarBattery
        ? []
        : options.map((opt) => ({
            label: opt.label,
            cost: evaluateSingleOption(baseInputs, {
              category: category as ApplianceCategory,
              option: opt,
              period,
              includeCapex,
            }),
          })),
    [isSolarBattery, options, baseInputs, category, period, includeCapex],
  );

  const savingsLines = useMemo<SavingsLine[]>(() => {
    if (isSolarBattery) return [];
    const cat = category as ApplianceCategory;
    const electricOpt = findOption(cat, efficientElectricValue(cat));
    if (!electricOpt) return [];
    // Difference of *displayed* (rounded) totals, not the rounded difference.
    // Otherwise the savings figure can disagree with the on-bar totals by
    // tens of dollars and confuse readers who do the subtraction themselves.
    const electricCost = roundForDisplay(evaluateSingleOption(baseInputs, {
      category: cat,
      option: electricOpt,
      period,
      includeCapex: true,
    }).total);
    // For appliance categories, only show LPG when reticulated gas isn't an
    // option in this state (i.e. NT). Otherwise gas already represents the
    // dominant fossil baseline and LPG would just be visual noise.
    const gasAvailable = options.some((o) => o.value === "Natural gas");
    const lines: SavingsLine[] = [];
    for (const f of FOSSIL_LABELS[cat]) {
      const fossilOpt = findOption(cat, f.value);
      if (!fossilOpt) continue;
      // Skip options not available for the state (e.g. gas in NT).
      if (!options.some((o) => o.value === f.value)) continue;
      // Hide LPG when gas is shown — keeps the box focused on the headline
      // comparison. Vehicles aren't affected (no LPG entry).
      if (f.value === "LPG" && gasAvailable) continue;
      const fossilCost = roundForDisplay(evaluateSingleOption(baseInputs, {
        category: cat,
        option: fossilOpt,
        period,
        includeCapex: true,
      }).total);
      lines.push({ fossilLabel: f.label, value: fossilCost - electricCost });
    }
    return lines;
  }, [isSolarBattery, category, baseInputs, period, options]);

  const costViewLabel = isOneYear
    ? "Operating cost (current prices)"
    : includeCapex ? "Total cost" : "Running cost only";
  const title = isSolarBattery
    ? `Battery — savings by export mode`
    : `${costViewLabel} — ${category.toLowerCase()} options (${years} year${years === 1 ? "" : "s"})`;

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
              onChange={(_, v: Category | null) => v && setCategory(v)}
              sx={groupSx}
            >
              {CATEGORIES.map((c) => (
                <ToggleButton key={c.value} value={c.value}>
                  {c.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Row>

          {!isOneYear && !isSolarBattery && (
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

          {isSolarBattery && (
            <>
              <Row label="Solar size">
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={solarKw}
                  onChange={(_, v: SolarSizeKw | null) => v !== null && setSolarKw(v)}
                  sx={groupSx}
                >
                  {SOLAR_KW_OPTIONS.map((kw) => (
                    <ToggleButton key={kw} value={kw}>
                      {kw} kW
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Row>
              <Row label="Battery size">
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={batteryKwh}
                  onChange={(_, v: BatterySizeKwh | null) => v !== null && setBatteryKwh(v)}
                  sx={groupSx}
                >
                  {BATTERY_KWH_OPTIONS.map((kwh) => (
                    <ToggleButton key={kwh} value={kwh}>
                      {kwh} kWh
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Row>
            </>
          )}
        </Box>

        {!isSolarBattery && (
          <SavingsBox
            category={category as ApplianceCategory}
            lines={savingsLines}
            noCar={noCar}
            years={years}
            scenario={baseInputs.solarScenario}
          />
        )}
      </Box>

      <Box sx={{ mt: 2 }}>
        {isSolarBattery ? (
          <SolarBatteryChart
            baseInputs={baseInputs}
            solarKw={solarKw}
            batteryKwh={batteryKwh}
            title={title}
          />
        ) : (
          <ComparisonChart title={title} bars={bars} />
        )}
      </Box>
    </Box>
  );
};

export default SingleApplianceSection;
