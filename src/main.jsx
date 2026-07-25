import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PookManager from "./PookManager.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PookManager />
  </StrictMode>
);
