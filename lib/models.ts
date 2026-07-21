import mongoose, { Schema, type InferSchemaType, models } from "mongoose";

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
  const createdAt = this.get("created_at") as Date;
  return Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
});

accountSchema.set("toJSON", { virtuals: true });
accountSchema.set("toObject", { virtuals: true });

export type AccountDocument = InferSchemaType<typeof accountSchema> & {
  _id: mongoose.Types.ObjectId;
  days?: number;
};

export const Account = models.Account || mongoose.model("Account", accountSchema);

export type AccountStatus = "available" | "available_3d" | "sold" | "personal";

export type AccountDTO = {
  _id: string;
  id: string;
  email: string;
  username: string;
  password: string;
  totp: string;
  status: AccountStatus;
  created_at: string;
  days: number;
};

export function toAccountDTO(doc: { toObject(options?: object): unknown }): AccountDTO {
  const obj = doc.toObject({ virtuals: true }) as AccountDocument & { _id: mongoose.Types.ObjectId; days?: number };
  return {
    _id: String(obj._id),
    id: String(obj._id),
    email: obj.email || "",
    username: obj.username,
    password: obj.password,
    totp: obj.totp || "",
    status: obj.status as AccountStatus,
    created_at: obj.created_at.toISOString(),
    days: typeof obj.days === "number" ? obj.days : 0,
  };
}
