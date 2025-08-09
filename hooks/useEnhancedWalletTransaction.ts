// hooks/useEnhancedWalletTransaction.ts
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Hex, encodeFunctionData } from 'viem';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';

// Define wallet type based on Privy's wallet interface
interface PrivyWallet {
  address: string;
  walletClientType: string;
  connectorType?: string;
  imported?: boolean;
  sendTransaction?: (params: {
    to: string;
    data: string;
    value: bigint;
  }) => Promise<{ transactionHash: string }>;
  [key: string]: any;
}

export type TransactionStatus = 
  | 'idle' 
  | 'waitingForApprovalSignature' 
  | 'approving' 
  | 'approvalSuccess' 
  | 'waitingForSignature' 
  | 'sending' 
  | 'confirming' 
  | 'success' 
  | 'error';

export function useEnhancedWalletTransaction() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { address } = useAccount();
  
  // External wallet hooks (existing)
  const { 
    writeContract, 
    data: externalTxHash, 
    isPending: isExternalWritePending, 
    isError: isExternalWriteError, 
    error: externalWriteError,
    reset: resetExternalWrite 
  } = useWriteContract();

  const { 
    isLoading: isExternalTxConfirming, 
    isSuccess: isExternalTxConfirmed, 
    isError: isExternalTxConfirmError, 
    error: externalTxConfirmError 
  } = useWaitForTransactionReceipt({
    hash: externalTxHash as Hex,
    query: {
      enabled: Boolean(externalTxHash),
      refetchInterval: 1000,
    },
  });

  // State for embedded wallet transactions
  const [embeddedTxHash, setEmbeddedTxHash] = useState<Hex | undefined>();
  const [isEmbeddedTxPending, setIsEmbeddedTxPending] = useState(false);
  const [embeddedTxError, setEmbeddedTxError] = useState<string | null>(null);

  // Determine wallet type
  const activeWallet = wallets.find((wallet: PrivyWallet) => wallet.address === address);
  const isEmbeddedWallet = activeWallet?.walletClientType === 'privy';
  const isExternalWallet = activeWallet?.walletClientType !== 'privy';

  // Unified transaction states
  const txHash = isEmbeddedWallet ? embeddedTxHash : externalTxHash;
  const isPending = isEmbeddedWallet ? isEmbeddedTxPending : isExternalWritePending;
  const isConfirming = isEmbeddedWallet ? false : isExternalTxConfirming; // Embedded wallets handle confirmation internally
  const isConfirmed = isEmbeddedWallet ? Boolean(embeddedTxHash) : isExternalTxConfirmed;
  const isError = isEmbeddedWallet ? Boolean(embeddedTxError) : (isExternalWriteError || isExternalTxConfirmError);
  const error = isEmbeddedWallet ? embeddedTxError : (externalWriteError?.message || externalTxConfirmError?.message);

  // Reset function
  const reset = useCallback(() => {
    resetExternalWrite();
    setEmbeddedTxHash(undefined);
    setIsEmbeddedTxPending(false);
    setEmbeddedTxError(null);
  }, [resetExternalWrite]);

  // Enhanced transaction execution
  const executeTransaction = useCallback(async (contractCall: {
    address: Hex;
    abi: any;
    functionName: string;
    args: any[];
    value?: bigint;
  }) => {
    if (!activeWallet || !address) {
      throw new Error('No active wallet found');
    }

    if (isEmbeddedWallet) {
      // Handle embedded wallet transaction
      try {
        setIsEmbeddedTxPending(true);
        setEmbeddedTxError(null);
        
        // Encode the function data
        const data = encodeFunctionData({
          abi: contractCall.abi,
          functionName: contractCall.functionName,
          args: contractCall.args,
        });

        // Send transaction using embedded wallet
        const txResponse = await activeWallet.sendTransaction!({
          to: contractCall.address,
          data,
          value: contractCall.value || 0n,
        });

        setEmbeddedTxHash(txResponse.transactionHash as Hex);
        return txResponse.transactionHash;
        
      } catch (error: any) {
        const errorMsg = error.message || 'Embedded wallet transaction failed';
        setEmbeddedTxError(errorMsg);
        throw new Error(errorMsg);
      } finally {
        setIsEmbeddedTxPending(false);
      }
    } else {
      // Handle external wallet transaction (existing logic)
      return writeContract(contractCall);
    }
  }, [activeWallet, address, isEmbeddedWallet, writeContract]);

  // Token approval helper
  const approveToken = useCallback(async (tokenAddress: Hex, spenderAddress: Hex, amount: bigint, tokenAbi: any) => {
    return executeTransaction({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: 'approve',
      args: [spenderAddress, amount],
    });
  }, [executeTransaction]);

  return {
    // Wallet info
    address,
    isEmbeddedWallet,
    isExternalWallet,
    activeWallet,
    
    // Transaction execution
    executeTransaction,
    approveToken,
    
    // Transaction state
    txHash,
    isPending,
    isConfirming,
    isConfirmed,
    isError,
    error,
    reset,
    
    // Raw states for debugging
    external: {
      hash: externalTxHash,
      isPending: isExternalWritePending,
      isConfirming: isExternalTxConfirming,
      isConfirmed: isExternalTxConfirmed,
      error: externalWriteError || externalTxConfirmError,
    },
    embedded: {
      hash: embeddedTxHash,
      isPending: isEmbeddedTxPending,
      error: embeddedTxError,
    },
  };
}