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
  deleted_at: { type: Date, default: null },
  folder_id: { type: Schema.Types.ObjectId, ref: "Folder", default: null, index: true },
});

accountSchema.virtual("days").get(function () {
  const createdAt = this.get("created_at");
  return Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
});

accountSchema.set("toJSON", { virtuals: true });
accountSchema.set("toObject", { virtuals: true });

const Account = mongoose.models.Account || mongoose.model("Account", accountSchema);

const folderSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  created_at: { type: Date, default: Date.now },
});
folderSchema.index({ name: 1 }, { unique: true });

const Folder = mongoose.models.Folder || mongoose.model("Folder", folderSchema);

/*
 * Riwayat aktivitas (audit log + undo/redo).
 *
 * Tiap entri menyimpan operasi `undo` dan `redo` sebagai data (bukan sekadar
 * teks), sehingga aksi terakhir bisa dibatalkan/diUlangi dari UI:
 *   - undo hanya untuk entri terbaru yang masih aktif (undone=false)
 *   - redo hanya untuk entri terbaru yang dibatalkan (undone=true)
 *   - aksi baru menandai semua entri undone sebagai superseded (redo hangus)
 *
 * Bentuk op (diterapkan oleh lib/activity.js):
 *   { kind: "account.set", id, fields }
 *   { kind: "account.insert", doc }          // doc lengkap (untuk undo hapus permanen)
 *   { kind: "account.delete", id }
 *   { kind: "folder.insert", doc }
 *   { kind: "folder.delete", id }
 *   { kind: "folder.set", id, fields }
 *   { kind: "folder.detach-all", id }        // lepas semua akun dari folder
 *   { kind: "folder.reattach", id, memberIds } // kembalikan anggota (yang masih null)
 */
const activitySchema = new Schema(
  {
    type: { type: String, required: true },
    summary: { type: String, required: true },
    actor: { type: String, default: "" },
    undone: { type: Boolean, default: false },
    superseded: { type: Boolean, default: false },
    undo: { type: [Schema.Types.Mixed], default: [] },
    redo: { type: [Schema.Types.Mixed], default: [] },
    affected_count: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
  },
  { minimize: false }
);
activitySchema.index({ created_at: -1, _id: -1 });

const ActivityLog =
  mongoose.models.ActivityLog || mongoose.model("ActivityLog", activitySchema);

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
    deleted_at: obj.deleted_at ? new Date(obj.deleted_at).toISOString() : null,
    folder_id: obj.folder_id ? String(obj.folder_id) : null,
  };
}

function toFolderDTO(doc) {
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    _id: String(obj._id),
    id: String(obj._id),
    name: obj.name,
    created_at: obj.created_at ? new Date(obj.created_at).toISOString() : null,
  };
}

/* DTO aktivitas TIDAK menyertakan ops (berisi snapshot dokumen). */
function toActivityDTO(doc) {
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    _id: String(obj._id),
    type: obj.type,
    summary: obj.summary,
    actor: obj.actor || "",
    undone: !!obj.undone,
    superseded: !!obj.superseded,
    affected_count: obj.affected_count || 0,
    created_at: obj.created_at ? new Date(obj.created_at).toISOString() : null,
  };
}

module.exports = { Account, Folder, ActivityLog, toAccountDTO, toFolderDTO, toActivityDTO, ACCOUNT_STATUSES };
