import type { Metadata } from 'next';
import './globals.css';
import AppNav from '@/components/AppNav';

export const metadata: Metadata = {
  title: 'Dhaka Tesla Pool — Share a seat. Split the fare.',
  description: 'Share a seat. Split the fare. Survive Dhaka traffic.',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Sora:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('dtp-theme');if(t!=='dark'&&t!=='light'){t='light'}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`,
          }}
        />
      </head>
      <body>
        <div className="app-shell">
          <AppNav />
          {children}
          <footer className="app-footer">
            <span>Dhaka Tesla Pool · Share a seat · Split the fare · Survive Dhaka traffic</span>
          </footer>
        </div>
      </body>
    </html>
  );
}


