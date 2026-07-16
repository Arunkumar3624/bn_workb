import { z } from "zod";

// ~8MB raw image, base64-inflated (~4/3x) plus the "data:image/...;base64,"
// prefix — real object storage (S3/GCS) is what a general file-upload
// feature needs; this is deliberately small, image-only, stored as a data
// URL the same way users.avatar_url already is.
const MAX_IMAGE_DATA_LENGTH = 11_500_000;

const linkSubmissionSchema = z.object({
  type: z.literal("link"),
  url: z.string().url("Enter a valid link (Google Drive, Dropbox, etc.)"),
  caption: z.string().max(500).optional(),
});

const imageSubmissionSchema = z.object({
  type: z.literal("image"),
  imageData: z
    .string()
    .startsWith("data:image/", "Must be an image file")
    .max(MAX_IMAGE_DATA_LENGTH, "Image is too large — please use a link instead for files over ~8MB"),
  caption: z.string().max(500).optional(),
});

export const createSubmissionSchema = z.discriminatedUnion("type", [
  linkSubmissionSchema,
  imageSubmissionSchema,
]);

export const reviewSubmissionSchema = z.object({
  approved: z.boolean(),
  rejectionReason: z.string().max(500).optional(),
});
