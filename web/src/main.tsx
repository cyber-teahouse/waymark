import React from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import App from "./App";
import "./styles.css";

// 由 waymark ui 服务时，监听热刷新信号（静态打开时静默失败）
if (location.protocol === "http:" || location.protocol === "https:") {
  new EventSource("/events").onmessage = () => {
    // 详情面板操作后的兜底 reload 刚发生过时，跳过这次重复刷新
    try {
      const last = Number(sessionStorage.getItem("waymark.reloadedAt") ?? 0);
      if (Date.now() - last < 2500) return;
      sessionStorage.setItem("waymark.reloadedAt", String(Date.now()));
    } catch { /* 存储不可用时直接刷新 */ }
    window.location.reload();
  };
}

createRoot(document.getElementById("root")!).render(<App />);
