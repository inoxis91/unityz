/** Production : NODE_ENV ou variables injectées par Railway. */
export const isProd =
  process.env.NODE_ENV === 'production' ||
  !!process.env.RAILWAY_ENVIRONMENT_NAME ||
  !!process.env.RAILWAY_STATIC_URL;
