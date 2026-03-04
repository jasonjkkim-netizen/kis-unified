/**
 * KIS Unified Trading Platform - Main Server
 */
import express from "express";
import { createRouter } from "./routes";
import { setupVite, serveStatic } from "./vite";

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// API routes
const apiRouter = createRouter();
app.use(apiRouter);

// Vite dev or static serving
const isDev = process.env.NODE_ENV !== "production";

(async () => {
  if (isDev) {
    await setupVite(app);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000");
  app.listen(port, "0.0.0.0", () => {
    console.log(`\n🚀 KIS Unified Trading Platform`);
    console.log(`   Server running on http://0.0.0.0:${port}`);
    console.log(`   Mode: ${isDev ? "development" : "production"}\n`);
  });
})();
