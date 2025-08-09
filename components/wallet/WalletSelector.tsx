// components/wallet/WalletSelector.tsx
"use client";

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, ExternalLink, Smartphone, Shield } from 'lucide-react';
import { useState } from 'react';

// Define wallet type based on Privy's wallet interface
interface PrivyWallet {
  address: string;
  walletClientType: string;
  connectorType?: string;
  imported?: boolean;
  [key: string]: any;
}

export function WalletSelector() {
  const { connectWallet, createWallet, user, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { address } = useAccount();
  const [isCreating, setIsCreating] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const embeddedWallet = wallets.find((wallet: PrivyWallet) => wallet.walletClientType === 'privy');
  const externalWallets = wallets.filter((wallet: PrivyWallet) => wallet.walletClientType !== 'privy');
  const hasActiveWallet = Boolean(address);

  const handleCreateEmbeddedWallet = async () => {
    if (!authenticated) return;
    
    setIsCreating(true);
    try {
      await createWallet();
    } catch (error) {
      console.error('Failed to create embedded wallet:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleConnectExternalWallet = async () => {
    setIsConnecting(true);
    try {
      await connectWallet();
    } catch (error) {
      console.error('Failed to connect external wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  if (!authenticated) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Please log in to manage your wallets
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Choose Your Wallet
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select how you want to store and manage your crypto
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Embedded Wallet Option */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-500" />
                <h3 className="font-semibold">Built-in Wallet</h3>
                <Badge variant="secondary">Recommended</Badge>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground">
              Easy to use, no browser extension needed. Perfect for beginners and seamless transactions.
            </p>
            
            <div className="flex items-center gap-2 text-xs text-green-600">
              <Shield className="w-3 h-3" />
              <span>Secured by your account • No seed phrases to manage</span>
            </div>
            
            {embeddedWallet ? (
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="font-medium">Built-in wallet ready</span>
                </div>
                <p className="text-xs text-green-600 mt-1 font-mono">
                  {embeddedWallet.address.slice(0, 6)}...{embeddedWallet.address.slice(-4)}
                </p>
              </div>
            ) : (
              <Button 
                onClick={handleCreateEmbeddedWallet} 
                disabled={isCreating}
                className="w-full"
              >
                {isCreating ? "Creating..." : "Create Built-in Wallet"}
              </Button>
            )}
          </div>

          {/* External Wallet Option */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-orange-500" />
              <h3 className="font-semibold">External Wallet</h3>
            </div>
            
            <p className="text-sm text-muted-foreground">
              Connect MetaMask, Coinbase Wallet, or other wallets you already have.
            </p>
            
            {externalWallets.length > 0 ? (
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="font-medium">External wallet connected</span>
                </div>
                <p className="text-xs text-green-600 mt-1 font-mono">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>
            ) : (
              <Button 
                onClick={handleConnectExternalWallet} 
                variant="outline"
                disabled={isConnecting}
                className="w-full"
              >
                {isConnecting ? "Connecting..." : "Connect External Wallet"}
              </Button>
            )}
          </div>

          {/* Current Status */}
          {hasActiveWallet && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-sm text-blue-700 font-medium">
                ✅ Wallet connected and ready for transactions
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// components/wallet/WalletStatus.tsx
export function WalletStatus() {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { authenticated } = usePrivy();
  
  if (!authenticated || !address) return null;
  
  const activeWallet = wallets.find((wallet: PrivyWallet) => wallet.address === address);
  const isEmbeddedWallet = activeWallet?.walletClientType === 'privy';
  const walletType = isEmbeddedWallet ? 'Built-in' : 'External';
  const walletIcon = isEmbeddedWallet ? '📱' : '🔗';
  
  return (
    <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 rounded-full px-3 py-1">
      <span>{walletIcon}</span>
      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
      <span className="font-medium">{walletType} Wallet</span>
      <span className="text-muted-foreground font-mono">
        {address.slice(0, 4)}...{address.slice(-4)}
      </span>
    </div>
  );
}