const mongoose = require("mongoose");
const environment = require("./environment");

let memoryServer = null;

const connectDatabase = async () => {
  try {
    if (!environment.mongoUri) {
      throw new Error("MONGO_URI is not defined in environment variables.");
    }
    await mongoose.connect(environment.mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    // In production or when strictly required, refuse to boot into a broken state
    if (process.env.NODE_ENV === "production" || process.env.REQUIRE_DB === "true") {
      throw new Error(`Critical: Failed to connect to MongoDB: ${error.message}`);
    }

    try {
      console.log("Starting in-memory MongoDB fallback for local sandbox testing...");
      const { MongoMemoryServer } = require("mongodb-memory-server");
      memoryServer = await MongoMemoryServer.create();
      const fallbackUri = memoryServer.getUri();
      await mongoose.connect(fallbackUri);
      console.log(`Connected to in-memory MongoDB sandbox at: ${fallbackUri}`);
    } catch (fallbackError) {
      console.warn("⚠️  Server starting without DB — DB-backed routes will fail until MongoDB is reachable.");
    }
  }
};

process.on("SIGINT", async () => {
  if (memoryServer) await memoryServer.stop();
  await mongoose.disconnect();
  process.exit(0);
});

module.exports = connectDatabase;
