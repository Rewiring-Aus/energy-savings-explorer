import React from "react";
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import {
  DwellingType,
  HouseInputs,
  Period,
  SolarScenario,
} from "src/comparison/model";
import {
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
// Used both as the default occupants and to label the "Avg" button.
const AVG_OCCUPANTS_HOUSE = 2.7;
const AVG_OCCUPANTS_APARTMENT = 1.71;
const AVG_VEHICLES = 1.8;
const OCCUPANT_INTS = [1, 2, 3, 4, 5];
const VEHICLE_INTS = [0, 1, 2, 3];

const groupSx = {
  flexWrap: "wrap",
  "& .MuiToggleButton-root": {
    textTransform: "none",
    padding: "0.25rem 0.6rem",
    fontSize: "0.8rem",
    borderColor: "#d7d5cd",
    "&.Mui-selected": {
      backgroundColor: "#222222",
      color: "#fff",
      "&:hover": { backgroundColor: "#000" },
    },
  },
};

const Section: React.FC<{
  label: string;
  helperText?: string;
  children: React.ReactNode;
}> = ({ label, helperText, children }) => (
  <Box sx={{ mb: 1.5 }}>
    <Typography
      variant="overline"
      sx={{ display: "block", fontWeight: 600, lineHeight: 1.4, color: "#444" }}
    >
      {label}
    </Typography>
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
      {children}
    </Box>
    {helperText && (
      <Typography
        sx={{ display: "block", fontSize: "0.72rem", color: "#666", mt: 0.5, lineHeight: 1.3 }}
      >
        {helperText}
      </Typography>
    )}
  </Box>
);

const ControlBox: React.FC<Props> = ({ value, onChange }) => {
  const theme = useTheme();
  const set = <K extends keyof HouseInputs>(key: K, v: HouseInputs[K]) => {
    onChange({ ...value, [key]: v });
  };

  const vClass: VehicleClassChoice = classFromOption(value.vehicleOption);
  const vVariant: VehicleVariant = variantFromOption(value.vehicleOption);

  const setClass = (next: VehicleClassChoice) => {
    set("vehicleOption", toVehicleOption(next, vVariant));
  };
  const setVariant = (next: VehicleVariant) => {
    if (vClass === "no_car") return;
    set("vehicleOption", toVehicleOption(vClass, next));
  };

  // Apartments and houses have different census-average household sizes.
  // The "Avg" button always shows the right average for the chosen dwelling
  // and, if the user is currently sitting on the previous average, we update
  // occupants in lock-step so the toggle stays selected on "Avg".
  const avgOccupants =
    value.dwelling === "apartment" ? AVG_OCCUPANTS_APARTMENT : AVG_OCCUPANTS_HOUSE;
  const avgOccupantsLabel = `Avg (${avgOccupants.toFixed(1)})`;

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

  return (
    <Box
      sx={{
        padding: "1rem",
        backgroundColor: theme.palette.background.paper,
        border: "1px solid #d7d5cd",
        borderRadius: 1,
        boxShadow: { lg: "0 1px 4px rgba(0,0,0,0.04)" },
      }}
    >
      <Typography variant="h3" sx={{ mt: 0, mb: 1.5, fontSize: "1.05rem" }}>
        Household settings
      </Typography>

      <Section label="Location">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={value.state}
          onChange={(_, v: StateCode | null) => v && set("state", v)}
          sx={groupSx}
        >
          {STATES.map((s) => (
            <ToggleButton key={s} value={s}>
              {STATE_LABELS[s]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Section>

      <Section label="Dwelling">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={value.dwelling}
          onChange={(_, v: DwellingType | null) => v && setDwelling(v)}
          sx={groupSx}
        >
          <ToggleButton value="house">House</ToggleButton>
          <ToggleButton value="apartment">Apartment</ToggleButton>
        </ToggleButtonGroup>
      </Section>

      <Section label="Occupants">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={value.occupants}
          onChange={(_, v: number | null) => v !== null && set("occupants", v)}
          sx={groupSx}
        >
          <ToggleButton value={avgOccupants}>{avgOccupantsLabel}</ToggleButton>
          {OCCUPANT_INTS.map((n) => (
            <ToggleButton key={n} value={n}>
              {n}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Section>

      <Section label="Vehicles">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={value.vehicles}
          onChange={(_, v: number | null) => v !== null && set("vehicles", v)}
          sx={groupSx}
        >
          <ToggleButton value={AVG_VEHICLES}>Avg (1.8)</ToggleButton>
          {VEHICLE_INTS.map((n) => (
            <ToggleButton key={n} value={n}>
              {n}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Section>

      <Section label="Vehicle type">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={vClass}
          onChange={(_, v: VehicleClassChoice | null) => v && setClass(v)}
          sx={groupSx}
        >
          {VEHICLE_CLASS_CHOICES.map((c) => (
            <ToggleButton key={c} value={c}>
              {VEHICLE_CLASS_CHOICE_LABELS[c]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Section>

      <Box sx={{ mb: 1.5, mt: -0.5 }}>
        <VehicleGraphic vClass={vClass} />
      </Box>

      {vClass !== "no_car" && (
        <Section label="Variant">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={vVariant}
            onChange={(_, v: VehicleVariant | null) => v && setVariant(v)}
            sx={groupSx}
          >
            {VEHICLE_VARIANTS.map((variant) => (
              <ToggleButton key={variant} value={variant}>
                {variantLabel(variant, vClass)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Section>
      )}

      <Section label="Finance">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={value.finance ? "yes" : "no"}
          onChange={(_, v: string | null) => v && set("finance", v === "yes")}
          sx={groupSx}
        >
          <ToggleButton value="no">Cash</ToggleButton>
          <ToggleButton value="yes">Loan (7%, 10yr)</ToggleButton>
        </ToggleButtonGroup>
      </Section>

      <Section label="Period">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={value.period}
          onChange={(_, v: Period | null) => v && set("period", v)}
          sx={groupSx}
        >
          <ToggleButton value="1year">1 year</ToggleButton>
          <ToggleButton value="15year">15 years</ToggleButton>
        </ToggleButtonGroup>
      </Section>

      <Section
        label="Scenario"
        helperText="The solar scenario models a house with solar but no timers or optimisation"
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={value.solarScenario}
          onChange={(_, v: SolarScenario | null) => v && set("solarScenario", v)}
          sx={groupSx}
        >
          <ToggleButton value="grid_only">Grid only</ToggleButton>
          <ToggleButton value="solar">Solar</ToggleButton>
          <ToggleButton value="solar_optimised">Solar optimised</ToggleButton>
        </ToggleButtonGroup>
      </Section>
    </Box>
  );
};

export default ControlBox;
