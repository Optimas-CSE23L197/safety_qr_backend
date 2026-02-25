import { randomUUID } from "crypto";

//////////////////////////////
//! GENERATE UNIQUE ID
//////////////////////////////

export const generateId = () => randomUUID();

//////////////////////////////
//! SAFE JSON PARSE
//////////////////////////////

export const safeJsonParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

//////////////////////////////
//! PAGINATION CALCULATOR
//////////////////////////////

export const getPagination = (page = 1, limit = 20) => {
  const take = Number(limit);
  const skip = (Number(page) - 1) * take;

  return { skip, take };
};

//////////////////////////////
//! BUILD API RESPONSE
//////////////////////////////

export const buildResponse = (data, message = "success") => ({
  success: true,
  message,
  data,
});

// ! Phone regex
export const phoneRegex = /^(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}$/;
