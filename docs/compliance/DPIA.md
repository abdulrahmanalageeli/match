# Data protection impact assessment

## Processing assessed

Compatibility profiling combines questionnaire answers, inferred personality/communication attributes, age, gender, nationality preferences, feedback and interaction history. The system proposes event pairings and may enforce safety bans. It does not guarantee or determine a relationship.

## Main risks and controls

- Unauthorized database disclosure: anonymous grants revoked, RLS enabled, service APIs authenticated and rate limited.
- Account takeover from a known phone number: Twilio Verify OTP is required; legacy tokens are rotated.
- Exposure of payment receipts: private bucket, type/size limits, short-lived signed links.
- Excessive profiling or opaque outcomes: separate explicit consent, notice of automated analysis, human organizer oversight and objection/review channel.
- Discrimination or unfair exclusion: matching gates and ban decisions require documented purpose, human review and a participant challenge route; assess outcome distributions each event.
- Overseas processing: vendor contracts, transfer assessment and minimization are mandatory owner actions.
- Retention creep: scheduled expiry for logs/messages and operational review for profiles, receipts, requests and bans.

Residual risk is medium until contracts/transfer assessment, exact controller identity, backup evidence and a fairness review are approved. Production collection must not begin while those owner actions remain unaccepted.

Approval: Privacy owner ___  Security owner ___  Executive ___  Date ___
