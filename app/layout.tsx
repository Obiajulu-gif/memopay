import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { getMerchant } from '@/lib/auth/current';
import { shortAddr } from '@/lib/format';
import LogoutButton from '@/components/LogoutButton';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MemoPay — invoices that reconcile themselves',
  description: 'Invoice links paid in USDC or EURC on Arc. Each payment carries the invoice ID on-chain.',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const merchant = await getMerchant();
  const testnet = process.env.NEXT_PUBLIC_ARC_NETWORK !== 'mainnet';
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <header className="header">
          <div className="container">
            <Link href={merchant ? '/dashboard' : '/'} className="brand">
              Memo<span>Pay</span>
            </Link>
            <nav className="nav">
              {testnet && <span className="badge badge-open">Arc Testnet</span>}
              {merchant && (
                <>
                  <Link href="/dashboard">Invoices</Link>
                  <span className="mono muted">{shortAddr(merchant)}</span>
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
