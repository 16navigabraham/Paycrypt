// components/wallet/WalletManager.tsx
"use client";

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { WalletSelector, WalletStatus } from './WalletSelector';

// Define wallet type based on Privy's wallet interface
interface PrivyWallet {
  address: string;
  walletClientType: string;
  connectorType?: string;
  imported?: boolean;
  [key: string]: any;
}

export function WalletManager() {
  const { wallets } = useWallets();
  const { address } = useAccount();
  const { authenticated } = usePrivy();

  if (!authenticated) return null;

  const hasWallets = wallets.length > 0;
  const hasActiveWallet = Boolean(address);

  return (
    <div className="space-y-4">
      <WalletStatus />
      
      {!hasActiveWallet && (
        <WalletSelector />
      )}
      
      {hasWallets && (
        <div className="text-xs text-muted-foreground">
          <p>💡 You can switch between wallets anytime in your account settings</p>
        </div>
      )}
    </div>
  );
}