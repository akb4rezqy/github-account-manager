"use strict";

const { handleApiRequest } = require("../../lib/api-handler");

module.exports = (req, res) =>
  handleApiRequest(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Terjadi kesalahan" }));
    } else {
      res.end();
    }
  });
