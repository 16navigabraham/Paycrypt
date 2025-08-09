// app/wallet/page.tsx - Enhanced wallet page with deposit/withdraw
"use client";

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Copy, ExternalLink, Download, Settings, Wallet, Shield, Plus, ArrowUpRight, ArrowDownLeft, QrCode } from 'lucide-react';
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
  const { user, authenticated, exportWallet, sendTransaction } = usePrivy();
  const { wallets } = useWallets();
  const { address } = useAccount();
  const [exportingWallet, setExportingWallet] = useState(false);
  
  // Withdraw state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

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

  const handleDeposit = () => {
    if (!embeddedWallet?.address) {
      toast.error("No wallet address found");
      return;
    }
    
    // Copy address and show QR code info
    copyAddress(embeddedWallet.address);
    toast.success("Wallet address copied! You can now deposit funds to this address on Base network");
  };

  const handleWithdraw = async () => {
    if (!embeddedWallet || !withdrawAddress || !withdrawAmount) {
      toast.error("Please fill in all withdrawal details");
      return;
    }

    // Basic validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(withdrawAddress)) {
      toast.error("Please enter a valid Ethereum address");
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsWithdrawing(true);
    try {
      // Note: This is a basic ETH transfer example
      // You'll need to modify this based on your token requirements
      const txHash = await sendTransaction({
        to: withdrawAddress,
        value: (amount * 1e18).toString(), // Convert to wei for ETH
      });
      
      toast.success(`Withdrawal initiated! Transaction: ${txHash}`);
      setShowWithdrawModal(false);
      setWithdrawAddress('');
      setWithdrawAmount('');
    } catch (error: any) {
      console.error('Withdrawal failed:', error);
      toast.error(error.message || "Withdrawal failed. Please try again.");
    } finally {
      setIsWithdrawing(false);
    }
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
            Manage your built-in wallet for crypto transactions
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="deposit">Deposit</TabsTrigger>
            <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Active Wallet Status */}
            {embeddedWallet && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="w-5 h-5" />
                    Your Built-in Wallet
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <div>
                          <p className="font-medium">📱 Built-in Wallet</p>
                          <p className="text-sm text-muted-foreground font-mono">
                            {embeddedWallet.address}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => copyAddress(embeddedWallet.address)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openInExplorer(embeddedWallet.address)}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-muted-foreground">Wallet Type</p>
                        <p className="font-medium">Built-in</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-muted-foreground">Network</p>
                        <p className="font-medium">Base Mainnet</p>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <p className="text-muted-foreground">Status</p>
                        <Badge variant="secondary" className="bg-green-100 text-green-700">Ready</Badge>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex gap-3 pt-4">
                      <Button onClick={handleDeposit} className="flex-1">
                        <ArrowDownLeft className="w-4 h-4 mr-2" />
                        Deposit
                      </Button>
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => setShowWithdrawModal(true)}
                      >
                        <ArrowUpRight className="w-4 h-4 mr-2" />
                        Withdraw
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Wallet Features */}
            <Card>
              <CardHeader>
                <CardTitle>Wallet Features</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <Shield className="w-8 h-8 mx-auto mb-2 text-green-500" />
                    <h3 className="font-medium mb-1">Secure</h3>
                    <p className="text-sm text-muted-foreground">Protected by your account</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <QrCode className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                    <h3 className="font-medium mb-1">Easy Deposits</h3>
                    <p className="text-sm text-muted-foreground">Copy address to receive funds</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <ArrowUpRight className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                    <h3 className="font-medium mb-1">Quick Withdrawals</h3>
                    <p className="text-sm text-muted-foreground">Send to any Base address</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deposit" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowDownLeft className="w-5 h-5" />
                  Deposit Funds
                </CardTitle>
                <CardDescription>
                  Send crypto to your built-in wallet on Base network
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {embeddedWallet && (
                  <>
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h3 className="font-medium text-blue-800 mb-2">Your Wallet Address</h3>
                      <div className="flex items-center justify-between p-3 bg-white border rounded font-mono text-sm">
                        <span className="break-all">{embeddedWallet.address}</span>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => copyAddress(embeddedWallet.address)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-4 border rounded-lg">
                        <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                          <span className="text-green-600 text-sm font-bold">1</span>
                        </div>
                        <div>
                          <h4 className="font-medium">Copy your wallet address</h4>
                          <p className="text-sm text-muted-foreground">Use the address above to receive funds</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-4 border rounded-lg">
                        <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 text-sm font-bold">2</span>
                        </div>
                        <div>
                          <h4 className="font-medium">Send from Base network only</h4>
                          <p className="text-sm text-muted-foreground">Ensure you're sending from Base mainnet</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-4 border rounded-lg">
                        <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                          <span className="text-purple-600 text-sm font-bold">3</span>
                        </div>
                        <div>
                          <h4 className="font-medium">Wait for confirmation</h4>
                          <p className="text-sm text-muted-foreground">Funds will appear after blockchain confirmation</p>
                        </div>
                      </div>
                    </div>

                    <Button onClick={handleDeposit} className="w-full" size="lg">
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Deposit Address
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowUpRight className="w-5 h-5" />
                  Withdraw Funds
                </CardTitle>
                <CardDescription>
                  Send crypto from your built-in wallet to another address
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-orange-600" />
                    <h3 className="font-medium text-orange-800">Important Notes</h3>
                  </div>
                  <ul className="text-sm text-orange-700 space-y-1">
                    <li>• Only send to Base network addresses</li>
                    <li>• Double-check the recipient address</li>
                    <li>• Transactions cannot be reversed</li>
                    <li>• Keep some ETH for gas fees</li>
                  </ul>
                </div>

                <Button 
                  onClick={() => setShowWithdrawModal(true)}
                  className="w-full"
                  size="lg"
                >
                  <ArrowUpRight className="w-4 h-4 mr-2" />
                  Start Withdrawal
                </Button>
              </CardContent>
            </Card>

            {/* Withdrawal Modal */}
            <Dialog open={showWithdrawModal} onOpenChange={setShowWithdrawModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Withdraw Funds</DialogTitle>
                  <DialogDescription>
                    Send crypto from your built-in wallet to another address
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="withdraw-address">Recipient Address</Label>
                    <Input
                      id="withdraw-address"
                      placeholder="0x..."
                      value={withdrawAddress}
                      onChange={(e) => setWithdrawAddress(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="withdraw-amount">Amount (ETH)</Label>
                    <Input
                      id="withdraw-amount"
                      type="number"
                      placeholder="0.001"
                      step="0.001"
                      min="0"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowWithdrawModal(false)}
                      className="flex-1"
                      disabled={isWithdrawing}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleWithdraw}
                      disabled={!withdrawAddress || !withdrawAmount || isWithdrawing}
                      className="flex-1"
                    >
                      {isWithdrawing ? "Sending..." : "Send"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
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
                </div>

                {/* Export Wallet */}
                {embeddedWallet && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Export Wallet</CardTitle>
                      <CardDescription>
                        Download your wallet's private key as a backup
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        variant="outline"
                        onClick={handleExportWallet}
                        disabled={exportingWallet}
                        className="w-full"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {exportingWallet ? 'Exporting...' : 'Export Private Key'}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Pro tip:</strong> Built-in wallets provide bank-level security while maintaining self-custody. 
                    You can always export your keys if you want to use them in other wallet apps.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AuthGuard>
  );
}