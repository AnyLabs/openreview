import { z } from "zod";

const urlError = "请输入有效的 URL 地址（以 http:// 或 https:// 开头）";

const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "该字段不能为空")
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, urlError);

export const gitLabFormSchema = z.object({
  gitlabUrl: httpUrlSchema,
  gitlabToken: z.string().trim().min(1, "请输入 Personal Access Token"),
});

export const aiFormSchema = z
  .object({
    openaiProviderId: z.string().trim(),
    openaiModelId: z.string().trim(),
    reviewLanguage: z.string().trim().min(1, "请选择评审语言"),
    reviewRules: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.openaiProviderId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["openaiProviderId"],
        message: "请选择生效供应商",
      });
    }

    if (!data.openaiModelId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["openaiModelId"],
        message: "请选择生效模型",
      });
    }
  });

export type GitLabFormValues = z.infer<typeof gitLabFormSchema>;
export type AIFormValues = z.infer<typeof aiFormSchema>;
