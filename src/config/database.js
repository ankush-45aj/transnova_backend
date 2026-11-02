const mongoose = require("mongoose");
const environment = require("./environment");

const connectDatabase = async () => {
  try {
    if (!environment.mongoUri) {
      throw new Error("MONGO_URI is not defined in environment variables.");
    }
    await mongoose.connect(environment.mongoUri);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    // In production or when strictly required, refuse to boot into a broken state
    if (process.env.NODE_ENV === "production" || process.env.REQUIRE_DB === "true") {
      throw new Error(`Critical: Failed to connect to MongoDB: ${error.message}`);
    }
    console.warn("⚠️  Server starting without DB — DB-backed routes will fail until MongoDB is reachable.");
  }
};

module.exports = connectDatabase;
