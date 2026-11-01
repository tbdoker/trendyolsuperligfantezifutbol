import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tribün',
  description: 'Trendyol Süper Lig için klasik ve draft fantezi futbol',
}

export const viewport: Viewport = {
  themeColor: '#0d0f0c',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* The root layout covers every page, so these fonts load everywhere. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&family=Big+Shoulders:wght@700;800;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
