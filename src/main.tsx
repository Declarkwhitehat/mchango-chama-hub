import * as React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./components/ThemeProvider";

// Ensure React is available globally for hooks resolution in Vite HMR
(window as any).React = React;

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

const root = createRoot(container);

// Remove no-transitions class after initial render to enable smooth theme switching
const enableTransitions = () => {
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('no-transitions');
  });
};

root.render(
  <StrictMode>
    <ThemeProvider 
      attribute="class" 
      defaultTheme="dark" 
      enableSystem
      storageKey="theme"
      disableTransitionOnChange={false}
    >
      <App />
    </ThemeProvider>
  </StrictMode>
);

// Enable transitions after app is mounted
enableTransitions();
