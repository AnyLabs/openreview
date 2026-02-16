import { z } from "zod";

const urlSchema = z
  .string()
  .trim()
  .min(1, "API 地址不能为空")
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "API 地址必须为 http/https URL");

const tokenNumberSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  });

export const providerDraftSchema = z.object({
  name: z.string().trim().min(1, "供应商名称不能为空"),
  id: z.string().trim().min(1, "供应商 ID 不能为空"),
  apiUrl: urlSchema,
  apiKey: z.string().trim().min(1, "API Key 不能为空"),
});

export const modelDraftSchema = z.object({
  name: z.string().trim().min(1, "模型名称不能为空"),
  id: z.string().trim().min(1, "模型 ID 不能为空"),
  description: z.string().trim().optional(),
  maxInputToken: tokenNumberSchema,
  maxContextToken: tokenNumberSchema,
});
