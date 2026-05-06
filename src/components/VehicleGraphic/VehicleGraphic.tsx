import React from "react";
import { Box } from "@mui/material";
import { VehicleClassChoice } from "src/comparison/data";
import hatchbackUrl from "src/assets/vehicles/hatchback.png";
import sedanUrl from "src/assets/vehicles/sedan.png";
import suvUrl from "src/assets/vehicles/suv.png";
import trainUrl from "src/assets/vehicles/train.png";

const URL_BY_CLASS: Record<VehicleClassChoice, string> = {
  no_car: trainUrl,
  hatchback: hatchbackUrl,
  sedan: sedanUrl,
  suv: suvUrl,
};

const ALT_BY_CLASS: Record<VehicleClassChoice, string> = {
  no_car: "High-speed train",
  hatchback: "Hatchback line drawing",
  sedan: "Sedan line drawing",
  suv: "SUV line drawing",
};

interface Props {
  vClass: VehicleClassChoice;
}

const VehicleGraphic: React.FC<Props> = ({ vClass }) => (
  <Box
    sx={{
      width: "100%",
      maxWidth: 176,
      height: 64,
      margin: "0 auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Box
      component="img"
      src={URL_BY_CLASS[vClass]}
      alt={ALT_BY_CLASS[vClass]}
      sx={{
        maxWidth: "100%",
        maxHeight: "100%",
        width: "auto",
        height: "auto",
        objectFit: "contain",
      }}
    />
  </Box>
);

export default VehicleGraphic;
