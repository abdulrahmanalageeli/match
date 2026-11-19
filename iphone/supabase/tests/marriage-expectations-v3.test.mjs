import {
  comparePreferences,
  dimensions,
} from "../../src/compatibility/model.ts";
import { reciprocalTopicAgreement } from "../../src/compatibility/preference-evidence.ts";
import personality from "../../src/compatibility/personality-catalog.json" with { type: "json" };
import { createDatabase, addUser, asMember } from "./harness.mjs";
import { seedCommunicationMember } from "./communication-fixture.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
const migration = "20261118085232_marriage_expectations_v3.sql";

const profile = (gender, dimensions, version) => ({
  id: randomUUID(),
  gender,
  age: 29,
  preferredMinAge: 25,
  preferredMaxAge: 40,
  city: "الرياض",
  assessmentVersion: version,
  personalityVersion: "personality-v1",
  surveyAnswers: Object.fromEntries(
    dimensions.flatMap((d) => [
      [d.id, "A"],
      [d.partnerId, "A"],
    ]),
  ),
  personalityAnswers: Object.fromEntries(personality.map((p) => [p.id, "C"])),
  marriageBasics: {},
  partnerCriteria: {},
  hardRequirements: [],
  interestIds: [],
});
const set = (p, d, s, w = s) =>
  Object.assign(p.surveyAnswers, { [d]: s, ["partner_" + d]: w });
const cases = [
  ["children", (_, b) => set(b, "children_plan", "B")],
  [
    "children hard",
    (a, b) => {
      set(b, "children_plan", "B");
      a.hardRequirements = ["children_plan"];
    },
  ],
  [
    "family veto",
    (_, b, v3) => {
      if (v3) set(b, "family_authority", "B");
    },
  ],
  [
    "traditional aligned",
    (a, b) => {
      set(a, "wife_work", "B");
      set(b, "wife_work", "B");
    },
  ],
  [
    "role conflict",
    (a, b, v3) => {
      set(a, "wife_work", "B");
      set(b, v3 ? "domestic_labor" : "household_roles", "B");
    },
  ],
  [
    "provision conflict",
    (_, b, v3) => {
      if (v3) set(b, "financial_provision", "B");
    },
  ],
  [
    "social boundaries",
    (a, b, v3) => {
      a.marriageBasics.prayerPractice = b.marriageBasics.prayerPractice =
        "regular";
      if (v3) set(b, "mixed_gatherings", "C");
    },
  ],
  [
    "hobbies temperament",
    (a, b) => {
      a.interestIds = ["reading"];
      b.interestIds = ["walking"];
      for (const k of [
        "social_energy",
        "planning",
        "novelty",
        "quiet_comfort",
      ]) {
        a.personalityAnswers[k] = "A";
        b.personalityAnswers[k] = "E";
      }
      set(a, "social_rhythm", "A", "C");
      set(b, "social_rhythm", "C", "A");
    },
  ],
  [
    "immobile",
    (a, b) => {
      b.city = "جدة";
    },
  ],
  [
    "one-way hard",
    (a, b) => {
      set(a, "wife_work", "B", "A");
      b.hardRequirements = ["wife_work"];
    },
  ],
  ["timelines", (a, b) => set(b, "marriage_timeline", "C")],
  [
    "independent housing",
    (_, b, v3) => {
      if (v3) set(b, "housing_arrangement", "C");
    },
  ],
  [
    "criterion present",
    (a, b) => {
      a.partnerCriteria.smoking = { mode: "prefer", target: "never" };
      b.marriageBasics.smoking = "cigarettes";
    },
  ],
  [
    "criterion unknown",
    (a, b) => {
      a.partnerCriteria.smoking = { mode: "prefer", target: "never" };
    },
  ],
  [
    "flexible work",
    (a, b) => {
      set(a, "wife_work", "C");
      set(b, "wife_work", "A");
    },
  ],
  [
    "unsettled",
    (a, b) => {
      set(a, "children_plan", "C");
      set(b, "children_plan", "C");
    },
  ],
];
async function seed(db, p) {
  const u = {
    id: p.id,
    email: p.id + "@example.test",
    sessionId: randomUUID(),
  };
  await addUser(db, u);
  await seedCommunicationMember(db, u, p.gender);
  await db.query("update marriage.profiles set age=$2 where member_id=$1", [
    p.id,
    p.age,
  ]);
  await db.query(
    "update marriage.preferences set min_age=$2,max_age=$3 where member_id=$1",
    [p.id, p.preferredMinAge, p.preferredMaxAge],
  );
  await db.query(
    "insert into marriage.cities(label) values($1) on conflict do nothing",
    [p.city],
  );
  await db.query(
    "update marriage.profiles set city_id=(select id from marriage.cities where label=$2) where member_id=$1",
    [p.id, p.city],
  );
  await db.query(
    "insert into marriage.member_assessment(member_id,version) values($1,$2)",
    [p.id, p.assessmentVersion],
  );
  for (const [table, pairs] of [
    ["member_answers", p.surveyAnswers],
    ["personality_answers", p.personalityAnswers],
  ]) {
    await db.query(
      "insert into marriage." +
        table +
        " (member_id,question_code,option_code) select $1,key,value from jsonb_each_text($2::jsonb)",
      [p.id, JSON.stringify(pairs)],
    );
  }
  for (const hard of p.hardRequirements)
    await db.query("insert into marriage.fit_hard_requirements values($1,$2)", [
      p.id,
      hard,
    ]);
  for (const id of p.interestIds)
    await db.query("insert into marriage.member_interests values($1,$2)", [
      p.id,
      id,
    ]);
  for (const [id, rule] of Object.entries(p.partnerCriteria))
    await db.query(
      "insert into marriage.partner_criteria(member_id,criterion,rule) values($1,$2,$3)",
      [p.id, id, rule],
    );
  if (p.marriageBasics.smoking || p.marriageBasics.prayerPractice)
    await db.query(
      "insert into marriage.member_basics(member_id,smoking,prayer_practice) values($1,$2,$3)",
      [
        p.id,
        p.marriageBasics.smoking ?? null,
        p.marriageBasics.prayerPractice ?? null,
      ],
    );
  return u.sessionId;
}
const revised = [
  69,
  46,
  71,
  100,
  65,
  71,
  73,
  100,
  60,
  48,
  66,
  69,
  99,
  null,
  98,
  87,
];
const baseline = [
  92,
  null,
  100,
  100,
  83,
  100,
  100,
  100,
  null,
  null,
  95,
  100,
  89,
  100,
  92,
  100,
];
test("the audit pairs run through the historical and current database and the current app", async () => {
  const before = await createDatabase({
    throughMigration: migration.slice(0, 14),
  });
  const after = await createDatabase();
  try {
    for (const [index, [name, change]] of cases.entries()) {
      for (const [db, version] of [
        [before, "marriage-v2"],
        [after, "marriage-v3"],
      ]) {
        const v3 = version === "marriage-v3";
        const catalog = (
          await db.query(
            "select catalog from marriage.assessment_versions where id=$1",
            [version],
          )
        ).rows[0].catalog;
        const a = profile("man", catalog.dimensions, version),
          b = profile("woman", catalog.dimensions, version);
        change(a, b, v3);
        const sessionId = await seed(db, a);
        await seed(db, b);
        if (v3 && index === 0) {
          const current = (await asMember(db, a.id, sessionId, member => member.query("select public.marriage_catalog()->'assessment' as catalog"))).rows[0].catalog;
          assert.deepEqual(current.dimensions, dimensions);
          const scoredFields = ({ selfPrompt, partnerPrompt, discussion, ...dimension }) => dimension;
          assert.deepEqual(catalog.dimensions.map(scoredFields), dimensions.map(scoredFields));
        }
        const {
          rows: [row],
        } = await db.query(
          "select marriage.compatible($1,$2) as eligible, fit from marriage.pair_fit($1,$2)",
          [a.id, b.id],
        );
        if (!v3) {
          assert.equal(row.eligible, !["children hard", "immobile", "one-way hard"].includes(name), name);
          assert.equal(
            row.eligible ? row.fit.percentage : null,
            baseline[index],
            name,
          );
          continue;
        }
        const { fit } = comparePreferences(a, b);
        assert.ok(row.eligible, name);
        assert.equal(row.fit.percentage, fit.percentage, name);
        assert.equal(fit.percentage, revised[index], name);
        const agreed = [15, 15, 15, 16, 14, 15, 15, 16, 16, 15, 15, 15, 16, null, 15, 15][index];
        const agreement = agreed === null ? null : { agreed, total: 16, percentage: Math.round(100 * agreed / 16) };
        assert.deepEqual(reciprocalTopicAgreement(row.fit), agreement, name);
        assert.deepEqual(reciprocalTopicAgreement(fit), agreement, name);
        assert.deepEqual(
          row.fit.practicalConcerns,
          fit.practicalConcerns,
          name,
        );
        assert.deepEqual(
          row.fit.preferenceEvidence,
          fit.preferenceEvidence,
          name,
        );
        assert.equal(
          row.fit.personality.percentage,
          fit.personality.percentage,
          name,
        );
        assert.equal(row.fit.provisional, fit.provisional, name);
        if (name === "hobbies temperament")
          assert.equal(fit.personality.percentage, 67);
        console.log(
          name,
          baseline[index] ?? "excluded",
          "=>",
          fit.percentage ?? "insufficient evidence",
          "mutual topics", fit.strengths.length, "/", fit.total,
        );
      }
    }
    // Personal attendance and acceptance of a partner’s choice are independent.
    const a = profile("man", dimensions, "marriage-v3");
    const b = profile("woman", dimensions, "marriage-v3");
    set(a, "public_event_attendance", "A", "C");
    set(b, "public_event_attendance", "C", "A");
    await seed(after, a);
    await seed(after, b);
    // Saved age ranges are reciprocal ranking preferences in v3. A directory
    // query's optional age filter is separate from these persisted preferences.
    for (const owner of [a,b]) {
      await after.query('update marriage.preferences set min_age=35,max_age=50 where member_id=$1',[owner.id]);
      const result = async () => (await after.query('select marriage.compatible($1,$2) as eligible, fit from marriage.pair_fit($1,$2)',[a.id,b.id])).rows[0];
      const outside = await result();
      assert.equal(outside.eligible,true);
      assert.ok(outside.fit.practicalConcerns.includes('age_range'));
      await after.query('update marriage.preferences set min_age=$2,max_age=$3 where member_id=$1',[owner.id,owner.preferredMinAge,owner.preferredMaxAge]);
      const inside = await result();
      assert.ok(!inside.fit.practicalConcerns.includes('age_range'));
      assert.ok(inside.fit.percentage > outside.fit.percentage);
    }
    async function checkAttendance(expectedPercentage, expectedStatus) {
      const {
        rows: [{ fit: sqlFit, eligible }],
      } = await after.query("select marriage.compatible($1,$2) as eligible, fit from marriage.pair_fit($1,$2)", [
        a.id,
        b.id,
      ]);
      const appFit = comparePreferences(a, b).fit;
      assert.equal(eligible, true);
      assert.equal(appFit.percentage, expectedPercentage);
      assert.deepEqual(sqlFit.preferenceEvidence, appFit.preferenceEvidence);
      assert.equal(sqlFit.percentage, expectedPercentage);
      assert.equal(
        appFit.preferenceEvidence.topics.find(
          (t) => t.id === "public_event_attendance",
        ).status,
        expectedStatus,
      );
    }
    for (const [selfA, wantA, selfB, wantB, essential, score, status] of [
      ["A", "A", "A", "A", false, 100, "aligned"],
      ["C", "C", "C", "C", false, 100, "aligned"],
      ["A", "C", "C", "A", false, 100, "aligned"],
      ["A", "A", "C", "C", false, 97, "different"],
      ["A", "A", "D", "C", false, null, "missing"],
      ["A", "A", "C", "C", true, 48, "different"],
    ]) {
      for (const [member, self, want] of [[a, selfA, wantA], [b, selfB, wantB]]) {
        set(member, "public_event_attendance", self, want);
        await after.query(
          "update marriage.member_answers set option_code=case question_code when 'public_event_attendance' then $2 else $3 end where member_id=$1 and question_code in ('public_event_attendance','partner_public_event_attendance')",
          [member.id, self, want],
        );
      }
      if (essential) {
        a.hardRequirements = ["public_event_attendance"];
        await after.query("insert into marriage.fit_hard_requirements values ($1,'public_event_attendance')", [a.id]);
      }
      await checkAttendance(score, status);
    }
    // A spouse's acceptance is directional. Test all choices against both scorers.
    const accepted = { A: ["A"], B: ["A", "B"], C: ["B", "C"], D: ["A", "B", "C"] };
    for (const [wanted, permitted] of Object.entries(accepted)) {
      for (const observed of ["A", "B", "C", "D"]) {
        set(a, "public_event_attendance", "A", wanted);
        set(b, "public_event_attendance", observed, "D");
        const topic = comparePreferences(a, b).fit.preferenceEvidence.topics.find(t => t.id === "public_event_attendance");
        const expected = observed === "D" ? null : Number(permitted.includes(observed));
        const result = await after.query("select marriage.expectation_credit('public_event_attendance',$1,$2,$3,$4) as credit", [a.id, b.id, wanted, observed]);
        assert.equal(result.rows[0].credit, expected, wanted + "/" + observed);
        assert.equal(topic.status, expected === null ? "missing" : expected === 1 ? "aligned" : "one_sided");
      }
    }
    delete b.surveyAnswers.public_event_attendance;
    b.surveyAnswers.perspective_revision = "C";
    assert.equal(comparePreferences(a, b).fit.percentage, null);

  } finally {
    await before.close();
    await after.close();
  }
});
