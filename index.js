import dotenv from "dotenv";
import mongoose, { connect } from "mongoose";
// import { DB_NAME } from "./constants.js";
// import { listen } from "express/lib/application";
import { connectDB } from "./src/db/db.js";
import { app } from "./src/server.js";

dotenv.config({ path: "./.env" });
// console.log("dotenv", process.env.CORS_ORIGIN);

connectDB()
  .then(() => {
    app.listen(process.env.PORT || 8000, () => {
      console.log(`server is running at port : ${process.env.PORT}`);
    });
  })
  .catch((error) => {
    console.log("MongoDB connection failed :", error);
  });