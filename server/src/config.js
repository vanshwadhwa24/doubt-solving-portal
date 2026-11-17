// Central configuration, overridable via environment variables.
export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://portal:portal@localhost:5432/doubt_portal',
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 72),
  uploadDir: process.env.UPLOAD_DIR || new URL('../uploads', import.meta.url).pathname,
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024),
  clientDist: process.env.CLIENT_DIST || new URL('../../client/dist', import.meta.url).pathname,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramStudentEmail: process.env.TELEGRAM_STUDENT_EMAIL || '',
  telegramDefaultCourse: process.env.TELEGRAM_DEFAULT_COURSE || '',
};
