import React from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import App from "./App";
import "./styles.css";

// 由 waymark ui 服务时，监听热刷新信号（静态打开时静默失败）
if (location.protocol === "http:" || location.protocol === "https:") {
  new EventSource("/events").onmessage = () => window.location.reload();
}

createRoot(document.getElementById("root")!).render(<App />);
