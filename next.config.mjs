/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the libSQL client (and its optional native addon) out of the bundle so
  // Next loads it via require() at runtime — required for it to work on Vercel.
  // postgres.js opens raw TCP/TLS sockets; keep it out of the bundle so Next
  // require()s it at runtime (same reason as imapflow).
  serverExternalPackages: ["imapflow", "postgres"],
};

export default nextConfig;
