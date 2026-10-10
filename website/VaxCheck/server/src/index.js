/**
 * index.js — Application Entry Point
 *
 * 1. Load environment variables
 * 2. Connect to MongoDB
 * 3. Start the Express server
 */

import dotenv from "dotenv";
dotenv.config({
  path: "./.env",
});

import { connectDB } from "./db/index.js";
import { app } from "./app.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("====================================================");
  console.log(`  VaxCheck Server v2.0 running on port ${PORT}`);
  console.log(`  API Base URL: http://localhost:${PORT}/api/v1`);
  console.log(`  Health:       http://localhost:${PORT}/api/health`);
  console.log("====================================================");

  // Connect to MongoDB Atlas (with automatic reconnection retry)
  connectDB();
});
