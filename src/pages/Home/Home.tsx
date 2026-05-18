import React, { useMemo, useState } from "react";
import {
  Box,
  Link,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import ControlBox from "src/components/ControlBox/ControlBox";
import ComparisonChart from "src/components/ComparisonChart/ComparisonChart";
import SingleApplianceSection from "src/components/SingleApplianceSection/SingleApplianceSection";
import {
  BatteryValueMode,
  DEFAULT_INPUTS,
  HouseInputs,
  compareHouses,
  wholeHomeBatteryDiagnostics,
} from "src/comparison/model";
import "./Home.css";

const formatKwh = (n: number) =>
  `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(n)} kWh`;
const formatDollars = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
const formatPriceKwh = (n: number) => `${(n * 100).toFixed(1)} ¢/kWh`;

const Home: React.FC = () => {
  const theme = useTheme();
  const [inputs, setInputs] = useState<HouseInputs>(DEFAULT_INPUTS);
  const [diagOpen, setDiagOpen] = useState(false);

  const result = useMemo(() => compareHouses(inputs), [inputs]);
  const batteryDiag = useMemo(() => wholeHomeBatteryDiagnostics(inputs), [inputs]);

  return (
    <Box
      className="Home"
      sx={{
        maxWidth: "82rem",
        margin: "auto",
        padding: { xs: "1rem", md: "2rem" },
        backgroundColor: theme.palette.background.default,
      }}
    >
      <Typography variant="h1">All-gas vs all-electric home</Typography>
      <Typography variant="subtitle1" sx={{ mb: 2 }}>
        Comparing the total cost of running a fully gas-powered home against a
        fully electrified one, using Rewiring Australia's 2026 Energy Savings
        Model.
      </Typography>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          alignItems: "flex-start",
          gap: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 1,
              padding: "0.6rem 1rem",
              backgroundColor: theme.palette.background.paper,
              border: "1px solid #d7d5cd",
              borderBottom: "none",
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
            }}
          >
            <Typography
              variant="overline"
              sx={{ fontWeight: 600, color: "#444", lineHeight: 1.4 }}
            >
              Battery export
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={inputs.batteryValue}
              onChange={(_, v: BatteryValueMode | null) => v && setInputs({ ...inputs, batteryValue: v })}
              sx={{
                "& .MuiToggleButton-root": {
                  textTransform: "none",
                  padding: "0.2rem 0.6rem",
                  fontSize: "0.8rem",
                  borderColor: "#d7d5cd",
                  "&.Mui-selected": {
                    backgroundColor: "#222222",
                    color: "#fff",
                    "&:hover": { backgroundColor: "#000" },
                  },
                },
              }}
            >
              <ToggleButton value="self_consume">Self-consume</ToggleButton>
              <ToggleButton value="vpp">VPP</ToggleButton>
              <ToggleButton value="wholesale">Wholesale</ToggleButton>
            </ToggleButtonGroup>
            <Typography
              sx={{ fontSize: "0.72rem", color: "#666", flexBasis: "100%", lineHeight: 1.3 }}
            >
              How a battery's exports are valued (applies when scenario is Solar / Solar optimised).
            </Typography>
            <Box
              sx={{
                flexBasis: "100%",
                mt: 0.75,
                padding: "0.5rem 0.75rem",
                backgroundColor: "#f5f4ee",
                border: "1px dashed #d7d5cd",
                borderRadius: 0.75,
                fontSize: "0.72rem",
                lineHeight: 1.4,
                color: "#333",
              }}
            >
              <Box
                role="button"
                tabIndex={0}
                onClick={() => setDiagOpen((o) => !o)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDiagOpen((o) => !o);
                  }
                }}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 1,
                  cursor: "pointer",
                  userSelect: "none",
                  "&:hover": { color: "#000" },
                }}
              >
                <Typography
                  component="span"
                  sx={{ fontWeight: 700, fontSize: "0.72rem", color: "#444" }}
                >
                  <Box
                    component="span"
                    sx={{
                      display: "inline-block",
                      width: "0.9em",
                      transform: diagOpen ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    ▸
                  </Box>{" "}
                  Battery diagnostics ({batteryDiag.solarKw} kW solar + {batteryDiag.batteryKwh} kWh battery)
                </Typography>
                {!batteryDiag.active && (
                  <Typography
                    component="span"
                    sx={{ fontStyle: "italic", color: "#888", fontSize: "0.7rem" }}
                  >
                    inactive — Scenario is Grid only
                  </Typography>
                )}
              </Box>
              {diagOpen && (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    columnGap: 1.5,
                    rowGap: 0.25,
                    mt: 0.4,
                  }}
                >
                  <span>PV generation / self-consumption / battery charge / export kWh/yr:</span>
                  <strong>
                    {formatKwh(batteryDiag.solarGenerationKwhPerYear)} /{" "}
                    {formatKwh(batteryDiag.solarSelfConsumedKwhPerYear)} /{" "}
                    {formatKwh(batteryDiag.batteryChargeKwhPerYear)} /{" "}
                    {formatKwh(batteryDiag.exportKwhPerYear)}
                  </strong>
                  <span>Battery charge / discharge kWh/yr:</span>
                  <strong>
                    {formatKwh(batteryDiag.batteryChargeKwhPerYear)} /{" "}
                    {formatKwh(batteryDiag.batteryDischargeKwhPerYear)}
                  </strong>
                  <span>Headroom kWh/yr (battery → grid surplus):</span>
                  <strong>{formatKwh(batteryDiag.headroomKwhPerYear)}</strong>
                  <span>FiT / Wholesale rates:</span>
                  <strong>
                    {formatPriceKwh(batteryDiag.fitPriceKwh)} / {formatPriceKwh(batteryDiag.wholesalePriceKwh)}
                  </strong>
                  <span style={{ color: inputs.batteryValue === "self_consume" ? "#000" : "#666" }}>
                    Self-consume value (no battery export):
                  </span>
                  <strong style={{ color: inputs.batteryValue === "self_consume" ? "#000" : "#666" }}>
                    {formatDollars(batteryDiag.selfConsumeAnnualValue)}/yr
                  </strong>
                  <span style={{ color: inputs.batteryValue === "vpp" ? "#000" : "#666" }}>
                    VPP value (flat membership):
                  </span>
                  <strong style={{ color: inputs.batteryValue === "vpp" ? "#000" : "#666" }}>
                    {formatDollars(batteryDiag.vppAnnualValue)}/yr
                  </strong>
                  <span style={{ color: inputs.batteryValue === "wholesale" ? "#000" : "#666" }}>
                    Wholesale value (headroom × wholesale):
                  </span>
                  <strong style={{ color: inputs.batteryValue === "wholesale" ? "#000" : "#666" }}>
                    {formatDollars(batteryDiag.wholesaleAnnualValue)}/yr
                  </strong>
                </Box>
              )}
            </Box>
          </Box>
          <ComparisonChart
            title={
              result.years === 1
                ? "Whole home — 1 year operating cost (current prices)"
                : `Whole home — total cost over ${result.years} years`
            }
            bars={[
              { label: "All-gas home", cost: result.gas },
              { label: "All-electric home", cost: result.electric },
            ]}
            showSavingsBox
            years={result.years}
          />

          <SingleApplianceSection baseInputs={inputs} />
        </Box>

        <Box
          sx={{
            width: { xs: "100%", lg: "300px" },
            flex: { lg: "0 0 300px" },
            position: { lg: "sticky" },
            top: { lg: "1rem" },
            alignSelf: { lg: "flex-start" },
          }}
        >
          <ControlBox value={inputs} onChange={setInputs} />
        </Box>
      </Box>

      <Typography
        variant="body2"
        sx={{
          fontSize: "0.65rem",
          lineHeight: "0.9rem",
          fontStyle: "italic",
          mt: 2,
          color: "#555",
        }}
      >
        The legal bit — Rewiring Australia disclaims and excludes all liability
        for any claim, loss, demand or damages of any kind whatsoever (including
        for negligence) arising out of or in connection with the use of either
        this website or the tools, information, content or materials included on
        this site or on any website we link to.
      </Typography>

      <Box sx={{ mt: 2, textAlign: "center" }}>
        <Typography variant="caption">
          © Copyright{" "}
          <Link
            href="https://www.rewiringaustralia.org/"
            aria-label="Go to Rewiring Australia home page"
          >
            Rewiring Australia
          </Link>{" "}
          2026
        </Typography>
      </Box>
    </Box>
  );
};

export default Home;
