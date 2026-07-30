import React, { useEffect, useRef, useState } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import rough from "roughjs";
import ChartExport from "src/components/ChartExport/ChartExport";
import ChartLogo from "src/components/ChartLogo/ChartLogo";
import { RA } from "src/theme/palette";
import { HouseCost } from "src/comparison/model";

export interface ChartBar {
  label: string;
  cost: HouseCost;
}

interface Props {
  title: string;
  // Second heading line — what the bars measure, e.g. "Total costs over 15
  // years", where the title names what's being compared. Folded into the export
  // filename so downloads stay distinguishable.
  subtitle?: string;
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
  // Caps the card at this width and tightens the bars to fill it, which for
  // these charts means the card renders square. A chart in a full-width card is
  // mostly margin, and that margin reads as dead space once it's a PNG in a
  // deck; the export rasterises the card as laid out, so the fix belongs to the
  // card rather than to anything capture-side. Pass a value from SQUARE_WIDTH —
  // they're measured per content shape, not interchangeable.
  squarePx?: number;
  // Savings callout stacked on top of one specific bar, filling the headroom
  // between that bar and the tallest one — the same treatment the 2-bar chart
  // gets from showSavingsBox, for charts where the target bar has to be named.
  savingsCallout?: SavingsCallout;
  // Panel rendered beside the title, INSIDE the card. Anything passed here is
  // part of the PNG/clipboard export, which is the point: the per-appliance
  // savings call-out has to travel with the chart it describes. Sitting in the
  // header rather than beside the bars leaves the bars the full card width.
  // The title left-aligns when this is present (centred would collide with it)
  // and stacks above the panel on narrow screens.
  headerPanel?: React.ReactNode;
}

// Brand palette only — see src/theme/palette.ts for the validator findings.
// The fuels sit at the two ends of the neutral range (grey for gas, black for
// petrol) against the brand yellow for electricity, so the chart's central
// contrast reads as fossil-dark vs electric-bright. Capital takes navy and
// interest teal, keeping both finance lines off the fuel colours.
//
// Separation verified on ALL pairs (not just adjacent, since a zero segment can
// make any two neighbours): worst ΔE 18.7 protan / 20.9 tritan, 22.1 normal.
// The limiting pairs are yellow↔teal and grey↔navy; navy against black is
// comfortably clear despite both being dark.
const SEGMENT_COLORS = {
  capital: RA.navy,        // paid-down principal / cash capex
  interest: RA.teal,       // finance interest
  gas: RA.gray,            // gas/LPG appliance fuel
  petrol: RA.black,        // petrol/diesel vehicle fuel
  electricity: RA.yellow,  // grid electricity
};

const SEGMENT_LABELS = {
  capital: "Purchase cost",
  interest: "Interest",
  gas: "Gas / LPG",
  petrol: "Petrol / diesel",
  electricity: "Electricity",
};

// Widths at which each chart renders square, one per content shape.
//
// Card height FALLS as width rises, because the caption block rewraps to fewer
// lines — so it's a step function, not a smooth one, and squareness is a single
// width you find by measuring rather than compute. Both values below come from
// sweeping width and reading back the height the export actually captures:
//
//   house      669 → 669  (exact; height plateaus at 669 across 640-760)
//   appliance  766 → 768  (2 px out; height steps 804 → 768 → 750, and 768 is
//                          the last width in the 768 band)
//
// Re-measure both if the caption block, legend or headings change materially.
// The appliance chart is the wider of the two because it carries more caption
// text and four bars; matching the house chart's 669 would have cost either
// 135 px of bar height or most of the assumptions text.
export const SQUARE_WIDTH = {
  house: 669,
  appliance: 766,
} as const;

// Bars are capped narrower than their column so a 2-bar chart doesn't look like
// two slabs. In a square card that cap is what leaves the flanks empty, so it
// goes up. It's a cap rather than a width, so it only binds when there's room:
// two bars in 669 px take the full 236, four bars in 766 px land at ~173 and the
// cap is simply inert.
const SQUARE_BAR_MAX_PX = 236;

type SegmentKey = keyof typeof SEGMENT_COLORS;
const ORDER: SegmentKey[] = ["capital", "interest", "gas", "petrol", "electricity"];

// Display rounding tiered to keep small numbers legible without implying
// false precision on big ones:
//   |n| < $250  → nearest $10  (so a $187 cooktop bill doesn't snap to $200)
//   otherwise  → nearest $50
function roundForDisplay(n: number): number {
  const abs = Math.abs(n);
  const step = abs < 250 ? 10 : 50;
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
  // What the saving is measured against, e.g. "gas". Replaces the "over N yrs"
  // sub-line when supplied: on the appliance chart the baseline is the thing
  // worth naming, since several fossil bars are on screen at once.
  baselineLabel?: string;
  // Explicit callout height. Defaults to the headroom up to the TALLEST bar,
  // which is only right when the tallest bar is the comparator. On the appliance
  // chart it usually isn't (LPG is typically dearest but gas is the comparator),
  // so the caller passes the height that reaches the comparator instead — which
  // makes the box's height a true picture of the saving.
  heightPx?: number;
}

// Explicit savings callout stacked above one named bar. The 2-bar case
// (`showSavingsBox`) derives its own from the bar difference; this is for charts
// with more bars, where neither the target bar nor the comparator is inferable.
export interface SavingsCallout extends Omit<SavingsAbove, "years" | "heightPx"> {
  barIndex: number;
  // Total of the bar the saving is measured against. Sets the callout's height,
  // so it rises to the comparator's top rather than the chart's.
  baselineTotal: number;
}

// Renders a complete chart column (savings-or-cost callout on top + stacked
// cost segments below) in a SINGLE SVG using rough.js. Everything inside the
// chart card is hand-drawn — savings rect, bar segments, even the heading
// inside the callout — so the look is unified and the column width is one
// source of truth (the SVG width), guaranteeing the callout matches the bar.
//
// Vertical layout, bottom → top:
//   y = maxPx                    baseline; bar segments stack UPWARD from here
//   y = barTop                   top of the bar stack (maxPx - totalPx)
//   y = barTop - savingsPx       top of the savings/cost rect
//
// The callout is anchored to the BAR's top, not the SVG's, and grows upward from
// it. That keeps its bottom edge flush against the bar however tall it is —
// which matters because its height reaches the comparator bar, not necessarily
// the tallest one.
const RoughBarColumn: React.FC<{
  segments: RoughSegment[];
  totalPx: number;
  maxPx: number;
  savingsAbove?: SavingsAbove;
  barMaxPx?: number;
}> = ({ segments, totalPx, maxPx, savingsAbove, barMaxPx = 180 }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);

  // Height of the callout: the caller's explicit height when given (reaching the
  // comparator bar), otherwise the headroom up to the tallest bar.
  const savingsPx = savingsAbove && savingsAbove.amount > 0
    ? Math.max(savingsAbove.heightPx ?? maxPx - totalPx, 0)
    : 0;

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

    // ---- Savings/cost callout rectangle (sits on top of the bar) -----------
    if (savingsAbove && savingsPx > 0) {
      const { amount, positive, years } = savingsAbove;
      const bgFill = positive ? "#e8f5e9" : "#fdecea";
      const strokeColor = positive ? "#2e7d32" : "#c62828";
      const fgColor = positive ? "#1b5e20" : "#b71c1c";
      // Anchor the bottom edge to the top of the bar stack and grow upward, so
      // the box always butts against the bar. Clamped at `inset` so the rough
      // stroke isn't clipped when the box reaches the top of the SVG (which is
      // what happens on the 2-bar chart, where it does span the full headroom).
      const inset = 2;
      const barTop = Math.max(maxPx - totalPx, 0);
      const boxTop = Math.max(barTop - savingsPx, inset);
      const boxH = Math.max(barTop - boxTop, 0);
      const rect = rc.rectangle(inset, boxTop, width - inset * 2, boxH, {
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
      // Naming the baseline ("vs gas") matters more than restating the horizon
      // when other fossil bars are on screen, so it takes the sub-line when
      // supplied — and then earns that line even on a 1-year view.
      const subheadingText = savingsAbove.baselineLabel
        ? `vs ${savingsAbove.baselineLabel}`
        : years > 1 ? `over ${years} yrs` : "";
      const showHeading = boxH >= 56;
      const showSubheading = boxH >= 110 && subheadingText !== "";
      // Show the / yr average underneath the headline figure whenever there's
      // room for the heading too; the small typeface stays legible even in a
      // compact 56-px callout.
      const showAnnual = boxH >= 56 && years > 1;
      const amountSize = boxH >= 110 ? 26 : boxH >= 70 ? 22 : 18;
      const headingText = positive ? "SAVINGS" : "EXTRA COST";

      // Vertical positions: distribute heading / sub / amount / per-year across
      // the rect's height. Fractions are OF THE BOX and offset by its top, so
      // the text travels with the box instead of sticking to the SVG's top edge.
      const cx = width / 2;
      const yAt = (f: number) => boxTop + boxH * f;
      const lines: { text: string; y: number; size: number; bold?: boolean }[] = [];
      if (showHeading && showSubheading) {
        lines.push({ text: headingText, y: yAt(0.18), size: 11, bold: true });
        lines.push({ text: subheadingText, y: yAt(0.36), size: 9 });
        lines.push({ text: formatMoney(amount), y: yAt(0.60), size: amountSize, bold: true });
        if (showAnnual) {
          lines.push({ text: `${formatMoney(amount / years)} / yr avg`, y: yAt(0.86), size: 10 });
        }
      } else if (showHeading && showAnnual) {
        lines.push({ text: headingText, y: yAt(0.22), size: 11, bold: true });
        lines.push({ text: formatMoney(amount), y: yAt(0.55), size: amountSize, bold: true });
        lines.push({ text: `${formatMoney(amount / years)} / yr avg`, y: yAt(0.85), size: 10 });
      } else if (showHeading) {
        lines.push({ text: headingText, y: yAt(0.28), size: 11, bold: true });
        lines.push({ text: formatMoney(amount), y: yAt(0.68), size: amountSize, bold: true });
      } else {
        lines.push({ text: formatMoney(amount), y: yAt(0.5), size: amountSize, bold: true });
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
      sx={{ width: "100%", maxWidth: barMaxPx, height: maxPx, position: "relative" }}
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
  barMaxPx?: number;
}> = ({ label, cost, maxTotal, maxPx, savingsAbove, barMaxPx }) => {
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
        barMaxPx={barMaxPx}
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

const ComparisonChart: React.FC<Props> = ({
  title, subtitle, footer, bars, showSavingsBox, years = 1, savingsCallout,
  headerPanel, squarePx,
}) => {
  const square = squarePx !== undefined;
  const theme = useTheme();
  const cardRef = useRef<HTMLDivElement | null>(null);
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
  const barPx = (total: number) =>
    maxTotal > 0 ? (total / maxTotal) * chartHeight : 0;

  const savingsForBar = (i: number): SavingsAbove | undefined => {
    // An explicit callout wins — the caller knows which bar it belongs to.
    if (savingsCallout) {
      if (savingsCallout.barIndex !== i || savingsCallout.amount === 0) return undefined;
      // Rise to the comparator's top, not the chart's.
      const { baselineTotal, ...rest } = savingsCallout;
      return {
        ...rest,
        years,
        heightPx: Math.max(barPx(baselineTotal) - barPx(bars[i].cost.total), 0),
      };
    }
    return showSavings && savings !== 0 && i === shorterIdx
      ? { amount: Math.abs(savings), positive: savings > 0, years }
      : undefined;
  };

  return (
    <Box
      ref={cardRef}
      sx={{
        position: "relative",
        padding: "1.5rem",
        backgroundColor: theme.palette.background.paper,
        border: "1px solid #d7d5cd",
        borderRadius: 1,
        // Square mode: fix the width so the card renders square, and centre it
        // in whatever column it's given. border-box so the measured width is the
        // width including padding.
        ...(square && {
          boxSizing: "border-box",
          width: "100%",
          maxWidth: squarePx,
          mx: "auto",
        }),
      }}
    >
      <ChartExport
        targetRef={cardRef}
        filename={subtitle ? `${title} — ${subtitle}` : title}
      />
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: { md: "flex-start" },
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, textAlign: headerPanel ? "left" : "center" }}>
          <Typography variant="h2" sx={{ mt: 0, mb: 0 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="h3"
              sx={{ mt: 0.25, mb: 0, fontWeight: 500, color: "#555" }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        {headerPanel}
      </Box>
      <Box
        sx={{
          display: "flex",
          gap: square ? 1 : { xs: 1, sm: 2 },
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
            barMaxPx={square ? SQUARE_BAR_MAX_PX : undefined}
          />
        ))}
      </Box>
      <Legend />
      {/* Captions on the left, brand mark on the right. Both sit inside the
          card, so an exported PNG carries the assumptions AND its attribution. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 2,
          mt: 1.5,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            display: "block",
            flex: 1,
            minWidth: 0,
            color: "#666",
            fontSize: "0.78rem",
            lineHeight: 1.4,
          }}
        >
          {footer}
        </Typography>
        <ChartLogo />
      </Box>
    </Box>
  );
};

export default ComparisonChart;
