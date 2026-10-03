import type { Metadata } from 'next';
import Link from 'next/link';
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google';
import { getMerchant } from '@/lib/auth/current';
import { shortAddr } from '@/lib/format';
import LogoutButton from '@/components/LogoutButton';
import './globals.css';

const bricolage = Bricolage_Grotesque({ variable: '--font-bricolage', subsets: ['latin'] });
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MemoPay — invoices that reconcile themselves on Arc',
  description: 'Invoice links paid in USDC or EURC on Arc. Each payment carries the invoice ID on-chain.',
};

// A slip with a memo stamp: the product in one mark.
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <path d="M5 3h16v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L5 21z" fill="#f4f7fd" />
      <rect x="8" y="7" width="10" height="1.8" rx=".9" fill="#2775ca" />
      <rect x="8" y="11" width="6" height="1.8" rx=".9" fill="#8db8ff" />
      <circle cx="17" cy="15.5" r="3.2" fill="none" stroke="#38cfa9" strokeWidth="1.6" />
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
              {merchant && (
                <>
                  <Link href="/dashboard">Invoices</Link>
                  <span className="mono muted addr">{shortAddr(merchant)}</span>
                  <LogoutButton />
                </>
              )}
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
