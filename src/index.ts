import "dotenv/config";
import { runScanner } from "./scanner.js";

const forceRescan =
  process.argv.includes("--force-rescan") ||
  process.argv.includes("--force-reclassify") ||
  process.env.FORCE_RESCAN === "1";

runScanner({ forceRescan })
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Scanner failed:", error);
    process.exit(1);
  });
