# Retention and secure disposal schedule

| Record | Period | Disposal |
|---|---:|---|
| Abandoned registration without survey | 7 days | Delete after operational validation |
| Security audit log | 90 days | Automated database deletion; extend only under documented incident hold |
| WhatsApp message content/provider payload | 180 days | Automated database deletion |
| Receipt image | 180 days after event/dispute closure | Delete private storage object and detailed receipt row; retain only required accounting fields |
| Participant profile, survey, results and feedback | 12 months after last participation | Delete or irreversibly anonymize linked records |
| Closed rights request | 5 years | Delete after legal-owner confirmation |
| Active safety ban identifier | Ban duration; review yearly | Remove when ban expires/appeal succeeds unless a legal hold applies |

The application automates the first two database schedules that are safe without business context. The privacy owner runs and records the monthly operational deletion review for the remaining categories. A legal hold must name the record set, reason, approver and review date.
