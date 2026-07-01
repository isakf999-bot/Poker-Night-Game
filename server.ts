import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./src/server/socketHandlers";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // Let Socket.IO's own request listener (attached below) handle its own path;
    // Next's handler would otherwise 404 it first and consume the response.
    if (req.url?.startsWith("/socket.io")) return;
    handle(req, res);
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
  });

  registerSocketHandlers(io);

  httpServer.listen(port, () => {
    console.log(`> Poker-servern körs på http://localhost:${port}`);
  });
});
