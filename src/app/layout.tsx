import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getSiteSettings } from "@/server/actions/site-settings";
import { themeColorCSS, type ThemeColorKey } from "@/lib/theme-colors";
import { cn } from "@/lib/utils";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    title: settings.siteName,
    description: `${settings.siteName} · 内部管理系统`,
    icons: {
      icon: "/favicon.ico",
      apple: "/apple-icon.png",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSiteSettings();
  const css = themeColorCSS(settings.themeColor as ThemeColorKey);

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>{css && <style dangerouslySetInnerHTML={{ __html: css }} />}</head>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          GeistSans.variable,
          GeistMono.variable
        )}
      >
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster position="top-center" richColors closeButton theme="system" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
