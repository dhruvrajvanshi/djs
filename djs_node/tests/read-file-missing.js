import { readFile } from "node:fs/promises";
try { await readFile("data/missing.txt", "utf8"); }
catch (error) { console.log(error instanceof Error, error.code, error.syscall, error.path); }
