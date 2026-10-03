import type { Metadata } from 'next';
import Link from 'next/link';
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google';
import { getMerchant } from '@/lib/auth/current';
import { shortAddr } from '@/lib/format';
import LogoutButton from '@/components/LogoutButton';
import { NavConnect } from '@/components/SignIn';
import './globals.css';

const bricolage = Bricolage_Grotesque({ variable: '--font-bricolage', subsets: ['latin'] });
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MemoPay — invoices that reconcile themselves on Arc',
  description: 'Invoice links paid in USDC or EURC on Arc. Each payment carries the invoice ID on-chain.',
};

// MemoPay mark: an invoice slip with a torn receipt edge and a "paid" stamp (same art as public/logo-mark.svg).
function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M13 9a4 4 0 0 1 4-4h26a4 4 0 0 1 4 4v38l-5.67 5-5.66-5-5.67 5-5.67-5-5.66 5L13 47z" fill="#f4f7fd" />
      <rect x="19" y="13" width="22" height="4.5" rx="2.25" fill="#2775ca" />
      <rect x="19" y="22" width="13" height="3.5" rx="1.75" fill="#8db8ff" />
      <rect x="19" y="29" width="17" height="3.5" rx="1.75" fill="#c9d6f2" />
      <circle cx="45" cy="45" r="13" fill="#0a1530" />
      <circle cx="45" cy="45" r="10" fill="#38cfa9" />
      <path d="M40 45.2l3.4 3.4L50.2 41.6" fill="none" stroke="#0a1530" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const merchant = await getMerchant();
  const mainnet = process.env.NEXT_PUBLIC_ARC_NETWORK === 'mainnet';
  return (
    <html lang="en" className={`${bricolage.variable} ${jetbrains.variable}`}>
      <body>
        <header className="header">
          <div className="container">
            <Link href={merchant ? '/dashboard' : '/'} className="brand">
              <Mark />
              MemoPay
            </Link>
            <nav className="nav" aria-label="Main">
              <span className={`chain-pill${mainnet ? '' : ' testnet'}`}>
                <span className="dot" aria-hidden="true" />
                {mainnet ? 'Arc mainnet' : 'Arc testnet'}
              </span>
              {merchant ? (
                <>
                  <Link href="/dashboard">Invoices</Link>
                  <span className="mono muted addr">{shortAddr(merchant)}</span>
                  <LogoutButton />
                </>
              ) : (
                <NavConnect />
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
