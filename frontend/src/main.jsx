import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import { AuthProvider } from "./auth";

createRoot(document.getElementById("root")).render(
  <StrictMode><ErrorBoundary><AuthProvider><App /></AuthProvider></ErrorBoundary></StrictMode>
);
