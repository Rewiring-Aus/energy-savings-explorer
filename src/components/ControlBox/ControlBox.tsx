import React from "react";
import { Box, MenuItem, Select, Typography, useTheme } from "@mui/material";
import {
  DwellingType,
  HouseInputs,
  Period,
  SolarScenario,
} from "src/comparison/model";
import {
  DRIVING_LEVELS,
  DRIVING_LEVEL_LABELS,
  DrivingLevel,
  STATES,
  StateCode,
  STATE_LABELS,
  VEHICLE_CLASS_CHOICES,
  VEHICLE_CLASS_CHOICE_LABELS,
  VEHICLE_VARIANTS,
  VehicleClassChoice,
  VehicleVariant,
  classFromOption,
  variantFromOption,
  variantLabel,
  toVehicleOption,
} from "src/comparison/data";
import VehicleGraphic from "src/components/VehicleGraphic/VehicleGraphic";

interface Props {
  value: HouseInputs;
  onChange: (next: HouseInputs) => void;
}

// Census averages by dwelling type — apartments are smaller households.
const AVG_OCCUPANTS_HOUSE = 2.7;
const AVG_OCCUPANTS_APARTMENT = 1.86;
const AVG_VEHICLES = 1.8;
const OCCUPANT_INTS = [1, 2, 3, 4, 5];
const VEHICLE_INTS = [0, 1, 2, 3];

// Inline "handwritten" dropdown that sits inside a sentence. The Select is
// rendered as a coloured pill with a cursive font so the choices read as if
// they were scribbled into the gaps of a story.
const HANDWRITTEN_COLOR = "#c2410c";  // warm rust orange
const HANDWRITTEN_FONT = '"Caveat", "Patrick Hand", "Comic Sans MS", cursive';

const inlineSelectSx = {
  fontFamily: HANDWRITTEN_FONT,
  fontSize: "1.45rem",
  lineHeight: 1,
  color: HANDWRITTEN_COLOR,
  fontWeight: 700,
  backgroundColor: "#fffaf3",
  border: `2px solid ${HANDWRITTEN_COLOR}`,
  borderRadius: "8px",
  margin: "0 0.15rem",
  padding: 0,
  "& .MuiSelect-select": {
    padding: "0.05rem 1.6rem 0.05rem 0.55rem !important",
    minHeight: "0 !important",
  },
  "& .MuiOutlinedInput-notchedOutline": { border: "none" },
  "& .MuiSvgIcon-root": { color: HANDWRITTEN_COLOR, right: 2 },
};

interface InlineSelectProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  width?: number | string;
}

function InlineSelect<T extends string | number>({
  value, options, onChange, width,
}: InlineSelectProps<T>) {
  return (
    <Select
      value={value}
      variant="outlined"
      size="small"
      onChange={(e) => onChange(e.target.value as T)}
      sx={{ ...inlineSelectSx, width: width ?? "auto" }}
      MenuProps={{
        PaperProps: {
          sx: {
            "& .MuiMenuItem-root": {
              fontFamily: HANDWRITTEN_FONT,
              fontSize: "1.2rem",
              color: HANDWRITTEN_COLOR,
            },
          },
        },
      }}
    >
      {options.map((opt) => (
        <MenuItem key={String(opt.value)} value={opt.value}>
          {opt.label}
        </MenuItem>
      ))}
    </Select>
  );
}

const sentenceSx = {
  fontSize: "1rem",
  lineHeight: 2.1,
  color: "#333",
  mb: 1.25,
};

const ControlBox: React.FC<Props> = ({ value, onChange }) => {
  const theme = useTheme();
  const set = <K extends keyof HouseInputs>(key: K, v: HouseInputs[K]) => {
    onChange({ ...value, [key]: v });
  };

  const vClass: VehicleClassChoice = classFromOption(value.vehicleOption);
  const vVariant: VehicleVariant = variantFromOption(value.vehicleOption);

  // --- Dwelling change auto-swaps occupants to the matching census average
  //     when the user was sitting on the previous average.
  const setDwelling = (next: DwellingType) => {
    const wasOnAvg =
      value.occupants === AVG_OCCUPANTS_HOUSE ||
      value.occupants === AVG_OCCUPANTS_APARTMENT;
    const newAvg =
      next === "apartment" ? AVG_OCCUPANTS_APARTMENT : AVG_OCCUPANTS_HOUSE;
    onChange({
      ...value,
      dwelling: next,
      occupants: wasOnAvg ? newAvg : value.occupants,
    });
  };

  // --- Vehicle count: 0 forces vehicleOption to "no_car"; any positive value
  //     restores a sensible default option if the user was at "no_car".
  const setVehicleCount = (count: number) => {
    if (count === 0) {
      onChange({ ...value, vehicles: 0, vehicleOption: "no_car" });
      return;
    }
    if (value.vehicleOption === "no_car") {
      onChange({
        ...value,
        vehicles: count,
        vehicleOption: toVehicleOption("hatchback", "byd"),
      });
    } else {
      set("vehicles", count);
    }
  };

  const setClass = (next: VehicleClassChoice) => {
    if (next === "no_car") {
      onChange({ ...value, vehicles: 0, vehicleOption: "no_car" });
    } else {
      set("vehicleOption", toVehicleOption(next, vVariant));
    }
  };
  const setVariant = (next: VehicleVariant) => {
    if (vClass === "no_car") return;
    set("vehicleOption", toVehicleOption(vClass, next));
  };

  // --- Options for each inline dropdown ---
  const dwellingOptions = [
    { value: "house" as DwellingType, label: "house" },
    { value: "apartment" as DwellingType, label: "apartment" },
  ];
  const stateOptions = STATES.map((s) => ({ value: s, label: STATE_LABELS[s] }));
  const avgOccupants =
    value.dwelling === "apartment" ? AVG_OCCUPANTS_APARTMENT : AVG_OCCUPANTS_HOUSE;
  const occupantOptions: { value: number; label: string }[] = [
    { value: avgOccupants, label: avgOccupants.toFixed(1) + " (avg)" },
    ...OCCUPANT_INTS.map((n) => ({ value: n, label: String(n) })),
  ];
  const vehicleCount = value.vehicleOption === "no_car" ? 0 : value.vehicles;
  const vehicleCountOptions: { value: number; label: string }[] = [
    { value: AVG_VEHICLES, label: AVG_VEHICLES + " (avg)" },
    ...VEHICLE_INTS.map((n) => ({ value: n, label: String(n) })),
  ];
  const classOptions = VEHICLE_CLASS_CHOICES
    .filter((c) => c !== "no_car")
    .map((c) => ({
      value: c,
      label: VEHICLE_CLASS_CHOICE_LABELS[c].toLowerCase(),
    }));
  const variantOptions: { value: VehicleVariant; label: string }[] =
    vClass === "no_car"
      ? []
      : VEHICLE_VARIANTS.map((v) => ({
          value: v,
          label: variantLabel(v, vClass).toLowerCase(),
        }));
  const distanceOptions = DRIVING_LEVELS.map((lvl) => ({
    value: lvl,
    label: DRIVING_LEVEL_LABELS[lvl],
  }));
  const financeOptions = [
    { value: "cash" as const, label: "cash" },
    { value: "loan" as const, label: "a loan (8.8%, 10yr)" },
  ];
  const periodOptions: { value: Period; label: string }[] = [
    { value: "1year", label: "1" },
    { value: "15year", label: "15" },
  ];
  const scenarioOptions: { value: SolarScenario; label: string }[] = [
    { value: "grid_only", label: "no solar" },
    { value: "solar", label: "solar" },
    { value: "solar_optimised", label: "solar with smart timers on appliances" },
  ];

  const dwellingArticle = value.dwelling === "apartment" ? "an" : "a";
  const hasCar = vehicleCount > 0;
  const carPhrase = hasCar && vehicleCount === 1 ? "car" : "cars";

  return (
    <Box
      sx={{
        padding: "1.25rem 1.1rem",
        backgroundColor: theme.palette.background.paper,
        border: "1px solid #d7d5cd",
        borderRadius: 1,
        boxShadow: { lg: "0 1px 4px rgba(0,0,0,0.04)" },
      }}
    >
      <Typography variant="h3" sx={{ mt: 0, mb: 1.5, fontSize: "1.05rem" }}>
        About my home
      </Typography>

      <Typography component="div" sx={sentenceSx}>
        I live in {dwellingArticle}{" "}
        <InlineSelect
          value={value.dwelling}
          options={dwellingOptions}
          onChange={(v) => setDwelling(v)}
        />{" "}
        in{" "}
        <InlineSelect
          value={value.state}
          options={stateOptions}
          onChange={(v: StateCode) => set("state", v)}
        />.
      </Typography>

      <Typography component="div" sx={sentenceSx}>
        <InlineSelect
          value={value.occupants}
          options={occupantOptions}
          onChange={(v: number) => set("occupants", v)}
        />{" "}
        people live here with{" "}
        <InlineSelect
          value={vehicleCount}
          options={vehicleCountOptions}
          onChange={(v: number) => setVehicleCount(v)}
        />{" "}
        {carPhrase}
        {hasCar && (
          <>
            ,{" "}
            <InlineSelect
              value={vVariant}
              options={variantOptions}
              onChange={(v: VehicleVariant) => setVariant(v)}
            />{" "}
            <InlineSelect
              value={vClass}
              options={classOptions}
              onChange={(v: VehicleClassChoice) => setClass(v)}
            />
          </>
        )}
        .{" "}
        {hasCar && (
          <>
            I usually drive{" "}
            <InlineSelect
              value={value.drivingLevel}
              options={distanceOptions}
              onChange={(v: DrivingLevel) => set("drivingLevel", v)}
            />{" "}
            km a week.
          </>
        )}
      </Typography>

      {hasCar && (
        <Box sx={{ mb: 1, mt: -0.5 }}>
          <VehicleGraphic vClass={vClass} />
        </Box>
      )}

      <Typography component="div" sx={sentenceSx}>
        I'll pay for upgrades with{" "}
        <InlineSelect
          value={value.finance ? "loan" : "cash"}
          options={financeOptions}
          onChange={(v: "cash" | "loan") => set("finance", v === "loan")}
          width={170}
        />.
      </Typography>

      <Typography component="div" sx={sentenceSx}>
        Show me my savings over{" "}
        <InlineSelect
          value={value.period}
          options={periodOptions}
          onChange={(v: Period) => set("period", v)}
        />{" "}
        years, assuming we have{" "}
        <InlineSelect
          value={value.solarScenario}
          options={scenarioOptions}
          onChange={(v: SolarScenario) => set("solarScenario", v)}
          width={"min(340px, 100%)"}
        />.
      </Typography>
    </Box>
  );
};

export default ControlBox;
