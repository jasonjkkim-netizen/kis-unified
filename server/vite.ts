/**
 * KIS Unified - Vite Dev Server Integration
 */
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, type ViteDevServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "../dist/public");
  if (!fs.existsSync(distPath)) {
    throw new Error(`Build directory not found: ${distPath}. Run 'npm run build' first.`);
  }
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

export async function setupVite(app: Express): Promise<ViteDevServer> {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: true },
    appType: "custom",
  });
  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      if (url.startsWith("/api")) return next();
      const clientPath = path.resolve(__dirname, "../client/index.html");
      let template = fs.readFileSync(clientPath, "utf-8");
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e: any) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });

  return vite;
}
