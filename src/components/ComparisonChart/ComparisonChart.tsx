import React from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { HouseCost } from "src/comparison/model";

export interface ChartBar {
  label: string;
  cost: HouseCost;
}

interface Props {
  title: string;
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

function formatMoney(n: number): string {
  const rounded = Math.round(n / 100) * 100;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(rounded);
}

const Bar: React.FC<{
  label: string;
  cost: HouseCost;
  maxTotal: number;
  maxPx: number;
}> = ({ label, cost, maxTotal, maxPx }) => {
  const totalPx = maxTotal > 0 ? (cost.total / maxTotal) * maxPx : 0;

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
      <Box
        sx={{
          width: "100%",
          maxWidth: 180,
          height: maxPx,
          display: "flex",
          flexDirection: "column",
          border: "1px solid #d7d5cd",
          borderRadius: 1,
          overflow: "hidden",
          backgroundColor: "#fff",
        }}
      >
        <Box sx={{ flex: 1 }} />
        <Box sx={{ height: totalPx, display: "flex", flexDirection: "column-reverse" }}>
          {ORDER.map((key) => {
            const value = cost[key as keyof HouseCost] as number;
            if (value <= 0) return null;
            const segPx = (value / cost.total) * totalPx;
            const showLabel = segPx > 22;
            return (
              <Box
                key={key}
                sx={{
                  height: `${segPx}px`,
                  backgroundColor: SEGMENT_COLORS[key],
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: key === "electricity" ? "#222" : "#fff",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  borderTop: "1px solid rgba(255,255,255,0.4)",
                }}
              >
                {showLabel && formatMoney(value)}
              </Box>
            );
          })}
        </Box>
      </Box>
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

const ComparisonChart: React.FC<Props> = ({ title, bars, showSavingsBox, years = 1 }) => {
  const theme = useTheme();
  // Y-axis is the actual peak across columns — the tallest bar fills the
  // chart, every other bar scales against the same reference.
  const maxTotal = Math.max(...bars.map((b) => b.cost.total), 1);
  const chartHeight = 360;

  const showSavings = showSavingsBox === true && bars.length === 2;
  const savings = showSavings ? bars[0].cost.total - bars[1].cost.total : 0;

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
    </Box>
  );
};

export default ComparisonChart;
