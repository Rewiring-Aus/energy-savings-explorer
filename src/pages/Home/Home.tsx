import React, { useMemo, useState } from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  Link,
  Typography,
  useTheme,
} from "@mui/material";
import ControlBox from "src/components/ControlBox/ControlBox";
import ComparisonChart, { SQUARE_WIDTH } from "src/components/ComparisonChart/ComparisonChart";
import SingleApplianceSection from "src/components/SingleApplianceSection/SingleApplianceSection";
import {
  DEFAULT_INPUTS,
  HouseInputs,
  compareHouses,
  wholeHomeBatteryDiagnostics,
} from "src/comparison/model";
import { TARIFF_LABELS } from "src/comparison/data";
import {
  assumptionsLine,
  dwellingNoun,
  householdLine,
  placeTitle,
} from "src/comparison/summary";
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
      <Typography variant="h1">Fossil fuel vs all-electric home</Typography>
      <Typography variant="subtitle1" sx={{ mb: 2 }}>
        Internal Rewiring Australia tool for estimating the savings a specific
        household in a specific place can expect from going all-electric.
        Numbers come from the 2026 Energy Savings Model — adjust the household
        on the right to match the one you want to size up.
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
          <ComparisonChart
            // Two bars only, so a full-width card would be mostly margin — and
            // that margin is what shows up as dead space in the exported PNG.
            squarePx={SQUARE_WIDTH.house}
            title={
              result.years === 1
                ? `${placeTitle(inputs)} — 1 year operating cost (current prices)`
                : `${placeTitle(inputs)} — total cost over ${result.years} years`
            }
            footer={(() => {
              const noun = dwellingNoun(inputs);
              // Numbers pronounced starting with a vowel take "an": 8 (eight),
              // 11 (eleven), 18 (eighteen), and any multiple starting with
              // those digits (80, 800, 1800…). All other leading digits → "a".
              const s = String(batteryDiag.batteryKwh);
              const battArticle = /^(8|11|18)/.test(s) ? "an" : "a";
              return (
                <>
                  <Box component="span" sx={{ display: "block", fontWeight: 600, color: "#444" }}>
                    {householdLine(inputs)}
                  </Box>
                  <Box component="span" sx={{ display: "block" }}>
                    {assumptionsLine(inputs, {
                      solarKw: batteryDiag.solarKw,
                      batteryKwh: batteryDiag.batteryKwh,
                    })}
                  </Box>
                  <Box component="span" sx={{ display: "block", mt: 0.5 }}>
                    {`The all-electric ${noun} has ${batteryDiag.solarKw} kW of rooftop solar and ${battArticle} ${batteryDiag.batteryKwh} kWh battery. Electricity costs include costs and credits.`}
                  </Box>
                </>
              );
            })()}
            bars={[
              {
                label: `Fossil fuel ${inputs.dwelling === "apartment" ? "apartment" : "house"}`,
                cost: result.gas,
              },
              {
                label: `All-electric ${inputs.dwelling === "apartment" ? "apartment" : "house"}`,
                cost: result.electric,
              },
            ]}
            showSavingsBox
            years={result.years}
          />

          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 1,
              padding: "0.6rem 1rem",
              backgroundColor: theme.palette.background.paper,
              border: "1px solid #d7d5cd",
              borderTop: "none",
              borderBottomLeftRadius: 4,
              borderBottomRightRadius: 4,
              marginTop: "-1px", // join visually to the bottom of the chart card
            }}
          >
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={inputs.batteryVpp}
                  onChange={(e) => setInputs({ ...inputs, batteryVpp: e.target.checked })}
                  sx={{ padding: "0.2rem 0.4rem" }}
                />
              }
              label="Enrolled in a VPP"
              slotProps={{ typography: { sx: { fontSize: "0.8rem" } } }}
            />
            <Typography
              sx={{ fontSize: "0.72rem", color: "#666", flexBasis: "100%", lineHeight: 1.3 }}
            >
              VPP enrolment unlocks the NSW and WA battery rebates. How battery
              exports are <em>valued</em> now follows from the household's tariff
              — set that in the panel on the right.
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
                  <span>Tariff (requested → used):</span>
                  <strong>
                    {TARIFF_LABELS[batteryDiag.requestedTariff]}
                    {batteryDiag.resolvedTariff !== batteryDiag.requestedTariff && (
                      <> → {TARIFF_LABELS[batteryDiag.resolvedTariff]} (not offered here)</>
                    )}
                  </strong>
                  <span>Free window kWh/day (of {batteryDiag.freeWindowCapKwhPerDay} cap):</span>
                  <strong>
                    {batteryDiag.freeWindowKwhPerDay.toFixed(2)}
                    {batteryDiag.freeWindowBinding && " — cap binding"}
                  </strong>
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
                  <span>Stored solar → home / EV / evening export kWh/yr:</span>
                  <strong>
                    {formatKwh(batteryDiag.batteryToHomeKwhPerYear)} /{" "}
                    {formatKwh(batteryDiag.batteryToEvKwhPerYear)} /{" "}
                    {formatKwh(batteryDiag.headroomKwhPerYear)}
                  </strong>
                  <span>Import / FiT rates:</span>
                  <strong>
                    {formatPriceKwh(batteryDiag.importPriceKwh)} /{" "}
                    {formatPriceKwh(batteryDiag.fitPriceKwh)}
                  </strong>
                  <span>Evening export (blended rate × volume):</span>
                  <strong>
                    {formatPriceKwh(batteryDiag.eveningExportPriceKwh)} ={" "}
                    {formatDollars(batteryDiag.eveningExportAnnualValue)}/yr
                  </strong>
                </Box>
              )}
            </Box>
          </Box>

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
