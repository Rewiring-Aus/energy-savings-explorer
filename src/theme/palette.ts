// Rewiring Australia brand palette — the single source of truth for brand
// colour. Anything that carries meaning (chart series, accents) must come from
// here rather than a literal hex, so "are we on palette?" stays answerable by
// grep.
//
// Neutral UI chrome (borders, muted body text, panel fills) is deliberately NOT
// in scope: those are greys tuned for legibility, not brand colours.

export const RA = {
  yellow: "#f0cf61",  // primary
  cream:  "#fefae6",
  purple: "#4a00c3",
  green:  "#2ea871",
  teal:   "#4db5be",
  gray:   "#545860",
  navy:   "#0a1f44",
  black:  "#000000",
  white:  "#ffffff",
} as const;

// ---------------------------------------------------------------------------
// Known constraints, measured with the dataviz palette validator
// (node scripts/validate_palette.js "<hex,…>" --mode light --pairs all)
// ---------------------------------------------------------------------------
//
// 1. NEVER use `green` and `teal` as series in the same chart. Their separation
//    is ΔE 11.4 for normal vision — below the hard floor of 15 — so full-colour
//    readers can't reliably tell them apart, let alone colourblind ones.
//
// 2. `yellow` (relative luminance 0.86) and `teal` (2.36:1) fall below 3:1
//    against a white chart surface. Both are fine here because every chart in
//    this app carries a legend plus direct value labels on the segments, which
//    is the relief the guideline requires — but neither can ever be the ONLY
//    thing distinguishing a mark.
//
// 3. The palette as a whole sits outside the validator's preferred lightness
//    band and chroma floor (yellow is very light, purple and navy very dark,
//    teal under-saturated). That is a property of the brand palette, not of any
//    particular selection from it, so those two checks cannot be made to pass
//    without leaving the brand. Series separation — the check that actually
//    governs readability — does pass on all pairs in both charts below.
