// Which commit this deploy was built from. The nightly job compares it with the newest commit that
// changed the site (pipeline/deploy-check.mjs) to notice a deploy that failed or never ran.
export const GET = () => new Response(JSON.stringify({
  commit: process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? 'unknown',
  builtAt: new Date().toISOString(),
}), { headers: { 'Content-Type': 'application/json' } });
