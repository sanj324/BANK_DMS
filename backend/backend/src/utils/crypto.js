const crypto = require("crypto");

const DEFAULT_KEY_MATERIAL = process.env.CONTACT_ENCRYPTION_KEY || "bank-dms-contact-default-key-change-me";
const KEY = crypto.createHash("sha256").update(String(DEFAULT_KEY_MATERIAL)).digest();

function encryptText(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptText(payload) {
  if (!payload) return null;
  const [ivHex, tagHex, dataHex] = String(payload).split(":");
  if (!ivHex || !tagHex || !dataHex) return null;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    KEY,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

module.exports = { encryptText, decryptText };
