import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// 由 planflow ui 服务时，监听热刷新信号（静态打开时静默失败）
try {
  new EventSource("/events").onmessage = () => window.location.reload();
} catch {
  /* ignore */
}

createRoot(document.getElementById("root")!).render(<App />);
