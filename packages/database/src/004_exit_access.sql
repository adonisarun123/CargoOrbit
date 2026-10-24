-- Exit sessions are separate from normal authentication and can only authorize
-- read-only handover during the explicitly approved closing window.
CREATE TABLE exit_sessions (
 id text PRIMARY KEY,
 user_id text NOT NULL REFERENCES users(id),
 membership_id text NOT NULL REFERENCES memberships(id),
 user_session_version integer NOT NULL,
 version integer NOT NULL DEFAULT 1,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exit_sessions_actor ON exit_sessions(user_id,membership_id,expires_at);
REVOKE ALL ON exit_sessions FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON exit_sessions TO cargoorbit_app;
