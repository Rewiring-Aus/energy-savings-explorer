import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import rough from "roughjs";
import { assumptionsLine, householdLine } from "src/comparison/summary";
import ChartExport from "src/components/ChartExport/ChartExport";
import ChartLogo from "src/components/ChartLogo/ChartLogo";
import ComparisonChart, { ChartBar, SavingsCallout } from "src/components/ComparisonChart/ComparisonChart";
import { RA } from "src/theme/palette";
import {
  ApplianceCategory,
  ApplianceOption,
  APPLIANCE_OPTIONS,
  getTariffSpec,
  HouseInputs,
  Period,
  SolarScenario,
  wholeHomePreset,
  SolarBatteryCost,
  SOLAR_FRACTION_BY_SCENARIO,
  availableOptions,
  evaluateSingleOption,
  evaluateSolarBatteryBreakdown,
  solarBatteryCapex,
  solarBatteryEnergyFlows,
} from "src/comparison/model";
import type { HouseType } from "src/comparison/model";
import {
  BATTERY_KWH_OPTIONS,
  BatterySizeKwh,
  FAST_CHARGE_FRACTION,
  FIT_BY_STATE,
  Fuel,
  FUEL_PRICES,
  SOLAR_KW_OPTIONS,
  SOLAR_LCOE_BY_STATE,
  SolarSizeKw,
  StateCode,
  TARIFF_LABELS,
} from "src/comparison/data";

interface Props {
  baseInputs: HouseInputs;
}

// "Solar+Battery" is a synthetic category that lives only in the UI — the
// underlying model uses evaluateSolarBattery() rather than the appliance
// option machinery.
type Category = ApplianceCategory | "Solar+Battery";

// The solar + battery comparison is hidden pending further work on the dispatch
// model. Flip this to true to bring the tab back — SolarBatteryChart and its
// evaluators are left fully wired up, only the entry point is withheld.
const SHOW_SOLAR_BATTERY = false;

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "Space Heating",  label: "Space heating" },
  { value: "Water Heating",  label: "Water heating" },
  { value: "Cooktop",        label: "Cooktop" },
  { value: "Vehicles",       label: "Vehicle" },
  ...(SHOW_SOLAR_BATTERY
    ? [{ value: "Solar+Battery" as Category, label: "Solar + battery" }]
    : []),
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

// Pretty label for each solar scenario, used in the chart footer captions.
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
//   otherwise  → nearest $50
function roundForDisplay(n: number): number {
  const abs = Math.abs(n);
  const step = abs < 250 ? 10 : 50;
  return Math.round(n / step) * step;
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
  fossilValue: string;  // energy-CSV key, e.g. "Natural gas" — locates the bar
  value: number;        // fossil − electric (positive = electric saves money)
}

// Shown in place of the savings callout when the household has no car, so the
// Vehicle view explains why the bars are empty rather than just showing zeros.
const NoCarNote: React.FC = () => (
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
    <Typography variant="overline" sx={{ display: "block", lineHeight: 1.2 }}>
      Savings
    </Typography>
    <Typography variant="body2" sx={{ mt: 1, color: "#666" }}>
      Pick a vehicle in Household settings to see savings.
    </Typography>
  </Box>
);

// Solar+battery segment keys — savings only. Capex is summarised separately
// above the chart since it's identical across bars.
type SbSegmentKey =
  | "solarToHome"
  | "solarExport"
  | "batteryToHome"
  | "batteryToEv"
  | "batteryToGrid";

// Brand palette only. The two flows OUT to the grid take the neutrals (grey,
// navy); the flows that stay on-site and displace a bill take the saturated
// hues (yellow for solar direct, green for battery→home, purple for battery→car).
//
// Teal is deliberately absent: against RA green it separates by only ΔE 11.4 for
// normal vision, below the hard floor of 15, so the two could not be told apart.
// Separation verified on ALL pairs: worst ΔE 17.1 protan / 9.9 tritan, 22.1 normal.
const SB_SEGMENT_COLORS: Record<SbSegmentKey, string> = {
  solarToHome:   RA.yellow,  // solar self-consumption (imports saved)
  solarExport:   RA.gray,    // daytime FiT export
  batteryToHome: RA.green,   // battery → home (imports saved)
  batteryToEv:   RA.purple,  // battery → car (charging saved)
  batteryToGrid: RA.navy,    // battery → grid (evening export)
};

const SB_SEGMENT_LABELS: Record<SbSegmentKey, string> = {
  solarToHome:   "Solar → home (imports saved)",
  solarExport:   "Solar → grid (FiT)",
  batteryToHome: "Battery → home (imports saved)",
  batteryToEv:   "Battery → car (charging saved)",
  batteryToGrid: "Battery → grid (evening export)",
};

// Stable hachure seeds (rough.js needs a fixed seed per fill so paint stays
// stable between renders).
const SB_SEGMENT_SEED: Record<SbSegmentKey, number> = {
  solarToHome: 41, solarExport: 67,
  batteryToHome: 89, batteryToEv: 137, batteryToGrid: 103,
};

const SAVINGS_KEYS: SbSegmentKey[] = [
  "solarToHome", "solarExport", "batteryToHome", "batteryToEv", "batteryToGrid",
];

function sbRoundForDisplay(n: number): number {
  const abs = Math.abs(n);
  const step = abs < 250 ? 10 : 50;
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
  modeSublabel?: string;  // small line under the title — used by the gas/petrol bar to name its mode
  maxPx: number;       // px height available for the bar
  scale: number;       // $/px
}> = ({ breakdown, modeLabel, modeSublabel, maxPx, scale }) => {
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
    breakdown.batteryToHome + breakdown.batteryToEv + breakdown.batteryToGrid;

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
        hachureGap: 2.2,
        hachureAngle: 41,
        fillWeight: 2.4,
        roughness: 1.4,
        stroke: "#222",
        strokeWidth: 1.2,
        seed: SB_SEGMENT_SEED[key],
      });
      svg.appendChild(node);
      if (h > 22) {
        const labelText = sbFormatMoney(value);
        const labelSize = 12;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const approxWidth = labelText.length * labelSize * 0.55 + 12;
        const padY = 3;
        const bg = document.createElementNS(ns, "rect");
        bg.setAttribute("x", String(cx - approxWidth / 2));
        bg.setAttribute("y", String(cy - labelSize / 2 - padY));
        bg.setAttribute("width", String(approxWidth));
        bg.setAttribute("height", String(labelSize + padY * 2));
        bg.setAttribute("rx", "4");
        bg.setAttribute("ry", "4");
        bg.setAttribute("fill", "#ffffff");
        bg.setAttribute("fill-opacity", "0.92");
        bg.setAttribute("stroke", "#222");
        bg.setAttribute("stroke-width", "0.6");
        bg.style.pointerEvents = "none";
        svg.appendChild(bg);

        const text = document.createElementNS(ns, "text");
        text.setAttribute("x", String(cx));
        text.setAttribute("y", String(cy));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("font-size", String(labelSize));
        text.setAttribute("font-weight", "700");
        text.setAttribute("fill", "#1a1a1a");
        text.style.pointerEvents = "none";
        text.textContent = labelText;
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
      {modeSublabel && (
        <Typography
          sx={{ m: 0, textAlign: "center", fontSize: "0.72rem", color: "#666", lineHeight: 1.2, mt: -0.5 }}
        >
          {modeSublabel}
        </Typography>
      )}
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

// Solar + battery view — two savings-only bars: what the same system saves an
// all-electric home, and what it saves a household still running gas heating /
// hot water / cooktop and petrol cars. Both are priced at the household's
// selected tariff.
//
// This used to be four bars, one per battery-export mode. The modes are gone:
// how exports are valued is now a property of the tariff (Amber settles the
// evening window at wholesale, every other plan at the flat feed-in tariff), so
// there is no longer an independent knob to compare across.
// The system's upfront cost is identical across both bars so it's stated once
// in the header rather than repeated in each bar.
const SolarBatteryChart: React.FC<{
  baseInputs: HouseInputs;
  solarKw: SolarSizeKw;
  batteryKwh: BatterySizeKwh;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
}> = ({ baseInputs, solarKw, batteryKwh, title, subtitle, footer }) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const years = baseInputs.period === "1year" ? 1 : 15;
  const sb = {
    solarKw, batteryKwh,
    period: baseInputs.period,
    includeCapex: true,
  };
  interface BarEntry {
    key: string;
    label: string;
    sublabel?: string;
    breakdown: SolarBatteryCost;
    houseType: HouseType;
  }
  // Report the RESOLVED tariff — Solar Sharer falls back to time-of-use outside
  // the states that offer it, and the bar sublabel is the only place that shows.
  const resolvedTariff = getTariffSpec(
    baseInputs.tariff, baseInputs.state, baseInputs.period,
  ).tariff;
  const tariffSublabel = TARIFF_LABELS[resolvedTariff];
  const breakdowns: BarEntry[] = [
    {
      key: "gas",
      label: "Gas/petrol home",
      sublabel: tariffSublabel,
      breakdown: evaluateSolarBatteryBreakdown(baseInputs, sb, "gas"),
      houseType: "gas" as const,
    },
    {
      key: "electric",
      label: "All-electric home",
      sublabel: tariffSublabel,
      breakdown: evaluateSolarBatteryBreakdown(baseInputs, sb, "electric"),
      houseType: "electric" as const,
    },
  ];

  // Single capex figure — identical across all bars.
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
      b.breakdown.batteryToHome + b.breakdown.batteryToEv + b.breakdown.batteryToGrid,
    ),
    1,
  );
  const scale = maxSavings / BAR_PX;

  return (
    <Box
      ref={cardRef}
      sx={{ position: "relative", padding: "1.5rem", backgroundColor: "#fff", border: "1px solid #d7d5cd", borderRadius: 1 }}
    >
      <ChartExport
        targetRef={cardRef}
        filename={subtitle ? `${title} — ${subtitle}` : title}
      />
      <Typography variant="h2" sx={{ textAlign: "center", mt: 0, mb: 0 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography
          variant="h3"
          sx={{ textAlign: "center", mt: 0.25, mb: 0.5, fontWeight: 500, color: "#555" }}
        >
          {subtitle}
        </Typography>
      )}

      <Typography variant="caption" sx={{ display: "block", textAlign: "center", color: "#555", mb: 1 }}>
        What the same system saves an all-electric home, next to a home still
        running gas and petrol — both on the household's tariff.
      </Typography>
      <Box sx={{ display: "flex", gap: { xs: 1, sm: 2 }, justifyContent: "center", alignItems: "flex-end", mt: 2 }}>
        {breakdowns.map((entry) => (
          <SbBar
            key={entry.key}
            modeLabel={entry.label}
            modeSublabel={entry.sublabel}
            breakdown={entry.breakdown}
            maxPx={BAR_PX}
            scale={scale}
          />
        ))}
      </Box>
      <SbLegend />

      {/* Captions left, brand mark right — both inside the exported card. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>{footer}</Box>
        <ChartLogo />
      </Box>

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

// --- Chart-2 footer: assumptions + tariff summary -------------------------
// Lays out (a) the self-consumption percentages baked into the bars for the
// current category + solar scenario and (b) the tariff rates being applied
// at the current period (1-yr current or 15-yr forecast). Lets the user see
// exactly why the bars look the way they do without spelunking the model.

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function centsKwh(n: number | undefined | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}¢/kWh`;
}

function dailyFee(n: number | undefined | null): string {
  if (n == null || n === 0) return "";
  return ` + $${n.toFixed(2)}/day`;
}

function periodPrice(state: StateCode, fuel: Fuel, period: Period):
  | { kwh: number; daily: number }
  | null {
  const row = FUEL_PRICES[state]?.[fuel];
  if (!row) return null;
  return period === "1year"
    ? { kwh: row.current, daily: row.dailyToday }
    : { kwh: row.forecast15yr, daily: row.daily15yr };
}

const footerLineSx = {
  display: "block",
  color: "#666",
  fontSize: "0.75rem",
  lineHeight: 1.5,
};

// Every chart card leads with the household it describes, so an exported PNG
// still says which settings produced it once it's away from the control panel.
const ChartFooter: React.FC<{
  category: Category;
  baseInputs: HouseInputs;
  solarKw: SolarSizeKw;
  batteryKwh: BatterySizeKwh;
}> = (props) => {
  // The solar/battery toggles above the chart only govern the Solar+Battery
  // card. Every other category is costed against the household's own system,
  // which is dwelling-dependent (apartments get a smaller one), so quote that
  // preset rather than the toggle positions.
  const system = props.category === "Solar+Battery"
    ? { solarKw: props.solarKw, batteryKwh: props.batteryKwh }
    : wholeHomePreset(props.baseInputs.dwelling);
  return (
    <>
      <Box sx={{ mt: 1.5 }}>
        <Typography variant="caption" sx={{ ...footerLineSx, fontWeight: 600, color: "#444" }}>
          {householdLine(props.baseInputs)}
        </Typography>
        <Typography variant="caption" sx={footerLineSx}>
          {assumptionsLine(props.baseInputs, system)}
        </Typography>
      </Box>
      <ChartFooterDetail {...props} />
    </>
  );
};

const ChartFooterDetail: React.FC<{
  category: Category;
  baseInputs: HouseInputs;
  solarKw: SolarSizeKw;
  batteryKwh: BatterySizeKwh;
}> = ({ category, baseInputs, solarKw, batteryKwh }) => {
  const { state, solarScenario: scenario, period } = baseInputs;
  const frac = SOLAR_FRACTION_BY_SCENARIO[scenario];
  const scenLabel = SCENARIO_LABEL[scenario].toLowerCase();
  const periodLabel = period === "1year"
    ? "today's prices"
    : "15-year forecast average";
  const spec = getTariffSpec(baseInputs.tariff, state, period);

  // ---- Solar+Battery: explain the dispatch order + the tariff's prices ----
  if (category === "Solar+Battery") {
    const fit = FIT_BY_STATE[state];
    return (
      <Box sx={{ mt: 1.5 }}>
        <Typography variant="caption" sx={footerLineSx}>
          Self-consumption is derived from your household's appliance + EV load
          (from the right-hand panel) at the {solarKw} kW solar + {batteryKwh} kWh
          battery sizing above.
        </Typography>
        <Typography variant="caption" sx={footerLineSx}>
          Stored solar is dispatched in strict priority — first to house load the
          daytime solar didn't reach, then to the car (capped at its unmet
          charging), and the remainder is exported in the evening.{" "}
          {spec.exportEvening === "wholesale_peak"
            ? "On this tariff the evening export settles at the tiered seasonal 4–8 pm wholesale schedule (per-hour cap = inverter size), floored at the feed-in tariff."
            : "On this tariff the evening export earns the flat feed-in tariff."}
        </Typography>
        <Typography variant="caption" sx={footerLineSx}>
          Prices ({periodLabel}): grid imports {centsKwh(spec.importDolKwh)},
          feed-in tariff {centsKwh(fit)}, daily supply charge $
          {spec.dailyCharge.toFixed(2)}
          {spec.freeWindow && " (this plan's higher standing charge buys the free 11am–2pm window)"}.
        </Typography>
      </Box>
    );
  }

  // ---- Vehicles ----
  if (category === "Vehicles") {
    const petrol = periodPrice(state, "petrol", period);
    const diesel = periodPrice(state, "diesel", period);
    const fast = periodPrice(state, "ev_fast_charge", period);
    const evTariffLabel = `${TARIFF_LABELS[spec.tariff]} at ${centsKwh(spec.evDolKwh)}`;
    return (
      <Box sx={{ mt: 1.5 }}>
        {scenario !== "grid_only" && (
          <Typography variant="caption" sx={footerLineSx}>
            Solar self-consumption: {pct(frac.vehicles)} of home-charged EV kWh
            served by rooftop solar ({scenLabel}). {pct(FAST_CHARGE_FRACTION)} of
            all EV charging is at public DC fast chargers — those kWh don't
            pass through the home meter and aren't eligible for solar.
          </Typography>
        )}
        {scenario === "grid_only" && (
          <Typography variant="caption" sx={footerLineSx}>
            EV charging mix: {pct(FAST_CHARGE_FRACTION)} at public DC fast
            chargers, {pct(1 - FAST_CHARGE_FRACTION)} at home.
          </Typography>
        )}
        <Typography variant="caption" sx={footerLineSx}>
          Tariffs ({periodLabel}): petrol {centsKwh(petrol?.kwh)},
          diesel {centsKwh(diesel?.kwh)}, EV home charging on{" "}
          {evTariffLabel}, public fast charge {centsKwh(fast?.kwh)}.
        </Typography>
      </Box>
    );
  }

  // ---- Space Heating / Water Heating / Cooktop ----
  const gas = periodPrice(state, "gas", period);
  const lpg = periodPrice(state, "lpg", period);
  const lcoe = SOLAR_LCOE_BY_STATE[state];

  let solarLine: React.ReactNode = null;
  if (scenario !== "grid_only") {
    if (category === "Space Heating") {
      solarLine = (
        <>
          Solar self-consumption ({scenLabel}): {pct(frac.spaceHeating)} of
          heating kWh met by rooftop solar (heat pump and resistive). Cooling
          is excluded from this chart so heating is compared like-for-like.
        </>
      );
    } else if (category === "Water Heating") {
      solarLine = (
        <>
          Solar self-consumption ({scenLabel}): heat pump hot water{" "}
          {pct(frac.waterHeating)} solar; electric resistance tank{" "}
          {pct(frac.waterHeatingResistance)} solar.
        </>
      );
    } else {
      // Cooktop
      solarLine = (
        <>
          Solar self-consumption ({scenLabel}): {pct(frac.cooktop)} of cooktop
          kWh met by rooftop solar.
        </>
      );
    }
  }

  const tariffParts: string[] = [];
  if (gas) tariffParts.push(`gas ${centsKwh(gas.kwh)}${dailyFee(gas.daily)}`);
  if (lpg) tariffParts.push(`LPG ${centsKwh(lpg.kwh)}${dailyFee(lpg.daily)}`);
  // Electricity is priced off the resolved TARIFF, not the flat "electricity"
  // row — quoting the flat row here would contradict what the bars actually
  // charge (e.g. Solar Sharer bills 33.0¢ + $2.30/day, not 39.8¢ + $1.56/day).
  tariffParts.push(
    `electricity ${centsKwh(spec.importDolKwh)}${dailyFee(spec.dailyCharge)} on ${TARIFF_LABELS[spec.tariff]}`,
  );
  if (spec.freeWindow) {
    tariffParts.push("free 11am–2pm (capped at 24 kWh/day household-wide)");
  }
  if (scenario !== "grid_only") {
    tariffParts.push(`self-consumed solar ${centsKwh(lcoe)} (LCOE)`);
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      {solarLine && (
        <Typography variant="caption" sx={footerLineSx}>
          {solarLine}
        </Typography>
      )}
      <Typography variant="caption" sx={footerLineSx}>
        Tariffs ({periodLabel}): {tariffParts.join(", ")}.
      </Typography>
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
      lines.push({
        fossilLabel: f.label,
        fossilValue: f.value,
        value: fossilCost - electricCost,
      });
    }
    return lines;
  }, [isSolarBattery, category, baseInputs, period, options]);

  // Savings callout stacked on the last bar. The electric option the savings are
  // measured against (efficientElectricValue) is always the final entry in
  // APPLIANCE_OPTIONS, so the callout belongs on the last bar — the same
  // arrangement as chart 1, where it sits on the electric column.
  //
  // Shows the total and the per-year average, exactly as chart 1 does, with the
  // fossil baseline named on the sub-line. savingsLines[0] is the headline
  // baseline (gas, or petrol for a car); where a second exists (diesel) the
  // reader can still take it off the bars, which carry their own totals.
  const savingsCallout = useMemo<SavingsCallout | undefined>(() => {
    if (isSolarBattery || bars.length === 0 || savingsLines.length === 0) return undefined;
    const headline = savingsLines[0];
    // The comparator's own bar sets the callout height, so the box rises to the
    // gas bar rather than to whatever happens to be tallest (usually LPG, which
    // isn't what the saving is measured against). bars is built 1:1 from
    // options, so the indices line up.
    const baselineIdx = options.findIndex((o) => o.value === headline.fossilValue);
    if (baselineIdx < 0) return undefined;
    return {
      barIndex: bars.length - 1,
      amount: Math.abs(headline.value),
      positive: headline.value > 0,
      baselineLabel: headline.fossilLabel,
      baselineTotal: bars[baselineIdx].cost.total,
    };
  }, [isSolarBattery, bars, options, savingsLines]);

  // Two-line heading: what's being compared, then what the bars measure.
  // Line 1 is the category ("Space heating"); line 2 the cost basis and horizon
  // ("Total costs over 15 years").
  const title = CATEGORIES.find((c) => c.value === category)?.label ?? category;
  const horizon = `over ${years} year${years === 1 ? "" : "s"}`;
  const subtitle = isSolarBattery
    ? `Savings ${horizon}`
    : isOneYear
      ? "Operating costs at current prices"
      : `${includeCapex ? "Total costs" : "Running costs"} ${horizon}`;

  // Household has no car when either count is 0 or vehicleOptions is empty
  // (defensive — these are kept in sync by ControlBox).
  const noCar = baseInputs.vehicles <= 0 || (baseInputs.vehicleOptions ?? []).length === 0;

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

      <Box sx={{ minWidth: 0 }}>
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

      <Box sx={{ mt: 2 }}>
        {isSolarBattery ? (
          <SolarBatteryChart
            baseInputs={baseInputs}
            solarKw={solarKw}
            batteryKwh={batteryKwh}
            title={title}
            subtitle={subtitle}
            footer={
              <ChartFooter
                category={category}
                baseInputs={baseInputs}
                solarKw={solarKw}
                batteryKwh={batteryKwh}
              />
            }
          />
        ) : (
          <ComparisonChart
            title={title}
            subtitle={subtitle}
            bars={bars}
            // Stacked on the final bar (the efficient-electric option, which is
            // always last in APPLIANCE_OPTIONS) so it fills the headroom up to
            // the tallest fossil bar — the same treatment chart 1 gets. Being
            // drawn inside the chart SVG, it travels with the PNG export.
            savingsCallout={savingsCallout}
            // Drives the "/ yr avg" line in the callout — without it the chart
            // would assume a 1-year horizon and drop the annual figure.
            years={years}
            // Only surfaces when there's no car to compare; otherwise the
            // callout on the bar carries the savings.
            headerPanel={
              category === "Vehicles" && noCar ? <NoCarNote /> : undefined
            }
            footer={
              <ChartFooter
                category={category}
                baseInputs={baseInputs}
                solarKw={solarKw}
                batteryKwh={batteryKwh}
              />
            }
          />
        )}
      </Box>
    </Box>
  );
};

export default SingleApplianceSection;
