import crypto from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error("Usage: npm run hash-password -- <password of at least 8 characters>");
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
console.log(`OWNER_PASSWORD_HASH=scrypt:${salt.toString("hex")}:${hash.toString("hex")}`);
