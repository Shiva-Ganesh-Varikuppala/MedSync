import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import { AuthProvider } from "./auth";
import { I18nProvider } from "./i18n";

createRoot(document.getElementById("root")).render(
  <StrictMode><ErrorBoundary><I18nProvider><AuthProvider><App /></AuthProvider></I18nProvider></ErrorBoundary></StrictMode>
);
