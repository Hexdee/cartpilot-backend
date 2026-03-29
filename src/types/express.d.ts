declare namespace Express {
  interface Request {
    rawBody?: Buffer;
    adminActor?: string;
  }
}
