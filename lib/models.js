"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const accountSchema = new Schema({
  email: { type: String, default: "" },
  username: { type: String, required: true },
  password: { type: String, required: true },
  totp: { type: String, default: "" },
  status: {
    type: String,
    enum: ["available", "sold", "personal", "available_3d"],
    default: "available",
  },
  created_at: { type: Date, default: Date.now },
});

accountSchema.virtual("days").get(function () {
  const createdAt = this.get("created_at");
  return Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
});

accountSchema.set("toJSON", { virtuals: true });
accountSchema.set("toObject", { virtuals: true });

const Account = mongoose.models.Account || mongoose.model("Account", accountSchema);

const ACCOUNT_STATUSES = ["available", "available_3d", "sold", "personal"];

function toAccountDTO(doc) {
  const obj = doc.toObject({ virtuals: true });
  return {
    _id: String(obj._id),
    id: String(obj._id),
    email: obj.email || "",
    username: obj.username,
    password: obj.password,
    totp: obj.totp || "",
    status: obj.status,
    created_at: obj.created_at.toISOString(),
    days: typeof obj.days === "number" ? obj.days : 0,
  };
}

module.exports = { Account, toAccountDTO, ACCOUNT_STATUSES };
