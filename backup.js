/* ===== สำรองข้อมูล / กู้คืนข้อมูล =====
   ใช้ตอนย้ายระบบขึ้นคลาวด์ และใช้เป็นการสำรองข้อมูลประจำสัปดาห์
   ไฟล์ที่ได้คือ JSON ไฟล์เดียว มีทุกอย่างรวมทั้งบัญชีผู้ใช้        */
const fs = require('fs'), path = require('path');
const store = require('./store');
const DATA = path.join(__dirname, 'data');
const DOCS = store.ROOT;                 /* data/docs */
const UF = path.join(DATA, 'users.json');

/* ---- เดินไล่ทุกไฟล์ใน data/docs แล้วคืนเป็น {path: body} ---- */
function walk(dir, base, out) {
  let names = [];
  try { names = fs.readdirSync(dir) } catch (e) { return out }
  names.forEach(nm => {
    const full = path.join(dir, nm);
    let st; try { st = fs.statSync(full) } catch (e) { return }
    if (st.isDirectory()) return walk(full, base ? base + '/' + nm : nm, out);
    if (!nm.endsWith('.json')) return;
    const key = (base ? base + '/' : '') + nm.slice(0, -5);
    try { out[key] = JSON.parse(fs.readFileSync(full, 'utf8')) } catch (e) {}
  });
  return out;
}

function exportAll() {
  let users = { users: [] };
  try { users = JSON.parse(fs.readFileSync(UF, 'utf8')) } catch (e) {}
  const docs = walk(DOCS, '', {});
  return {
    kind: 'finra-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: { docs: Object.keys(docs).length, users: (users.users || []).length },
    docs,
    users: users.users || []
  };
}

/* ---- ตรวจว่าไฟล์ที่อัปโหลดมาใช้ได้จริงก่อนเขียนทับอะไร ---- */
function check(b) {
  if (!b || typeof b !== 'object') return 'ไฟล์ไม่ถูกต้อง';
  if (b.kind !== 'finra-backup') return 'ไม่ใช่ไฟล์สำรองของระบบนี้';
  if (!b.docs || typeof b.docs !== 'object') return 'ไฟล์สำรองไม่มีข้อมูล';
  if (!Array.isArray(b.users)) return 'ไฟล์สำรองไม่มีรายชื่อผู้ใช้';
  for (const k in b.docs) {
    /* กันไม่ให้ path หลุดออกนอกโฟลเดอร์ data */
    if (k.indexOf('..') >= 0 || k.startsWith('/') || /[\\:]/.test(k)) return 'ไฟล์สำรองมี path ที่ไม่ปลอดภัย: ' + k;
  }
  return null;
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const t = file + '.tmp';
  fs.writeFileSync(t, text);
  fs.renameSync(t, file);
}

/* ---- กู้คืน: เก็บของเดิมไว้ก่อนเสมอ ถ้าพังยังย้อนได้ ---- */
function importAll(b, opts) {
  const err = check(b);
  if (err) throw new Error(err);
  opts = opts || {};

  /* 1. สำรองของเดิมไว้ข้าง ๆ */
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const keep = path.join(DATA, 'before-restore-' + stamp);
  try {
    fs.mkdirSync(keep, { recursive: true });
    if (fs.existsSync(DOCS)) fs.cpSync(DOCS, path.join(keep, 'docs'), { recursive: true });
    if (fs.existsSync(UF)) fs.copyFileSync(UF, path.join(keep, 'users.json'));
  } catch (e) {}

  /* 2. เขียนเอกสารทั้งหมดใหม่ */
  let docs = 0;
  for (const k in b.docs) {
    writeAtomic(path.join(DOCS, k + '.json'), JSON.stringify(b.docs[k], null, 2));
    docs++;
  }

  /* 3. ผู้ใช้ — ข้ามได้ถ้าไม่อยากทับบัญชีที่สร้างไว้แล้ว */
  let users = 0;
  if (!opts.keepUsers) {
    writeAtomic(UF, JSON.stringify({ users: b.users }, null, 2));
    users = b.users.length;
  }
  return { docs, users, backupFolder: path.basename(keep) };
}

module.exports = { exportAll, importAll, check };
