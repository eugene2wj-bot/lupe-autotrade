import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '루프 — 무한매수법 가장 쉬운 매매 도우미',
  description:
    '무한매수법, 어렵게 계산하지 마세요. 회차별 매수·매도 가격을 자동으로 알려주고, 매매 기록까지 간편하게 관리할 수 있습니다.',
  keywords: '무한매수법,밸류리밸런싱,라오어,분할매수,분할매도,해외주식,매매 가이드,루프,Lupe,주식 투자',
  authors: [{ name: 'Lupe' }],
  robots: 'index, follow',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="bg-[#f2f2f7] dark:bg-gray-950 text-gray-900 dark:text-gray-50 min-h-screen font-sans antialiased">
        {/* 네비게이션 */}
        <nav className="sticky top-0 z-30 bg-white/85 dark:bg-gray-950/85 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <a className="flex items-center gap-1.5" href="/">
              <div className="w-[22px] h-[22px] rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center">
                <span className="text-white text-[11px] font-black">L</span>
              </div>
              <span className="text-sm font-bold bg-gradient-to-r from-indigo-600 dark:from-indigo-500 to-indigo-500 dark:to-indigo-400 bg-clip-text text-transparent">
                루프
              </span>
            </a>
            <a
              href="/settings/auto-trade"
              className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-gray-100 dark:bg-gray-900 px-3 py-1.5 rounded-full transition-colors"
            >
              <span>🤖 자동매매 설정</span>
            </a>
          </div>
        </nav>

        <main className="max-w-6xl mx-auto px-4 py-6 pb-24">
          {children}
        </main>
      </body>
    </html>
  );
}
