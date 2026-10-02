import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "Plinth";
const base = import.meta.env.BASE_URL;
const onPages = base !== "/";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no",
      },
      { title: APP_NAME },
      {
        name: "description",
        content: "Inspect STL files on your phone. Load several, show or hide each one, orbit or fly around.",
      },
      { name: "theme-color", content: "#0c0e11" },
      ...(onPages
        ? [
            { name: "mobile-web-app-capable", content: "yes" },
            { name: "apple-mobile-web-app-capable", content: "yes" },
            { name: "apple-mobile-web-app-title", content: APP_NAME },
            { name: "apple-mobile-web-app-status-bar-style", content: "black" },
          ]
        : []),
    ],
    links: onPages
      ? [
          { rel: "icon", type: "image/svg+xml", href: `${base}favicon.svg` },
          { rel: "stylesheet", href: appCss },
          { rel: "manifest", href: `${base}manifest.webmanifest` },
          { rel: "apple-touch-icon", href: `${base}__grok/icon-180.png` },
        ]
      : [
          { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
          { rel: "stylesheet", href: appCss },
          { rel: "manifest", href: "/__grok/manifest.webmanifest" },
          { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
        ],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
