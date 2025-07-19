// app/electricity/page.tsx
"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {Button} from "@/components/ui/button"
import {Label} from "@/components/ui/label"
import {Badge} from "@/components/ui/badge"
import { Loader2, AlertCircle, CheckCircle } from "lucide-react"
import BackToDashboard from "@/components/BackToDashboard"
import AuthGuard from "@/components/AuthGuard"
import { Input } from "@/components/ui/input"

import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/config/contract";
import { ERC20_ABI } from "@/config/erc20Abi"; // Import ERC20 ABI
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSimulateContract } from 'wagmi'; // Added useSimulateContract
import { usePrivy } from '@privy-io/react-auth';
import { parseEther, parseUnits, toBytes, toHex, Hex } from 'viem';
import { toast } from 'sonner';
import { TransactionStatusModal } from "@/components/TransactionStatusModal";
import { useBaseNetworkEnforcer } from '@/hooks/useBaseNetworkEnforcer'; // Import the network enforcer hook

// Base chain contract addresses (ensure these are correct for Base Mainnet)
const USDT_CONTRACT_ADDRESS = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"; // Replace with actual USDT contract on Base
const USDC_CONTRACT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Replace with actual USDC contract on Base

const CRYPTOS = [
  { symbol: "ETH", name: "Ethereum", coingeckoId: "ethereum", tokenType: 0, decimals: 18, contract: undefined },
  { symbol: "USDT", name: "Tether", coingeckoId: "tether", tokenType: 1, decimals: 6, contract: USDT_CONTRACT_ADDRESS },
  { symbol: "USDC", name: "USD Coin", coingeckoId: "usd-coin", tokenType: 2, decimals: 6, contract: USDC_CONTRACT_ADDRESS },
]

const ELECTRICITY_PROVIDERS = [
  { serviceID: "ikeja-electric", name: "Ikeja Electric" },
  { serviceID: "eko-electric", name: "Eko Electric" },
  { serviceID: "kano-electric", name: "Kano Electric" },
  { serviceID: "portharcourt-electric", name: "Port Harcourt Electric" },
  { serviceID: "jos-electric", name: "Jos Electric" },
  { serviceID: "ibadan-electric", name: "Ibadan Electric" },
  { serviceID: "kaduna-electric", name: "Kaduna Electric" },
  { serviceID: "abuja-electric", name: "Abuja Electric" },
  { serviceID: "enugu-electric", name: "Enugu Electric (EEDC)" },
  { serviceID: "benin-electric", name: "Benin Electric" },
  { serviceID: "aba-electric", name: "Aba Electric" },
  { serviceID: "yola-electric", name: "Yola Electric" },
]

interface ElectricityPlan {
  variation_code: string
  name: string
}

const METER_LENGTHS: Record<string, number[]> = {
  prepaid: [11],
  postpaid: [10, 11, 13],
  default: [10, 11, 12, 13],
}

function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`
}

/* ---------- fetch helpers ---------- */
async function fetchPrices() {
  const ids = CRYPTOS.map(c => c.coingeckoId).join(",")
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=ngn`)
  return res.ok ? await res.json() : {}
}

async function fetchElectricityPlans(serviceID: string) {
  const res = await fetch(`/api/vtpass/service-variations?serviceID=${serviceID}`)
  const data = res.ok ? await res.json() : {}
  return data.content?.variations || []
}

/* ---------- VTpass verify - NOW USES YOUR LOCAL API ROUTE ---------- */
async function verifyMeter(billersCode: string, serviceID: string, type: string) {
  const res = await fetch("/api/vtpass/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ billersCode, serviceID, type }),
  })

  const data = await res.json()

  if (data.success) {
    return data.data || {};
  } else {
    throw new Error(data.error || "Verification failed");
  }
}

function getMeterLength(planCode: string): number[] {
  const lc = planCode.toLowerCase()
  if (lc.includes("prepaid")) return METER_LENGTHS.prepaid
  if (lc.includes("postpaid")) return METER_LENGTHS.postpaid
  return METER_LENGTHS.default
}

export default function ElectricityPage() {
  const [crypto, setCrypto] = useState("")
  const [provider, setProvider] = useState("")
  const [plan, setPlan] = useState("") // This now holds the variation_code for meter type (e.g., "prepaid", "postpaid")
  const [amount, setAmount] = useState("")
  const [meterNumber, setMeterNumber] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerAddress, setCustomerAddress] = useState("")
  const [plans, setPlans] = useState<ElectricityPlan[]>([]) // These are the meter types (prepaid/postpaid)
  const [prices, setPrices] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [verifyingMeter, setVerifyingMeter] = useState(false)
  const [verificationError, setVerificationError] = useState("")
  const [verificationSuccess, setVerificationSuccess] = useState(false)
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [phone, setPhone] = useState("");

  // --- START OF MODIFICATIONS: Transaction and Approval States ---
  const [txStatus, setTxStatus] = useState<'idle' | 'waitingForSignature' | 'sending' | 'confirming' | 'success' | 'error' | 'backendProcessing' | 'backendSuccess' | 'backendError' | 'waitingForApprovalSignature' | 'approving' | 'approvalSuccess' | 'approvalError'>('idle');
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [backendMessage, setBackendMessage] = useState<string | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionHashForModal, setTransactionHashForModal] = useState<Hex | undefined>(undefined);

  const [approvalError, setApprovalError] = useState<string | null>(null);
  // --- END OF MODIFICATIONS ---

  const { connectWallet, authenticated, user } = usePrivy();
  const { isConnected, address } = useAccount();

  // --- START OF MODIFICATIONS: Network Enforcer Hook ---
  const { isOnBaseChain, isSwitchingChain, promptSwitchToBase } = useBaseNetworkEnforcer();
  // --- END OF MODIFICATIONS ---

  /* initial load */
  useEffect(() => {
    fetchPrices().then(setPrices).finally(() => setLoading(false))
  }, [])

  /* plans when provider changes */
  useEffect(() => {
    if (!provider) {
        setPlans([]);
        setPlan("");
        return;
    }
    setLoadingPlans(true)
    fetchElectricityPlans(provider).then(setPlans).finally(() => setLoadingPlans(false))
  }, [provider])

  /* requestId generator */
  useEffect(() => {
    if ((crypto || provider || plan || meterNumber || amount || phone) && !requestId) {
        setRequestId(generateRequestId());
    } else if (!(crypto || provider || plan || meterNumber || amount || phone) && requestId) {
        setRequestId(undefined);
    }
  }, [crypto, provider, plan, meterNumber, amount, phone, requestId]);


  /* auto-verify meter */
  useEffect(() => {
    if (!provider || !plan || !meterNumber) {
      setCustomerName("")
      setCustomerAddress("")
      setVerificationError("")
      setVerificationSuccess(false)
      return
    }

    const validLengths = getMeterLength(plan)
    if (!validLengths.includes(meterNumber.length)) {
      setCustomerName("")
      setCustomerAddress("")
      setVerificationError(`Please enter a valid ${validLengths.join(" or ")} digit meter number for ${ELECTRICITY_PROVIDERS.find(p => p.serviceID === provider)?.name || 'this provider'}.`)
      setVerificationSuccess(false)
      return
    }

    const id = setTimeout(async () => {
      setVerifyingMeter(true)
      setVerificationError("")
      setVerificationSuccess(false)
      setCustomerName("")
      setCustomerAddress("")

      try {
        const content = await verifyMeter(meterNumber, provider, plan) // Pass 'plan' as type

        const name    = String(content?.Customer_Name || "").trim()
        const address = String(content?.Customer_Address || "").trim()

        if (!name) throw new Error("Customer name not found. Please check the meter number.")

        setCustomerName(name)
        setCustomerAddress(address)
        setVerificationSuccess(true)
      } catch (err: any) {
        setVerificationError(err.message || "Verification failed. Please try again.")
      } finally {
        setVerifyingMeter(false)
      }
    }, 700)
    return () => clearTimeout(id)
  }, [meterNumber, provider, plan])

  /* derived values */
  const selectedCrypto = CRYPTOS.find(c => c.symbol === crypto)
  const priceNGN = selectedCrypto ? prices[selectedCrypto.coingeckoId]?.ngn : null
  const amountNGN = Number(amount) || 0
  const cryptoNeeded = priceNGN && amountNGN ? amountNGN / priceNGN : 0

  // For the main contract call, use the exact amount needed.
  const tokenAmountForOrder = selectedCrypto ? parseUnits(cryptoNeeded.toFixed(18), selectedCrypto.decimals) : BigInt(0);
  const valueForEth = selectedCrypto?.symbol === 'ETH' && cryptoNeeded > 0
      ? parseEther(cryptoNeeded.toFixed(18))
      : BigInt(0);
  const bytes32RequestId: Hex = toHex(toBytes(requestId || ""), { size: 32 });

  // For approval, use the maximum uint256 value for unlimited approval.
  const unlimitedApprovalAmount = parseUnits('115792089237316195423570985008687907853269984665640564039457584007913129639935', 0);

  // Wagmi Hooks for TOKEN APPROVAL Simulation
  const { data: simulateApproveData, error: simulateApproveError, isLoading: isSimulatingApprove } = useSimulateContract({
      address: selectedCrypto?.contract as Hex,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESS, unlimitedApprovalAmount],
      query: {
          enabled: Boolean(selectedCrypto?.tokenType !== 0 && selectedCrypto?.contract && address && isConnected && isOnBaseChain),
      },
  });

  // Wagmi Hooks for TOKEN APPROVAL Transaction
  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending, isError: isApproveError, error: approveWriteError } = useWriteContract();

  const { isLoading: isApprovalConfirming, isSuccess: isApprovalTxConfirmed, isError: isApprovalConfirmError, error: approveConfirmError } = useWaitForTransactionReceipt({
      hash: approveHash as Hex,
      query: {
          enabled: Boolean(approveHash),
          refetchInterval: 1000,
      },
  });

  // Wagmi Hooks for MAIN PAYMENT Simulation
  const { data: simulateWriteData, error: simulateWriteError, isLoading: isSimulatingWrite } = useSimulateContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'createOrder',
      args: [
          bytes32RequestId,
          selectedCrypto?.tokenType as any, // Cast as any for now, ensure selectedCrypto is defined
          tokenAmountForOrder,
      ],
      value: valueForEth,
      query: {
          enabled: Boolean(selectedCrypto && requestId && cryptoNeeded > 0 && address && isConnected && isOnBaseChain && (selectedCrypto.tokenType === 0 || isApprovalTxConfirmed)), // Only simulate if ETH or after approval
      },
  });

  // Wagmi Hooks for MAIN PAYMENT Transaction
  const { writeContract, data: hash, isPending: isWritePending, isError: isWriteError, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isConfirmError, error: confirmError } = useWaitForTransactionReceipt({
    hash: hash as Hex,
    query: {
      enabled: Boolean(hash),
      refetchInterval: 1000,
    },
  });

  // Moved handlePostTransaction definition above its usage in useEffect
  const handlePostTransaction = useCallback(async (transactionHash: Hex) => {
    setTxStatus('backendProcessing');
    setBackendMessage("Processing your order...");
    toast.loading("Processing order with VTpass...", { id: 'backend-status' });
    try {
      const orderData = {
        requestId,
        crypto: selectedCrypto?.symbol, // Safely access symbol
        provider,
        meter_number: meterNumber,
        serviceID: provider,
        variation_code: plan,
        amount: amountNGN,
        cryptoNeeded,
        type: 'electricity',
        transactionHash,
        userAddress: address,
        phone: phone,
      };
      console.log('Submitting order to backend:', orderData);
      const backendResponse = await fetch('/api/electricity', {
        method: "POST",
        headers: { "Content-Type": "application/json" }, // Corrected Content-Type
        body: JSON.stringify({
          requestId,
          meter_number: meterNumber,
          serviceID: provider,
          variation_code: plan,
          amount: amountNGN,
          phone: phone,
          cryptoUsed: cryptoNeeded,
          cryptoSymbol: selectedCrypto?.symbol, // Safely access symbol
          transactionHash
        }),
      });

      const responseData = await backendResponse.json();

      if (!backendResponse.ok) {
        throw new Error(responseData.message || responseData.error || "Failed to deliver electricity via backend.");
      }

      setTxStatus('backendSuccess');
      setBackendMessage("Electricity bill paid successfully!");
      toast.success("Electricity bill paid successfully!", { id: 'backend-status' });
      // Reset form for next transaction
      setCrypto("");
      setProvider("");
      setPlan("");
      setAmount("");
      setMeterNumber("");
      setCustomerName("");
      setCustomerAddress("");
      setVerificationSuccess(false);
      setRequestId(undefined);
    } catch (backendError: any) {
      setTxStatus('backendError');
      const msg = `Backend processing failed: ${backendError.message}. Please contact support with Request ID: ${requestId}`;
      setBackendMessage(msg);
      console.error("Backend API call failed:", backendError);
      toast.error(msg, { id: 'backend-status' });
    }
  }, [requestId, selectedCrypto?.symbol, amountNGN, phone, cryptoNeeded, address, provider, meterNumber, plan, customerName, verificationSuccess]);


  // Effect to monitor approval transaction status
  useEffect(() => {
    if (isApprovePending) {
        setTxStatus('waitingForApprovalSignature');
        setTransactionHashForModal(undefined); // Clear main tx hash
        setTransactionError(null);
        setBackendMessage(null);
        setApprovalError(null);
        toast.info("Awaiting token approval signature...");
    } else if (approveHash && !isApprovalTxConfirmed && !isApprovalConfirming) {
        setTxStatus('sending'); // Use 'sending' for approval hash available but not yet confirming
        setTransactionHashForModal(approveHash); // Show approval hash in modal
        toast.loading("Token approval sent, waiting for confirmation...", { id: 'approval-status' });
    } else if (isApprovalConfirming) {
        setTxStatus('approving'); // Use 'approving' when it's actively confirming
        setTransactionHashForModal(approveHash);
        toast.loading("Token approval confirming on blockchain...", { id: 'approval-status' });
    } else if (isApprovalTxConfirmed) {
        setTxStatus('approvalSuccess');
        setApprovalError(null); // Clear any previous approval errors
        toast.success("Token approved for unlimited spending! Proceeding with payment...", { id: 'approval-status' }); // Updated message
        console.log("Approval: Blockchain confirmed! Initiating main transaction...");

        // Add a small delay to allow UI to update to 'approvalSuccess' before triggering next step
        const initiateMainTransaction = setTimeout(() => {
            if (selectedCrypto?.tokenType === 0) {
                // This path should ideally not be hit if approval logic is correct
                // but as a fallback, ensure the main tx is initiated.
                if (simulateWriteData?.request) {
                    setTxStatus('waitingForSignature'); // Update status for main transaction
                    writeContract(simulateWriteData.request);
                    console.log("Main transaction initiated after approval (ETH path).");
                } else if (simulateWriteError) {
                    console.error("Simulation error for ETH main transaction after approval:", simulateWriteError);
                    const errorMsg = simulateWriteError.message || "Simulation failed for ETH transaction.";
                    setTransactionError(errorMsg);
                    setTxStatus('error');
                    toast.error(errorMsg);
                } else {
                    console.error("No simulation data for ETH main transaction after approval.");
                    setTransactionError("Could not simulate ETH transaction. Please try again.");
                    setTxStatus('error');
                    toast.error("An internal error occurred. Please try again.");
                }
            } else { // ERC20 token, proceed with main transaction after approval
                if (simulateWriteData?.request) {
                    setTxStatus('waitingForSignature'); // Update status for main transaction
                    writeContract(simulateWriteData.request);
                    console.log("Main transaction initiated after approval (ERC20 path).");
                } else if (simulateWriteError) {
                    console.error("Simulation error for ERC20 main transaction after approval:", simulateWriteError);
                    const errorMsg = simulateWriteError.message || "Simulation failed for ERC20 transaction after approval.";
                    setTransactionError(errorMsg);
                    setTxStatus('error');
                    toast.error(errorMsg);
                } else {
                    console.error("No simulation data for ERC20 main transaction after approval.");
                    setTransactionError("Could not simulate ERC20 transaction. Please try again.");
                    setTxStatus('error');
                    toast.error("An internal error occurred. Please try again.");
                }
            }
        }, 500); // 500ms delay

        return () => clearTimeout(initiateMainTransaction); // Cleanup timeout on unmount or re-render

    } else if (isApproveError || isApprovalConfirmError) {
        setTxStatus('approvalError');
        const errorMsg = (approveWriteError?.message || approveConfirmError?.message || simulateApproveError?.message || "Token approval failed").split('\n')[0];
        setApprovalError(errorMsg);
        setTransactionError(errorMsg); // Use main error state for modal display
        toast.error(`Approval failed: ${errorMsg}`, { id: 'approval-status' });
    }
  }, [isApprovePending, approveHash, isApprovalTxConfirmed, isApprovalConfirming, isApproveError, isApprovalConfirmError, approveWriteError, approveConfirmError, writeContract, simulateWriteData, simulateWriteError, selectedCrypto, cryptoNeeded, requestId]);

  // Effect to monitor main transaction status
  useEffect(() => {
    // Only run if not currently in an approval flow (or just finished with approval error)
    if (['waitingForApprovalSignature', 'approving', 'approvalSuccess', 'approvalError'].includes(txStatus)) {
        return;
    }

    // Handle immediate writeContract errors (e.g., user rejected, simulation failed)
    if (isWriteError) {
        setTxStatus('error');
        const errorMsg = writeError?.message?.split('\n')[0] || simulateWriteError?.message?.split('\n')[0] || "Wallet transaction failed or was rejected.";
        setTransactionError(errorMsg);
        toast.error(`Transaction failed: ${errorMsg}`, { id: 'tx-status' });
        return; // Exit early if there's a write error
    }

    if (isWritePending) {
        setTxStatus('waitingForSignature');
        setTransactionHashForModal(undefined); // Clear main tx hash
        setTransactionError(null);
        setBackendMessage(null);
        toast.info("Awaiting wallet signature...");
    } else if (hash && !isConfirmed && !isConfirming) {
        setTxStatus('sending');
        setTransactionHashForModal(hash);
        toast.loading("Transaction sent, waiting for blockchain confirmation...", { id: 'tx-status' });
    } else if (isConfirming) {
        setTxStatus('confirming');
        setTransactionHashForModal(hash); // Ensure hash is shown during confirming
        toast.loading("Transaction confirming on blockchain...", { id: 'tx-status' });
    } else if (isConfirmed) {
        setTxStatus('success');
        setTransactionHashForModal(hash); // Ensure hash is shown during success
        toast.success("Blockchain transaction confirmed! Processing order...", { id: 'tx-status' });
        if (hash) {
            handlePostTransaction(hash);
        }
    } else if (isConfirmError) { // Handle errors during transaction receipt
        setTxStatus('error');
        const errorMsg = confirmError?.message?.split('\n')[0] || "Blockchain transaction failed to confirm.";
        setTransactionError(errorMsg);
        setTransactionHashForModal(hash); // Show hash for failed tx
        toast.error(`Transaction failed: ${errorMsg}`, { id: 'tx-status' });
    } else {
        // If no active transaction state, and not in an approval flow, reset to idle
        if (!['waitingForApprovalSignature', 'approving', 'approvalSuccess', 'approvalError'].includes(txStatus)) {
            setTxStatus('idle');
            setTransactionError(null);
            setBackendMessage(null);
            setTransactionHashForModal(undefined);
        }
    }
  }, [isWritePending, hash, isConfirming, isConfirmed, isWriteError, isConfirmError, writeError, confirmError, txStatus, handlePostTransaction, simulateWriteError]);

  const ensureWalletConnected = async () => {
    if (!authenticated) {
      toast.error("Please log in to proceed.");
      await connectWallet();
      return false;
    }
    if (!address) {
      toast.error("No wallet found. Please ensure a wallet is connected via Privy.");
      await connectWallet();
      return false;
    }
    // Use the network enforcer hook
    if (!isOnBaseChain) {
        promptSwitchToBase();
        return false;
    }
    return true;
  };

  const handlePurchase = async () => {
    // FIX: Show modal immediately on purchase attempt (ONLY place to set true)
    setShowTransactionModal(true);
    setTransactionError(null);
    setBackendMessage(null);
    setApprovalError(null);

    const walletConnectedAndOnBase = await ensureWalletConnected();
    if (!walletConnectedAndOnBase) {
      setTxStatus('idle');
      setShowTransactionModal(false); // Hide modal if initial checks fail
      return;
    }

    if (!address) {
      toast.error("Wallet address not found after connection. Please refresh and try again.");
      setTxStatus('error');
      return;
    }
    if (!requestId) {
      toast.error("Request ID not generated. Please fill all form details.");
      setTxStatus('error');
      return;
    }
    if (!verificationSuccess || !customerName) {
      toast.error("Please verify meter number before proceeding with purchase.");
      setTxStatus('error');
      return;
    }
    if (amountNGN <= 0) {
        toast.error("Please enter a valid amount.");
        setTxStatus('error');
        return;
    }

    // Ensure selectedCrypto is not undefined here
    if (!selectedCrypto) {
        toast.error("Please select a cryptocurrency.");
        setTxStatus('error');
        return;
    }

    // Debugging logs for contract call parameters
    console.log("--- Initiating Contract Call ---");
    console.log("RequestId (bytes32):", bytes32RequestId);
    console.log("TokenType:", selectedCrypto.tokenType);
    console.log("TokenAmount for Order (parsed):", tokenAmountForOrder.toString()); // Log as string to see full BigInt
    console.log("Value (for ETH, 0 for ERC20):", valueForEth.toString()); // Log as string to see full BigInt
    console.log("Selected Crypto:", selectedCrypto.symbol);
    console.log("Crypto Needed (float):", cryptoNeeded);
    console.log("Selected Crypto Decimals:", selectedCrypto.decimals);
    console.log("--------------------------------");

    if (selectedCrypto.tokenType !== 0) { // If it's an ERC20 token (USDT or USDC)
        if (simulateApproveError) {
            const errorMsg = simulateApproveError.message?.split('\n')[0] || "Token approval simulation failed.";
            setApprovalError(errorMsg);
            setTransactionError(errorMsg);
            setTxStatus('approvalError');
            toast.error(`Approval simulation failed: ${errorMsg}`);
            return;
        }
        if (!simulateApproveData?.request) {
            setApprovalError("Approval simulation data not ready. Please try again.");
            setTransactionError("Approval simulation data not ready. Please try again.");
            setTxStatus('approvalError');
            toast.error("Approval simulation data not ready. Please try again.");
            return;
        }
        toast.info("Approving token spend for this transaction...");
        setTxStatus('waitingForApprovalSignature'); // Set initial status for approval
        try {
            writeApprove(simulateApproveData.request);
            return; // After initiating approval, stop here. The approval useEffect will handle next steps.
        } catch (error: any) {
            console.error("Error sending approval transaction:", error);
            const errorMsg = error.message || "Failed to send approval transaction.";
            setApprovalError(errorMsg);
            setTransactionError(errorMsg); // Propagate to main error state for modal
            setTxStatus('approvalError');
            toast.error(errorMsg);
            return;
        }
    } else {
        // If ETH, no approval needed, proceed directly with main transaction
        if (simulateWriteError) {
            const errorMsg = simulateWriteError.message?.split('\n')[0] || "Transaction simulation failed.";
            setTransactionError(errorMsg);
            setTxStatus('error');
            toast.error(`Payment simulation failed: ${errorMsg}`);
            return;
        }
        if (!simulateWriteData?.request) {
            setTransactionError("Payment simulation data not ready. Please try again.");
            setTxStatus('error');
            toast.error("Payment simulation data not ready. Please try again.");
            return;
        }
        try {
          setTxStatus('waitingForSignature'); // Set status for main transaction signature
          writeContract(simulateWriteData.request);
        } catch (error: any) {
          console.error("Error sending main transaction:", error);
          const errorMsg = error.message || "Failed to send transaction.";
          setTransactionError(errorMsg);
          setTxStatus('error');
          toast.error(errorMsg);
        }
    }
  };

  // FIX: Wrapped handleCloseModal in useCallback
  const handleCloseModal = useCallback(() => {
    setShowTransactionModal(false);
    setTxStatus('idle'); // Reset status to idle when modal closes
    setTransactionError(null); // Clear any errors
    setBackendMessage(null); // Clear backend messages
    setTransactionHashForModal(undefined); // Clear hash
    setApprovalError(null); // Clear approval specific errors
  }, []); // Empty dependency array as it doesn't depend on any changing state

  const canPay =
    crypto &&
    provider &&
    plan &&
    meterNumber &&
    amount &&
    amountNGN >= 100 &&
    phone &&
    priceNGN &&
    requestId &&
    customerName &&
    verificationSuccess;

  // --- START OF MODIFICATIONS: Updated isButtonDisabled logic ---
  const isButtonDisabled = loading || loadingPlans || verifyingMeter ||
                           isWritePending || isConfirming || txStatus === 'backendProcessing' || !canPay ||
                           isApprovePending || isApprovalConfirming || isSimulatingApprove || isSimulatingWrite || // Disable during simulation
                           simulateApproveError || simulateWriteError || // Disable if simulation fails
                           !isOnBaseChain || isSwitchingChain; // Disable if not on Base or switching
  // --- END OF MODIFICATIONS ---

  if (loading) return <div className="p-10 text-center">Loading…</div>

  return (
    <AuthGuard>
      <div className="container py-10 max-w-xl mx-auto">
        <BackToDashboard />
        <h1 className="text-3xl font-bold mb-4">Pay Electricity Bill</h1>
        <p className="text-muted-foreground mb-8">
          Pay your electricity bills using USDT, USDC, or ETH on Base chain.
        </p>
        <Card>
          <CardHeader>
            <CardTitle>Crypto to Electricity Payment</CardTitle>
            <CardDescription>
              Preview and calculate your electricity bill payment with crypto
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* crypto */}
            <div className="space-y-2">
              <Label htmlFor="crypto-select">Pay With</Label>
              <Select value={crypto} onValueChange={setCrypto}>
                <SelectTrigger id="crypto-select">
                  <SelectValue placeholder="Select crypto" />
                </SelectTrigger>
                <SelectContent>
                  {CRYPTOS.map(c => (
                    <SelectItem key={c.symbol} value={c.symbol}>
                      {c.symbol} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* provider */}
            <div className="space-y-2">
              <Label htmlFor="provider-select">Electricity Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="provider-select">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {ELECTRICITY_PROVIDERS.map(p => (
                    <SelectItem key={p.serviceID} value={p.serviceID}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* meter type */}
            <div className="space-y-2">
              <Label htmlFor="meter-type-select">Meter Type</Label>
              <Select value={plan} onValueChange={setPlan} disabled={!provider || loadingPlans}>
                <SelectTrigger id="meter-type-select">
                  <SelectValue placeholder={loadingPlans ? "Loading..." : "Select type"} />
                </SelectTrigger>
                <SelectContent>
                  {plans.map(p => (
                    <SelectItem key={p.variation_code} value={p.variation_code}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* meter number */}
            <div className="space-y-2">
              <Label htmlFor="meter-number-input">Meter Number</Label>
              <Input
                id="meter-number-input"
                type="text"
                placeholder={plan ? `Enter ${getMeterLength(plan).join(" or ")}-digit meter number` : "Select a Meter Type first"}
                value={meterNumber}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, "")
                  setMeterNumber(v)
                  setVerificationError("")
                  setVerificationSuccess(false)
                  setCustomerName("")
                  setCustomerAddress("")
                }}
                maxLength={13}
                disabled={!plan}
              />
              {verifyingMeter && (
                <div className="flex items-center space-x-2 text-sm text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying meter…</span>
                </div>
              )}
              {verificationSuccess && (
                <div className="flex items-center space-x-2 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>Meter verified</span>
                </div>
              )}
              {verificationError && (
                <div className="flex items-center space-x-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>{verificationError}</span>
                </div>
              )}
            </div>

            {/* customer details */}
            {customerName && (
              <div className="space-y-2">
                <Label>Customer Name</Label>
                <Input value={customerName} readOnly className="bg-green-50 text-black" />
              </div>
            )}
            {customerAddress && (
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={customerAddress} readOnly className="bg-green-50 text-black" />
              </div>
            )}

            {/* amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (NGN)</Label>
              <Input
                id="amount"
                type="number"
                min={100}
                max={50000}
                placeholder="Enter amount in Naira, minimum ₦100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            {/* Phone Number for Electricity - it's in your code, keeping it */}
            <div className="space-y-2">
                <Label htmlFor="phone">Phone Number (for token/receipt)</Label>
                <Input
                    id="phone"
                    type="tel"
                    placeholder="e.g. 080*********"
                    maxLength={11}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                />
            </div>

            <div className="border-t pt-4 space-y-2">
              {requestId && (
                <div className="flex justify-between text-sm">
                  <span>Request ID:</span>
                  <span className="text-muted-foreground font-mono text-xs">{requestId}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>Amount (NGN):</span>
                <span>
                  {amountNGN > 0 ? `₦${amountNGN.toLocaleString()}` : "--"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>You will pay:</span>
                <span>
                  {cryptoNeeded > 0 && selectedCrypto ? (
                    <Badge variant="outline">
                      {cryptoNeeded.toFixed(6)} {selectedCrypto.symbol}
                    </Badge>
                  ) : (
                    "--"
                  )}
                </span>
              </div>
            </div>
            <Button
                className="w-full"
                onClick={handlePurchase}
                // disabled={isButtonDisabled}
            >
                {isSwitchingChain ? "Switching Network..." :
                !isOnBaseChain ? "Switch to Base Network" :
                isSimulatingApprove || isSimulatingWrite ? "Simulating Transaction..." :
                simulateApproveError || simulateWriteError ? "Simulation Failed" :
                isApprovePending ? "Awaiting Approval Signature..." :
                isApprovalConfirming ? "Approving Token..." :
                txStatus === 'waitingForSignature' ? "Awaiting Payment Signature..." :
                txStatus === 'sending' ? "Sending Transaction..." :
                txStatus === 'confirming' ? "Confirming Blockchain..." :
                txStatus === 'success' ? "Blockchain Confirmed!" :
                txStatus === 'backendProcessing' ? "Processing Order..." :
                txStatus === 'backendSuccess' ? "Payment Successful!" :
                txStatus === 'backendError' ? "Payment Failed - Try Again" :
                txStatus === 'error' ? "Blockchain Failed - Try Again" :
                canPay ? "Pay Electricity Bill" :
                "Fill all details and verify meter"}
            </Button>
          </CardContent>
        </Card>
      </div>
      <TransactionStatusModal
        isOpen={showTransactionModal}
        onClose={handleCloseModal}
        txStatus={txStatus}
        transactionHash={transactionHashForModal}
        errorMessage={transactionError || approvalError || simulateApproveError?.message || simulateWriteError?.message}
        backendMessage={backendMessage}
        requestId={requestId}
      />
    </AuthGuard>
  )
}
