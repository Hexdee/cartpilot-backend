import { NextFunction, Request, Response } from "express";
import { env } from "@/config/env";
import { HttpError } from "@/lib/http-error";

export function adminAuthMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  const authorization = request.headers.authorization;
  const token = authorization?.replace(/^Bearer\s+/i, "");

  if (!token || token !== env.ADMIN_API_TOKEN) {
    return next(new HttpError(401, "Unauthorized admin request."));
  }

  request.adminActor = "admin-api";
  return next();
}
