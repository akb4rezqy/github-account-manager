"use strict";

const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

let conn = null;
let promise = null;

async function connectDb() {
  if (!MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  if (conn) return conn;
  if (!promise) {
    promise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
  }
  conn = await promise;
  return conn;
}

module.exports = { connectDb };
