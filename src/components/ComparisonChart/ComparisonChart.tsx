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

interface SavingsAbove {
  amount: number;    // absolute value, always positive
  positive: boolean; // true = "Savings from electrifying", false = "Cost of electrifying"
  years: number;
}

// Renders a complete chart column (savings-or-cost callout on top + stacked
// cost segments below) in a SINGLE SVG using rough.js. Everything inside the
// chart card is hand-drawn — savings rect, bar segments, even the heading
// inside the callout — so the look is unified and the column width is one
// source of truth (the SVG width), guaranteeing the callout matches the bar.
//
// Vertical layout, top → bottom:
//   y = 0           savingsPx tall savings/cost rect (skipped if 0)
//   y = savingsPx   bar segments stack upward from y = maxPx
const RoughBarColumn: React.FC<{
  segments: RoughSegment[];
  totalPx: number;
  maxPx: number;
  savingsAbove?: SavingsAbove;
}> = ({ segments, totalPx, maxPx, savingsAbove }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);

  const savingsPx =
    savingsAbove && savingsAbove.amount > 0 ? Math.max(maxPx - totalPx, 0) : 0;

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

    // ---- Savings/cost callout rectangle (top of SVG) ----------------------
    if (savingsAbove && savingsPx > 0) {
      const { amount, positive, years } = savingsAbove;
      const bgFill = positive ? "#e8f5e9" : "#fdecea";
      const strokeColor = positive ? "#2e7d32" : "#c62828";
      const fgColor = positive ? "#1b5e20" : "#b71c1c";
      // Inset the rect by 2 px so the rough stroke isn't clipped at the SVG
      // edges. The bottom edge butts directly against the top of the bar
      // segments — no negative margin trickery needed.
      const inset = 2;
      const rect = rc.rectangle(inset, inset, width - inset * 2, savingsPx - inset, {
        fill: bgFill,
        fillStyle: "solid",
        stroke: strokeColor,
        strokeWidth: 1.8,
        roughness: 1.4,
        bowing: 1.0,
        seed: positive ? 13 : 19,
      });
      svg.appendChild(rect);

      // Text inside the rect — tiered by height so short boxes still read.
      // Headings are kept short (single word) so they fit the bar's column
      // width (~120-180 px). The full "Savings from electrifying" phrasing
      // wouldn't fit at 10 px font and was getting clipped on the right.
      const showHeading = savingsPx >= 56;
      const showSubheading = savingsPx >= 110 && years > 1;
      // Show the / yr average underneath the headline figure whenever there's
      // room for the heading too; the small typeface stays legible even in a
      // compact 56-px callout.
      const showAnnual = savingsPx >= 56 && years > 1;
      const amountSize = savingsPx >= 110 ? 26 : savingsPx >= 70 ? 22 : 18;
      const headingText = positive ? "SAVINGS" : "EXTRA COST";
      const subheadingText = years > 1 ? `over ${years} yrs` : "";

      // Vertical positions: distribute heading / sub / amount / per-year
      // across the available rect height. y values stay below savingsPx so
      // the per-year line never crosses into the bar segments underneath.
      const cx = width / 2;
      const lines: { text: string; y: number; size: number; bold?: boolean }[] = [];
      if (showHeading && showSubheading) {
        lines.push({ text: headingText, y: savingsPx * 0.18, size: 11, bold: true });
        lines.push({ text: subheadingText, y: savingsPx * 0.36, size: 9 });
        lines.push({ text: formatMoney(amount), y: savingsPx * 0.60, size: amountSize, bold: true });
        if (showAnnual) {
          lines.push({ text: `${formatMoney(amount / years)} / yr avg`, y: savingsPx * 0.86, size: 10 });
        }
      } else if (showHeading && showAnnual) {
        lines.push({ text: headingText, y: savingsPx * 0.22, size: 11, bold: true });
        lines.push({ text: formatMoney(amount), y: savingsPx * 0.55, size: amountSize, bold: true });
        lines.push({ text: `${formatMoney(amount / years)} / yr avg`, y: savingsPx * 0.85, size: 10 });
      } else if (showHeading) {
        lines.push({ text: headingText, y: savingsPx * 0.28, size: 11, bold: true });
        lines.push({ text: formatMoney(amount), y: savingsPx * 0.68, size: amountSize, bold: true });
      } else {
        lines.push({ text: formatMoney(amount), y: savingsPx / 2, size: amountSize, bold: true });
      }
      for (const line of lines) {
        const t = document.createElementNS(ns, "text");
        t.setAttribute("x", String(cx));
        t.setAttribute("y", String(line.y));
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("dominant-baseline", "middle");
        t.setAttribute("font-size", String(line.size));
        t.setAttribute("font-weight", line.bold ? "700" : "500");
        t.setAttribute("fill", fgColor);
        t.style.pointerEvents = "none";
        t.textContent = line.text;
        svg.appendChild(t);
      }
    }

    // ---- Bar segments (bottom of SVG, growing upward) ----------------------
    let y = maxPx;
    for (const seg of segments) {
      y -= seg.segPx;
      // Denser hachure (smaller gap + heavier weight) shades the segment in
      // more solidly, giving the label backdrop a darker, less noisy field
      // to sit against. The colour itself is unchanged.
      const node = rc.rectangle(0, y, width, seg.segPx, {
        fill: SEGMENT_COLORS[seg.key],
        fillStyle: "hachure",
        hachureGap: 2.2,
        hachureAngle: 41,
        fillWeight: 2.4,
        roughness: 1.4,
        stroke: "#222",
        strokeWidth: 1.2,
        seed: SEGMENT_SEED[seg.key],
      });
      svg.appendChild(node);
      if (seg.segPx > 22) {
        const labelText = formatMoney(seg.value);
        const labelSize = 13;
        const labelCx = width / 2;
        const labelCy = y + seg.segPx / 2;
        // Width estimate — SVG can't measure text before it's mounted, so
        // approximate from glyph count × half-em. Works for the $1,234 /
        // $234,000 strings we render here.
        const approxWidth = labelText.length * labelSize * 0.55 + 14;
        const padY = 4;
        const bg = document.createElementNS(ns, "rect");
        bg.setAttribute("x", String(labelCx - approxWidth / 2));
        bg.setAttribute("y", String(labelCy - labelSize / 2 - padY));
        bg.setAttribute("width", String(approxWidth));
        bg.setAttribute("height", String(labelSize + padY * 2));
        bg.setAttribute("rx", "4");
        bg.setAttribute("ry", "4");
        // Near-opaque white backdrop punches the value out of the hachured
        // bar without breaking the hand-drawn look — a small alpha keeps the
        // colour faintly visible underneath.
        bg.setAttribute("fill", "#ffffff");
        bg.setAttribute("fill-opacity", "0.92");
        bg.setAttribute("stroke", "#222");
        bg.setAttribute("stroke-width", "0.6");
        bg.style.pointerEvents = "none";
        svg.appendChild(bg);

        const text = document.createElementNS(ns, "text");
        text.setAttribute("x", String(labelCx));
        text.setAttribute("y", String(labelCy));
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
  }, [segments, totalPx, maxPx, width, savingsAbove, savingsPx]);

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
  savingsAbove?: SavingsAbove;
}> = ({ label, cost, maxTotal, maxPx, savingsAbove }) => {
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
      <RoughBarColumn
        segments={segments}
        totalPx={totalPx}
        maxPx={maxPx}
        savingsAbove={savingsAbove}
      />
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

const ComparisonChart: React.FC<Props> = ({ title, footer, bars, showSavingsBox, years = 1 }) => {
  const theme = useTheme();
  // Y-axis is the actual peak across columns — the tallest bar fills the
  // chart, every other bar scales against the same reference.
  const maxTotal = Math.max(...bars.map((b) => b.cost.total), 1);
  const chartHeight = 360;

  const showSavings = showSavingsBox === true && bars.length === 2;
  // Savings = difference of *displayed* (rounded) totals, so the figure
  // matches what the user sees on the bars. Positive savings = electric
  // cheaper (typical); negative = electric costs more.
  const savings = showSavings
    ? roundForDisplay(bars[0].cost.total) - roundForDisplay(bars[1].cost.total)
    : 0;
  // The stacked savings/cost box sits on top of the SHORTER bar — savings
  // overlaps the electric column when it's cheaper, cost overlaps the gas
  // column when electric is dearer. Whichever bar is shorter gets the box.
  const shorterIdx =
    showSavings && bars[1].cost.total < bars[0].cost.total ? 1 : 0;
  const savingsForBar = (i: number) =>
    showSavings && savings !== 0 && i === shorterIdx
      ? { amount: Math.abs(savings), positive: savings > 0, years }
      : undefined;

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
          alignItems: "flex-end",
          mt: 2,
        }}
      >
        {bars.map((b, i) => (
          <Bar
            key={`${b.label}-${i}`}
            label={b.label}
            cost={b.cost}
            maxTotal={maxTotal}
            maxPx={chartHeight}
            savingsAbove={savingsForBar(i)}
          />
        ))}
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
