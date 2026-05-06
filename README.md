# Energy Savings Explorer

An interactive frontend that compares the cost of running an all-gas vs an
all-electric Australian home over 1- or 15-year horizons. All calculations
run in the browser — no backend required. Deployed via GitHub Pages.

**Live:** https://rewiring-aus.github.io/energy-savings-explorer/

Author: [@calumharveys](https://github.com/calumharveys). Forked from the
[Rewiring Australia Household Calculator (Static)](https://github.com/Rewiring-Aus/household-calculator-static)
and rebuilt around Rewiring Australia's 2026 Energy Savings Model.

## How it works

The user picks a household (location, dwelling type, occupants, vehicles,
solar scenario, finance) in a sticky control panel, and instantly sees two
side-by-side stacks: the whole-home cost of staying on gas vs going
all-electric. A second view ("Compare a single appliance") lets you swap
each fossil option (gas/LPG/petrol/diesel) against its efficient electric
alternative.

The calculation engine is a TypeScript port of the model in
[`Energy savings 2026 Model/energy_savings_model.R`](https://github.com/Rewiring-Aus/),
covering occupancy & dwelling scaling, per-appliance solar self-consumption,
loan amortisation (capital vs interest), and per-state retail prices.

## Development

```bash
npm install
npm run dev       # Vite dev server at http://localhost:5173
npm run build     # Production build to dist/
npx vitest run    # Run tests
```

## Deployment

Pushes to `main` trigger [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds with `VITE_BASE=/energy-savings-explorer/` and publishes the
`dist/` folder to GitHub Pages.

To preview a different base path locally:

```bash
VITE_BASE=/energy-savings-explorer/ npm run build && npm run preview
```

## Project structure

```
src/
├─ comparison/
│  ├─ data.ts        # CSV-derived constants (energy use, fuel prices, vehicle capex/efficiency)
│  └─ model.ts       # Whole-home + single-appliance evaluators
├─ components/
│  ├─ ComparisonChart/        # Stacked bars + savings call-out
│  ├─ ControlBox/             # Sticky right-hand household-settings panel
│  ├─ SingleApplianceSection/ # Per-appliance comparison + savings vs each fossil
│  └─ VehicleGraphic/         # Train / hatchback / sedan / SUV PNGs
├─ pages/Home/      # Top-level layout
└─ assets/vehicles/ # Vehicle line drawings (PNG)
```
