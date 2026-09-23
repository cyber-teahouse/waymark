import React from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import App from "./App";
import "./styles.css";

// 热更新由 App 内的 EventSource 监听负责（workflow 帧局部刷新，保留画布视口）

createRoot(document.getElementById("root")!).render(<App />);
