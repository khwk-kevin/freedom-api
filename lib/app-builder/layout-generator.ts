/**
 * Generates a customized layout.tsx that sets the correct <title>,
 * meta description, favicon, and background color for each merchant.
 */

import type { MerchantAppSpec } from './types';

export function generateCustomLayoutTsx(spec: MerchantAppSpec): string {
  const name = spec.businessName || 'Your App';
  const description = (spec.ideaDescription || `${name} — powered by Freedom World`).slice(0, 160);
  const bgColor = spec.scrapedData?.backgroundColor || '#050314';

  // Escape for safe embedding in template literal
  const safeName = name.replace(/"/g, '\\"').replace(/`/g, '\\`');
  const safeDesc = description.replace(/"/g, '\\"').replace(/`/g, '\\`');

  return `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "${safeName}",
  description: "${safeDesc}",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={\`\${inter.variable} antialiased\`}
        style={{ backgroundColor: "${bgColor}", margin: 0 }}
      >
        {children}
      </body>
    </html>
  );
}
`;
}
