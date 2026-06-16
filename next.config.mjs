/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the libSQL client (and its optional native addon) out of the bundle so
  // Next loads it via require() at runtime — required for it to work on Vercel.
  serverExternalPackages: ["@libsql/client", "libsql", "imapflow"],
};

export default nextConfig;
