# NCA / NCNI control mapping

Applicability must be confirmed by the entity and competent authority. This matrix is engineering evidence, not an NCA certification.

| Control area | Repository / platform evidence | Remaining evidence |
|---|---|---|
| Governance and accountability | ROPA, DPIA, retention and incident procedures | Executive approval, roles, annual review minutes |
| Identity and access | Signed admin sessions, OTP, no default passwords, service-role mediation | MFA for vendor/admin accounts, access review export |
| Data protection | RLS/revokes migration, private receipts, minimization, rights portal | Vendor DPAs, transfer assessment, deletion-run records |
| Logging and monitoring | `security_audit_logs`, rate-limit/denial events, 90-day expiry | Alerting owner, incident exercises, log-review records |
| Application security | Payload limits, signature checks, CSP/security headers, dependency audit | SAST/DAST evidence and remediation SLA |
| Resilience | Fail-closed server configuration | Backup/PITR configuration and tested restoration report |
| Third parties | Vendor register in ROPA/privacy notice | Contract and subprocessor reviews |
| Incident management | Incident procedure | Contact roster and tabletop exercise |

Review against the exact current NCA framework edition that applies to the organization; record control IDs, implementation status, evidence URL, owner, exception and due date in the organization's GRC system.
