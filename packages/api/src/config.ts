const list = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  mongoUri: process.env.MONGODB_URI ?? "mongodb://localhost:27018/sumi?replicaSet=rs0&directConnection=true",
  port: Number(process.env.PORT ?? 3000),
  /** Where people open the web app. GitHub sign-in sends the browser back here. */
  publicUrl: process.env.SUMI_PUBLIC_URL ?? "http://localhost:5173",
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  githubAllowedLogins: list(process.env.GITHUB_ALLOWED_LOGINS),
};

/** GitHub sign-in is on when a client id and secret are set. It then requires an explicit allow-list. */
export function githubOptions() {
  const { githubClientId: clientId, githubClientSecret: clientSecret, githubAllowedLogins: allowedLogins } = config;
  if (!clientId && !clientSecret) return undefined;
  if (!clientId || !clientSecret) {
    throw new Error("Set both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, or neither.");
  }
  if (allowedLogins.length === 0) {
    throw new Error(
      "GITHUB_ALLOWED_LOGINS is empty. Set it to a comma-separated list of GitHub logins; otherwise anyone with a GitHub account could sign in.",
    );
  }
  return { clientId, clientSecret, publicUrl: config.publicUrl, allowedLogins };
}
