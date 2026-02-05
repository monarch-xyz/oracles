import "dotenv/config";
import { runScanner } from "./scanner.js";

runScanner()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Scanner failed:", error);
    process.exit(1);
  });
