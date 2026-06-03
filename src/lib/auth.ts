import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "mysql",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

  // 我们用 username 登录,email 字段在 schema 里仍存在(伪 email)
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: false,
    requireEmailVerification: false,
    minPasswordLength: 6,
  },

  // 业务字段
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "PLAYER",
        input: false,
      },
      active: {
        type: "boolean",
        defaultValue: true,
        input: false,
      },
      playerGender: {
        type: "string",
        required: false,
        input: false,
      },
      defaultRateCents: {
        type: "number",
        required: false,
        input: false,
      },
      mustChangePwd: {
        type: "boolean",
        defaultValue: true,
        input: false,
      },
      wechatQrPath: {
        type: "string",
        required: false,
        input: false,
      },
      alipayQrPath: {
        type: "string",
        required: false,
        input: false,
      },
      qrSecurityCodeHash: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 天
    updateAge: 60 * 60 * 24, // 一天刷一次
  },

  plugins: [
    username({
      minUsernameLength: 2,
      maxUsernameLength: 32,
      usernameValidator: (username) => /^[\p{L}\p{N}_.-]+$/u.test(username),
      usernameNormalization: false,
    }),
    nextCookies(),
  ],
});
