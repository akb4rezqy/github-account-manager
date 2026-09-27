"use strict";

/*
 * Riwayat aktivitas + undo/redo.
 *
 * Setiap perubahan data dicatat sebagai entri berisi operasi `undo` dan
 * `redo`. Undo/redo mengikuti semantik stack:
 *  - undo  -> entri terbaru yang masih aktif (undone=false, superseded=false)
 *  - redo  -> entri terbaru yang dibatalkan (undone=true, superseded=false)
 *  - aksi baru menandai semua entri undone sebagai superseded (redo hangus)
 *  - entri undo/redo sendiri tidak dicatat sebagai entri baru
 *
 * Penerapan ops bersifat best-effort (dokumen yang sudah tidak ada dilewati)
 * dan mengembalikan jumlah operasi yang benar-benar berdampak.
 */

const { Account, Folder, ActivityLog, toActivityDTO } = require("./models");

const ACTIVITY_LIMIT = 200;

const STATUS_LABELS_ID = {
  available: "Tersedia",
  available_3d: "3 Hari",
  sold: "Terjual",
  personal: "Pribadi",
};

function statusLabel(status) {
  return STATUS_LABELS_ID[status] || status;
}

async function applyOp(op) {
  switch (op.kind) {
    case "account.set": {
      const result = await Account.updateOne({ _id: op.id }, { $set: op.fields });
      return result.matchedCount || 0;
    }
    case "account.insert": {
      const result = await Account.replaceOne({ _id: op.doc._id }, op.doc, { upsert: true });
      return (result.matchedCount || 0) + (result.upsertedCount || 0);
    }
    case "account.delete": {
      const result = await Account.deleteOne({ _id: op.id });
      return result.deletedCount || 0;
    }
    case "folder.insert": {
      const result = await Folder.replaceOne({ _id: op.doc._id }, op.doc, { upsert: true });
      return (result.matchedCount || 0) + (result.upsertedCount || 0);
    }
    case "folder.delete": {
      const result = await Folder.deleteOne({ _id: op.id });
      return result.deletedCount || 0;
    }
    case "folder.set": {
      const result = await Folder.updateOne({ _id: op.id }, { $set: op.fields });
      return result.matchedCount || 0;
    }
    case "folder.detach-all": {
      const result = await Account.updateMany({ folder_id: op.id }, { $set: { folder_id: null } });
      return result.modifiedCount || 0;
    }
    case "folder.reattach": {
      const result = await Account.updateMany(
        { _id: { $in: op.memberIds }, folder_id: null },
        { $set: { folder_id: op.id } }
      );
      return result.modifiedCount || 0;
    }
    default:
      return 0;
  }
}

async function applyOps(ops) {
  let applied = 0;
  for (const op of ops || []) {
    try {
      applied += await applyOp(op);
    } catch {
      // Lewati op yang gagal (mis. id tidak valid) - best effort.
    }
  }
  return applied;
}

/* Pembuat op balikan untuk perubahan field akun: undo=set before, redo=set after. */
function accountSetOps(ids, befores, afters) {
  const pick = (map, id) => (map instanceof Map ? map.get(String(id)) : map[String(id)]);
  return {
    undo: ids.map((id) => ({ kind: "account.set", id: String(id), fields: pick(befores, id) })),
    redo: ids.map((id) => ({ kind: "account.set", id: String(id), fields: pick(afters, id) })),
  };
}

async function logEntry({ type, summary, actor, undo, redo, affectedCount }) {
  // Aksi baru menghanguskan redo.
  await ActivityLog.updateMany({ undone: true, superseded: false }, { $set: { superseded: true } });
  const entry = await ActivityLog.create({
    type,
    summary,
    actor: actor || "",
    undo: undo || [],
    redo: redo || [],
    affected_count: affectedCount || 0,
  });
  const count = await ActivityLog.countDocuments({});
  if (count > ACTIVITY_LIMIT) {
    const olds = await ActivityLog.find()
      .sort({ created_at: 1, _id: 1 })
      .limit(count - ACTIVITY_LIMIT)
      .select("_id");
    await ActivityLog.deleteMany({ _id: { $in: olds.map((item) => item._id) } });
  }
  return entry;
}

async function latestUndoable() {
  return ActivityLog.findOne({ undone: false, superseded: false }).sort({ created_at: -1, _id: -1 });
}

async function latestRedoable() {
  return ActivityLog.findOne({ undone: true, superseded: false }).sort({ created_at: -1, _id: -1 });
}

async function undoLatest() {
  const entry = await latestUndoable();
  if (!entry) return { ok: false, error: "Tidak ada aksi yang bisa dibatalkan" };
  const applied = await applyOps(entry.undo);
  entry.undone = true;
  await entry.save();
  return { ok: true, summary: entry.summary, applied, total: entry.affected_count || entry.undo.length };
}

async function redoLatest() {
  const entry = await latestRedoable();
  if (!entry) return { ok: false, error: "Tidak ada aksi yang bisa diulangi" };
  const applied = await applyOps(entry.redo);
  entry.undone = false;
  await entry.save();
  return { ok: true, summary: entry.summary, applied, total: entry.affected_count || entry.redo.length };
}

async function activityState(limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), ACTIVITY_LIMIT);
  const entries = await ActivityLog.find().sort({ created_at: -1, _id: -1 }).limit(safeLimit);
  const [undoable, redoable] = await Promise.all([latestUndoable(), latestRedoable()]);
  return {
    entries: entries.map(toActivityDTO),
    canUndo: !!undoable,
    canRedo: !!redoable,
    undoSummary: undoable ? undoable.summary : "",
    redoSummary: redoable ? redoable.summary : "",
  };
}

module.exports = {
  ACTIVITY_LIMIT,
  statusLabel,
  applyOps,
  accountSetOps,
  logEntry,
  undoLatest,
  redoLatest,
  activityState,
};
