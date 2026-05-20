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
1.8 BYD Dolphin (hatchback, new), 200–300 km/wk, EV tariff,
wholesale battery valuation, 10 kW solar + 15 kWh battery preset,
7% / 10-yr loan.

## Constants that must match R↔TS

Mismatches in either side will fail the diff. Keep the following aligned
whenever one model is edited:

| Constant                       | TS                                | R                                                            |
|--------------------------------|-----------------------------------|--------------------------------------------------------------|
| Battery safeguard              | `BATTERY_HOUSEHOLD_SAFEGUARD_PCT` | `household_safeguard_pct` param of `evaluate_household`      |
| EV dedicated tariff $/kWh      | `EV_DEDICATED_DOL_KWH` = 0.08     | `EV_OFF_PEAK_DOL_KWH` (the R script overrides to 0.08)       |
| Loan rate                      | `DEFAULT_INPUTS.loanRate` = 0.07  | `loan_rate` param of `evaluate_household`                    |
| Loan term                      | `DEFAULT_INPUTS.loanTerm` = 10    | `loan_term` param of `evaluate_household`                    |
| PV array size                  | `WHOLE_HOME_SOLAR_KW` = 10        | `solar_kwp` param of `evaluate_household`                    |
| Battery size                   | `WHOLE_HOME_BATTERY_KWH` = 15     | `battery_size_kwh` param of `evaluate_household`             |
| VPP membership ($/yr)          | `VPP_ANNUAL_BENEFIT` = 300        | n/a — R has no VPP toggle; TS Wholesale mode aligns with R's tiered seasonal valuation |
| Battery valuation mode (TS)    | `DEFAULT_INPUTS.batteryValue` = "wholesale" | matches R always-on tiered seasonal headroom                   |

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
