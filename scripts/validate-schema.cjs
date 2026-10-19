const w = require("@prisma/prisma-schema-wasm");
const fs = require("fs");
const schema = fs.readFileSync("prisma/schema.prisma","utf8");
const params = JSON.stringify({ prismaSchema: [["schema.prisma", schema]], noColor: true });
try { w.validate(params); console.log("SCHEMA VALID"); } catch (e) { console.log(String(e.message||e).slice(0,3000)); }
