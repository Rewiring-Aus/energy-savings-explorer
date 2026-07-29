import React, { useState } from "react";
import { Box } from "@mui/material";

// Rewiring Australia mark, shown beside the caption block under each chart so
// an exported PNG is attributable once it's out of the app.
//
// The file is loaded from `public/` at RUNTIME rather than imported, so the app
// still builds if it's ever removed — a missing logo must not break the charts.
//
//   public/rewiring-australia-logo.png    the official black-on-transparent
//                                         mark (2000x849), currently in place
//   public/rewiring-australia-logo.svg    tried if the PNG is ever swapped out
//
// Rendered at full opacity and untouched otherwise — prominence is controlled by
// size, not by fading the mark. If neither file resolves this renders nothing.
const PNG_SRC = "rewiring-australia-logo.png";
const SVG_SRC = "rewiring-australia-logo.svg";

// Vite serves `public/` from the configured base, which differs between local
// dev ("/") and GitHub Pages ("/energy-savings-explorer/").
const publicUrl = (file: string) => `${import.meta.env.BASE_URL}${file}`;

// 64 px tall ≈ 151 px wide at the mark's 2000x849 aspect — clearly branding
// without crowding the caption block it sits beside.
const ChartLogo: React.FC<{ height?: number }> = ({ height = 64 }) => {
  const [src, setSrc] = useState(publicUrl(PNG_SRC));
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <Box
      component="img"
      src={src}
      alt="Rewiring Australia"
      onError={() => {
        // Try the SVG once, then give up quietly.
        if (src.endsWith(".png")) setSrc(publicUrl(SVG_SRC));
        else setFailed(true);
      }}
      sx={{ height, width: "auto", flex: "0 0 auto", alignSelf: "flex-end" }}
    />
  );
};

export default ChartLogo;
