import redis from "../config/redis.js";
import { generateOTP, hashOTP } from "../utils/otp.js";

const OTP_TTL = process.env.OTP_TTL;
const RESEND_COOLDOWN = process.env.RESEND_COOLDOWN;
const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS;

export const sendParentOTP = async (phone) => {
  const key = `otp:${phone}`;
  const exists = await redis.ttl(key);

  if (exists > RESEND_COOLDOWN) {
    throw new Error("Please wait before requesting another OTP");
  }

  const otp = generateOTP();
  const hash = hashOTP(otp);

  await redis.set(key, JSON.stringify({ hash, attempts: 0 }), "EX", OTP_TTL);

  console.log("OTP:", otp);

  return true;
};

export const verifyParentOTP = async (phone, otp) => {
  const key = `otp:${phone}`;

  const data = await redis.get(key);

  if (!data) {
    throw new Error("OTP expired or not found");
  }

  const parsed = JSON.parse(data);

  if (parsed.attempts >= MAX_ATTEMPTS) {
    await redis.del(key);
    throw new Error("Too many attempts");
  }

  const hash = hashOTP(otp);

  if (hash !== parsed.hash) {
    parsed.attempts += 1;
    await redis.set(key, JSON.stringify(parsed), "KEEPTTL");
    throw new Error("Invalid OTP");
  }

  await redis.del(key); // one-time use

  return true;
};
