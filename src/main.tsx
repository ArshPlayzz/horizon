import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { FileContextProvider } from "./lib/file-context";

document.documentElement.classList.add("dark");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FileContextProvider>
      <App />
    </FileContextProvider>
  </React.StrictMode>,
);
