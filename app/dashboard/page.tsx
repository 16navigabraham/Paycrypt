"use client";

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import dynamic from 'next/dynamic'
import { MainLayout } from "@/components/layout/main-layout"
import { PortfolioOverview } from "@/components/dashboard/portfolio-overview"
import { QuickActions } from "@/components/dashboard/quick-actions"
import RecentTransactions from "@/components/dashboard/recent-transactions"
import { MarketData } from "@/components/dashboard/market-data"
import { Button } from "@/components/ui/button"
import { Menu, User, LogOut, Copy, CheckCircle, Wifi, WifiOff } from "lucide-react"
import { Sidebar } from "@/components/layout/sidebar"
import { Badge } from "@/components/ui/badge"

interface UserData {
  fid: string;
  username: string;
  displayName: string;
  walletAddress: string;
  pfpUrl: string;
}

interface FarcasterWallet {
  address: string;
  chainId: string;
  connectedAt: string;
}

// AuthGuard Component with Mini App Flow
function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [wagmiHooks, setWagmiHooks] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load wagmi hooks dynamically on client side
  useEffect(() => {
    async function loadWagmiHooks() {
      try {
        const { useAccount } = await import('wagmi');
        setWagmiHooks({ useAccount });
      } catch (error) {
        console.error('Error loading wagmi hooks:', error);
        setWagmiHooks({});
      }
    }
    loadWagmiHooks();
  }, []);

  const accountHook = wagmiHooks?.useAccount?.();
  const address = accountHook?.address;
  const isConnected = accountHook?.isConnected;

  useEffect(() => {
    if (!wagmiHooks) return; // Wait for wagmi to load

    // For mini app flow - assume wallet will be connected automatically
    // Check for both live connection and stored wallet data
    const storedWalletAddress = localStorage.getItem('paycrypt_wallet_address');
    
    if (isConnected && address) {
      // Wallet is actively connected via wagmi
      localStorage.setItem('paycrypt_wallet_address', address);
      setIsAuthenticated(true);
      setIsLoading(false);
      console.log('✅ Live wallet connection detected in dashboard');
    } else if (storedWalletAddress) {
      // Mini app flow - wallet data from home page setup
      setIsAuthenticated(true);
      setIsLoading(false);
      console.log('✅ Mini app wallet data found in dashboard');
    } else {
      // No wallet data - wait a bit for mini app setup, then redirect
      console.log('⏳ Waiting for mini app wallet setup...');
      const timeout = setTimeout(() => {
        console.log('❌ No wallet data found, redirecting to home');
        router.replace('/');
      }, 3000); // Give 3 seconds for mini app setup
      
      return () => clearTimeout(timeout);
    }
  }, [router, isConnected, address, wagmiHooks]);

  if (!wagmiHooks || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Setting up Dashboard...</p>
          <p className="text-sm text-gray-500 mt-2">Connecting your Farcaster wallet...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // AuthGuard will redirect
  }

  return <>{children}</>;
}

// Dashboard Component with Mini App Integration
function DashboardClient() {
  const router = useRouter();
  const [wagmiHooks, setWagmiHooks] = useState<any>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<FarcasterWallet | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'live' | 'cached' | 'connecting'>('connecting');

  // Load wagmi hooks dynamically on client side
  useEffect(() => {
    async function loadWagmiHooks() {
      try {
        const { useAccount } = await import('wagmi');
        setWagmiHooks({ useAccount });
      } catch (error) {
        console.error('Error loading wagmi hooks:', error);
        setWagmiHooks({});
      }
    }
    loadWagmiHooks();
  }, []);

  const accountHook = wagmiHooks?.useAccount?.();
  const address = accountHook?.address;
  const isConnected = accountHook?.isConnected;

  useEffect(() => {
    if (!wagmiHooks) return; // Wait for wagmi to load

    // Load user data - prioritize live connection, fallback to stored data
    const currentWalletAddress = address || localStorage.getItem('paycrypt_wallet_address');
    const fid = localStorage.getItem('paycrypt_fid');
    const username = localStorage.getItem('paycrypt_username');
    const displayName = localStorage.getItem('paycrypt_display_name');
    const pfpUrl = localStorage.getItem('paycrypt_pfp');
    
    if (currentWalletAddress) {
      // Determine connection status
      if (isConnected && address) {
        setConnectionStatus('live');
        // Update stored address if live connection differs
        if (address !== localStorage.getItem('paycrypt_wallet_address')) {
          localStorage.setItem('paycrypt_wallet_address', address);
        }
      } else {
        setConnectionStatus('cached');
      }

      setUserData({
        fid: fid || '',
        username: username || '',
        displayName: displayName || username || 'Farcaster User',
        walletAddress: currentWalletAddress,
        pfpUrl: pfpUrl || ''
      });
      
      // Create wallet object compatible with existing components
      setConnectedWallet({
        address: currentWalletAddress,
        chainId: '8453', // Base chain ID
        connectedAt: new Date().toISOString()
      });

      console.log('🎯 Dashboard loaded with wallet:', currentWalletAddress);
      console.log('📱 Connection status:', isConnected ? 'live' : 'cached');
    }
  }, [address, isConnected, wagmiHooks]);

  const handleLogout = () => {
    localStorage.removeItem('paycrypt_wallet_address');
    localStorage.removeItem('paycrypt_fid');
    localStorage.removeItem('paycrypt_username');
    localStorage.removeItem('paycrypt_display_name');
    localStorage.removeItem('paycrypt_pfp');
    router.replace('/');
  };

  const copyAddress = async () => {
    if (userData?.walletAddress) {
      await navigator.clipboard.writeText(userData.walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getConnectionBadge = () => {
    switch (connectionStatus) {
      case 'live':
        return (
          <Badge className="bg-gradient-to-r from-green-500 to-blue-600 text-white border-0">
            <Wifi className="h-3 w-3 mr-1" />
            Live Connection
          </Badge>
        );
      case 'cached':
        return (
          <Badge className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
            <WifiOff className="h-3 w-3 mr-1" />
            Mini App Connected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-yellow-700 border-yellow-300">
            Connecting...
          </Badge>
        );
    }
  };

  const authenticated = !!userData;

  // Don't render until wagmi hooks are loaded
  if (!wagmiHooks) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      {/* Desktop overlay when sidebar is open */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/50 hidden lg:block" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Your existing Sidebar component */}
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
      />

      <div className="space-y-6">
        {/* Enhanced Header Section with Mini App Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Toggle Button - Inline with header */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="bg-background border shadow-md hover:bg-accent"
            >
              <Menu className="h-5 w-5" />
            </Button>
            
            <div className="flex flex-col space-y-2">
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                {userData && getConnectionBadge()}
              </div>
              <div className="flex items-center space-x-4">
                <p className="text-muted-foreground">
                  {authenticated && connectedWallet
                    ? (
                      <span className="flex items-center space-x-2">
                        <span>Base Wallet: {formatAddress(connectedWallet.address)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={copyAddress}
                          className="h-6 w-6 p-0"
                        >
                          {copied ? (
                            <CheckCircle className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </span>
                    )
                    : "Setting up your wallet connection..."}
                </p>
              </div>
            </div>
          </div>

          {/* User Profile Section */}
          {userData && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                {userData.pfpUrl ? (
                  <img 
                    src={userData.pfpUrl} 
                    alt="Profile" 
                    className="h-10 w-10 rounded-full object-cover border-2 border-blue-200"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                    <User className="h-5 w-5 text-white" />
                  </div>
                )}
                <div className="text-sm">
                  <div className="font-medium">{userData.displayName}</div>
                  {userData.username && (
                    <div className="text-gray-500">
                      @{userData.username} {userData.fid && `• FID: ${userData.fid}`}
                    </div>
                  )}
                </div>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          )}
        </div>

        {/* Welcome Message - Enhanced for Mini App */}
        {userData && (
          <div className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950/30 dark:to-green-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Welcome to Paycrypt, {userData.displayName}! 🎉
            </h2>
            <p className="text-blue-700 dark:text-blue-200 text-sm">
              {connectionStatus === 'live' 
                ? 'Your Farcaster wallet is actively connected. All systems ready!'
                : 'Connected via mini app. Your wallet is ready for secure transactions on Base network.'}
            </p>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Portfolio Overview (Takes 3/4 width on lg screens) */}
          <div className="lg:col-span-3 space-y-6">
            {/* Portfolio Overview Card */}
            <div className="bg-lightblue rounded-xl shadow-sm border border-lightblue-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-black-900">
                  Portfolio Overview
                </h2>
                <div className="text-sm text-gray-500">
                  Last updated: {new Date().toLocaleTimeString()}
                </div>
              </div>
              <PortfolioOverview wallet={connectedWallet} />
            </div>

            {/* Recent Transactions Card */}
            <div className="bg-lightblue rounded-xl shadow-sm border border-lightblue-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-black-900">
                  Recent Transactions
                </h2>
              </div>
              <RecentTransactions wallet={connectedWallet} />
            </div>

            {/* Market Data Card */}
            <div className="bg-lightblue rounded-xl shadow-sm border border-lightblue-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-black-900">
                  Market Data
                </h2>
                <div className="text-sm text-gray-500">
                  Real-time data
                </div>
              </div>
              <MarketData />
            </div>
          </div>

          {/* Right Sidebar - Quick Actions */}
          <div className="lg:col-span-1">
            <div className="space-y-6">
              {/* Account Info Card */}
              {userData && (
                <div className="bg-lightblue rounded-xl shadow-sm border border-lightblue-200 p-6">
                  <h2 className="text-xl font-semibold text-black-900 mb-4">
                    Account Info
                  </h2>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Display Name</label>
                      <p className="font-medium">{userData.displayName}</p>
                    </div>
                    {userData.username && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Username</label>
                        <p className="font-medium">@{userData.username}</p>
                      </div>
                    )}
                    {userData.fid && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Farcaster ID</label>
                        <p className="font-mono text-sm">{userData.fid}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Connected Network</label>
                      <Badge variant="outline" className="text-xs">Base Mainnet</Badge>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Connection Status</label>
                      <Badge variant="outline" className={`text-xs ${
                        connectionStatus === 'live' ? 'bg-green-50 text-green-700' : 
                        connectionStatus === 'cached' ? 'bg-blue-50 text-blue-700' : 
                        'bg-yellow-50 text-yellow-700'
                      }`}>
                        {connectionStatus === 'live' ? 'Live Connection' : 
                         connectionStatus === 'cached' ? 'Mini App' : 'Connecting...'}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Actions Card */}
              <div className="bg-lightblue rounded-xl shadow-sm border border-lightblue-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-black-900">
                    Quick Actions
                  </h2>
                </div>
                <QuickActions wallet={connectedWallet} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

// Dashboard Component wrapped with AuthGuard
function Dashboard() {
  return (
    <AuthGuard>
      <DashboardClient />
    </AuthGuard>
  );
}

// Export dynamic component with no SSR
const DashboardPage = dynamic(() => Promise.resolve(Dashboard), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Setting up Dashboard...</p>
        <p className="text-sm text-gray-500 mt-2">Connecting your Farcaster wallet...</p>
      </div>
    </div>
  )
});

export default DashboardPage;