-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "admin_user_id" TEXT;

ALTER TABLE "Session"
DROP CONSTRAINT IF EXISTS session_one_user_only;

ALTER TABLE "Session"
ADD CONSTRAINT session_one_user_only
CHECK (
  (
    (parent_user_id IS NOT NULL)::int +
    (school_user_id IS NOT NULL)::int +
    (admin_user_id IS NOT NULL)::int
  ) = 1
);

ALTER TABLE "Session"
ADD CONSTRAINT fk_session_parent
FOREIGN KEY (parent_user_id) REFERENCES "ParentUser"(id) ON DELETE CASCADE;

ALTER TABLE "Session"
ADD CONSTRAINT fk_session_school
FOREIGN KEY (school_user_id) REFERENCES "SchoolUser"(id) ON DELETE CASCADE;

ALTER TABLE "Session"
ADD CONSTRAINT fk_session_admin
FOREIGN KEY (admin_user_id) REFERENCES "Admin"(id) ON DELETE CASCADE;

CREATE INDEX idx_session_parent ON "Session"(parent_user_id);
CREATE INDEX idx_session_school ON "Session"(school_user_id);
CREATE INDEX idx_session_admin ON "Session"(admin_user_id);

ALTER TABLE "Session" ADD COLUMN revoked_at TIMESTAMP;