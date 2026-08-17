/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // `sharp` est natif : il ne doit pas être empaqueté par le bundler serveur.
  serverExternalPackages: ["sharp", "puppeteer-core", "@sparticuz/chromium", "unpdf"],
};

export default config;
