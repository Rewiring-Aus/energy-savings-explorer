import React, { useEffect } from "react";
import Home from "./pages/Home";
import { ThemeProvider } from "@mui/material/styles";
import theme from "./theme/theme";

// When this app is embedded in an iframe, post the document height back to
// the parent so it can resize. Harmless when running standalone.
function usePostHeight() {
  useEffect(() => {
    let lastHeight = 0;
    const postHeight = () => {
      const height = document.documentElement.scrollHeight;
      if (height !== lastHeight) {
        lastHeight = height;
        window.parent.postMessage({ type: "calculator-resize", height }, "*");
      }
    };

    let timer: ReturnType<typeof setTimeout>;
    const debouncedPostHeight = () => {
      clearTimeout(timer);
      timer = setTimeout(postHeight, 100);
    };

    postHeight();
    window.addEventListener("resize", postHeight);
    const observer = new MutationObserver(debouncedPostHeight);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", postHeight);
      observer.disconnect();
    };
  }, []);
}

const App: React.FC = () => {
  usePostHeight();
  return (
    <ThemeProvider theme={theme}>
      <Home />
    </ThemeProvider>
  );
};

export default App;
