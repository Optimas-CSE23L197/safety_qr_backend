import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "../src/config/prisma.js";

const SALT_ROUNDS = Number(process.env.SALT_ROUNDS) || 12;

async function main() {
  // =============================================================================
  // SUPER ADMINS (you and your 2 friends)
  // =============================================================================

  const superAdmins = [
    {
      name: "Animesh Karan",
      email: "karananimesh144@gmail.com",
      password: "Karan@144#",
    },
    // { name: "Friend Two",   email: "friend2@gmail.com",          password: "Friend@2#" },
    // { name: "Friend Three", email: "friend3@gmail.com",          password: "Friend@3#" },
  ];

  for (const sa of superAdmins) {
    const email = sa.email.toLowerCase();
    const existing = await prisma.superAdmin.findUnique({ where: { email } });

    if (existing) {
      console.log("⚠️  Super admin already exists:", email);
    } else {
      const password_hash = await bcrypt.hash(sa.password, SALT_ROUNDS);
      const admin = await prisma.superAdmin.create({
        data: {
          name: sa.name,
          email,
          password_hash,
          is_active: true,
        },
      });
      console.log("✅ Super admin created:", admin.email);
    }
  }

  // =============================================================================
  // TEST SCHOOL
  // =============================================================================

  const existingSchool = await prisma.school.findUnique({
    where: { code: "TEST-001" },
  });

  if (existingSchool) {
    console.log("⚠️  Test school already exists:", existingSchool.id);
    return;
  }

  const school = await prisma.school.create({
    data: {
      name: "Test School",
      code: "TEST-001",
      email: "school@test.com",
      phone: "9999999999",
      is_active: true,
    },
  });
  console.log("✅ School created:", school.id);

  // =============================================================================
  // SCHOOL SETTINGS
  // =============================================================================

  await prisma.schoolSettings.create({
    data: {
      school_id: school.id,
      token_validity_months: 12,
      max_tokens_per_student: 1,
    },
  });
  console.log("✅ School settings created");

  // =============================================================================
  // SCHOOL USERS
  // =============================================================================

  const schoolUserPassword = await bcrypt.hash("Admin@123#", SALT_ROUNDS);
  const schoolAdmin = await prisma.schoolUser.create({
    data: {
      school_id: school.id,
      email: "schooladmin@test.com",
      password_hash: schoolUserPassword,
      name: "School Admin",
      role: "ADMIN",
      is_active: true,
    },
  });
  console.log("✅ School admin created:", schoolAdmin.id);

  const staffPassword = await bcrypt.hash("Staff@123#", SALT_ROUNDS);
  const schoolStaff = await prisma.schoolUser.create({
    data: {
      school_id: school.id,
      email: "schoolstaff@test.com",
      password_hash: staffPassword,
      name: "School Staff",
      role: "STAFF",
      is_active: true,
    },
  });
  console.log("✅ School staff created:", schoolStaff.id);

  // =============================================================================
  // TEST STUDENT
  // =============================================================================

  const student = await prisma.student.create({
    data: {
      school_id: school.id,
      first_name: "Aryan",
      last_name: "Sharma",
      class: "8",
      section: "B",
      is_active: true,
    },
  });
  console.log("✅ Student created:", student.id);

  // =============================================================================
  // EMERGENCY PROFILE FOR STUDENT
  // =============================================================================

  await prisma.emergencyProfile.create({
    data: {
      student_id: student.id,
      blood_group: "B+",
      visibility: "PUBLIC",
      is_visible: true,
    },
  });
  console.log("✅ Emergency profile created");

  // =============================================================================
  // SUMMARY
  // =============================================================================

  console.log("\n========================================");
  console.log("         SEED DATA SUMMARY");
  console.log("========================================");
  console.log("school_id        :", school.id);
  console.log("school_user_id   :", schoolAdmin.id);
  console.log("student_id       :", student.id);
  console.log("----------------------------------------");
  console.log("Super admin login: karananimesh144@gmail.com");
  console.log("Super admin pass : Karan@144#");
  console.log("----------------------------------------");
  console.log("School admin     : schooladmin@test.com");
  console.log("School admin pass: Admin@123#");
  console.log("----------------------------------------");
  console.log("School staff     : schoolstaff@test.com");
  console.log("School staff pass: Staff@123#");
  console.log("========================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
