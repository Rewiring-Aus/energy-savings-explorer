import React, { useEffect, useRef, useState } from "react";
import { Autocomplete, Box, MenuItem, Select, TextField, Typography, useTheme } from "@mui/material";
import rough from "roughjs";
import {
  DwellingType,
  getTariffSpec,
  householdBreakdown,
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
  Tariff,
  TARIFFS,
  TARIFF_LABELS,
  VEHICLE_CLASS_CHOICES,
  VEHICLE_CLASS_CHOICE_LABELS,
  VEHICLE_VARIANTS,
  VehicleClass,
  VehicleClassChoice,
  VehicleOption,
  VehicleVariant,
  classFromOption,
  postcodeToState,
  variantFromOption,
  variantLabel,
  toVehicleOption,
} from "src/comparison/data";
import VehicleGraphic from "src/components/VehicleGraphic/VehicleGraphic";
import { RA } from "src/theme/palette";

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

// Inline dropdown that sits inside a sentence. The Select is rendered as a
// rough.js sketched pill — but the text itself uses the body font (Roboto)
// to match the rest of the visualiser, with the coloured ink + bold weight
// keeping it visually distinct as a pickable choice. Near-black ink rather than
// the previous rust orange: orange isn't in the RA palette, and a coloured ink
// here competes with the charts for attention. The sketched pill and the bold
// weight are what mark it as pickable, so the ink doesn't need to.
const HANDWRITTEN_COLOR = RA.black;
const INLINE_FONT = "Roboto, sans-serif";

// Select sx — drops the CSS border / background / radius; the visible "pill"
// is drawn as a rough.js sketched rectangle behind the Select (see
// InlineSelect below). Keeps the ink + chevron colour.
const inlineSelectSx = {
  fontFamily: INLINE_FONT,
  fontSize: "1rem",
  lineHeight: 1.2,
  color: HANDWRITTEN_COLOR,
  fontWeight: 700,
  backgroundColor: "transparent",
  padding: 0,
  position: "relative",
  zIndex: 1,
  "& .MuiSelect-select": {
    padding: "0.05rem 1.6rem 0.05rem 0.55rem !important",
    minHeight: "0 !important",
    backgroundColor: "transparent",
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

// Hand-drawn pill via rough.js: a sketched rounded rectangle sits behind a
// transparent MUI Select. The SVG resizes to whatever the Select actually
// measures (different labels are different widths). One stable seed per
// mount so the sketch doesn't redraw differently every keystroke; only the
// dimensions change when the picked option changes.
function InlineSelect<T extends string | number>({
  value, options, onChange, width,
}: InlineSelectProps<T>) {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // Stable per-mount seed so the sketch is the same shape across renders.
  const seedRef = useRef<number>(Math.floor(Math.random() * 1e9));

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setDims({
          w: Math.ceil(e.contentRect.width),
          h: Math.ceil(e.contentRect.height),
        });
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || dims.w <= 0 || dims.h <= 0) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const rc = rough.svg(svg);
    // Inset by 3 px on each side so the rough strokes don't get clipped at
    // the SVG edges (roughness can push lines a few px outside the nominal
    // rectangle).
    const inset = 3;
    const rect = rc.rectangle(inset, inset, dims.w - inset * 2, dims.h - inset * 2, {
      stroke: HANDWRITTEN_COLOR,
      strokeWidth: 1.6,
      fill: "#fffaf3",
      fillStyle: "solid",
      roughness: 1.4,
      bowing: 1.2,
      seed: seedRef.current,
    });
    svg.appendChild(rect);
  }, [dims]);

  return (
    <Box
      component="span"
      ref={wrapRef}
      sx={{
        position: "relative",
        display: "inline-block",
        margin: "0 0.15rem",
        verticalAlign: "middle",
      }}
    >
      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
        }}
      />
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
                fontFamily: INLINE_FONT,
                fontSize: "1rem",
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
    </Box>
  );
}

// Inline combobox — freeSolo autocomplete with the same sketched-pill
// background as InlineSelect. The user can pick a label from the dropdown
// OR type a free-text value (e.g. a postcode). `onInputSubmit` fires on
// blur and Enter with the raw typed string so the caller can parse it.
interface InlineComboProps {
  value: string;
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
  onInputSubmit: (raw: string) => void;
  width?: number | string;
  placeholder?: string;
}

function InlineCombo({
  value, options, onSelect, onInputSubmit, width, placeholder,
}: InlineComboProps) {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const seedRef = useRef<number>(Math.floor(Math.random() * 1e9));
  // Local input mirror — held while typing so the field doesn't snap back
  // to the canonical value mid-edit. Flushed via onInputSubmit on blur /
  // Enter, then synced back from the props `value` once the parent applies it.
  const [input, setInput] = useState<string>(
    options.find((o) => o.value === value)?.label ?? value,
  );
  useEffect(() => {
    setInput(options.find((o) => o.value === value)?.label ?? value);
  }, [value, options]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setDims({
          w: Math.ceil(e.contentRect.width),
          h: Math.ceil(e.contentRect.height),
        });
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || dims.w <= 0 || dims.h <= 0) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const rc = rough.svg(svg);
    const inset = 3;
    const rect = rc.rectangle(inset, inset, dims.w - inset * 2, dims.h - inset * 2, {
      stroke: HANDWRITTEN_COLOR,
      strokeWidth: 1.6,
      fill: "#fffaf3",
      fillStyle: "solid",
      roughness: 1.4,
      bowing: 1.2,
      seed: seedRef.current,
    });
    svg.appendChild(rect);
  }, [dims]);

  return (
    <Box
      component="span"
      ref={wrapRef}
      sx={{
        position: "relative",
        display: "inline-block",
        margin: "0 0.15rem",
        verticalAlign: "middle",
      }}
    >
      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
        }}
      />
      <Autocomplete
        freeSolo
        options={options}
        value={options.find((o) => o.value === value)}
        inputValue={input}
        onInputChange={(_e, newInput) => setInput(newInput)}
        onChange={(_e, picked) => {
          if (typeof picked === "string") {
            onInputSubmit(picked);
          } else if (picked) {
            onSelect(picked.value);
          }
        }}
        getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
        isOptionEqualToValue={(o, v) => o.value === v.value}
        sx={{
          width: width ?? 120,
          "& .MuiInputBase-root": {
            padding: "0 1.6rem 0 0.55rem !important",
            fontFamily: INLINE_FONT,
            fontSize: "1rem",
            color: HANDWRITTEN_COLOR,
            fontWeight: 700,
            backgroundColor: "transparent",
          },
          "& .MuiOutlinedInput-notchedOutline": { border: "none" },
          "& input": { padding: "0.05rem 0 !important" },
          "& .MuiAutocomplete-endAdornment": { right: 2 },
          "& .MuiSvgIcon-root": { color: HANDWRITTEN_COLOR },
        }}
        ListboxProps={{
          sx: {
            fontFamily: INLINE_FONT,
            color: HANDWRITTEN_COLOR,
            "& .MuiAutocomplete-option": {
              fontFamily: INLINE_FONT,
              fontSize: "1rem",
              color: HANDWRITTEN_COLOR,
            },
          },
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            variant="outlined"
            size="small"
            placeholder={placeholder}
            onBlur={() => onInputSubmit(input)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onInputSubmit(input);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        )}
      />
    </Box>
  );
}

const sentenceSx = {
  fontSize: "1rem",
  lineHeight: 2.1,
  color: "#333",
  mb: 1.25,
};

// Build a vehicleOptions array of the requested length, preserving the
// user's existing per-car picks where possible and padding with a sensible
// default. The first car pads to the BYD Dolphin (matching DEFAULT_INPUTS)
// and every car after it to the BYD Sealion, so a 2-car household reads
// "BYD hatchback and a BYD SUV" out of the box rather than two identical
// SUVs. When the count drops the array is truncated.
const DEFAULT_FIRST_CAR: VehicleOption = "byd_dolphin";
const DEFAULT_NEW_CAR: VehicleOption = "byd_sealion";
function resizeVehicleOptions(current: VehicleOption[], length: number): VehicleOption[] {
  const next: VehicleOption[] = [];
  for (let i = 0; i < length; i++) {
    next.push(current[i] ?? (i === 0 ? DEFAULT_FIRST_CAR : DEFAULT_NEW_CAR));
  }
  return next;
}

const ControlBox: React.FC<Props> = ({ value, onChange }) => {
  const theme = useTheme();
  const set = <K extends keyof HouseInputs>(key: K, v: HouseInputs[K]) => {
    onChange({ ...value, [key]: v });
  };

  const carEntries: VehicleOption[] = value.vehicleOptions ?? [];

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

  // --- Vehicle count: 0 zeroes the options array; any positive value resizes
  //     the array to the requested length, preserving prior picks. The
  //     fractional "average" preset (1.8) collapses to a single shared car.
  const setVehicleCount = (count: number) => {
    if (count === 0) {
      onChange({ ...value, vehicles: 0, vehicleOptions: [] });
      return;
    }
    const targetLength = Number.isInteger(count) ? count : 1;
    onChange({
      ...value,
      vehicles: count,
      vehicleOptions: resizeVehicleOptions(carEntries, targetLength),
    });
  };

  // Per-car class / variant setters update vehicleOptions[index] only.
  const setCarClass = (index: number, next: VehicleClassChoice) => {
    if (next === "no_car") return; // class selector excludes "no_car"
    const current = carEntries[index] ?? DEFAULT_NEW_CAR;
    const variant = variantFromOption(current);
    const updated = [...carEntries];
    updated[index] = toVehicleOption(next, variant);
    set("vehicleOptions", updated);
  };
  const setCarVariant = (index: number, next: VehicleVariant) => {
    const current = carEntries[index] ?? DEFAULT_NEW_CAR;
    const cls = classFromOption(current);
    if (cls === "no_car") return;
    const updated = [...carEntries];
    updated[index] = toVehicleOption(cls, next);
    set("vehicleOptions", updated);
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
  const vehicleCount = value.vehicles;
  const vehicleCountOptions: { value: number; label: string }[] = [
    { value: AVG_VEHICLES, label: AVG_VEHICLES + " (avg)" },
    ...VEHICLE_INTS.map((n) => ({ value: n, label: String(n) })),
  ];
  const classOptions = VEHICLE_CLASS_CHOICES
    .filter((c) => c !== "no_car")
    .map((c) => ({
      value: c,
      // Canonical casing — "Hatchback / Sedan / SUV". (Was lowercased while
      // the dropdowns used a cursive scribble font; with Roboto that turned
      // "SUV" into "suv", which reads as a typo.)
      label: VEHICLE_CLASS_CHOICE_LABELS[c],
    }));
  // Variant labels: "average new" / "average used" stay lower-case to read
  // as inline scribble; "BYD" is a brand name and stays uppercase.
  const buildVariantOptions = (cls: VehicleClass): { value: VehicleVariant; label: string }[] =>
    VEHICLE_VARIANTS.map((v) => ({
      value: v,
      label: variantLabel(v, cls),
    }));
  const distanceOptions = DRIVING_LEVELS.map((lvl) => ({
    value: lvl,
    label: DRIVING_LEVEL_LABELS[lvl],
  }));
  const tariffOptions: { value: Tariff; label: string }[] = TARIFFS.map((t) => ({
    value: t,
    label: TARIFF_LABELS[t],
  }));
  const financeOptions = [
    { value: "cash" as const, label: "cash" },
    { value: "loan" as const, label: "a loan (6%, 15yr)" },
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

  // Resolved tariff — Solar Sharer silently falls back to time-of-use outside
  // the states that offer it, and that has to be visible rather than implied.
  const tariffSpec = getTariffSpec(value.tariff, value.state, value.period);
  const tariffFellBack = tariffSpec.tariff !== value.tariff;
  // Free-window kWh/day is the most legible explanation of why Solar Sharer
  // differs from the other plans, so surface it next to the selector.
  const freeWindowKwhDay = tariffSpec.freeWindow
    ? householdBreakdown(value, "electric").free.totalKwh
    : 0;
  const freeWindowBinding = tariffSpec.freeWindow
    && householdBreakdown(value, "electric").free.scaleFactor < 1;

  const hasCar = vehicleCount > 0;
  const carPhrase = hasCar && vehicleCount === 1 ? "car" : "cars";
  // "These are" only fits when there's more than one car; with one car
  // "It is" reads better. For 1.8 (avg) we still treat as multi-car.
  const chargedSubject = vehicleCount === 1 ? "It is" : "These are";
  const isGridOnly = value.solarScenario === "grid_only";

  // --- Per-car selector helper. Renders "an average new SUV" / "a BYD
  // hatchback" — the article ("a"/"an") flips based on the variant label
  // since "average" starts with a vowel sound while "BYD" doesn't. Used by
  // the car description sentence for each car configured.
  const renderCarPhrase = (index: number) => {
    const opt = carEntries[index] ?? DEFAULT_NEW_CAR;
    const cls = classFromOption(opt);
    const variant = variantFromOption(opt);
    if (cls === "no_car") return null;
    const article = variant === "byd" ? "a" : "an";
    return (
      <>
        {article}{" "}
        <InlineSelect
          value={variant}
          options={buildVariantOptions(cls)}
          onChange={(v: VehicleVariant) => setCarVariant(index, v)}
        />{" "}
        <InlineSelect
          value={cls}
          options={classOptions}
          onChange={(v: VehicleClassChoice) => setCarClass(index, v)}
        />
      </>
    );
  };

  // Build the comma-separated list of car phrases. For an integer count N
  // we render N selectors; for 1.8 (average) we render a single shared
  // selector applied to all 1.8 average cars.
  const carPhraseCount = Number.isInteger(vehicleCount) ? vehicleCount : 1;
  const carPhraseNodes: React.ReactNode[] = [];
  for (let i = 0; i < carPhraseCount; i++) {
    if (i > 0) {
      carPhraseNodes.push(carPhraseCount === 2 && i === 1 ? " and " : i === carPhraseCount - 1 ? ", and " : ", ");
    }
    carPhraseNodes.push(<React.Fragment key={i}>{renderCarPhrase(i)}</React.Fragment>);
  }

  // VehicleGraphic only renders sensibly for a single class — show the
  // first car's drawing as the visual anchor.
  const firstCarClass = carEntries.length > 0 ? classFromOption(carEntries[0]) : null;

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
        About this home
      </Typography>

      <Typography component="div" sx={sentenceSx}>
        This{" "}
        <InlineSelect
          value={value.dwelling}
          options={dwellingOptions}
          onChange={(v) => setDwelling(v)}
        />{" "}
        is in{" "}
        <InlineCombo
          // Show the postcode digits when one is set so the user can see
          // they're on a postcode-precision read; otherwise display the
          // state label as before.
          value={value.postcode !== undefined ? String(value.postcode) : value.state}
          options={stateOptions.map((s) => ({ value: s.value, label: s.label }))}
          onSelect={(v) => {
            // Picking a state from the dropdown clears the postcode — the
            // user is asking for a state-level view again.
            onChange({ ...value, state: v as StateCode, postcode: undefined });
          }}
          onInputSubmit={(raw) => {
            const trimmed = raw.trim();
            if (!trimmed) return;
            const matched = stateOptions.find(
              (s) => s.label.toLowerCase() === trimmed.toLowerCase() ||
                     s.value.toLowerCase() === trimmed.toLowerCase(),
            );
            if (matched) {
              onChange({ ...value, state: matched.value as StateCode, postcode: undefined });
              return;
            }
            // 4-digit postcode → resolve to its state but persist the
            // postcode so postcode-keyed lookups (e.g. solar irradiance)
            // can use it. Leave inputs alone if the digits don't map to a
            // known state range.
            if (/^\d{4}$/.test(trimmed)) {
              const pc = parseInt(trimmed, 10);
              const resolved = postcodeToState(pc);
              if (resolved) onChange({ ...value, state: resolved, postcode: pc });
            }
          }}
          width={140}
          placeholder="state or postcode"
        />.
      </Typography>

      <Typography component="div" sx={sentenceSx}>
        There {value.occupants === 1 ? "is" : "are"}{" "}
        <InlineSelect
          value={value.occupants}
          options={occupantOptions}
          onChange={(v: number) => set("occupants", v)}
        />{" "}
        {value.occupants === 1 ? "occupant" : "occupants"} and{" "}
        <InlineSelect
          value={vehicleCount}
          options={vehicleCountOptions}
          onChange={(v: number) => setVehicleCount(v)}
        />{" "}
        {carPhrase}
        {hasCar && (
          <>
            {" "}which {vehicleCount === 1 ? "usually drives" : "each usually drive"}{" "}
            <InlineSelect
              value={value.drivingLevel}
              options={distanceOptions}
              onChange={(v: DrivingLevel) => set("drivingLevel", v)}
            />{" "}
            km a week
          </>
        )}
        .
      </Typography>

      {hasCar && (
        <Typography component="div" sx={sentenceSx}>
          The electric car would be {carPhraseNodes}.
        </Typography>
      )}

      {firstCarClass && firstCarClass !== "no_car" && (
        <Box sx={{ mb: 1, mt: -0.5 }}>
          <VehicleGraphic vClass={firstCarClass} />
        </Box>
      )}

      {hasCar && !isGridOnly && (
        <Typography component="div" sx={sentenceSx}>
          {chargedSubject} charged on solar where possible.
        </Typography>
      )}

      <Typography component="div" sx={sentenceSx}>
        The house is on{" "}
        <InlineSelect
          value={value.tariff}
          options={tariffOptions}
          onChange={(v: Tariff) => set("tariff", v)}
          width={"min(340px, 100%)"}
        />
        {tariffFellBack && (
          // Solar Sharer isn't offered here, so the model silently used
          // time-of-use. Say so rather than implying coverage.
          <Box
            component="span"
            sx={{ fontStyle: "italic", color: "#8a6d3b", whiteSpace: "normal" }}
          >
            {" "}— not offered in {STATE_LABELS[value.state]}, so time-of-use is
            used instead
          </Box>
        )}
        .
        {freeWindowKwhDay > 0 && (
          <Box
            component="span"
            sx={{ display: "block", fontSize: "0.8rem", color: "#666", mt: 0.25 }}
          >
            About {freeWindowKwhDay.toFixed(1)} kWh a day of this household's use
            can shift into the free 11am–2pm window
            {freeWindowBinding ? " (capped at the 24 kWh daily limit)" : ""}.
          </Box>
        )}
      </Typography>

      <Typography component="div" sx={sentenceSx}>
        Upgrades are paid for with{" "}
        <InlineSelect
          value={value.finance ? "loan" : "cash"}
          options={financeOptions}
          onChange={(v: "cash" | "loan") => set("finance", v === "loan")}
          width={170}
        />.
      </Typography>

      <Typography component="div" sx={sentenceSx}>
        Show the savings over{" "}
        <InlineSelect
          value={value.period}
          options={periodOptions}
          onChange={(v: Period) => set("period", v)}
        />{" "}
        years, assuming there are{" "}
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
