// hooks/useBaseNetworkEnforcer.ts
import { useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { base } from 'wagmi/chains';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { toast } from 'sonner';

// Define wallet type based on Privy's wallet interface
interface PrivyWallet {
  address: string;
  walletClientType: string;
  connectorType?: string;
  imported?: boolean;
  [key: string]: any;
}

type NetworkStatusType = 'connected' | 'switching' | 'external-wrong-chain' | 'embedded-wrong-chain' | 'disconnected' | 'unknown';
type StatusColorType = 'green' | 'yellow' | 'orange' | 'red' | 'gray';

/**
 * Enhanced custom hook to ensure the user's wallet is connected to the Base network.
 * Works with both embedded and external wallets.
 */
export function useBaseNetworkEnforcer() {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { isConnected, address } = useAccount();
  const currentChainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  // Determine wallet type
  const activeWallet = wallets.find((wallet: PrivyWallet) => wallet.address === address);
  const isEmbeddedWallet = activeWallet?.walletClientType === 'privy';
  const isExternalWallet = activeWallet?.walletClientType !== 'privy';
  
  const isOnBaseChain = currentChainId === base.id;
  
  // Embedded wallets are typically configured to use Base by default
  // External wallets need explicit chain switching
  const canSwitchChain = isExternalWallet || !isEmbeddedWallet;

  // Enhanced status information
  const getNetworkStatus = (): NetworkStatusType => {
    if (!address) return 'disconnected';
    if (isSwitchingChain) return 'switching';
    if (isOnBaseChain) return 'connected';
    if (isEmbeddedWallet) return 'embedded-wrong-chain'; // Shouldn't happen
    if (isExternalWallet) return 'external-wrong-chain';
    return 'unknown';
  };

  const networkStatus: NetworkStatusType = getNetworkStatus();

  // Helper functions
  const getStatusMessage = (): string => {
    switch (networkStatus) {
      case 'disconnected':
        return 'No wallet connected';
      case 'switching':
        return 'Switching to Base network...';
      case 'connected':
        return isEmbeddedWallet ? 'Built-in wallet ready' : 'External wallet connected to Base';
      case 'embedded-wrong-chain':
        return 'Embedded wallet network issue';
      case 'external-wrong-chain':
        return 'Please switch to Base network';
      default:
        return 'Checking network status...';
    }
  };
  
  const getStatusColor = (): StatusColorType => {
    switch (networkStatus) {
      case 'connected':
        return 'green';
      case 'switching':
        return 'yellow';
      case 'external-wrong-chain':
        return 'orange';
      case 'embedded-wrong-chain':
      case 'disconnected':
        return 'red';
      default:
        return 'gray';
    }
  };

  // Effect to automatically prompt for chain switch
  useEffect(() => {
    if (authenticated && address && !isOnBaseChain && !isSwitchingChain) {
      if (isEmbeddedWallet) {
        // For embedded wallets, they should already be on Base
        console.warn('Embedded wallet not on Base chain - this might indicate a configuration issue');
        toast.warning("Embedded wallet should be on Base network. Please contact support if this persists.", {
          id: 'embedded-chain-warning',
          duration: 5000
        });
      } else if (isExternalWallet) {
        // For external wallets, prompt to switch as usual
        toast.info("Please switch your wallet to the Base network.", { 
          id: 'switch-chain', 
          duration: 5000 
        });
        try {
          switchChain({ chainId: base.id });
        } catch (error) {
          console.error('Failed to switch chain:', error);
          toast.error("Failed to switch network. Please manually switch to Base in your wallet.");
        }
      }
    }
    
    // If user logs out or disconnects wallet, dismiss any lingering toasts
    if (authenticated === false || isConnected === false) {
      toast.dismiss('switch-chain');
      toast.dismiss('embedded-chain-warning');
    }
  }, [
    authenticated, 
    address, 
    isOnBaseChain, 
    isSwitchingChain, 
    switchChain, 
    isConnected, 
    isEmbeddedWallet, 
    isExternalWallet
  ]);

  // Function to manually trigger a switch (useful for button actions)
  const promptSwitchToBase = (): boolean => {
    if (!authenticated) {
      toast.error("Please log in to proceed.");
      return false;
    }
    
    if (!address) {
      toast.error("No wallet found. Please ensure a wallet is connected.");
      return false;
    }

    if (isOnBaseChain) {
      return true; // Already on Base
    }

    if (isEmbeddedWallet) {
      // Embedded wallets should already be on Base
      toast.warning("Embedded wallet should automatically be on Base. Please try refreshing or contact support.");
      return false;
    }

    if (isExternalWallet && !isSwitchingChain) {
      toast.info("Switching to Base network...", { id: 'switch-chain-manual' });
      try {
        switchChain({ chainId: base.id });
      } catch (error) {
        console.error('Failed to switch chain:', error);
        toast.error("Failed to switch network. Please manually switch to Base in your wallet.");
      }
      return false; // Indicate that a switch was prompted
    }

    return false;
  };

  return {
    // Core functionality (backward compatible)
    isOnBaseChain,
    isSwitchingChain,
    promptSwitchToBase,
    
    // Enhanced information
    isEmbeddedWallet,
    isExternalWallet,
    canSwitchChain,
    networkStatus,
    activeWallet,
    
    // Helper functions
    getStatusMessage,
    getStatusColor
  };
}