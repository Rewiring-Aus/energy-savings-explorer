import React, { useMemo, useState } from "react";
import { Box, Link, Typography, useTheme } from "@mui/material";
import ControlBox from "src/components/ControlBox/ControlBox";
import ComparisonChart from "src/components/ComparisonChart/ComparisonChart";
import SingleApplianceSection from "src/components/SingleApplianceSection/SingleApplianceSection";
import {
  DEFAULT_INPUTS,
  HouseInputs,
  compareHouses,
} from "src/comparison/model";
import "./Home.css";

const Home: React.FC = () => {
  const theme = useTheme();
  const [inputs, setInputs] = useState<HouseInputs>(DEFAULT_INPUTS);

  const result = useMemo(() => compareHouses(inputs), [inputs]);

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
