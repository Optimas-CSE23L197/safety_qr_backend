import "dotenv/config";
import prisma from "../src/config/prisma.js";

async function main() {
  console.log("🌱 Seeding test card data...\n");

  // ── 1. Find existing school ────────────────────────────────────────────────
  const school = await prisma.school.findUnique({
    where: { code: "TEST-001" },
  });

  if (!school) {
    throw new Error(
      "❌ School TEST-001 not found. Run the original seed.js first.",
    );
  }
  console.log(`✅ Found school: ${school.name} (${school.id})`);

  // ── 2. Find existing student ───────────────────────────────────────────────
  const student = await prisma.student.findFirst({
    where: { school_id: school.id, first_name: "Aryan" },
  });

  if (!student) {
    throw new Error("❌ Student not found. Run the original seed.js first.");
  }
  console.log(
    `✅ Found student: ${student.first_name} ${student.last_name} (${student.id})`,
  );

  // ── 3. ParentUser ──────────────────────────────────────────────────────────
  // Use a real mobile number you can receive SMS on
  const parent = await prisma.parentUser.upsert({
    where: { phone_index: "+919999999999" },
    update: {},
    create: {
      phone: "+919999999999",
      phone_index: "+919999999999",
      is_phone_verified: true,
      status: "ACTIVE",
    },
  });
  console.log(`✅ ParentUser: ${parent.phone} (${parent.id})`);

  // ── 4. ParentStudent link ──────────────────────────────────────────────────
  await prisma.parentStudent.upsert({
    where: {
      parent_id_student_id: {
        parent_id: parent.id,
        student_id: student.id,
      },
    },
    update: {},
    create: {
      parent_id: parent.id,
      student_id: student.id,
      relationship: "Father",
      is_primary: true,
    },
  });
  console.log(`✅ ParentStudent link created`);

  // ── 5. Token ───────────────────────────────────────────────────────────────
  const token = await prisma.token.upsert({
    where: { token_hash: "seed-test-token-hash-0001" },
    update: {},
    create: {
      token_hash: "seed-test-token-hash-0001",
      school_id: school.id,
      student_id: student.id,
      status: "ACTIVE",
      activated_at: new Date(),
      assigned_at: new Date(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    },
  });
  console.log(`✅ Token created: ${token.id}`);

  // ── 6. Card ────────────────────────────────────────────────────────────────
  // card_number format must match backend validator: /^[A-Z0-9\-]{6,20}$/
  const card = await prisma.card.upsert({
    where: { card_number: "TEST-CARD-0001" },
    update: {},
    create: {
      card_number: "TEST-CARD-0001",
      school_id: school.id,
      student_id: student.id,
      token_id: token.id,
      file_url: "https://placeholder.com/test-card.pdf",
      print_status: "PRINTED",
      printed_at: new Date(),
    },
  });
  console.log(`✅ Card created: ${card.card_number}\n`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("========================================");
  console.log("        TEST CARD SEED SUMMARY");
  console.log("========================================");
  console.log("Card Number : TEST-CARD-0001");
  console.log("Mobile      : 9999999999  (enter without +91)");
  console.log("----------------------------------------");
  console.log("Flow: Card → Token → Student → Parent");
  console.log("OTP will be sent to: +919999999999");
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
