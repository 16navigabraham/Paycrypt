"use client"

import { ThemeProvider } from "@/components/theme-provider"
import { PrivyProvider } from "@privy-io/react-auth"
import { base } from "viem/chains"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider 
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        // Login methods - keep your existing ones
        loginMethods: ['email', 'wallet', 'sms'],
        
        // Enable embedded wallets
        embeddedWallets: {
          createOnLogin: 'users-without-wallets', // Auto-create for users without external wallets
          requireUserPasswordOnCreate: false, // Optional: require password protection
          noPromptOnSignature: false, // Show confirmation for transactions
        },
        
        // Appearance
        appearance: {
          theme: 'light',
          accentColor: '#676FFF',
          logo: '/logo.png', // Optional: your app logo
        },
        
        // Supported chains - Base mainnet
        supportedChains: [base],
        
        // Default chain
        defaultChain: base,
        
        // External wallet options (keep existing functionality)
        externalWallets: {
          metamask: { connectionOptions: 'detect' },
          coinbaseWallet: { connectionOptions: 'all' },
          walletConnect: { connectionOptions: 'all' },
        },
      }}
    >
      <ThemeProvider 
        attribute="class" 
        defaultTheme="system" 
        enableSystem 
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </PrivyProvider>
  )
}