# TS↔R regression scenarios

Ten fixed household scenarios run through both `compareHouses()` (TS) and
`evaluate_household()` (R). Run both, diff the CSVs, drift becomes obvious.

## Run

```
npm run regression:ts > /tmp/ts.csv
npm run regression:r  > /tmp/r.csv
diff <(sed -n '/===BEGIN_TS_REGRESSION_CSV===/,/===END_TS_REGRESSION_CSV===/p' /tmp/ts.csv) \
     <(sed -n '/===BEGIN_R_REGRESSION_CSV===/,/===END_R_REGRESSION_CSV===/p'  /tmp/r.csv)
```

(The R script also writes the CSV to stdout — pipe wherever you like.)

## The 10 scenarios

| ID  | Description                                      |
|-----|--------------------------------------------------|
| S01 | AUS / 15yr cash / grid only                      |
| S02 | AUS / 15yr loan / grid only                      |
| S03 | AUS / 15yr cash / solar                          |
| S04 | AUS / 15yr loan / solar                          |
| S05 | AUS / 15yr cash / solar_optimised                |
| S06 | NSW / 15yr cash / solar                          |
| S07 | WA / 15yr cash / grid only                       |
| S08 | NT / 15yr cash / grid only (LPG fallback)        |
| S09 | AUS no-car / 15yr cash / solar                   |
| S10 | AUS apartment / 1 occ / 15yr cash / solar        |

All other settings are TS `DEFAULT_INPUTS`:
3 occupants, 2 cars (BYD Dolphin + BYD Sealion), 200–300 km/wk,
`tariff` = `solar_sharer`, `EV_TARIFF_SHARE` = 1, 10 kW solar +
15 kWh battery preset, 6% / 15-yr loan, safeguard 0.

## Current status (last run: 2026-07-29, after the tariff refactor)

All scenarios agree within $1–15 over 15 years (rounding), except S10.

S10 (apartment) differs by design: TS scales the whole-home system down to
5 kW / 8 kWh for apartments via `wholeHomePreset()`, R does not. Expect a
~$1,250 gap on that row; it is intentional, not drift.

## Second harness: `scripts/tariff-invariants.test.ts`

The CSV diff only covers `tariff = solar_sharer`. `tariff-invariants.test.ts`
pins the full 4 × 3 tariff × solar-scenario matrix for the reference household
from `TARIFF_PORT_TO_TS.md` §7 (AUS, 2.7 occupants, SUV + hatch, 6%/15-yr loan,
10 kW + 15 kWh, safeguard 0), verified against `evaluate_household()` to within
$1/yr on every cell:

| tariff | grid_only | solar | solar_optimised |
|---|---|---|---|
| flat | 2,717 | 3,560 | 3,959 |
| tou | 3,294 | 3,541 | 3,839 |
| amber | 3,294 | 3,541 | 3,839 |
| solar_sharer | 3,532 | 4,222 | 4,519 |

(annual savings vs gas, $/yr)

It also asserts the structural invariants that are easy to silently break:

- `solar_optimised` ≥ `solar` on **every** tariff. Dispatching solar before the
  free window makes these two cannibalise each other (both are $0) while
  stripping the battery of stored energy — a real loss — which flips the sign.
- `amber` == `tou` on imports, supply charge and the gas side; they differ only
  in the value of evening exports.
- Free-window kWh must not move when solar changes *within* a scenario (it
  legitimately changes across scenarios, because the `sso_` column changes).
- Stored solar partitions exactly three ways: house load + EV + evening export
  == `storedSolar × (1 - safeguard)`. The export leg is the residual and must
  never be dropped.
- The battery is never credited for more kWh than were actually billed — the
  eligible load must be net of free-window kWh and the `min_retail` floor.
- Solar Sharer eligibility is derived from the price rows, not hardcoded, and
  falls back to `tou` in VIC/WA/TAS/NT.

> **Note on §7 of `TARIFF_PORT_TO_TS.md`:** its `net_annual_opex` table lists
> `solar_sharer` as "~2,674" for both `solar` and `solar_optimised`, described as
> a "~$0 gap". That row is stale — R returns 2,667 / 2,369, and the doc's own
> savings table (4,222 vs 4,519) implies exactly the $297 gap those figures
> produce. Trust the savings table.

Watch `batteryCapacityFactor()` in `model.ts`. Battery capacity must be
time-AVERAGED over the horizon — `(1 + (1-d)^N) / 2`, matching
`battery_model.R`'s `avg_capacity_factor`. Using the end-of-life value
`(1-d)^N` instead shrinks the battery ~17% and silently under-credits every
solar scenario by $1,000–3,100 over 15 years.

## Constants that must match R↔TS

Mismatches in either side will fail the diff. Keep the following aligned
whenever one model is edited:

| Constant                       | TS                                | R                                                            |
|--------------------------------|-----------------------------------|--------------------------------------------------------------|
| Battery safeguard              | `BATTERY_HOUSEHOLD_SAFEGUARD_PCT` = 0 | `household_safeguard_pct` param of `evaluate_household` (function default is 0.20; the canonical comparisons run passes 0) |
| Tariff                         | `DEFAULT_INPUTS.tariff` = "solar_sharer" | `tariff` param of `evaluate_household` (same default)   |
| EV tariff share                | `EV_TARIFF_SHARE` = 1             | `ev_tariff_share` param (same default)                       |
| Free-window cap (kWh/day)      | `SOLAR_SHARER_CAP_KWH_DAY` = 24   | `SOLAR_SHARER_CAP_KWH_DAY`                                   |
| Solar Sharer states            | `SOLAR_SHARER_STATES` — derived from which states have an `electricity_sso_free` row | `SOLAR_SHARER_STATES` — derived the same way. **Neither side hardcodes this**, so adding VIC sso rows to the CSV needs no code change on either side (but the TS rows must be transcribed, see below) |
| VPP enrolment                  | `DEFAULT_INPUTS.batteryVpp` = false | `battery_vpp` param (same default). Gates the NSW/WA battery subsidy only — it does **not** affect export pricing on either side |
| Loan rate                      | `DEFAULT_INPUTS.loanRate` = 0.06  | `loan_rate` param of `evaluate_household`                    |
| Loan term                      | `DEFAULT_INPUTS.loanTerm` = 15    | `loan_term` param of `evaluate_household`                    |
| PV array size                  | `wholeHomePreset()` = 10 kW (house) | `solar_kwp` param of `evaluate_household`                  |
| Battery size                   | `wholeHomePreset()` = 15 kWh (house) | `battery_size_kwh` param of `evaluate_household`          |
| Per-load solar / free-window shares | `SOLAR_FRACTION_TABLE` in `model.ts` | `SOLAR_FRACTION_TABLE` in `energy_savings_model.R` — same shape, same rows, including the `sso_*` and `min_retail` columns |

`VPP_ANNUAL_BENEFIT` is now unused by the model: R has no VPP revenue concept,
and battery exports are valued by the tariff. It is left in `data.ts` because
VPP's effect on export revenue is an open question to revisit.

**The `sso` price rows are hand-transcribed into `data.ts`.** `SOLAR_SHARER_STATES`
derives eligibility from those rows, so a state is only eligible in TS once its
`electricity_sso_free` / `_off_peak` rows have been copied across from
`fuel_prices_by_state_simple.csv`. Currently: ACT, AUS, NSW, QLD, SA.
VIC has no sso rows in the CSV despite being an announced Solar Sharer
jurisdiction — that is an upstream data gap, not a port omission.

The R script sets the params explicitly at the top so the only edit needed
when something moves is the `defaults` list in `scripts/regression-scenarios.R`.

## Known small residuals (≤ $50 / row, sub-0.1%)

- TS uses rounded constants from `data.ts` (e.g. PV daily kWh `4.39`),
  R reads raw values from the LCOE CSV (`0.18274…`). Promote the TS
  constants to 4–5 decimals if bit-exact parity is needed.
- R rounds each appliance row's components to whole dollars before summing
  in the summary tibble; TS keeps doubles until display.
- TS interest split (capital vs interest portion of the loan repayment) is
  reconstructed analytically on the R side — same total, but the per-segment
  split is exact only when annuity arithmetic is identical.

## CSV columns

`id, description, gas_capital, gas_interest, gas_gas, gas_petrol, gas_electricity, gas_total, electric_capital, electric_interest, electric_electricity, electric_total, savings_15yr`

R leaves the per-fuel opex columns (`gas_gas`, `gas_petrol`, `gas_electricity`,
`electric_electricity`) as `NA` — its summary rolls them into `appliance_opex`.
Totals are still directly comparable.
