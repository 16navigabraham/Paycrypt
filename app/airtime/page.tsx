//app/airtime/page.tsx
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertCircle, AlertTriangle, Smartphone, ExternalLink } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"

import BackToDashboard from "@/components/BackToDashboard"
import AuthGuard from "@/components/AuthGuard"
import { TransactionStatusModal } from "@/components/TransactionStatusModal"

import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/config/contract"
import { ERC20_ABI } from "@/config/erc20Abi"
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { parseUnits, toBytes, toHex, Hex, fromHex, formatUnits, encodeFunctionData } from 'viem'
import { toast } from 'sonner'
import { base } from 'wagmi/chains'

import { buyAirtime } from "@/lib/api"
import { TokenConfig } from "@/lib/tokenlist"
import { fetchActiveTokensWithMetadata } from "@/lib/tokenUtils"

// Types
interface PrivyWallet {
  address: string
  walletClientType: string
  connectorType?: string
  imported?: boolean
  sendTransaction?: (params: { to: string; data: string; value: bigint }) => Promise<{ transactionHash: string }>
  [key: string]: any
}

type TxStatus = 'idle' | 'connecting' | 'approving' | 'paying' | 'confirming' | 'processing' | 'success' | 'error'

// Map our status to TransactionStatusModal expected types
const getModalStatus = (status: TxStatus): "idle" | "approving" | "confirming" | "success" | "error" | "waitingForSignature" | "sending" | "waitingForApprovalSignature" | "approvalSuccess" | "approvalError" | "backendProcessing" | "backendSuccess" | "backendError" => {
  switch (status) {
    case 'connecting':
      return 'waitingForSignature'
    case 'approving':
      return 'waitingForApprovalSignature'
    case 'paying':
      return 'sending'
    case 'confirming':
      return 'confirming'
    case 'processing':
      return 'backendProcessing'
    case 'success':
      return 'backendSuccess'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}

// Constants
const NETWORKS = [
  { serviceID: "mtn", name: "MTN" },
  { serviceID: "glo", name: "Glo" },
  { serviceID: "airtel", name: "Airtel" },
  { serviceID: "9mobile", name: "9mobile" },
]

const generateRequestId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

// Fetch token prices
async function fetchPrices(tokenList: TokenConfig[]) {
  if (!tokenList?.length) return {}
  const ids = tokenList.map(c => c.coingeckoId).join(",")
  const res = await fetch(`https://paycrypt-margin-price.onrender.com/api/v3/simple/price?ids=${ids}&vs_currencies=ngn`)
  return res.ok ? await res.json() : {}
}

export default function AirtimePage() {
  // State
  const [activeTokens, setActiveTokens] = useState<TokenConfig[]>([])
  const [selectedToken, setSelectedToken] = useState("")
  const [network, setNetwork] = useState("")
  const [amount, setAmount] = useState("")
  const [phone, setPhone] = useState("")
  const [prices, setPrices] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [requestId, setRequestId] = useState<string>()

  // Transaction state
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  const [txError, setTxError] = useState<string | null>(null)
  const [backendMessage, setBackendMessage] = useState<string | null>(null)
  const [showTxModal, setShowTxModal] = useState(false)
  const [txHash, setTxHash] = useState<Hex>()
  const backendRequestSentRef = useRef<Hex | null>(null)

  // Hooks
  const { authenticated, connectWallet, setActiveWallet } = usePrivy()
  const { wallets } = useWallets()
  const { address, chainId } = useAccount()

  // Contract interactions
  const { writeContract: writeApprove, data: approveHash, isPending: isApproving, reset: resetApprove } = useWriteContract()
  const { writeContract: writeOrder, data: orderHash, isPending: isOrdering, reset: resetOrder } = useWriteContract()
  
  const { isLoading: isApprovalConfirming, isSuccess: isApprovalConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
    query: { enabled: Boolean(approveHash) }
  })
  
  const { isLoading: isOrderConfirming, isSuccess: isOrderConfirmed } = useWaitForTransactionReceipt({
    hash: orderHash,
    query: { enabled: Boolean(orderHash) }
  })

  // Wallet detection
  const embeddedWallet = wallets.find((w: PrivyWallet) => w.walletClientType === 'privy')
  const externalWallets = wallets.filter((w: PrivyWallet) => w.walletClientType !== 'privy')
  const activeWallet = wallets.find((w: PrivyWallet) => w.address === address)
  const isEmbeddedWallet = activeWallet?.walletClientType === 'privy'
  const isOnBaseChain = chainId === base.id

  // Current wallet address (either connected or available)
  const walletAddress = address || embeddedWallet?.address
  const hasWallet = Boolean(walletAddress)

  // Derived values
  const selectedTokenObj = activeTokens.find(t => t.address === selectedToken)
  const priceNGN = selectedTokenObj ? prices[selectedTokenObj.coingeckoId]?.ngn : null
  const amountNGN = Number(amount) || 0
  const cryptoNeeded = priceNGN && amountNGN ? amountNGN / priceNGN : 0
  const tokenAmountForOrder = selectedTokenObj ? parseUnits(cryptoNeeded.toFixed(selectedTokenObj.decimals), selectedTokenObj.decimals) : BigInt(0)
  const bytes32RequestId = requestId ? toHex(toBytes(requestId), { size: 32 }) : toHex(toBytes(""), { size: 32 })

  // Check if order exists
  const { data: existingOrder } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getOrder',
    args: [fromHex(bytes32RequestId, 'bigint')],
    query: { enabled: Boolean(requestId && walletAddress) }
  })

  // Auto-connect embedded wallet
  useEffect(() => {
    const autoConnect = async () => {
      if (authenticated && embeddedWallet && !address) {
        try {
          await setActiveWallet(embeddedWallet)
          toast.success("Built-in wallet connected!")
        } catch (error) {
          console.error("Auto-connect failed:", error)
        }
      }
    }
    
    const timer = setTimeout(autoConnect, 1000)
    return () => clearTimeout(timer)
  }, [authenticated, embeddedWallet, address, setActiveWallet])

  // Load tokens and prices
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const tokens = await fetchActiveTokensWithMetadata()
        const erc20Tokens = tokens.filter(token => token.tokenType !== 0)
        setActiveTokens(erc20Tokens)
        
        const tokenPrices = await fetchPrices(erc20Tokens)
        setPrices(tokenPrices)
      } catch (error) {
        console.error("Failed to load tokens:", error)
        toast.error("Failed to load token data")
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])

  // Generate request ID
  useEffect(() => {
    if ((selectedToken || network || amount || phone) && !requestId) {
      setRequestId(generateRequestId())
    } else if (!(selectedToken || network || amount || phone) && requestId) {
      setRequestId(undefined)
    }
  }, [selectedToken, network, amount, phone, requestId])

  // Transaction monitoring
  useEffect(() => {
    if (isApprovalConfirmed && txStatus === 'approving') {
      setTxStatus('paying')
      toast.success("Token approved! Proceeding with payment...")
      
      // Auto-proceed with order after approval
      setTimeout(() => {
        if (selectedTokenObj && requestId) {
          writeOrder({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'createOrder',
            args: [bytes32RequestId, selectedTokenObj.address as Hex, tokenAmountForOrder]
          })
        }
      }, 1000)
    }
  }, [isApprovalConfirmed, txStatus, writeOrder, bytes32RequestId, selectedTokenObj, tokenAmountForOrder, requestId])

  useEffect(() => {
    if (isOrderConfirmed && txStatus === 'paying') {
      setTxStatus('processing')
      setTxHash(orderHash!)
      toast.success("Payment confirmed! Processing order...")
      
      if (orderHash) {
        handleBackendProcessing(orderHash)
      }
    }
  }, [isOrderConfirmed, txStatus, orderHash])

  // Backend processing
  const handleBackendProcessing = useCallback(async (transactionHash: Hex) => {
    if (backendRequestSentRef.current === transactionHash) return

    backendRequestSentRef.current = transactionHash
    setBackendMessage("Processing your order...")
    toast.loading("Processing with service provider...", { id: 'backend' })

    try {
      await buyAirtime({
        requestId: requestId!,
        phone,
        serviceID: network,
        amount: amountNGN,
        cryptoUsed: parseFloat(cryptoNeeded.toFixed(selectedTokenObj?.decimals || 6)),
        cryptoSymbol: selectedTokenObj?.symbol ?? "",
        transactionHash,
        userAddress: walletAddress!
      })

      setTxStatus('success')
      setBackendMessage("Airtime delivered successfully!")
      toast.success("Airtime delivered!", { id: 'backend' })

      // Reset form
      setTimeout(() => {
        setSelectedToken("")
        setNetwork("")
        setAmount("")
        setPhone("")
        setRequestId(undefined)
        backendRequestSentRef.current = null
      }, 3000)

    } catch (error: any) {
      setTxStatus('error')
      const errorMsg = error.message?.includes('HTML') ? 'Server error' : 
                      error.message?.includes('JSON') ? 'Communication error' : 
                      error.message?.includes('fetch') ? 'Network error' : 
                      error.message || 'Unknown error'
      
      setBackendMessage(`${errorMsg}. Request ID: ${requestId}`)
      toast.error(`Order failed: ${errorMsg}`, { id: 'backend' })
    }
  }, [requestId, phone, network, amountNGN, cryptoNeeded, selectedTokenObj, walletAddress])

  // Wallet connection
  const handleConnectWallet = async () => {
    if (!authenticated) {
      toast.error("Please log in first")
      return
    }

    setTxStatus('connecting')
    
    try {
      if (embeddedWallet && !address) {
        await setActiveWallet(embeddedWallet)
        toast.success("Built-in wallet connected!")
      } else {
        await connectWallet()
      }
    } catch (error) {
      console.error("Connection failed:", error)
      toast.error("Failed to connect wallet")
    } finally {
      setTxStatus('idle')
    }
  }

  // Transaction execution
  const handlePurchase = async () => {
    if (!authenticated) {
      toast.error("Please log in first")
      return
    }

    if (!walletAddress) {
      await handleConnectWallet()
      return
    }

    if (!isOnBaseChain) {
      toast.error("Please switch to Base network")
      return
    }

    // Validation
    if (phone.length < 10 || phone.length > 11) {
      toast.error("Enter valid Nigerian phone number (10-11 digits)")
      return
    }

    if (amountNGN < 100 || amountNGN > 50000) {
      toast.error("Amount must be between ₦100 and ₦50,000")
      return
    }

    if (!priceNGN || cryptoNeeded <= 0) {
      toast.error("Unable to calculate crypto amount")
      return
    }

    if (existingOrder?.user !== '0x0000000000000000000000000000000000000000') {
      toast.error("Order already exists. Please refresh and try again.")
      setRequestId(generateRequestId())
      return
    }

    // Start transaction
    setShowTxModal(true)
    setTxStatus('approving')
    setTxError(null)
    setBackendMessage(null)
    backendRequestSentRef.current = null

    // Reset previous transactions
    resetApprove()
    resetOrder()

    try {
      console.log("Starting transaction:", {
        walletType: isEmbeddedWallet ? "Embedded" : "External",
        token: selectedTokenObj?.symbol,
        amount: formatUnits(tokenAmountForOrder, selectedTokenObj!.decimals)
      })

      if (isEmbeddedWallet) {
        // Embedded wallet: Direct transaction
        toast.info("Processing with built-in wallet...")
        
        const data = encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'createOrder',
          args: [bytes32RequestId, selectedTokenObj!.address as Hex, tokenAmountForOrder]
        })

        const result = await embeddedWallet!.sendTransaction!({
          to: CONTRACT_ADDRESS,
          data,
          value: 0n
        })

        setTxHash(result.transactionHash as Hex)
        setTxStatus('processing')
        toast.success("Transaction sent! Processing order...")
        
        await handleBackendProcessing(result.transactionHash as Hex)
        
      } else {
        // External wallet: Approval + Order
        toast.info("Approving token spend...")
        
        const unlimitedApproval = parseUnits('115792089237316195423570985008687907853269984665640564039457584007913129639935', 0)
        
        writeApprove({
          address: selectedTokenObj!.address as Hex,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [CONTRACT_ADDRESS, unlimitedApproval]
        })
      }

    } catch (error: any) {
      console.error("Transaction failed:", error)
      setTxStatus('error')
      setTxError(error.message || "Transaction failed")
      toast.error("Transaction failed")
    }
  }

  // Form validation
  const canPay = selectedToken && 
                network && 
                amount && 
                amountNGN >= 100 && 
                amountNGN <= 50000 && 
                phone.length >= 10 && 
                priceNGN && 
                tokenAmountForOrder > 0

  const isProcessing = txStatus !== 'idle' && txStatus !== 'error'
  const isDisabled = !canPay || isProcessing || !isOnBaseChain

  if (loading) {
    return (
      <AuthGuard>
        <div className="container py-10 max-w-xl mx-auto">
          <div className="flex items-center justify-center p-10">
            <Loader2 className="w-8 h-8 animate-spin mr-2" />
            <span>Loading tokens...</span>
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="container py-10 max-w-xl mx-auto">
        <BackToDashboard />
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Buy Airtime</h1>
          <p className="text-muted-foreground">
            Purchase airtime using ERC20 tokens on Base network
          </p>
        </div>

        {/* Wallet Status */}
        {!hasWallet && authenticated && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span>Connect a wallet to start making purchases</span>
                <Button variant="outline" size="sm" onClick={handleConnectWallet} disabled={txStatus === 'connecting'}>
                  {txStatus === 'connecting' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : embeddedWallet ? (
                    <>
                      <Smartphone className="w-4 h-4 mr-2" />
                      Connect Built-in Wallet
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Connect External Wallet
                    </>
                  )}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {hasWallet && !isOnBaseChain && (
          <Alert className="mb-6 border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              Please switch to Base network to continue
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Crypto to Airtime</CardTitle>
            <CardDescription>
              Convert your crypto to airtime instantly
            </CardDescription>
            {hasWallet && (
              <div className="flex items-center justify-between pt-2 text-sm">
                <div className="text-muted-foreground">
                  {isEmbeddedWallet ? '📱 Built-in' : '🔗 External'} Wallet
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={isOnBaseChain ? "default" : "destructive"}>
                    {isOnBaseChain ? "Base Network" : "Wrong Network"}
                  </Badge>
                  <span className="font-mono text-xs">
                    {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                  </span>
                </div>
              </div>
            )}
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Token Selection */}
            <div className="space-y-2">
              <Label>Pay With</Label>
              <Select value={selectedToken} onValueChange={setSelectedToken}>
                <SelectTrigger>
                  <SelectValue placeholder="Select token" />
                </SelectTrigger>
                <SelectContent>
                  {activeTokens.map(token => (
                    <SelectItem key={token.address} value={token.address}>
                      {token.symbol} - {token.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Network Selection */}
            <div className="space-y-2">
              <Label>Network Provider</Label>
              <Select value={network} onValueChange={setNetwork}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
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

            {/* Amount Input */}
            <div className="space-y-2">
              <Label>Amount (NGN)</Label>
              <Input
                type="number"
                placeholder="₦100 - ₦50,000"
                value={amount}
                onChange={e => {
                  const val = e.target.value
                  if (val === "" || val === "0") {
                    setAmount("")
                  } else {
                    const numVal = Math.max(0, parseInt(val))
                    setAmount(String(Math.min(numVal, 50000)))
                  }
                }}
                min="100"
                max="50000"
              />
              {amountNGN > 0 && priceNGN && selectedTokenObj && (
                <div className="text-sm text-muted-foreground flex items-center justify-between">
                  <span>
                    ≈ {cryptoNeeded.toFixed(selectedTokenObj.decimals)} {selectedTokenObj.symbol}
                  </span>
                  <Badge variant="secondary">
                    1 {selectedTokenObj.symbol} = ₦{priceNGN.toLocaleString()}
                  </Badge>
                </div>
              )}
            </div>

            {/* Phone Input */}
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                type="tel"
                placeholder="Enter phone number"
                value={phone}
                onChange={e => {
                  const cleaned = e.target.value.replace(/\D/g, "")
                  setPhone(cleaned.slice(0, 11))
                }}
                maxLength={11}
              />
            </div>

            {/* Transaction Summary */}
            {requestId && (
              <div className="border-t pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Request ID:</span>
                  <span className="font-mono text-xs">{requestId}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span>₦{amountNGN.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>You pay:</span>
                  <span className="font-medium">
                    {cryptoNeeded.toFixed(selectedTokenObj?.decimals || 6)} {selectedTokenObj?.symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Provider:</span>
                  <span>{NETWORKS.find(n => n.serviceID === network)?.name}</span>
                </div>
              </div>
            )}

            {/* Purchase Button */}
            <Button
              className="w-full"
              onClick={handlePurchase}
              disabled={isDisabled}
              size="lg"
            >
              {txStatus === 'connecting' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting Wallet...
                </>
              ) : txStatus === 'approving' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Approving Token...
                </>
              ) : txStatus === 'paying' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing Payment...
                </>
              ) : txStatus === 'processing' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing Order...
                </>
              ) : txStatus === 'success' ? (
                "✅ Airtime Delivered!"
              ) : !hasWallet ? (
                "Connect Wallet First"
              ) : !isOnBaseChain ? (
                "Switch to Base Network"
              ) : !canPay ? (
                "Fill All Details"
              ) : (
                `Purchase Airtime ${isEmbeddedWallet ? '' : '(Approve + Pay)'}`
              )}
            </Button>

            {/* Info */}
            <div className="text-xs text-center text-muted-foreground">
              {isEmbeddedWallet ? (
                "🚀 Built-in wallet provides streamlined transactions"
              ) : (
                "📝 External wallets require token approval then payment"
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <TransactionStatusModal
        isOpen={showTxModal}
        onClose={() => {
          if (!isProcessing) {
            setShowTxModal(false)
            setTxStatus('idle')
            setTxError(null)
            setBackendMessage(null)
          }
        }}
        txStatus={getModalStatus(txStatus)}
        transactionHash={txHash}
        errorMessage={txError}
        backendMessage={backendMessage}
        requestId={requestId}
      />
    </AuthGuard>
  )
}