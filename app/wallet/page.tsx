// app/wallet/page.tsx - Enhanced wallet management page with fixed types
"use client";

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WalletManager } from '@/components/wallet/WalletManager';
import { Copy, ExternalLink, Download, Settings, Wallet, Shield } from 'lucide-react';
import { toast } from 'sonner';
import BackToDashboard from '@/components/BackToDashboard';
import AuthGuard from '@/components/AuthGuard';

// Define wallet type based on Privy's wallet interface
interface PrivyWallet {
  address: string;
  walletClientType: string;
  connectorType?: string;
  imported?: boolean;
  [key: string]: any;
}

export default function WalletPage() {
  const { user, authenticated, exportWallet } = usePrivy();
  const { wallets } = useWallets();
  const { address } = useAccount();
  const [exportingWallet, setExportingWallet] = useState(false);

  const embeddedWallet = wallets.find((wallet: PrivyWallet) => wallet.walletClientType === 'privy');
  const externalWallets = wallets.filter((wallet: PrivyWallet) => wallet.walletClientType !== 'privy');
  const activeWallet = wallets.find((wallet: PrivyWallet) => wallet.address === address);

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast.success('Address copied to clipboard!');
  };

  const handleExportWallet = async () => {
    if (!embeddedWallet) return;
    
    setExportingWallet(true);
    try {
      await exportWallet();
      toast.success('Wallet export initiated. Follow the prompts in your browser.');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export wallet. Please try again.');
    } finally {
      setExportingWallet(false);
    }
  };

  const openInExplorer = (addr: string) => {
    window.open(`https://basescan.org/address/${addr}`, '_blank');
  };

  if (!authenticated) {
    return (
      <AuthGuard>
        <div className="container py-10 max-w-4xl mx-auto">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Please log in to access your wallet</h1>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="container py-10 max-w-4xl mx-auto">
        <BackToDashboard />
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Wallet Management</h1>
          <p className="text-muted-foreground">
            Manage your embedded and external wallets for crypto transactions
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="manage">Manage Wallets</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Active Wallet Status */}
            {address && activeWallet && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="w-5 h-5" />
                    Active Wallet
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <div>
                          <p className="font-medium">
                            {activeWallet.walletClientType === 'privy' ? '📱 Built-in Wallet' : '🔗 External Wallet'}
                          </p>
                          <p className="text-sm text-muted-foreground font-mono">
                            {address}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => copyAddress(address)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openInExplorer(address)}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-muted-foreground">Wallet Type</p>
                        <p className="font-medium">
                          {activeWallet.walletClientType === 'privy' ? 'Embedded' : 'External'}
                        </p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-muted-foreground">Network</p>
                        <p className="font-medium">Base Mainnet</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-muted-foreground">Status</p>
                        <Badge variant="secondary" className="bg-green-100 text-green-700">Connected</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* All Wallets Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Your Wallets ({wallets.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {embeddedWallet && (
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          📱
                        </div>
                        <div>
                          <p className="font-medium">Built-in Wallet</p>
                          <p className="text-sm text-muted-foreground font-mono">
                            {embeddedWallet.address.slice(0, 6)}...{embeddedWallet.address.slice(-4)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {address === embeddedWallet.address && (
                          <Badge variant="secondary">Active</Badge>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => copyAddress(embeddedWallet.address)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {externalWallets.map((wallet: PrivyWallet, index: number) => (
                    <div key={wallet.address} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                          🔗
                        </div>
                        <div>
                          <p className="font-medium">External Wallet #{index + 1}</p>
                          <p className="text-sm text-muted-foreground font-mono">
                            {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {address === wallet.address && (
                          <Badge variant="secondary">Active</Badge>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => copyAddress(wallet.address)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {wallets.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No wallets connected</p>
                      <p className="text-sm">Create a built-in wallet or connect an external one to get started</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage" className="space-y-6">
            <WalletManager />
            
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {embeddedWallet && (
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Export Built-in Wallet</p>
                      <p className="text-sm text-muted-foreground">
                        Download your wallet's private key as a backup
                      </p>
                    </div>
                    <Button 
                      variant="outline"
                      onClick={handleExportWallet}
                      disabled={exportingWallet}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {exportingWallet ? 'Exporting...' : 'Export'}
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">View on Block Explorer</p>
                    <p className="text-sm text-muted-foreground">
                      Check your wallet activity on BaseScan
                    </p>
                  </div>
                  <Button 
                    variant="outline"
                    onClick={() => address && openInExplorer(address)}
                    disabled={!address}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Security Features
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <Shield className="w-5 h-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-800">Built-in Wallet Security</p>
                      <p className="text-sm text-green-700">
                        Your built-in wallet is secured by Trusted Execution Environments (TEEs) and only you can access your keys.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Security Features:</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        Hardware-level security for key storage
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        Keys never leave secure environments
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        Account-based recovery (no seed phrases needed)
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        Export capability for full ownership
                      </li>
                    </ul>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      💡 <strong>Pro tip:</strong> Built-in wallets provide bank-level security while maintaining self-custody. 
                      You can always export your keys if you want to use them in other wallet apps.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Best Practices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">🔐</span>
                    <div>
                      <p className="font-medium">Keep your account secure</p>
                      <p className="text-muted-foreground">Use strong passwords and enable 2FA on your Paycrypt account</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-lg">💾</span>
                    <div>
                      <p className="font-medium">Export your built-in wallet</p>
                      <p className="text-muted-foreground">Consider exporting as a backup, especially for larger amounts</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-lg">🌐</span>
                    <div>
                      <p className="font-medium">Verify transactions</p>
                      <p className="text-muted-foreground">Always check transaction details before confirming</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-lg">🔄</span>
                    <div>
                      <p className="font-medium">Use both wallet types</p>
                      <p className="text-muted-foreground">Built-in for convenience, external for larger holdings</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AuthGuard>
  );
}