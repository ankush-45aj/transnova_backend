const app = require("./app");
const connectDatabase = require("./config/database");
const environment = require("./config/environment");

const startServer = async () => {
  await connectDatabase();

  app.listen(environment.port, () => {
    console.log(`TransNova server running on port ${environment.port}`);
  });
};

startServer();