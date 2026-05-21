import React, { useEffect, useRef, useState } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import rough from "roughjs";
import { HouseCost } from "src/comparison/model";

export interface ChartBar {
  label: string;
  cost: HouseCost;
}

interface Props {
  title: string;
  // Small grey text rendered inside the chart card below the legend. Use it
  // for assumptions / definitions that frame the numbers (e.g. PV+battery
  // size on chart 1).
  footer?: React.ReactNode;
  bars: ChartBar[];
  // When true and exactly 2 bars are supplied, render a "savings" call-out
  // box to the right of the chart showing the difference between bar[0]
  // (the higher-cost / fossil scenario) and bar[1] (the electric scenario).
  showSavingsBox?: boolean;
  // Used by the savings box to label and annualise totals (only relevant when
  // showSavingsBox is true).
  years?: number;
}

const SEGMENT_COLORS = {
  capital: "#4A00C3",      // deep purple — paid-down principal / cash capex
  interest: "#444444",     // dark grey — finance interest
  gas: "#e97840",          // orange — gas/LPG appliance fuel
  petrol: "#8B3A1E",       // burgundy — petrol/diesel vehicle fuel
  electricity: "#F0CF61",  // yellow — grid electricity
};

const SEGMENT_LABELS = {
  capital: "Capital",
  interest: "Interest",
  gas: "Gas / LPG",
  petrol: "Petrol / diesel",
  electricity: "Electricity",
};

type SegmentKey = keyof typeof SEGMENT_COLORS;
const ORDER: SegmentKey[] = ["capital", "interest", "gas", "petrol", "electricity"];

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

// Stable hachure colour per segment key — keeps bars consistent between
// renders (otherwise rough.js picks new random offsets every paint).
const SEGMENT_SEED: Record<SegmentKey, number> = {
  capital: 11,
  interest: 23,
  gas: 41,
  petrol: 67,
  electricity: 89,
};

interface RoughSegment {
  key: SegmentKey;
  value: number;
  segPx: number;
}

interface HoverState {
  label: string;
  value: number;
  x: number;
  y: number;
}

// Renders a stacked bar as a single SVG using rough.js for the hand-drawn
// hachured fills. The SVG is sized to the chart area (maxPx tall) and the
// bars grow up from the bottom; segment labels are drawn as SVG <text>.
// Each segment also gets a transparent hit-area rect that surfaces a hover
// tooltip — important for thin segments where the inline label is suppressed.
const RoughStackedBar: React.FC<{
  segments: RoughSegment[];
  totalPx: number;
  maxPx: number;
}> = ({ segments, totalPx, maxPx }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || width <= 0) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const rc = rough.svg(svg);
    const ns = "http://www.w3.org/2000/svg";

    let y = maxPx;
    for (const seg of segments) {
      y -= seg.segPx;
      const node = rc.rectangle(0, y, width, seg.segPx, {
        fill: SEGMENT_COLORS[seg.key],
        fillStyle: "hachure",
        hachureGap: 3,
        hachureAngle: 41,
        fillWeight: 1.6,
        roughness: 1.4,
        stroke: "#222",
        strokeWidth: 1.2,
        seed: SEGMENT_SEED[seg.key],
      });
      svg.appendChild(node);
      if (seg.segPx > 22) {
        const text = document.createElementNS(ns, "text");
        text.setAttribute("x", String(width / 2));
        text.setAttribute("y", String(y + seg.segPx / 2));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("font-size", "12");
        text.setAttribute("font-weight", "700");
        text.setAttribute("fill", "#222");
        // White halo behind the black glyphs — keeps the label legible on
        // dark hachured fills without changing the black text colour.
        text.setAttribute("stroke", "#fff");
        text.setAttribute("stroke-width", "3");
        text.setAttribute("stroke-linejoin", "round");
        text.setAttribute("paint-order", "stroke fill");
        text.style.pointerEvents = "none";
        text.textContent = formatMoney(seg.value);
        svg.appendChild(text);
      }

      // Transparent hit-area on top of the segment so hover works anywhere
      // in the rectangle, not just on the hachure strokes themselves.
      const hit = document.createElementNS(ns, "rect");
      hit.setAttribute("x", "0");
      hit.setAttribute("y", String(y));
      hit.setAttribute("width", String(width));
      hit.setAttribute("height", String(seg.segPx));
      hit.setAttribute("fill", "transparent");
      hit.style.cursor = "default";
      const segLabel = SEGMENT_LABELS[seg.key];
      const segValue = seg.value;
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
    }
  }, [segments, totalPx, maxPx, width]);

  return (
    <Box
      ref={wrapRef}
      sx={{ width: "100%", maxWidth: 180, height: maxPx, position: "relative" }}
    >
      <svg ref={svgRef} width={width} height={maxPx} style={{ display: "block" }} />
      {hover && (
        <Box
          sx={{
            position: "absolute",
            left: hover.x + 12,
            top: hover.y + 12,
            padding: "0.25rem 0.5rem",
            backgroundColor: "#222",
            color: "#fff",
            borderRadius: 1,
            fontSize: "0.75rem",
            fontWeight: 600,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 10,
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          {hover.label}: {formatMoney(hover.value)}
        </Box>
      )}
    </Box>
  );
};

const Bar: React.FC<{
  label: string;
  cost: HouseCost;
  maxTotal: number;
  maxPx: number;
}> = ({ label, cost, maxTotal, maxPx }) => {
  const totalPx = maxTotal > 0 ? (cost.total / maxTotal) * maxPx : 0;
  const segments: RoughSegment[] = ORDER
    .map((key) => ({ key, value: cost[key as keyof HouseCost] as number }))
    .filter((s) => s.value > 0)
    .map((s) => ({ ...s, segPx: cost.total > 0 ? (s.value / cost.total) * totalPx : 0 }));

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        minWidth: 0,
      }}
    >
      <Typography variant="h5" sx={{ m: 0, textAlign: "center", fontSize: "0.95rem" }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ m: 0, textAlign: "center" }}>
        {formatMoney(cost.total)}
      </Typography>
      <RoughStackedBar segments={segments} totalPx={totalPx} maxPx={maxPx} />
    </Box>
  );
};

const Legend: React.FC = () => (
  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center", mt: 2 }}>
    {ORDER.map((key) => (
      <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Box
          sx={{
            width: 14,
            height: 14,
            backgroundColor: SEGMENT_COLORS[key],
            borderRadius: 0.5,
          }}
        />
        <Typography variant="caption">{SEGMENT_LABELS[key]}</Typography>
      </Box>
    ))}
  </Box>
);

const SavingsBox: React.FC<{ savings: number; years: number }> = ({ savings, years }) => {
  const positive = savings > 0;
  const fg = positive ? "#1b5e20" : "#b71c1c";
  const heading = positive ? "Savings from electrifying" : "Cost of electrifying";
  return (
    <Box
      sx={{
        flex: "0 0 auto",
        minWidth: 180,
        maxWidth: 240,
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "1rem",
        backgroundColor: positive ? "#e8f5e9" : "#fdecea",
        border: `2px solid ${positive ? "#2e7d32" : "#c62828"}`,
        borderRadius: 2,
        textAlign: "center",
      }}
    >
      <Typography variant="overline" sx={{ m: 0, lineHeight: 1.2, color: fg }}>
        {heading} {years > 1 ? `over ${years} years` : ""}
      </Typography>
      <Typography
        sx={{
          m: 0,
          mt: 1,
          fontSize: { xs: "1.8rem", sm: "2.4rem" },
          fontWeight: 700,
          color: fg,
          lineHeight: 1.1,
        }}
      >
        {formatMoney(Math.abs(savings))}
      </Typography>
      {years > 1 && (
        <Typography sx={{ mt: 0.75, fontSize: "0.85rem", color: fg, lineHeight: 1.2 }}>
          {formatMoney(Math.abs(savings) / years)} / year average
        </Typography>
      )}
    </Box>
  );
};

const ComparisonChart: React.FC<Props> = ({ title, footer, bars, showSavingsBox, years = 1 }) => {
  const theme = useTheme();
  // Y-axis is the actual peak across columns — the tallest bar fills the
  // chart, every other bar scales against the same reference.
  const maxTotal = Math.max(...bars.map((b) => b.cost.total), 1);
  const chartHeight = 360;

  const showSavings = showSavingsBox === true && bars.length === 2;
  // Savings = difference of *displayed* (rounded) totals, so the figure
  // matches what the user sees on the bars.
  const savings = showSavings
    ? roundForDisplay(bars[0].cost.total) - roundForDisplay(bars[1].cost.total)
    : 0;

  return (
    <Box
      sx={{
        padding: "1.5rem",
        backgroundColor: theme.palette.background.paper,
        border: "1px solid #d7d5cd",
        borderRadius: 1,
      }}
    >
      <Typography variant="h2" sx={{ textAlign: "center", mt: 0 }}>
        {title}
      </Typography>
      <Box
        sx={{
          display: "flex",
          gap: { xs: 1, sm: 2 },
          justifyContent: "center",
          alignItems: "stretch",
          mt: 2,
        }}
      >
        <Box
          sx={{
            flex: 1,
            display: "flex",
            gap: { xs: 1, sm: 2 },
            justifyContent: "center",
            alignItems: "flex-end",
          }}
        >
          {bars.map((b, i) => (
            <Bar
              key={`${b.label}-${i}`}
              label={b.label}
              cost={b.cost}
              maxTotal={maxTotal}
              maxPx={chartHeight}
            />
          ))}
        </Box>
        {showSavings && <SavingsBox savings={savings} years={years} />}
      </Box>
      <Legend />
      {footer && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mt: 1.5,
            color: "#666",
            fontSize: "0.78rem",
            lineHeight: 1.4,
          }}
        >
          {footer}
        </Typography>
      )}
    </Box>
  );
};

export default ComparisonChart;
