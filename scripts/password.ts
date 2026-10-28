import { hash } from "bcryptjs";
import { createInterface } from "node:readline/promises";
const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const password = await prompt.question(
  "New administrator password (input visible; use a private terminal): ",
);
prompt.close();
if (password.length < 12) throw new Error("Use at least 12 characters");
console.log(
  "ADMIN_PASSWORD_HASH=base64:" +
    Buffer.from(await hash(password, 12)).toString("base64"),
);
