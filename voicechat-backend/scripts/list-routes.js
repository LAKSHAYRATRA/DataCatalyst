import { s3Client } from "../src/config/s3.js"; // just to load env
import express from "express";
import adminRoutes from "../src/routes/admin.js";

const app = express();
app.use("/api/admin", adminRoutes);

function printRoutes(stack, prefix = "") {
  stack.forEach((r) => {
    if (r.route) {
      const methods = Object.keys(r.route.methods).join(",").toUpperCase();
      console.log(`${methods} ${prefix}${r.route.path}`);
    } else if (r.name === "router" && r.handle.stack) {
      const newPrefix = prefix + (r.regexp.source.replace("^\\/", "/").replace("\\/?(?=\\/|$)", "").replace("\\/?$", ""));
      // Clean up regex characters
      const cleanPrefix = newPrefix.replace(/\\\//g, "/").replace(/\?\:\(\?\=\\\/\|\$\)/g, "").replace(/\^\//g, "/");
      printRoutes(r.handle.stack, cleanPrefix);
    }
  });
}

printRoutes(app._router.stack);
