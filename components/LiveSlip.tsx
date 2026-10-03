'use client';

import { useEffect, useState } from 'react';
import { clientNetwork } from '@/lib/arc/browser';
import { arcConfig } from '@/lib/arc/config';

// Sample invoice stamped "Final", with Arc's real block height ticking underneath.
export default function LiveSlip() {
  const [block, setBlock] = useState<bigint | null>(null);
  const network = clientNetwork();

  useEffect(() => {
    let alive = true;
    const rpc = arcConfig(network).rpcUrls[0];
    async function tick() {
      try {
        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        });
        const { result } = await res.json();
        if (alive && result) setBlock(BigInt(result));
      } catch {
        // Offline or rate-limited: keep the last value.
      }
    }
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [network]);

  return (
    <div className="live-slip" aria-label="Example invoice settled on Arc">
      <div className="slip">
        <div className="live-head">
          <strong>INV-0042</strong>
          <span className="block" aria-live="off">
            Arc block <b>{block === null ? '…' : block.toLocaleString('en-US')}</b>
          </span>
        </div>
        <div className="total">1,250.00 USDC</div>
        <div className="muted small">Billed to Kemi Adebayo Studio</div>
        <table style={{ marginTop: 14 }}>
          <tbody>
            <tr><td>Identity system</td><td className="num">900.00</td></tr>
            <tr><td>Launch assets</td><td className="num">350.00</td></tr>
          </tbody>
        </table>
        <div className="memo-line">
          Memo attached to the payment
          <span className="mono">memopay:v1:INV-0042:0x9f3c…e1a7</span>
        </div>
        <span className="stamp-final">Final in 0.5s</span>
      </div>
    </div>
  );
}
