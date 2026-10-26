import { readFile } from "node:fs/promises";
console.log((await readFile("data/empty.txt", "utf8")) === "");
