/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module — keep it out of the bundle so Next
  // loads it via require() at runtime instead of trying to webpack it.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
