-- Support PostgreSQL's reverse lookup when maintaining a referenced policy version.
create index consents_by_version on marriage.consents(version);
