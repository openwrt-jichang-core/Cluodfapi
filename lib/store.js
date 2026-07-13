import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "accounts.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf-8");
}

/**
 * 账号结构: { id, label, token, createdAt }
 * 注意: 这里为了演示用明文 JSON 存储 token。
 * 生产环境务必对 token 做加密存储(如用 KMS / Vault / 数据库字段加密),
 * 并且绝不能把 data/accounts.json 提交到 git 或暴露给前端。
 */
export function listAccounts() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

export function saveAccounts(accounts) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 2), "utf-8");
}

export function addAccount({ label, token }) {
  const accounts = listAccounts();
  const account = {
    id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: label || "未命名账号",
    token,
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  saveAccounts(accounts);
  return account;
}

export function removeAccount(id) {
  const accounts = listAccounts().filter((a) => a.id !== id);
  saveAccounts(accounts);
}

export function getAccount(id) {
  return listAccounts().find((a) => a.id === id);
}
