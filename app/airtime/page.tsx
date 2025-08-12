// app/airtime/page.tsx
"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {Button} from "@/components/ui/button"
import {Label} from "@/components/ui/label"
import {Badge} from "@/components/ui/badge"
import { Loader2, AlertCircle } from "lucide-react"
import BackToDashboard from "@/components/BackToDashboard"
import AuthGuard from "@/components/AuthGuard"
import { Input } from "@/components/ui/input"

import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/config/contract";
import { ERC20_ABI } from "@/config/erc20Abi";
import { parseUnits, toBytes, toHex, Hex, fromHex, formatUnits } from 'viem';
import { toast } from 'sonner';
import { TransactionStatusModal } from "@/components/TransactionStatusModal";

import { buyAirtime } from "@/lib/api";
import { TokenConfig } from "@/lib/tokenlist";
import { fetchActiveTokensWithMetadata } from "@/lib/tokenUtils";

const NETWORKS = [
  { serviceID: "mtn", name: "MTN" },
  { serviceID: "glo", name: "Glo" },
  { serviceID: "airtel", name: "Airtel" },
  { serviceID: "9mobile", name: "9mobile" },
]

function generateRequestId(): string {
  return `${Date.now().toString()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
}

// Fetch prices for dynamic tokens
async function fetchPrices(tokenList: TokenConfig[]): Promise<Record<string, any>> {
  if (!tokenList || tokenList.length === 0) return {};
  const ids = tokenList.map(c => c.coingeckoId).join(",");
  try {
    const res = await fetch(`https://paycrypt-margin-price.onrender.com/api/v3/simple/price?ids=${ids}&vs_currencies=ngn`);
    return res.ok ? await res.json() : {};
  } catch (error) {
    console.error("Error fetching prices:", error);
    return {};
  }
}

// Client-side only component with wagmi hooks
function AirtimePageClient() {
  // Import wagmi hooks dynamically only on client side
  const [wagmiHooks, setWagmiHooks] = useState<any>(null);
  
  const [activeTokens, setActiveTokens] = useState<TokenConfig[]>([]);
  const [selectedToken, setSelectedToken] = useState<string>(""); // Stores the address of the selected token
  const [network, setNetwork] = useState("");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [prices, setPrices] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [requestId, setRequestId] = useState<string | undefined>(undefined);

  const [txStatus, setTxStatus] = useState<'idle' | 'waitingForApprovalSignature' | 'approving' | 'approvalSuccess' | 'waitingForSignature' | 'sending' | 'confirming' | 'success' | 'backendProcessing' | 'backendSuccess' | 'backendError' | 'error'>('idle');
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [backendMessage, setBackendMessage] = useState<string | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionHashForModal, setTransactionHashForModal] = useState<Hex | undefined>(undefined);
  const backendRequestSentRef = useRef<Hex | null>(null);

  // Load wagmi hooks dynamically on client side
  useEffect(() => {
    async function loadWagmiHooks() {
      try {
        const { useAccount, useConnect, useWriteContract, useWaitForTransactionReceipt, useReadContract } = await import('wagmi');
        const { useBaseNetworkEnforcer } = await import('@/hooks/useBaseNetworkEnforcer');
        
        setWagmiHooks({
          useAccount,
          useConnect,
          useWriteContract,
          useWaitForTransactionReceipt,
          useReadContract,
          useBaseNetworkEnforcer
        });
      } catch (error) {
        console.error('Error loading wagmi hooks:', error);
      }
    }
    
    loadWagmiHooks();
  }, []);

  // Only use wagmi hooks after they're loaded
  const accountHook = wagmiHooks?.useAccount();
  const connectHook = wagmiHooks?.useConnect();
  const baseNetworkHook = wagmiHooks?.useBaseNetworkEnforcer();

  const address = accountHook?.address;
  const isConnected = accountHook?.isConnected;
  const connect = connectHook?.connect;
  const connectors = connectHook?.connectors;
  const isOnBaseChain = baseNetworkHook?.isOnBaseChain;
  const isSwitchingChain = baseNetworkHook?.isSwitchingChain;
  const promptSwitchToBase = baseNetworkHook?.promptSwitchToBase;

  // Load tokens and prices on initial mount
  useEffect(() => {
    if (!wagmiHooks) return; // Wait for wagmi hooks to load
    
    async function loadTokensAndPrices() {
      setLoading(true);
      try {
        const tokens = await fetchActiveTokensWithMetadata();
        // Filter out ETH (tokenType 0) - only ERC20 tokens supported
        setActiveTokens(tokens.filter(token => token.tokenType !== 0));
        const prices = await fetchPrices(tokens);
        setPrices(prices);
      } catch (error) {
        console.error("Error loading tokens and prices:", error);
        toast.error("Failed to load token data. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadTokensAndPrices();
  }, [wagmiHooks]);

  // Generate requestId when form has data
  useEffect(() => {
    if ((selectedToken || network || amount || phone) && !requestId) {
      setRequestId(generateRequestId());
    } else if (!(selectedToken || network || amount || phone) && requestId) {
      setRequestId(undefined);
    }
  }, [selectedToken, network, amount, phone, requestId]);

  // Derived values for selected token
  const selectedTokenObj = activeTokens.find(t => t.address === selectedToken);
  const priceNGN = selectedTokenObj ? prices[selectedTokenObj.coingeckoId]?.ngn : null;
  const amountNGN = Number(amount) || 0;
  const cryptoNeeded = priceNGN && amountNGN ? amountNGN / priceNGN : 0;
  const tokenAmountForOrder: bigint = selectedTokenObj ? parseUnits(cryptoNeeded.toFixed(selectedTokenObj.decimals), selectedTokenObj.decimals) : BigInt(0);
  const bytes32RequestId: Hex = requestId ? toHex(toBytes(requestId), { size: 32 }) : toHex(toBytes(""), { size: 32 });

  // Wagmi hooks - only use after wagmi is loaded
  const readContractHook = wagmiHooks?.useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getOrder',
    args: [fromHex(bytes32RequestId, 'bigint')],
    query: { enabled: Boolean(requestId && address && wagmiHooks) },
  });

  const writeContractApproveHook = wagmiHooks?.useWriteContract();
  const writeContractMainHook = wagmiHooks?.useWriteContract();

  const waitForApprovalReceiptHook = wagmiHooks?.useWaitForTransactionReceipt({
    hash: writeContractApproveHook?.data as Hex,
    query: {
      enabled: Boolean(writeContractApproveHook?.data),
      refetchInterval: 1000,
    },
  });

  const waitForMainReceiptHook = wagmiHooks?.useWaitForTransactionReceipt({
    hash: writeContractMainHook?.data as Hex,
    query: {
      enabled: Boolean(writeContractMainHook?.data),
      refetchInterval: 1000,
    },
  });

  const existingOrder = readContractHook?.data;

  // Handle backend API call after successful transaction
  const handlePostTransaction = useCallback(async (transactionHash: Hex) => {
    // Prevent duplicate backend requests
    if (backendRequestSentRef.current === transactionHash) {
      console.log(`Backend request already sent for hash: ${transactionHash}. Skipping duplicate.`);
      return;
    }

    backendRequestSentRef.current = transactionHash;
    setTxStatus('backendProcessing');
    setBackendMessage("Processing your order...");
    toast.loading("Processing order with our service provider...", { id: 'backend-status' });

    try {
      const response = await buyAirtime({
        requestId: requestId!,
        phone,
        serviceID: network,
        amount: amountNGN,
        cryptoUsed: parseFloat(cryptoNeeded.toFixed(selectedTokenObj?.decimals || 6)),
        cryptoSymbol: selectedTokenObj?.symbol ?? "",
        transactionHash,
        userAddress: address!
      });

      setTxStatus('backendSuccess');
      setBackendMessage("Airtime delivered successfully!");
      toast.success("Airtime delivered successfully!", { id: 'backend-status' });

      // Reset form for next transaction after a delay
      setTimeout(() => {
        setSelectedToken("");
        setNetwork("");
        setAmount("");
        setPhone("");
        setRequestId(undefined);
        backendRequestSentRef.current = null;
        // Clear requestId slightly later to prevent immediate re-generation
        setTimeout(() => setRequestId(undefined), 100);
      }, 3000); // 3 second delay to allow user to see success

    } catch (error: any) {
      setTxStatus('backendError');
      let errorMessage = error.message;
      if (errorMessage.includes('HTML instead of JSON')) {
        errorMessage = 'Server error occurred. Please try again or contact support.';
      } else if (errorMessage.includes('Invalid JSON')) {
        errorMessage = 'Communication error with server. Please try again.';
      } else if (errorMessage.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      const fullMessage = `${errorMessage}. Request ID: ${requestId}`;
      setBackendMessage(fullMessage);
      toast.error(fullMessage, { id: 'backend-status' });
    }
  }, [requestId, phone, network, amountNGN, cryptoNeeded, selectedTokenObj?.symbol, selectedTokenObj?.decimals, address]);

  // Effect to monitor approval transaction status
  useEffect(() => {
    if (!showTransactionModal || !writeContractApproveHook || !waitForApprovalReceiptHook) return;

    if (writeContractApproveHook.isPending) {
      setTxStatus('waitingForApprovalSignature');
      setTransactionHashForModal(undefined);
      setTransactionError(null);
      setBackendMessage(null);
      toast.info("Awaiting token approval signature...");
      backendRequestSentRef.current = null;
    } else if (writeContractApproveHook.data && !waitForApprovalReceiptHook.isSuccess && !waitForApprovalReceiptHook.isLoading) {
      setTxStatus('approving');
      setTransactionHashForModal(writeContractApproveHook.data);
      toast.loading("Token approval sent, waiting for confirmation...", { id: 'approval-status' });
    } else if (waitForApprovalReceiptHook.isLoading) {
      setTxStatus('approving');
      setTransactionHashForModal(writeContractApproveHook.data);
      toast.loading("Token approval confirming on blockchain...", { id: 'approval-status' });
    } else if (waitForApprovalReceiptHook.isSuccess) {
      setTxStatus('approvalSuccess');
      toast.success("Token approved! Proceeding with payment...", { id: 'approval-status' });
      
      console.log("Approval confirmed! Initiating main transaction...");
      
      // Automatically proceed with main transaction
      setTimeout(() => {
        console.log("Contract call params:", {
          requestId: bytes32RequestId,
          tokenAddress: selectedTokenObj?.address,
          amount: tokenAmountForOrder.toString()
        });
        
        try {
          setTxStatus('waitingForSignature');
          writeContractMainHook?.writeContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'createOrder',
            args: [
              bytes32RequestId,
              selectedTokenObj?.address as Hex,
              tokenAmountForOrder,
            ],
            value: undefined,
          });
        } catch (error: any) {
          console.error("Error sending main transaction after approval:", error);
          const errorMsg = error.message || "Failed to send main transaction after approval.";
          setTransactionError(errorMsg);
          setTxStatus('error');
          toast.error(errorMsg);
        }
      }, 2000); // 2 second delay
      
    } else if (writeContractApproveHook.isError || waitForApprovalReceiptHook.isError) {
      setTxStatus('error');
      const errorMsg = (writeContractApproveHook.error?.message || waitForApprovalReceiptHook.error?.message || "Token approval failed").split('\n')[0];
      setTransactionError(errorMsg);
      toast.error(`Approval failed: ${errorMsg}`, { id: 'approval-status' });
    }
  }, [showTransactionModal, writeContractApproveHook, waitForApprovalReceiptHook, bytes32RequestId, selectedTokenObj?.address, tokenAmountForOrder, writeContractMainHook]);

  // Effect to monitor main transaction status
  useEffect(() => {
    if (!showTransactionModal || !writeContractMainHook || !waitForMainReceiptHook) return;
    
    // Skip if we're in approval phase
    if (['waitingForApprovalSignature', 'approving', 'approvalSuccess'].includes(txStatus)) {
      return;
    }

    if (writeContractMainHook.isPending) {
      setTxStatus('waitingForSignature');
      setTransactionHashForModal(undefined);
      setTransactionError(null);
      setBackendMessage(null);
      toast.info("Awaiting wallet signature for payment...");
      backendRequestSentRef.current = null;
    } else if (writeContractMainHook.data && !waitForMainReceiptHook.isSuccess && !waitForMainReceiptHook.isLoading) {
      setTxStatus('sending');
      setTransactionHashForModal(writeContractMainHook.data);
      toast.loading("Payment transaction sent, waiting for blockchain confirmation...", { id: 'tx-status' });
    } else if (waitForMainReceiptHook.isLoading) {
      setTxStatus('confirming');
      setTransactionHashForModal(writeContractMainHook.data);
      toast.loading("Payment transaction confirming on blockchain...", { id: 'tx-status' });
    } else if (waitForMainReceiptHook.isSuccess) {
      if (txStatus !== 'backendProcessing' && txStatus !== 'backendSuccess' && txStatus !== 'backendError') {
        setTxStatus('success');
        setTransactionHashForModal(writeContractMainHook.data);
        toast.success("Blockchain transaction confirmed! Processing order...", { id: 'tx-status' });
        
        // Process backend transaction
        if (writeContractMainHook.data) {
          handlePostTransaction(writeContractMainHook.data);
        }
      }
    } else if (writeContractMainHook.isError || waitForMainReceiptHook.isError) {
      setTxStatus('error');
      const errorMsg = (writeContractMainHook.error?.message?.split('\n')[0] || waitForMainReceiptHook.error?.message?.split('\n')[0] || "Transaction failed").split('\n')[0];
      setTransactionError(errorMsg);
      setTransactionHashForModal(writeContractMainHook.data);
      toast.error(`Transaction failed: ${errorMsg}`, { id: 'tx-status' });
    }
  }, [showTransactionModal, writeContractMainHook, waitForMainReceiptHook, txStatus, handlePostTransaction]);

  // Wagmi wallet connection
  const ensureWalletConnected = async () => {
    if (!isConnected) {
      toast.error("Please connect your wallet to proceed.");
      try {
        // Try to connect with the first available connector (usually Farcaster in mini apps)
        const farcasterConnector = connectors?.find((c: any) => c.name.includes('Farcaster'));
        const connectorToUse = farcasterConnector || connectors?.[0];
        if (connectorToUse && connect) {
          connect({ connector: connectorToUse });
        }
      } catch (error) {
        console.error('Error connecting wallet:', error);
      }
      return false;
    }
    if (!address) {
      toast.error("No wallet address found. Please ensure wallet is connected.");
      return false;
    }
    if (!isOnBaseChain) {
      promptSwitchToBase?.();
      return false;
    }
    return true;
  };

  const handlePurchase = async () => {
    setShowTransactionModal(true);
    setTransactionError(null);
    setBackendMessage(null);
    setTxStatus('idle');
    backendRequestSentRef.current = null;

    const walletConnectedAndOnBase = await ensureWalletConnected();
    if (!walletConnectedAndOnBase) {
      setShowTransactionModal(false);
      return;
    }

    if (!address || !requestId || !selectedTokenObj || amountNGN <= 0) {
      toast.error("Please check all form fields and wallet connection.");
      setTxStatus('error');
      return;
    }

    // Validate phone number format
    if (phone.length < 10 || phone.length > 11) {
      toast.error("Please enter a valid Nigerian phone number (10-11 digits).");
      setTxStatus('error');
      return;
    }

    // Validate amount range
    if (amountNGN < 100 || amountNGN > 50000) {
      toast.error("Amount must be between ₦100 and ₦50,000.");
      setTxStatus('error');
      return;
    }

    // Validate crypto calculation
    if (!priceNGN || cryptoNeeded <= 0) {
      toast.error("Unable to calculate crypto amount. Please try again.");
      setTxStatus('error');
      return;
    }

    // Validate token amount calculation
    if (tokenAmountForOrder <= 0) {
      toast.error("Invalid token amount calculated. Please try again.");
      setTxStatus('error');
      return;
    }

    // Check for existing order
    if (existingOrder && existingOrder.user && existingOrder.user !== '0x0000000000000000000000000000000000000000') {
      toast.error('Order already exists for this request. Please refresh and try again.');
      setRequestId(generateRequestId());
      setTxStatus('error');
      return;
    }

    console.log("--- Initiating ERC20 Transaction Flow ---");
    console.log("RequestId (bytes32):", bytes32RequestId);
    console.log("Token Address:", selectedTokenObj.address);
    console.log("TokenAmount for Order:", tokenAmountForOrder.toString());
    console.log("Formatted amount:", formatUnits(tokenAmountForOrder, selectedTokenObj.decimals));
    console.log("Selected Crypto:", selectedTokenObj.symbol);
    console.log("Crypto needed (float):", cryptoNeeded);
    console.log("Price NGN:", priceNGN);
    console.log("Amount NGN:", amountNGN);
    console.log("----------------------------------------");

    // Reset previous transaction states
    writeContractApproveHook?.reset();
    writeContractMainHook?.reset();

    if (!selectedTokenObj.address) {
      toast.error("Selected crypto has no contract address.");
      setTxStatus('error');
      return;
    }

    // COMPULSORY TOKEN APPROVAL - Always start with approval for all ERC20 tokens
    toast.info("Approving token spend for this transaction...");
    setTxStatus('waitingForApprovalSignature');
    
    try {
      // Approve unlimited amount for convenience (standard practice)
      const unlimitedApproval = parseUnits('115792089237316195423570985008687907853269984665640564039457584007913129639935', 0);
      
      console.log("Approving unlimited amount for future transactions");
      
      writeContractApproveHook?.writeContract({
        address: selectedTokenObj.address as Hex,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, unlimitedApproval],
      });
    } catch (error: any) {
      console.error("Error sending approval transaction:", error);
      const errorMsg = error.message || "Failed to send approval transaction.";
      setTransactionError(errorMsg);
      setTxStatus('error');
      toast.error(errorMsg);
    }

    // Regenerate requestId for next transaction
    setRequestId(generateRequestId());
  };

  const handleCloseModal = useCallback(() => {
    // Don't allow closing during critical phases
    if (['waitingForApprovalSignature', 'approving', 'waitingForSignature', 'sending', 'confirming', 'backendProcessing'].includes(txStatus)) {
      toast.info("Please wait for the transaction to complete before closing.");
      return;
    }
    
    setShowTransactionModal(false);
    setTxStatus('idle');
    setTransactionError(null);
    setBackendMessage(null);
    setTransactionHashForModal(undefined);
    backendRequestSentRef.current = null;
  }, [txStatus]);

  // Determine if the "Purchase Airtime" button should be enabled
  const canPay = selectedToken && network && amount && amountNGN >= 100 && amountNGN <= 50000 && phone && phone.length >= 10 && priceNGN && requestId && tokenAmountForOrder > 0;

  const isButtonDisabled = loading || !canPay ||
                           ['waitingForApprovalSignature', 'approving', 'waitingForSignature', 'sending', 'confirming', 'backendProcessing'].includes(txStatus) ||
                           writeContractApproveHook?.isPending || waitForApprovalReceiptHook?.isLoading || 
                           writeContractMainHook?.isPending || waitForMainReceiptHook?.isLoading || 
                           !isOnBaseChain || isSwitchingChain;

  // Don't render until wagmi hooks are loaded
  if (!wagmiHooks) {
    return (
      <AuthGuard>
        <div className="container py-10 max-w-xl mx-auto">
          <div className="flex items-center justify-center p-10">
            <Loader2 className="w-8 h-8 animate-spin mr-2" />
            <span>Loading...</span>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (loading) return (
    <AuthGuard>
      <div className="container py-10 max-w-xl mx-auto">
        <div className="flex items-center justify-center p-10">
          <Loader2 className="w-8 h-8 animate-spin mr-2" />
          <span>Loading active tokens...</span>
        </div>
      </div>
    </AuthGuard>
  );

  return (
    <AuthGuard>
      <div className="container py-10 max-w-xl mx-auto">
        <BackToDashboard />
        <h1 className="text-3xl font-bold mb-4">Buy Airtime</h1>
        <p className="text-muted-foreground mb-8">
          Purchase airtime using supported ERC20 cryptocurrencies on Base chain.
        </p>
        <Card>
          <CardHeader>
            <CardTitle>Crypto to Airtime Payment</CardTitle>
            <CardDescription>
              Preview and calculate your airtime purchase with crypto
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Token selection */}
            <div className="space-y-2">
              <Label htmlFor="token-select">Pay With</Label>
              <Select value={selectedToken} onValueChange={setSelectedToken}>
                <SelectTrigger id="token-select">
                  <SelectValue placeholder="Select ERC20 token" />
                </SelectTrigger>
                <SelectContent>
                  {activeTokens.length === 0 ? (
                    <SelectItem value="" disabled>No ERC20 tokens available</SelectItem>
                  ) : (
                    activeTokens.map(token => (
                      <SelectItem key={token.address} value={token.address}>
                        {token.symbol} - {token.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {activeTokens.length === 0 && !loading && (
                <p className="text-sm text-yellow-600">
                  No active ERC20 tokens found from contract.
                </p>
              )}
            </div>

            {/* Network provider */}
            <div className="space-y-2">
              <Label htmlFor="network-select">Network Provider</Label>
              <Select value={network} onValueChange={setNetwork}>
                <SelectTrigger id="network-select">
                  <SelectValue placeholder="Select network" />
                </SelectTrigger>
                <SelectContent>
                  {NETWORKS.map(n => (
                    <SelectItem key={n.serviceID} value={n.serviceID}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount input */}
            <div className="space-y-2">
              <Label htmlFor="amount-input">Amount (NGN)</Label>
              <Input
                id="amount-input"
                type="number"
                placeholder="Enter amount (₦100 - ₦50,000)"
                value={amount}
                onChange={e => {
                  const val = e.target.value;
                  if (val === "" || val === "0") {
                    setAmount("");
                  } else {
                    const numVal = Math.max(0, parseInt(val));
                    setAmount(String(Math.min(numVal, 50000))); // Cap at 50k
                  }
                }}
                min="100"
                max="50000"
                disabled={!selectedTokenObj}
              />
              {amountNGN > 0 && priceNGN && selectedTokenObj && (
                <div className="text-sm text-muted-foreground flex items-center justify-between">
                  <span>
                    You will pay: ~{cryptoNeeded.toFixed(selectedTokenObj.decimals)} {selectedTokenObj.symbol}
                  </span>
                  <Badge variant="secondary">
                    1 {selectedTokenObj.symbol} = ₦{priceNGN?.toLocaleString()}
                  </Badge>
                </div>
              )}
              {amountNGN > 0 && amountNGN < 100 && (
                <p className="text-sm text-red-500">Minimum amount is ₦100.</p>
              )}
              {amountNGN > 50000 && (
                <p className="text-sm text-red-500">Maximum amount is ₦50,000.</p>
              )}
            </div>

            {/* Phone number input */}
            <div className="space-y-2">
              <Label htmlFor="phone-input">Phone Number</Label>
              <Input
                id="phone-input"
                type="tel"
                placeholder="Enter phone number (11 digits)"
                value={phone}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, "")
                  setPhone(v.slice(0, 11))
                }}
                maxLength={11}
              />
              {phone && phone.length < 10 && (
                <p className="text-sm text-red-500">Phone number must be at least 10 digits.</p>
              )}
            </div>

            {/* Compulsory token approval info */}
            {selectedTokenObj && (
              <div className="text-sm p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-500" />
                  <span className="text-blue-700">
                    Token approval required for all ERC20 transactions
                  </span>
                </div>
              </div>
            )}

            {/* Transaction summary */}
            <div className="border-t pt-4 space-y-2 text-sm">
              {requestId && (
                <div className="flex justify-between">
                  <span>Request ID:</span>
                  <span className="text-muted-foreground font-mono text-xs">{requestId}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Amount (NGN):</span>
                <span>
                  {amountNGN > 0 ? `₦${amountNGN.toLocaleString()}` : "--"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>You will pay:</span>
                <span>
                  {cryptoNeeded > 0 && selectedTokenObj ? (
                    <Badge variant="outline">
                      {cryptoNeeded.toFixed(selectedTokenObj.decimals)} {selectedTokenObj.symbol}
                    </Badge>
                  ) : (
                    "--"
                  )}
                </span>
              </div>
              {selectedTokenObj && (
                <div className="flex justify-between">
                  <span>Network:</span>
                  <span>{NETWORKS.find(n => n.serviceID === network)?.name || network || "--"}</span>
                </div>
              )}
              {phone && (
                <div className="flex justify-between">
                  <span>Phone:</span>
                  <span className="font-mono">{phone}</span>
                </div>
              )}
            </div>
            
            <Button
              className="w-full"
              onClick={handlePurchase}
              disabled={isButtonDisabled}
            >
              {isSwitchingChain ? "Switching Network..." :
              !isOnBaseChain ? "Switch to Base Network" :
              txStatus === 'waitingForApprovalSignature' ? "Awaiting Approval Signature..." :
              txStatus === 'approving' ? "Approving Token..." :
              txStatus === 'approvalSuccess' ? "Approval Complete - Starting Payment..." :
              txStatus === 'waitingForSignature' ? "Awaiting Payment Signature..." :
              txStatus === 'sending' ? "Sending Payment..." :
              txStatus === 'confirming' ? "Confirming Payment..." :
              txStatus === 'success' ? "Payment Confirmed!" :
              txStatus === 'backendProcessing' ? "Processing Order..." :
              txStatus === 'backendSuccess' ? "Airtime Delivered Successfully!" :
              txStatus === 'backendError' ? "Order Failed - Try Again" :
              txStatus === 'error' ? "Transaction Failed - Try Again" :
              canPay ? "Approve & Purchase Airtime" :
              "Fill all details"}
            </Button>

            {/* Active tokens info */}
            {activeTokens.length > 0 && (
              <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
                <p className="font-medium mb-1">Active ERC20 Tokens ({activeTokens.length}):</p>
                <p>{activeTokens.map(t => t.symbol).join(", ")}</p>
              </div>
            )}

            {/* Transaction flow info */}
            <div className="text-xs text-muted-foreground p-3 bg-blue-50 rounded-lg">
              <p className="font-medium mb-1">Transaction Flow:</p>
              <p>1. Token Approval → 2. Payment Transaction → 3. Order Processing</p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <TransactionStatusModal
        isOpen={showTransactionModal}
        onClose={handleCloseModal}
        txStatus={txStatus}
        transactionHash={transactionHashForModal}
        errorMessage={transactionError}
        backendMessage={backendMessage}
        requestId={requestId}
      />
    </AuthGuard>
  )
}

// Export dynamic component with no SSR
const AirtimePage = dynamic(() => Promise.resolve(AirtimePageClient), {
  ssr: false,
  loading: () => (
    <AuthGuard>
      <div className="container py-10 max-w-xl mx-auto">
        <div className="flex items-center justify-center p-10">
          <Loader2 className="w-8 h-8 animate-spin mr-2" />
          <span>Loading...</span>
        </div>
      </div>
    </AuthGuard>
  )
});

export default AirtimePage;