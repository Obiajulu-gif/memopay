// Copies the compiled MemoPayInvoices bytecode + ABI into the web app (used by the /deploy page).
// Run after `npm run build`:  node scripts/export-artifact.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const a = JSON.parse(readFileSync('artifacts/contracts/MemoPayInvoices.sol/MemoPayInvoices.json', 'utf8'));
const out = { contractName: a.contractName, abi: a.abi, bytecode: a.bytecode };
writeFileSync('../lib/arc/settlement-artifact.json', JSON.stringify(out, null, 2) + '\n');
console.log(`exported ${a.contractName}: ${(a.bytecode.length - 2) / 2} bytes of creation code`);
