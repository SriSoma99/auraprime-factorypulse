import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("apps/app/dist");
const port = 8081;

const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0] || "/";
  let filePath = path.join(dist, urlPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(dist, "index.html");
  }
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": mime[ext] || "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Web app served at http://localhost:${port}`);
});
