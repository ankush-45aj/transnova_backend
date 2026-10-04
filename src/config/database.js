const mongoose = require("mongoose");
const environment = require("./environment");

const connectDatabase = async () => {
  try {
    await mongoose.connect(environment.mongoUri);

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDatabase;