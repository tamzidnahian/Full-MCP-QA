import { printHistory } from "./historyStore";

const limit = Number(process.argv[2] ?? "10");
printHistory(Number.isFinite(limit) ? limit : 10);
