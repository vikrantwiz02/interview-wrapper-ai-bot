import "../styles/globals.css";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Interview Wrapper - AI-Powered Mock Interviews",
  openGraph: {
    title: "Interview Wrapper - AI-Powered Mock Interviews",
    description:
      "Interview Wrapper is an AI-powered mock interview platform that helps you practice for your next job interview.",
    images: [
      {
        url: "https://demo.useliftoff.com/opengraph-image",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Interview Wrapper - AI-Powered Mock Interviews",
    description:
      "Interview Wrapper is an AI-powered mock interview platform that helps you practice for your next job interview.",
    images: ["https://demo.useliftoff.com/opengraph-image"],
    creator: "@vikrantwiz02",
  },
  metadataBase: new URL("https://demo.useliftoff.com"),
  themeColor: "#FFF",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="scroll-smooth antialiased [font-feature-settings:'ss01']">
        {children}
      </body>
    </html>
  );
}
