/**
 * db/index.js
 *
 * MongoDB connection helper using Mongoose.
 * Call connectDB() once at application startup (in index.js).
 * Add your MONGODB_URI to the .env file.
 */

import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

import dns from "node:dns";

// Temporary workaround for local DNS SRV resolution issue.
// Remove this once the local DNS configuration is fixed.
dns.setServers(["1.1.1.1", "8.8.8.8"]);

let isConnecting = false;

const connectDB = async () => {
  if (isConnecting) return;
  isConnecting = true;
  try {
    const connectionInstance = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: DB_NAME,
      serverSelectionTimeoutMS: 8000,
    });
    console.log(
      `\n✅ MongoDB connected — host: ${connectionInstance.connection.host} (db: ${connectionInstance.connection.name})`,
    );
    isConnecting = false;
  } catch (error) {
    isConnecting = false;
    console.error(
      `\n❌ MongoDB connection FAILED (${error.message}).\n` +
      `👉 Please ensure your IP (or 0.0.0.0/0) is whitelisted in MongoDB Atlas Network Access.\n` +
      `🔄 Retrying in 5 seconds...\n`
    );
    setTimeout(connectDB, 5000);
  }
};

export { connectDB };
