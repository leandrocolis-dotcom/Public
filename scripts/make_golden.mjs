// Regrava o gabarito numérico (tests/fixtures/golden.json). Só rode quando uma mudança de resultado for INTENCIONAL.
import { writeFileSync } from "node:fs";
import { computeGolden } from "../tests/golden-lib.js";

const g = computeGolden();
writeFileSync(new URL("../tests/fixtures/golden.json", import.meta.url), JSON.stringify(g));
console.log("golden.json gravado:", Object.keys(g).join(", "));
