import { DatabaseSync } from "node:sqlite";
import {
  randomUUID,
  randomBytes,
  createHash,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const derive = promisify(scrypt);
const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
const digest = (token) => createHash("sha256").update(token).digest("hex");
export const SKU = "com.blindmatch.marriage.monthly";
export const BUNDLE = "com.blindmatch.marriage";
export const CONSENT_VERSION = "2026-11-05";
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function requireThat(test, status, message) {
  if (!test) throw new ApiError(status, message);
}
function field(value, max, required = true) {
  requireThat(
    typeof (value ?? "") === "string",
    400,
    "تحقّق من صيغة البيانات.",
  );
  const text = (value ?? "").trim();
  requireThat(
    (!required || text.length > 0) && text.length <= max,
    400,
    "تحقّق من الحقول المطلوبة وطول النص.",
  );
  return text;
}
function age(value) {
  requireThat(
    Number.isInteger(value) && value >= 18 && value <= 110,
    400,
    "يجب أن يكون العمر بين ١٨ و١١٠.",
  );
  return value;
}
function credentials(body) {
  const email = field(body.email, 254).toLowerCase();
  requireThat(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    400,
    "أدخل بريدًا إلكترونيًا صالحًا.",
  );
  requireThat(
    typeof body.password === "string" &&
      body.password.length >= 10 &&
      body.password.length <= 128,
    400,
    "استخدم كلمة مرور من ١٠ إلى ١٢٨ حرفًا.",
  );
  return { email, password: body.password };
}
function visiblePerson(p) {
  return {
    displayName: p.displayName,
    age: p.age,
    city: p.city,
    profession: p.profession,
    bio: p.bio,
    familyPreference: p.familyPreference,
  };
}
export function openStore(
  path = process.env.MARRIAGE_DB ||
    fileURLToPath(new URL("./data/marriage.sqlite", import.meta.url)),
) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  // Upgrade databases created before review status was recorded.
  if (
    !db
      .prepare("PRAGMA table_info(reports)")
      .all()
      .some((column) => column.name === "resolved_at")
  ) {
    db.exec("ALTER TABLE reports ADD COLUMN resolved_at INTEGER");
  }
  if (db.prepare("PRAGMA user_version").get().user_version < 1) {
    db.exec("BEGIN IMMEDIATE");
    try {
      // Earlier releases stored no consent evidence. Preserve the profile so the
      // member can review and submit it again, without inventing a consent date.
      const missingConsent =
        "SELECT id FROM users WHERE profile IS NOT NULL AND NOT EXISTS (SELECT 1 FROM application_consents WHERE user_id=users.id AND version=?)";
      db.prepare(
        "UPDATE introductions SET closed=1 WHERE closed=0 AND (first_id IN (" +
          missingConsent +
          ") OR second_id IN (" +
          missingConsent +
          "))",
      ).run(CONSENT_VERSION, CONSENT_VERSION);
      db.prepare(
        "UPDATE users SET application_status='draft' WHERE id IN (" +
          missingConsent +
          ")",
      ).run(CONSENT_VERSION);
      db.exec("PRAGMA user_version=1; COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }
  return new Store(db);
}
class Store {
  constructor(db) {
    this.db = db;
  }
  atomic(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  user(id) {
    const u = this.db.prepare("SELECT * FROM users WHERE id=?").get(id);
    requireThat(u, 401, "يلزم تسجيل الدخول.");
    return u;
  }
  newSession(id) {
    const token = randomBytes(32).toString("base64url");
    this.db
      .prepare("DELETE FROM sessions WHERE expires_at <= ?")
      .run(Date.now());
    this.db
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(digest(token), id, Date.now() + sessionLifetime);
    return { token, state: this.state(id) };
  }
  async register(body) {
    const { email, password } = credentials(body);
    const salt = randomBytes(16).toString("hex");
    const hash = (await derive(password, salt, 64)).toString("hex");
    return this.atomic(() => {
      requireThat(!this.byEmail(email), 409, "تعذّر إنشاء الحساب بهذا البريد.");
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO users (id,email,password_hash,account_token) VALUES (?,?,?,?)",
        )
        .run(id, email, salt + ":" + hash, randomUUID());
      return this.newSession(id);
    });
  }
  byEmail(email) {
    return this.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.toLowerCase());
  }
  async login(body) {
    const { email, password } = credentials(body);
    const u = this.byEmail(email);
    const [salt, hash] = u
      ? u.password_hash.split(":")
      : ["0".repeat(32), "0".repeat(128)];
    const actual = await derive(password, salt, 64);
    requireThat(
      timingSafeEqual(actual, Buffer.from(hash, "hex")) && u,
      401,
      "تحقق من البريد وكلمة المرور.",
    );
    return this.newSession(u.id);
  }
  authenticate(token = "") {
    const session = this.db
      .prepare("SELECT user_id FROM sessions WHERE digest=? AND expires_at>?")
      .get(digest(token), Date.now());
    requireThat(session, 401, "يلزم تسجيل الدخول.");
    return session.user_id;
  }
  logout(token) {
    this.db.prepare("DELETE FROM sessions WHERE digest=?").run(digest(token));
  }
  membership(id) {
    const { expiry } = this.db
      .prepare(
        "SELECT MAX(expires_at) AS expiry FROM transactions WHERE user_id=? AND revoked=0",
      )
      .get(id);
    const active = Boolean(expiry && expiry > Date.now());
    return {
      active,
      expiresAt: expiry ? new Date(expiry).toISOString() : null,
      canStart: !active && this.hasEligiblePartner(id),
    };
  }
  hasEligiblePartner(id, partnerId = null) {
    return this.eligiblePartners(id, partnerId, false, 1).length > 0;
  }
  eligiblePartners(id, partnerId, paidOnly, limit) {
    // Use the same eligibility rules for an anonymous readiness signal and an
    // operator's proposed pair. Selling the first subscriptions must not depend
    // on the prospective other member having already paid.
    return this.db
      .prepare(
        `
      SELECT p.email FROM users u JOIN users p ON p.id<>u.id
      WHERE u.id=? AND (? IS NULL OR p.id=?)
        AND u.application_status='approved' AND p.application_status='approved'
        AND u.paused=0 AND p.paused=0
        AND json_extract(u.profile,'$.city')=json_extract(p.profile,'$.city')
        AND json_extract(u.profile,'$.gender')<>json_extract(p.profile,'$.gender')
        AND json_extract(u.profile,'$.age') BETWEEN json_extract(p.profile,'$.preferredMinAge') AND json_extract(p.profile,'$.preferredMaxAge')
        AND json_extract(p.profile,'$.age') BETWEEN json_extract(u.profile,'$.preferredMinAge') AND json_extract(u.profile,'$.preferredMaxAge')
        AND NOT EXISTS (SELECT 1 FROM introductions i
          WHERE i.first_id=min(u.id,p.id) AND i.second_id=max(u.id,p.id))
        AND NOT EXISTS (SELECT 1 FROM introductions i WHERE i.closed=0
          AND (i.first_id IN (u.id,p.id) OR i.second_id IN (u.id,p.id)))
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
          (b.reporter=u.id AND b.subject=p.id) OR (b.reporter=p.id AND b.subject=u.id))
        AND (?=0 OR EXISTS (SELECT 1 FROM transactions t WHERE
          t.user_id=p.id AND t.revoked=0 AND t.expires_at>?))
      ORDER BY p.email LIMIT ?`,
      )
      .all(id, partnerId, partnerId, Number(paidOnly), Date.now(), limit);
  }
  paidCandidates(id) {
    if (!this.available(this.user(id))) return [];
    return this.eligiblePartners(id, null, true, -1);
  }
  readyMembers() {
    return this.db
      .prepare(
        `
      SELECT u.email FROM users u WHERE u.application_status='approved' AND u.paused=0
        AND EXISTS (SELECT 1 FROM transactions t WHERE t.user_id=u.id AND t.revoked=0 AND t.expires_at>?)
        AND NOT EXISTS (SELECT 1 FROM introductions i WHERE i.closed=0 AND u.id IN (i.first_id,i.second_id))
      ORDER BY u.email`,
      )
      .all(Date.now());
  }
  available(u) {
    return (
      u.application_status === "approved" &&
      !u.paused &&
      this.membership(u.id).active
    );
  }
  currentPair(id) {
    return this.db
      .prepare(
        "SELECT * FROM introductions WHERE closed=0 AND (first_id=? OR second_id=?) LIMIT 1",
      )
      .get(id, id);
  }
  state(id) {
    const u = this.user(id);
    const membership = this.membership(id);
    let introduction = null;
    if (u.application_status === "approved" && !u.paused && membership.active) {
      const pair = this.currentPair(id);
      if (pair) {
        const first = pair.first_id === id;
        const other = this.user(first ? pair.second_id : pair.first_id);
        if (this.available(other)) {
          const p = JSON.parse(other.profile);
          const mutual = Boolean(pair.first_accept && pair.second_accept);
          const accepted = first ? pair.first_accept : pair.second_accept;
          introduction = {
            id: pair.id,
            status: mutual ? "mutual" : accepted ? "waiting" : "proposed",
            person: visiblePerson(p),
            contact: mutual ? p.contact : null,
          };
        }
      }
    }
    return {
      user: {
        id,
        email: u.email,
        applicationStatus: u.application_status,
        paused: Boolean(u.paused),
        appAccountToken: u.account_token,
      },
      profile: u.profile ? JSON.parse(u.profile) : null,
      membership,
      introduction,
    };
  }
  apply(id, input) {
    requireThat(
      input.consentVersion === CONSENT_VERSION,
      400,
      "يلزم الاطّلاع على سياسة الخصوصية الحالية والموافقة عليها.",
    );
    const profile = {
      displayName: field(input.displayName, 60),
      age: age(input.age),
      gender: input.gender,
      city: field(input.city, 80),
      profession: field(input.profession, 100),
      bio: field(input.bio, 1200),
      contact: field(input.contact, 180),
      preferredMinAge: age(input.preferredMinAge ?? 18),
      preferredMaxAge: age(input.preferredMaxAge ?? 110),
      familyPreference: field(input.familyPreference, 180, false),
    };
    requireThat(
      ["man", "woman"].includes(profile.gender) &&
        profile.preferredMinAge <= profile.preferredMaxAge,
      400,
      "راجع تفضيلات الترشيح.",
    );
    return this.atomic(() => {
      const current = this.user(id);
      const previous = current.profile ? JSON.parse(current.profile) : null;
      this.db
        .prepare(
          "INSERT INTO application_consents (user_id,version,received_at) VALUES (?,?,?)",
        )
        .run(id, CONSENT_VERSION, Date.now());
      if (
        current.application_status !== "draft" &&
        previous &&
        Object.keys(profile).every((key) => previous[key] === profile[key])
      )
        return this.state(id);
      if (current.application_status === "approved") this.closeUserPairs(id);
      this.db
        .prepare(
          "UPDATE users SET profile=?,application_status='pending' WHERE id=?",
        )
        .run(JSON.stringify(profile), id);
      return this.state(id);
    });
  }
  approve(id) {
    requireThat(
      this.user(id).application_status === "pending",
      409,
      "الطلب غير جاهز للمراجعة.",
    );
    requireThat(
      this.db
        .prepare(
          "SELECT 1 FROM application_consents WHERE user_id=? AND version=? LIMIT 1",
        )
        .get(id, CONSENT_VERSION),
      409,
      "الطلب يحتاج إلى موافقة صاحبه على سياسة الخصوصية.",
    );
    this.db
      .prepare("UPDATE users SET application_status='approved' WHERE id=?")
      .run(id);
  }
  assign(first, second) {
    requireThat(first !== second, 400, "اختر عضوين مختلفين.");
    const [a, b] = [first, second].sort();
    return this.atomic(() => {
      const u = this.user(a),
        v = this.user(b);
      requireThat(
        this.available(u) && this.available(v),
        409,
        "يجب اعتماد العضوين وتفعيل الاشتراك والبحث.",
      );
      requireThat(
        this.hasEligiblePartner(a, b),
        409,
        "العضوان غير متاحين لترشيح جديد أو لا تتوافق تفضيلاتهما.",
      );
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO introductions (id,first_id,second_id) VALUES (?,?,?)",
        )
        .run(id, a, b);
      return id;
    });
  }
  respond(id, input) {
    const pairId = field(input.id, 80);
    const decision = input.decision;
    requireThat(
      ["accept", "pass", "block", "report"].includes(decision),
      400,
      "اختر إجراءً صالحًا.",
    );
    return this.atomic(() => {
      const pair = this.db
        .prepare(
          "SELECT * FROM introductions WHERE id=? AND (first_id=? OR second_id=?)",
        )
        .get(pairId, id, id);
      requireThat(pair, 404, "الترشيح غير متاح.");
      const first = pair.first_id === id,
        other = first ? pair.second_id : pair.first_id;
      if (decision === "accept") {
        requireThat(
          !pair.closed &&
            this.available(this.user(id)) &&
            this.available(this.user(other)),
          409,
          "الترشيح غير متاح.",
        );
        this.db
          .prepare(
            first
              ? "UPDATE introductions SET first_accept=1 WHERE id=?"
              : "UPDATE introductions SET second_accept=1 WHERE id=?",
          )
          .run(pairId);
      } else {
        if (decision === "block" || decision === "report") {
          this.db
            .prepare("INSERT OR IGNORE INTO blocks VALUES (?,?)")
            .run(id, other);
          if (decision === "report")
            this.db
              .prepare(
                "INSERT OR IGNORE INTO reports (id,reporter,subject,reason,filed_at) VALUES (?,?,?,?,?)",
              )
              .run(
                randomUUID(),
                id,
                other,
                field(input.reason, 1000, false) || "طلب مراجعة",
                Date.now(),
              );
        }
        this.db
          .prepare("UPDATE introductions SET closed=1 WHERE id=?")
          .run(pairId);
      }
      return this.state(id);
    });
  }
  pause(id, paused) {
    requireThat(typeof paused === "boolean", 400, "اختر حالة البحث.");
    return this.atomic(() => {
      this.db
        .prepare("UPDATE users SET paused=? WHERE id=?")
        .run(Number(paused), id);
      if (paused) this.closeUserPairs(id);
      return this.state(id);
    });
  }
  closeUserPairs(id) {
    this.db
      .prepare(
        "UPDATE introductions SET closed=1 WHERE closed=0 AND (first_id=? OR second_id=?)",
      )
      .run(id, id);
  }
  suspend(id) {
    return this.atomic(() => {
      requireThat(this.user(id).profile, 409, "طلب غير مكتمل.");
      this.closeUserPairs(id);
      this.db
        .prepare(
          "UPDATE users SET paused=1,application_status='pending' WHERE id=?",
        )
        .run(id);
    });
  }
  resolveReport(id) {
    const review = this.db
      .prepare(
        "UPDATE reports SET resolved_at=? WHERE id=? AND resolved_at IS NULL",
      )
      .run(Date.now(), id);
    requireThat(review.changes, 404, "البلاغ غير موجود أو تمت مراجعته.");
  }
  remove(id) {
    this.db.prepare("DELETE FROM users WHERE id=?").run(id);
  }
  recordReceipt(receipt, id) {
    const u = this.user(id);
    requireThat(
      receipt.bundleId === BUNDLE &&
        receipt.productId === SKU &&
        receipt.appAccountToken?.toLowerCase() === u.account_token &&
        typeof receipt.transactionId === "string" &&
        receipt.transactionId.length > 0 &&
        typeof receipt.originalTransactionId === "string" &&
        receipt.originalTransactionId.length > 0 &&
        Number.isSafeInteger(receipt.signedDate) &&
        Number.isSafeInteger(receipt.expiresDate) &&
        receipt.expiresDate > 0,
      403,
      "تعذّر ربط الاشتراك بهذا الحساب.",
    );
    return this.atomic(() => {
      const ownership = this.db
        .prepare(
          "SELECT user_id FROM transactions WHERE original_id=? OR transaction_id=? LIMIT 1",
        )
        .get(receipt.originalTransactionId, receipt.transactionId);
      requireThat(
        !ownership || ownership.user_id === id,
        403,
        "الاشتراك مرتبط بحساب آخر.",
      );
      this.db
        .prepare(
          `INSERT INTO transactions VALUES (?,?,?,?,?,?)
        ON CONFLICT(transaction_id) DO UPDATE SET
        expires_at=excluded.expires_at, signed_at=excluded.signed_at, revoked=excluded.revoked
        WHERE excluded.signed_at>transactions.signed_at OR
        (excluded.signed_at=transactions.signed_at AND excluded.revoked>transactions.revoked)`,
        )
        .run(
          receipt.transactionId,
          receipt.originalTransactionId,
          id,
          receipt.expiresDate,
          receipt.signedDate,
          Number(Boolean(receipt.revocationDate || receipt.isUpgraded)),
        );
      return this.state(id);
    });
  }
  recordNotification(receipt) {
    const owner = this.db
      .prepare("SELECT id FROM users WHERE account_token=?")
      .get(receipt.appAccountToken?.toLowerCase() ?? "");
    if (owner && receipt.productId === SKU)
      this.recordReceipt(receipt, owner.id);
  }
}
