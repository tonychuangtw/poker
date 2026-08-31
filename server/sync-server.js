/* 撲克工具箱 雲端同步伺服器（可攜版）— Google 登入換票 + 進度同步 + 兩地雙向複寫
 *
 * 這支是給「自架同步後端」用的獨立伺服器：前端 js/sync.js 的完整後端契約
 *   POST /api/session                Bearer <Google ID token 或 sess. 票> → {token}（30 天 HMAC 票）
 *   GET  /api/progress?app=&level=   Bearer 票 → {blob, updatedAt}
 *   PUT  /api/progress?app=&level=   Bearer 票 + JSON blob → {updatedAt}
 *   POST /api/replica/sync           Bearer <replica_secret> → 兩地 SQLite 雙向交換（見 PROTOCOL.md）
 *   GET  /api/health                 → {ok, users}
 *
 * 跑法：
 *   npm install better-sqlite3          # 唯一相依，repo 本體不需要
 *   cp server/config.example.json server/config.json   # 填自己的值
 *   node server/sync-server.js [config.json 路徑]
 *
 * 設計要點：
 * - 身分鍵＝Google sub（同一帳號在不同 OAuth client 的 sub 相同 → 兩站帳號天然互通）
 * - blob＝前端打包的整組 poker.* JSON 字串，伺服器不拆解，只做列級 LWW
 * - 複寫規則：updated_at 嚴格較新才覆蓋、沿用原 updated_at 絕不重蓋章、列不刪除
 *   （刪除靠 blob 內墓碑）；echo 因嚴格較新規則天然冪等
 * - hmac_secret 每站自己一把（session 票不跨站）；replica_secret 兩站共用（面交，勿進 repo）
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESS_MS = 30 * 86400000;
const MAX_BLOB_BYTES = 2 * 1024 * 1024;
const REPLICA_BATCH_BYTES = 4 * 1024 * 1024;

/* ---------------- 純函式（可單獨測試，不碰 DB） ---------------- */

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hmacOf(secret, payloadB64) {
  return b64url(crypto.createHmac('sha256', secret).update(payloadB64).digest());
}

function mintSess(secret, sub, email) {
  const payload = b64url(JSON.stringify({ s: sub, e: email || '', x: Date.now() + SESS_MS }));
  return 'sess.' + payload + '.' + hmacOf(secret, payload);
}

function verifySess(secret, tok) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'sess') return null;
  const a = Buffer.from(parts[2]), b = Buffer.from(hmacOf(secret, parts[1]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p = null;
  try {
    p = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch (e) { return null; }
  if (!p || !/^[0-9]{5,30}$/.test(String(p.s || '')) || !(p.x > Date.now())) return null;
  return p;
}

// 複寫列驗證：不合格回 null，合格回正規化後的列
function validReplicaRow(r) {
  if (!r || !/^[0-9]{5,30}$/.test(String(r.sub || ''))) return null;
  if (!/^[\w.-]{1,32}$/.test(String(r.app || '')) || !/^[\w.-]{1,32}$/.test(String(r.level || ''))) return null;
  if (typeof r.blob !== 'string' || r.blob.length > MAX_BLOB_BYTES) return null;
  if (!Number.isFinite(r.updated_at) || r.updated_at <= 0) return null;
  return {
    sub: String(r.sub), email: String(r.email || ''),
    app: String(r.app), level: String(r.level),
    blob: r.blob, updated_at: Math.floor(r.updated_at)
  };
}

/* ---------------- 伺服器 ---------------- */

function createSyncServer(conf) {
  const Database = require('better-sqlite3'); // 延遲載入：純函式測試不需要裝
  const db = new Database(conf.db_path || path.join(__dirname, 'syncdata.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(
    'CREATE TABLE IF NOT EXISTS users (' +
    ' sub TEXT PRIMARY KEY, email TEXT NOT NULL DEFAULT \'\',' +
    ' created_at INTEGER NOT NULL, last_login INTEGER NOT NULL);' +
    'CREATE TABLE IF NOT EXISTS progress (' +
    ' sub TEXT NOT NULL, app TEXT NOT NULL, level TEXT NOT NULL,' +
    ' blob TEXT NOT NULL, updated_at INTEGER NOT NULL,' +
    ' PRIMARY KEY (sub, app, level));' +
    'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);'
  );

  const clientIds = Array.isArray(conf.google_client_ids) ? conf.google_client_ids : [conf.google_client_ids].filter(Boolean);
  const corsOrigins = Array.isArray(conf.cors_origins) ? conf.cors_origins : [];

  const metaGet = (k) => { const r = db.prepare('SELECT v FROM meta WHERE k=?').get(k); return r ? r.v : null; };
  const metaSet = (k, v) => db.prepare('INSERT INTO meta (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v));

  function touchUser(sub, email) {
    db.prepare(
      'INSERT INTO users (sub, email, created_at, last_login) VALUES (?,?,?,?) ' +
      'ON CONFLICT(sub) DO UPDATE SET email = CASE WHEN excluded.email <> \'\' THEN excluded.email ELSE users.email END, last_login=excluded.last_login'
    ).run(sub, email || '', Date.now(), Date.now());
  }

  function verifyGoogleToken(idToken, cb) {
    if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(idToken) || idToken.length > 4096) return cb(null);
    const q = https.request({
      host: 'oauth2.googleapis.com',
      path: '/tokeninfo?id_token=' + encodeURIComponent(idToken),
      method: 'GET'
    }, (ur) => {
      let out = '';
      ur.on('data', (c) => { out += c; if (out.length > 65536) ur.destroy(); });
      ur.on('error', () => cb(null));
      ur.on('end', () => {
        let d = null;
        try { d = JSON.parse(out); } catch (e) {}
        if (!d || !clientIds.includes(d.aud) || d.email_verified !== 'true' ||
            !/^[0-9]{5,30}$/.test(String(d.sub || ''))) return cb(null);
        cb({ sub: d.sub, email: d.email || '' });
      });
    });
    q.setTimeout(10000, () => q.destroy());
    q.on('error', () => cb(null));
    q.end();
  }

  function bearerOf(req) {
    const h = String(req.headers.authorization || '');
    return h.indexOf('Bearer ') === 0 ? h.slice(7).trim() : '';
  }

  function sendJson(res, code, obj) {
    if (res.headersSent) return res.destroy();
    const buf = Buffer.from(JSON.stringify(obj));
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
    res.end(buf);
  }

  function readBody(req, res, cap, cb) {
    let body = '', bytes = 0, aborted = false;
    req.on('data', (c) => {
      bytes += c.length;
      if (bytes > cap) { aborted = true; sendJson(res, 413, { error: 'too large' }); req.destroy(); }
      else body += c;
    });
    req.on('error', () => {});
    req.on('end', () => { if (!aborted) cb(body); });
  }

  function replicaRowsSince(since) {
    const rows = [];
    let bytes = 0, upTo = Date.now(), truncated = false;
    const it = db.prepare(
      'SELECT p.sub, p.app, p.level, p.blob, p.updated_at, COALESCE(u.email, \'\') AS email ' +
      'FROM progress p LEFT JOIN users u ON u.sub = p.sub WHERE p.updated_at > ? ORDER BY p.updated_at ASC'
    ).iterate(since);
    for (const r of it) {
      if (bytes + r.blob.length > REPLICA_BATCH_BYTES && rows.length) { truncated = true; upTo = rows[rows.length - 1].updated_at; break; }
      rows.push(r);
      bytes += r.blob.length;
    }
    return { rows, upTo, truncated };
  }

  const upProgressLww = db.prepare(
    'INSERT INTO progress (sub, app, level, blob, updated_at) VALUES (?,?,?,?,?) ' +
    'ON CONFLICT(sub, app, level) DO UPDATE SET blob=excluded.blob, updated_at=excluded.updated_at ' +
    'WHERE excluded.updated_at > progress.updated_at');
  const upUserEmail = db.prepare(
    'INSERT INTO users (sub, email, created_at, last_login) VALUES (?,?,?,0) ' +
    'ON CONFLICT(sub) DO UPDATE SET email = CASE WHEN excluded.email <> \'\' THEN excluded.email ELSE users.email END');

  function applyReplicaRows(rows) {
    let applied = 0;
    for (const raw of (rows || [])) {
      const r = validReplicaRow(raw);
      if (!r) continue;
      try {
        upUserEmail.run(r.sub, r.email, Date.now());
        if (upProgressLww.run(r.sub, r.app, r.level, r.blob, r.updated_at).changes > 0) applied++;
      } catch (e) {}
    }
    return applied;
  }

  function secretOk(given, expected) {
    if (!given || !expected) return false;
    const a = Buffer.from(given), b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  const server = http.createServer((req, res) => {
    let u;
    try { u = new URL(req.url, 'http://x'); } catch (e) { res.writeHead(400); return res.end(); }
    const pathname = u.pathname;

    // CORS（github.io 等跨網域前端要打進來時，把來源加進 cors_origins）
    const origin = req.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '3600');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (pathname === '/api/health' && req.method === 'GET') {
      let n = 0;
      try { n = db.prepare('SELECT COUNT(*) AS n FROM users').get().n; } catch (e) {}
      return sendJson(res, 200, { ok: true, users: n });
    }

    if (pathname === '/api/replica/sync') {
      if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
      if (!conf.replica_secret) return sendJson(res, 503, { error: 'replica not configured' });
      if (!secretOk(bearerOf(req), conf.replica_secret)) return sendJson(res, 401, { error: 'unauthorized' });
      return readBody(req, res, REPLICA_BATCH_BYTES * 2, (body) => {
        let d = null;
        try { d = JSON.parse(body); } catch (e) {}
        if (!d || typeof d !== 'object') return sendJson(res, 400, { error: 'bad json' });
        const applied = applyReplicaRows(Array.isArray(d.rows) ? d.rows : []);
        const out = replicaRowsSince(Number(d.since) || 0);
        sendJson(res, 200, { ok: true, applied, rows: out.rows, now: out.upTo, truncated: out.truncated });
      });
    }

    if (pathname === '/api/session') {
      if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
      const tok = bearerOf(req);
      if (!tok) return sendJson(res, 401, { error: 'unauthorized' });
      const sess = verifySess(conf.hmac_secret, tok);
      if (sess) { touchUser(sess.s, sess.e); return sendJson(res, 200, { token: mintSess(conf.hmac_secret, sess.s, sess.e) }); }
      return verifyGoogleToken(tok, (g) => {
        if (!g) return sendJson(res, 401, { error: 'unauthorized' });
        touchUser(g.sub, g.email);
        sendJson(res, 200, { token: mintSess(conf.hmac_secret, g.sub, g.email) });
      });
    }

    if (pathname === '/api/progress') {
      const tok = bearerOf(req);
      if (!tok) return sendJson(res, 401, { error: 'unauthorized' });
      const app = String(u.searchParams.get('app') || 'poker').slice(0, 32);
      const level = String(u.searchParams.get('level') || 'main').slice(0, 32);
      if (!/^[\w.-]+$/.test(app) || !/^[\w.-]+$/.test(level)) return sendJson(res, 400, { error: 'bad params' });

      const withAuth = (who) => {
        if (req.method === 'GET') {
          const row = db.prepare('SELECT blob, updated_at FROM progress WHERE sub=? AND app=? AND level=?').get(who.sub, app, level);
          if (!row) return sendJson(res, 200, {});
          let blob = {};
          try { blob = JSON.parse(row.blob); } catch (e) {}
          return sendJson(res, 200, { blob, updatedAt: row.updated_at });
        }
        if (req.method === 'PUT') {
          return readBody(req, res, MAX_BLOB_BYTES, (body) => {
            let blob = null;
            try { blob = JSON.parse(body); } catch (e) {}
            if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return sendJson(res, 400, { error: 'bad json' });
            const now = Date.now();
            touchUser(who.sub, who.email);
            db.prepare(
              'INSERT INTO progress (sub, app, level, blob, updated_at) VALUES (?,?,?,?,?) ' +
              'ON CONFLICT(sub, app, level) DO UPDATE SET blob=excluded.blob, updated_at=excluded.updated_at'
            ).run(who.sub, app, level, JSON.stringify(blob), now);
            sendJson(res, 200, { updatedAt: now });
          });
        }
        res.writeHead(405, { Allow: 'GET, PUT' });
        return res.end();
      };

      // 登入瞬間 client 會先拿原始 Google ID token 打 progress（不等換票）→ 兩種票都要收
      const sess = verifySess(conf.hmac_secret, tok);
      if (sess) return withAuth({ sub: sess.s, email: sess.e || '' });
      return verifyGoogleToken(tok, (g) => {
        if (!g) return sendJson(res, 401, { error: 'unauthorized' });
        withAuth({ sub: g.sub, email: g.email });
      });
    }

    sendJson(res, 404, { error: 'not found' });
  });

  // 主動輪詢對方（可選：replica_peer 沒設就純被動）。游標回退 10 分鐘重疊，冪等不怕重送。
  function runReplicaExchange() {
    if (!conf.replica_peer || !conf.replica_secret) return;
    const since = Math.max(0, Number(metaGet('replica.lastSyncAt') || 0) - 600000);
    const mine = replicaRowsSince(since);
    const payload = JSON.stringify({ since, rows: mine.rows });
    let peer;
    try { peer = new URL(conf.replica_peer); } catch (e) { return console.error('[replica] peer URL 無效'); }
    const mod = peer.protocol === 'http:' ? http : https;
    const rq = mod.request({
      host: peer.hostname,
      port: peer.port || (peer.protocol === 'http:' ? 80 : 443),
      path: peer.pathname + peer.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': 'Bearer ' + conf.replica_secret
      }
    }, (ur) => {
      let out = '';
      ur.on('data', (c) => { out += c; if (out.length > REPLICA_BATCH_BYTES * 2) ur.destroy(); });
      ur.on('error', () => {});
      ur.on('end', () => {
        if (ur.statusCode !== 200) return console.error('[replica] peer 回 ' + ur.statusCode);
        let d = null;
        try { d = JSON.parse(out); } catch (e) {}
        if (!d || !d.ok) return console.error('[replica] 回應解析失敗');
        const applied = applyReplicaRows(Array.isArray(d.rows) ? d.rows : []);
        metaSet('replica.lastSyncAt', String(d.now || Date.now()));
        if (mine.rows.length || applied) console.log('[replica] 送 ' + mine.rows.length + ' 列、收套用 ' + applied + ' 列');
      });
    });
    rq.setTimeout(30000, () => rq.destroy(new Error('timeout')));
    rq.on('error', (e) => console.error('[replica] ' + e.message));
    rq.end(payload);
  }

  return { server, db, runReplicaExchange };
}

/* ---------------- 直接執行 ---------------- */

if (require.main === module) {
  const confPath = process.argv[2] || path.join(__dirname, 'config.json');
  let conf;
  try { conf = JSON.parse(fs.readFileSync(confPath, 'utf8')); }
  catch (e) { console.error('讀不到設定檔 ' + confPath + '（照 config.example.json 建一份）'); process.exit(1); }
  if (!conf.hmac_secret || !(conf.google_client_ids || []).length) {
    console.error('設定檔至少要有 hmac_secret 與 google_client_ids');
    process.exit(1);
  }
  const { server, runReplicaExchange } = createSyncServer(conf);
  const port = Number(conf.port) || 8787;
  const interval = Number(conf.replica_interval_ms) || 5 * 60000;
  server.listen(port, conf.host || '0.0.0.0', () => {
    console.log('poker sync-server on :' + port + (conf.replica_peer ? '，每 ' + Math.round(interval / 1000) + 's 與 ' + conf.replica_peer + ' 交換' : ''));
  });
  if (conf.replica_peer && conf.replica_secret) {
    setInterval(runReplicaExchange, interval).unref();
    setTimeout(runReplicaExchange, 10000).unref();
  }
  process.on('uncaughtException', (e) => console.error('[sync-server] uncaughtException:', e && e.message));
}

module.exports = { createSyncServer, mintSess, verifySess, validReplicaRow, b64url };
