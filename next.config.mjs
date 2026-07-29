/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // TypeScript 7 is the native compiler and no longer exposes the JS compiler
  // API Next.js uses for its built-in type check. This routes the build's
  // check through the `tsc` CLI instead. `npm run typecheck` runs the same
  // compiler directly, so type errors surface either way.
  experimental: { useTypeScriptCli: true },
};

export default nextConfig;
