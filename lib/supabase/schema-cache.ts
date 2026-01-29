const schemaErrorMatchers = [
  "schema cache",
  "does not exist",
  "relation does not exist",
];

export const isSchemaCacheError = (error?: { message?: string } | null) => {
  const message = (error?.message ?? "").toLowerCase();
  if (!message) {
    return false;
  }
  return schemaErrorMatchers.some((matcher) => message.includes(matcher));
};

export const schemaCacheBannerMessage =
  "Database schema is updating. Please refresh in a moment.";
