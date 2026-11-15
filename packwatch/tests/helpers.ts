import { readFileSync } from "node:fs";
import { join } from "node:path";
export const fx = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
export const fxJson = (name: string) => JSON.parse(fx(name)) as unknown;
