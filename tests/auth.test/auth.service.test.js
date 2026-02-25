import { jest } from "@jest/globals";

// ✅ MOCKS FIRST (ESM style)
jest.unstable_mockModule("../../src/modules/auth/auth.repository.js", () => ({
  getAdminByEmail: jest.fn(),
}));

jest.unstable_mockModule("bcrypt", () => ({
  default: { compare: jest.fn() },
}));

jest.unstable_mockModule("../../src/utils/jwt.js", () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
}));

// ✅ IMPORT AFTER MOCKS
const { loginAdmin } = await import("../../src/modules/auth/auth.service.js");

const authRepo = await import("../../src/modules/auth/auth.repository.js");

const bcrypt = (await import("bcrypt")).default;

const jwt = await import("../../src/utils/jwt.js");

import { ApiError } from "../../src/utils/ApiError.js";
import { ERROR_MESSAGES } from "../../src/config/constants.js";

describe("loginAdmin service", () => {
  const adminMock = {
    id: "1",
    email: "admin@test.com",
    password: "hashedpassword",
    name: "Admin",
    role: "ADMIN",
    is_active: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 🧪 1. Missing credentials
  it("should throw error if email or password missing", async () => {
    await expect(loginAdmin({ email: "", password: "" })).rejects.toThrow(
      ApiError,
    );
  });

  // 🧪 2. Admin not found
  it("should throw error if admin not found", async () => {
    authRepo.getAdminByEmail.mockResolvedValue(null);

    await expect(
      loginAdmin({ email: "admin@test.com", password: "123" }),
    ).rejects.toThrow(ERROR_MESSAGES.ADMIN_NOT_FOUND);
  });

  // 🧪 3. Account disabled
  it("should throw error if admin inactive", async () => {
    authRepo.getAdminByEmail.mockResolvedValue({
      ...adminMock,
      is_active: false,
    });

    await expect(
      loginAdmin({ email: "admin@test.com", password: "123" }),
    ).rejects.toThrow(ERROR_MESSAGES.ACCOUNT_DISABLED);
  });

  // 🧪 4. Invalid password
  it("should throw error if password does not match", async () => {
    authRepo.getAdminByEmail.mockResolvedValue(adminMock);
    bcrypt.compare.mockResolvedValue(false);

    await expect(
      loginAdmin({ email: "admin@test.com", password: "wrong" }),
    ).rejects.toThrow(ERROR_MESSAGES.INVALID_CREDENTIALS);
  });

  // 🧪 5. Successful login
  it("should return tokens and admin data on success", async () => {
    authRepo.getAdminByEmail.mockResolvedValue(adminMock);
    bcrypt.compare.mockResolvedValue(true);
    jwt.generateAccessToken.mockReturnValue("access-token");
    jwt.generateRefreshToken.mockReturnValue("refresh-token");

    const result = await loginAdmin({
      email: "admin@test.com",
      password: "123",
    });

    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      admin: {
        id: adminMock.id,
        email: adminMock.email,
        name: adminMock.name,
        role: adminMock.role,
      },
    });
  });
});
