import { openStore } from "./domain.mjs";

const [command, ...args] = process.argv.slice(2);
const store = openStore();
function resolveUser(email) {
  const user = store.byEmail(email || "");
  if (!user) throw Error("Member not found.");
  return user;
}
try {
  if (command === "pending") {
    console.table(
      store.db
        .prepare(
          "SELECT email,json_extract(profile,'$.displayName') AS name,json_extract(profile,'$.age') AS claimed_age FROM users WHERE application_status='pending'",
        )
        .all(),
    );
  } else if (command === "ready" && args.length === 0) {
    console.table(store.readyMembers());
  } else if (command === "candidates" && args.length === 1) {
    console.table(store.paidCandidates(resolveUser(args[0]).id));
  } else if (command === "approve" && args[1] === "--verified-adult") {
    store.approve(resolveUser(args[0]).id);
    console.log("Application approved.");
  } else if (command === "introduce" && args.length === 2) {
    console.log(
      "Created introduction:",
      store.assign(resolveUser(args[0]).id, resolveUser(args[1]).id),
    );
  } else if (command === "close" && args[0]) {
    const result = store.db
      .prepare("UPDATE introductions SET closed=1 WHERE id=? AND closed=0")
      .run(args[0]);
    if (!result.changes) throw Error("Open introduction not found.");
    console.log("Introduction closed.");
  } else if (command === "reports") {
    console.table(
      store.db
        .prepare(
          "SELECT r.id,u.email AS reported_member,r.reason,r.filed_at FROM reports r JOIN users u ON u.id=r.subject WHERE r.resolved_at IS NULL ORDER BY r.filed_at DESC",
        )
        .all(),
    );
  } else if (command === "resolve" && args.length === 1) {
    store.resolveReport(args[0]);
    console.log("Report marked reviewed. The member block remains in effect.");
  } else if (command === "suspend" && args.length === 1) {
    store.suspend(resolveUser(args[0]).id);
    console.log("Member removed from matching pending operator review.");
  } else {
    console.error(
      "Usage: pending | approve EMAIL --verified-adult | ready | candidates EMAIL | introduce EMAIL EMAIL | close INTRODUCTION_ID | reports | resolve REPORT_ID | suspend EMAIL",
    );
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  store.db.close();
}
