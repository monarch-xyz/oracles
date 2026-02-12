import { MORPHO_CHAINLINK_ORACLE_V1_COMMON, MORPHO_CHAINLINK_ORACLE_V1_MASK } from "../src/bytecodes/oracle-bytecode-constants.js";

const hex = MORPHO_CHAINLINK_ORACLE_V1_COMMON.slice(2);
const mask = new Set(MORPHO_CHAINLINK_ORACLE_V1_MASK);

console.log("Checking for unmasked PUSH32 instructions...");

for (let i = 0; i < hex.length; i += 2) {
  const byteIndex = i / 2;
  const opcode = hex.slice(i, i + 2);
  
  if (opcode === "7f") {
    // Check if the next 32 bytes are fully masked
    let allMasked = true;
    let anyMasked = false;
    
    // PUSH32 takes next 32 bytes (indices byteIndex+1 to byteIndex+32)
    for (let offset = 1; offset <= 32; offset++) {
      if (mask.has(byteIndex + offset)) {
        anyMasked = true;
      } else {
        allMasked = false;
      }
    }
    
    if (!allMasked) {
      console.log(`Found UNMASKED (or partially masked) PUSH32 at index ${byteIndex}`);
      console.log(`Value: ${hex.slice(i + 2, i + 2 + 64)}`);
      console.log(`Masked status: ${anyMasked ? "Partially Masked" : "Unmasked"}`);
    } else {
      // console.log(`Found MASKED PUSH32 at index ${byteIndex}`);
    }
    
    i += 64; // Skip the 32 bytes
  }
}
