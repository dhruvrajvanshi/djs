import { readFile } from "node:fs/promises";
console.log(await readFile("data/utf8-chunks.txt", "utf8"));
console.log(await readFile("data/utf8-invalid.txt", "utf-8"));
