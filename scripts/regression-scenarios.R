# Regression check: runs the canonical 10 scenarios through evaluate_household()
# and prints a CSV table to stdout. The matching TS test
# (scripts/regression-scenarios.test.ts) runs the same 10 scenarios through
# compareHouses() and prints the same shape. Diff the two outputs to spot any
# TS<->R drift after either side is edited.
#
# Run with:
#   Rscript scripts/regression-scenarios.R
#
# Constants that must match TS data.ts (see scripts/REGRESSION.md):
#   - household_safeguard_pct = 0
#   - solar_kwp = 10, battery_size_kwh = 15
#   - loan_rate = 0.06, loan_term = 15
#   - tariff = "solar_sharer", ev_tariff_share = 1
#
# The former electricity_tariff / ev_tariff / EV_OFF_PEAK_DOL_KWH knobs no
# longer exist — one `tariff` argument replaces them (see get_tariff_spec).

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

suppressPackageStartupMessages(library(tidyverse))

model_path <- "/Users/calumharvey-scholes/Library/CloudStorage/GoogleDrive-calum@rewiringaustralia.org/Shared drives/Rewiring Australia Shared Drive/Research/Projects/Energy savings 2026 Model/energy_savings_model.R"

invisible(capture.output(source(model_path)))

# ---------------------------------------------------------------------------
# Shared defaults — mirror TS DEFAULT_INPUTS
# ---------------------------------------------------------------------------

defaults <- list(
  state                   = "AUS",
  n_occupants             = 3,              # TS DEFAULT_INPUTS.occupants
  dwelling_type           = "house",
  n_vehicles              = 2,              # TS DEFAULT_INPUTS.vehicles
  vehicle_class           = c("hatch", "SUV"), # TS [byd_dolphin, byd_sealion]
  new_used                = "New",          # BYD model lookup => Dolphin / Sealion
  period                  = "15year",
  use_loan                = FALSE,
  loan_rate               = 0.06,           # TS DEFAULT_INPUTS.loanRate
  loan_term               = 15,             # TS DEFAULT_INPUTS.loanTerm
  km_tier                 = "middle",
  tariff                  = "solar_sharer", # TS DEFAULT_INPUTS.tariff
  ev_tariff_share         = 1,              # TS EV_TARIFF_SHARE
  battery_vpp             = FALSE,          # TS DEFAULT_INPUTS.batteryVpp
  solar_kwp               = 10,             # TS WHOLE_HOME_SOLAR_KW
  battery_size_kwh        = 15,             # TS WHOLE_HOME_BATTERY_KWH
  household_safeguard_pct = 0               # TS BATTERY_HOUSEHOLD_SAFEGUARD_PCT
)

# ---------------------------------------------------------------------------
# Scenarios — identical to scripts/regression-scenarios.test.ts
# ---------------------------------------------------------------------------

scenarios <- list(
  list(id = "S01", desc = "AUS / 15yr cash / grid only",
       o = list(), solar = "grid_only"),
  list(id = "S02", desc = "AUS / 15yr loan / grid only",
       o = list(use_loan = TRUE), solar = "grid_only"),
  list(id = "S03", desc = "AUS / 15yr cash / solar",
       o = list(), solar = "solar"),
  list(id = "S04", desc = "AUS / 15yr loan / solar",
       o = list(use_loan = TRUE), solar = "solar"),
  list(id = "S05", desc = "AUS / 15yr cash / solar_optimised",
       o = list(), solar = "solar_optimised"),
  list(id = "S06", desc = "NSW / 15yr cash / solar",
       o = list(state = "NSW"), solar = "solar"),
  list(id = "S07", desc = "WA / 15yr cash / grid only",
       o = list(state = "WA"), solar = "grid_only"),
  list(id = "S08", desc = "NT / 15yr cash / grid only (LPG)",
       o = list(state = "NT"), solar = "grid_only"),
  list(id = "S09", desc = "AUS no-car / 15yr cash / solar",
       o = list(n_vehicles = 0), solar = "solar"),
  list(id = "S10", desc = "AUS apartment / 1 occ / 15yr cash / solar",
       o = list(dwelling_type = "apartment", n_occupants = 1), solar = "solar")
)

# R Gas scenario tag — NT uses LPG since there's no reticulated gas.
gas_scenario_for_state <- function(state) {
  if (state == "NT") "LPG" else "Gas"
}

solar_scenario_tag <- function(solar) {
  switch(solar,
         grid_only       = "Electric (grid_only)",
         solar           = "Electric (solar)",
         solar_optimised = "Electric (solar_optimised)")
}

# ---------------------------------------------------------------------------
# Run each scenario, extract the Gas + Electric summary rows
# ---------------------------------------------------------------------------

split_capital_interest <- function(row, args) {
  # R's summary collapses appliance + PV + battery + switchboard capex into
  # total_capex but does not split loan repayments into principal/interest.
  # We reconstruct the interest portion analytically so the CSV matches the
  # TS shape (capital = principal, interest = interest portion of loan).
  total_capex <- as.numeric(row$total_capex)
  if (!isTRUE(args$use_loan) || total_capex <= 0) {
    return(list(capital = total_capex, interest = 0))
  }
  rate <- args$loan_rate
  term <- args$loan_term
  annual <- annual_loan_payment(total_capex, rate, term)
  loan_years <- min(if (args$period == "1year") 1 else 15, term)
  total_repayment <- annual * loan_years
  principal_repaid <- total_capex * (loan_years / term)
  list(capital = principal_repaid,
       interest = total_repayment - principal_repaid)
}

rows <- lapply(scenarios, function(s) {
  args <- modifyList(defaults, s$o)
  res <- do.call(evaluate_household, args)

  gas_tag  <- gas_scenario_for_state(args$state)
  elec_tag <- solar_scenario_tag(s$solar)

  gas_row  <- res$summary[res$summary$scenario == gas_tag, ]
  elec_row <- res$summary[res$summary$scenario == elec_tag, ]

  gas_fin  <- split_capital_interest(gas_row,  args)
  elec_fin <- split_capital_interest(elec_row, args)

  data.frame(
    id                    = s$id,
    description           = sprintf('"%s"', s$desc),
    gas_capital           = round(gas_fin$capital, 0),
    gas_interest          = round(gas_fin$interest, 0),
    # R doesn't split gas-volume vs petrol vs electricity opex in the summary,
    # so we report the rolled-up appliance_opex + annual_supply_charge for the
    # gas household and leave the per-fuel columns empty — totals still line up
    # with the TS sum across columns.
    gas_gas               = NA_real_,
    gas_petrol            = NA_real_,
    gas_electricity       = NA_real_,
    gas_total             = round(as.numeric(gas_row$total_cost), 0),
    electric_capital      = round(elec_fin$capital, 0),
    electric_interest     = round(elec_fin$interest, 0),
    electric_electricity  = NA_real_,
    electric_total        = round(as.numeric(elec_row$total_cost), 0),
    savings_15yr          = round(as.numeric(gas_row$total_cost) -
                                    as.numeric(elec_row$total_cost), 0),
    stringsAsFactors = FALSE
  )
})

out <- do.call(rbind, rows)

# ---------------------------------------------------------------------------
# Emit
# ---------------------------------------------------------------------------

cat("===BEGIN_R_REGRESSION_CSV===\n")
cat(paste(c(
  "id","description","gas_capital","gas_interest","gas_gas","gas_petrol",
  "gas_electricity","gas_total","electric_capital","electric_interest",
  "electric_electricity","electric_total","savings_15yr"
), collapse = ","), "\n", sep = "")
for (i in seq_len(nrow(out))) {
  vals <- out[i, ]
  cat(paste(vals, collapse = ","), "\n", sep = "")
}
cat("===END_R_REGRESSION_CSV===\n")
