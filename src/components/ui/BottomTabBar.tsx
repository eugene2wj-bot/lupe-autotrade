'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function HouseIcon({ size = 20, strokeWidth = 2, className = '' }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function CircleCheckIcon({ size = 20, strokeWidth = 2, className = '' }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SettingsIcon({ size = 20, strokeWidth = 2, className = '' }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const navItems = [
  { href: '/', label: '홈', icon: HouseIcon },
  { href: '/completed', label: '완료', icon: CircleCheckIcon },
  { href: '/settings', label: '설정', icon: SettingsIcon },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pointer-events-none"
      style={{
        paddingBottom: 'calc(max(env(safe-area-inset-bottom), var(--app-safe-area-bottom, 0px), 0.25rem) + 0.75rem)',
      }}
    >
      <nav
        className="pointer-events-auto flex items-stretch gap-1 p-1.5 rounded-28 bg-white/45 dark:bg-gray-900/50 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-1px_0_rgba(255,255,255,0.15),0_10px_40px_-8px_rgba(0,0,0,0.22),0_4px_12px_-2px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.4),0_10px_40px_-8px_rgba(0,0,0,0.55),0_4px_12px_-2px_rgba(0,0,0,0.3)]"
      >
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex flex-col items-center justify-center gap-0.5 min-w-[68px] px-3 py-1.5 rounded-20 transition-all duration-200 ease-out active:scale-95 ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-200 bg-gradient-to-b from-white/80 to-white/55 dark:from-indigo-400/25 dark:to-indigo-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(99,102,241,0.08),0_1px_2px_rgba(99,102,241,0.15),0_2px_6px_-1px_rgba(99,102,241,0.18)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(0,0,0,0.2),0_1px_2px_rgba(0,0,0,0.3),0_2px_6px_-1px_rgba(99,102,241,0.25)] ring-1 ring-inset ring-white/40 dark:ring-white/10'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Icon
                size={20}
                strokeWidth={isActive ? 2.5 : 2}
                className={`transition-transform duration-200 ${
                  isActive ? 'drop-shadow-[0_1px_1px_rgba(99,102,241,0.3)]' : ''
                }`}
              />
              <span className={`text-[10px] leading-none tracking-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
