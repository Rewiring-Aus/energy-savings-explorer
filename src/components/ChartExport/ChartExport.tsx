import React, { useCallback, useState } from "react";
import { Box, Button } from "@mui/material";
import { getFontEmbedCSS, toSvg } from "html-to-image";

// Rasterises a chart card (title + bars + legend + footer captions) to a PNG
// so it can be pasted straight into a deck or doc. Two entry points: copy to
// clipboard, or download a file.
//
// Anything inside the card marked `data-export-exclude` is dropped from the
// capture — used to keep the export toolbar itself out of the image.

// Embedding the Rubik webface means walking every stylesheet and base64-ing
// the .ttf, which takes a beat. Do it once per session and reuse.
let fontEmbedCssPromise: Promise<string> | null = null;
function fontEmbedCss(node: HTMLElement): Promise<string> {
  if (!fontEmbedCssPromise) {
    fontEmbedCssPromise = getFontEmbedCSS(node).catch(() => "");
  }
  return fontEmbedCssPromise;
}

const PIXEL_RATIO = 2; // retina-sharp when dropped into a deck

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Chart image failed to load"));
    img.src = src;
  });
}

// html-to-image gives us the DOM → SVG half; we drive the SVG → canvas → PNG
// half ourselves rather than calling its toBlob/toCanvas, which gate on a
// requestAnimationFrame tick and hang outright in tabs that aren't painting.
async function captureCard(node: HTMLElement): Promise<Blob> {
  const fontEmbedCSS = await fontEmbedCss(node);

  // The export toolbar is filtered out of the clone, so the captured content
  // is shorter than the live card by exactly the toolbar's outer height.
  // Trimming that off keeps the PNG free of dead space at the top.
  const toolbar = node.querySelector<HTMLElement>("[data-export-exclude]");
  const toolbarPx = toolbar
    ? toolbar.offsetHeight +
      parseFloat(window.getComputedStyle(toolbar).marginBottom || "0")
    : 0;

  const width = node.offsetWidth;
  const height = Math.max(node.offsetHeight - toolbarPx, 1);

  const svgUrl = await toSvg(node, {
    width,
    height,
    backgroundColor: "#ffffff",
    fontEmbedCSS,
    filter: (el: HTMLElement) =>
      !(el.dataset && el.dataset.exportExclude !== undefined),
  });

  const img = await loadImage(svgUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * PIXEL_RATIO);
  canvas.height = Math.ceil(height * PIXEL_RATIO);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
      "image/png",
    );
  });
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "chart"
  );
}

type Status = "idle" | "working" | "copied" | "saved" | "error";

interface Props {
  // The card element to rasterise. Held in a ref by the chart component.
  targetRef: React.RefObject<HTMLElement | null>;
  // Chart title — becomes the download filename.
  filename: string;
}

const ChartExport: React.FC<Props> = ({ targetRef, filename }) => {
  const [status, setStatus] = useState<Status>("idle");

  const flash = (s: Status) => {
    setStatus(s);
    window.setTimeout(() => setStatus("idle"), 1800);
  };

  const download = useCallback(async () => {
    const node = targetRef.current;
    if (!node) return;
    setStatus("working");
    try {
      const blob = await captureCard(node);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(filename)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      flash("saved");
    } catch {
      flash("error");
      throw new Error("export failed");
    }
  }, [targetRef, filename]);

  const copy = useCallback(async () => {
    const node = targetRef.current;
    if (!node) return;
    setStatus("working");
    try {
      // Safari only honours a clipboard write inside the original user
      // gesture, so hand ClipboardItem the pending promise rather than
      // awaiting the blob first.
      const pending = captureCard(node);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pending }),
      ]);
      flash("copied");
    } catch {
      // Firefox (and any non-secure context) rejects image clipboard writes —
      // fall back to downloading so the button still does something useful.
      await download().catch(() => flash("error"));
    }
  }, [targetRef, download]);

  const label =
    status === "working"
      ? "Rendering…"
      : status === "copied"
        ? "Copied ✓"
        : status === "saved"
          ? "Saved ✓"
          : status === "error"
            ? "Failed"
            : null;

  const buttonSx = {
    minWidth: 0,
    textTransform: "none",
    fontSize: "0.72rem",
    lineHeight: 1.2,
    padding: "0.15rem 0.5rem",
    color: "#555",
    borderColor: "#d7d5cd",
    "&:hover": { borderColor: "#999", backgroundColor: "#f5f4ee" },
  } as const;

  return (
    // In normal flow rather than absolutely positioned so it can never sit on
    // top of a long chart title on a narrow screen. The capture filter drops
    // the whole row, so the exported PNG closes the gap it leaves behind.
    <Box
      data-export-exclude=""
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 0.5,
        mb: 0.5,
        minHeight: "1.6rem",
      }}
    >
      {label && (
        <Box
          component="span"
          sx={{
            fontSize: "0.68rem",
            color: status === "error" ? "#b71c1c" : "#666",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </Box>
      )}
      <Button
        size="small"
        variant="outlined"
        sx={buttonSx}
        disabled={status === "working"}
        onClick={copy}
        title="Copy this chart (including captions) to the clipboard as a PNG"
      >
        Copy
      </Button>
      <Button
        size="small"
        variant="outlined"
        sx={buttonSx}
        disabled={status === "working"}
        onClick={() => void download().catch(() => {})}
        title="Download this chart (including captions) as a PNG"
      >
        PNG
      </Button>
    </Box>
  );
};

export default ChartExport;
