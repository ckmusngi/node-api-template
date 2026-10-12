import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { env } from "../../config/env";
import { errors, json, registry, secured, success } from "../../docs/registry";
import { storage, sniffFileType } from "../../lib/storage";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { ApiResponse } from "../../utils/api-response";
import { AppError, ErrorCode } from "../../utils/app-error";
import { HttpStatus } from "../../utils/http-status";
import { z } from "../../utils/zod";
import { auditContext, recordAudit } from "../audit/audit.service";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (env.UPLOAD_ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    cb(
      new AppError(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        `File type ${file.mimetype} is not allowed`,
      ),
    );
  },
});

export const uploadRouter = Router();

uploadRouter.post(
  "/",
  authenticate,
  authorize("uploads:create"),
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file)
      throw AppError.badRequest('A file is required in the "file" field');

    // The client-provided mimetype is untrusted; confirm it from the file's contents.
    const detected = sniffFileType(file.buffer);
    if (
      !detected ||
      detected.mime !== file.mimetype ||
      !env.UPLOAD_ALLOWED_MIME.includes(detected.mime)
    ) {
      throw new AppError(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        "File contents do not match an allowed type",
      );
    }

    // Never use the original filename in the storage key.
    const key = `${req.user!.id}/${randomUUID()}${detected.ext}`;
    const stored = await storage.put(key, file.buffer, detected.mime);
    await recordAudit(
      {
        action: "upload.created",
        entityType: "upload",
        entityId: key,
        metadata: { size: stored.size, contentType: stored.contentType },
      },
      auditContext(req),
    );
    ApiResponse.created(res, {
      ...stored,
      originalName: file.originalname.slice(0, 255),
    });
  },
);

const UploadSchema = z
  .object({
    key: z.string(),
    url: z.string(),
    size: z.number().int(),
    contentType: z.string(),
    originalName: z.string(),
  })
  .openapi("Upload");

registry.registerPath({
  method: "post",
  path: "/uploads",
  tags: ["Uploads"],
  security: secured,
  summary: "Upload a file",
  description: `multipart/form-data with a single \`file\` field. Max ${env.UPLOAD_MAX_BYTES} bytes. Allowed: ${env.UPLOAD_ALLOWED_MIME.join(", ")}. The type is verified from file contents.`,
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.string().openapi({ type: "string", format: "binary" }),
          }),
        },
      },
    },
  },
  responses: {
    201: json("Stored", success(UploadSchema)),
    400: errors[400],
    401: errors[401],
    413: { description: "File too large" },
    415: { description: "File type not allowed" },
  },
});
