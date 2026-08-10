import { z } from "zod";

export const createWorkspaceBodySchema = z.object({
  businessName: z.string().trim().min(1, "Enter your business name.").max(200),
  website: z.string().trim().min(1, "Enter your website.").max(300),
  country: z.string().trim().min(1, "Select a country.").max(100),
  companySize: z.string().trim().min(1, "Select a company size.").max(50),
});

export const updateWorkspaceBodySchema = z.object({
  businessName: z.string().trim().min(1).max(200).optional(),
  website: z.string().trim().min(1).max(300).optional(),
  country: z.string().trim().min(1).max(100).optional(),
  companySize: z.string().trim().min(1).max(50).optional(),
});

export const workspaceIdParamsSchema = z.object({
  workspaceId: z.string().min(1),
});
