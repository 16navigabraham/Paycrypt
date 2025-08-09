//app/airtime/page.tsx

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertCircle, Smartphone } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"

import BackToDashboard from "@/components/BackToDashboard"
import AuthGuard from "@/components/AuthGuard"
import { TransactionStatusModal } from "@/components/TransactionStatusModal"

import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/config/contract"
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { parseUnits, toBytes, toHex, Hex, formatUnits, encodeFunctionData } from 'viem'
import { toast } from 'sonner'

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

type TxStatus = 'idle' | 'approving' | 'paying' | 'processing' | 'success' | 'error'

// Map our status to TransactionStatusModal expected types
const getModalStatus = (status: TxStatus): "idle" | "approving" | "confirming" | "success" | "error" | "waitingForSignature" | "sending" | "waitingForApprovalSignature" | "approvalSuccess" | "approvalError" | "backendProcessing" | "backendSuccess" | "backendError" => {
  switch (status) {
    case 'approving':
      return 'waitingForApprovalSignature'
    case 'paying':
      return 'sending'
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
  const [approvalHash, setApprovalHash] = useState<Hex>()
  const backendRequestSentRef = useRef<Hex | null>(null)

  // Hooks
  const { authenticated, user, sendTransaction } = usePrivy()
  const { wallets } = useWallets()

  // Embedded wallet detection - Privy automatically creates this when user logs in
  const embeddedWallet = wallets.find((w: PrivyWallet) => w.walletClientType === 'privy')
  const hasEmbeddedWallet = Boolean(embeddedWallet)

  // Derived values
  const selectedTokenObj = activeTokens.find(t => t.address === selectedToken)
  const priceNGN = selectedTokenObj ? prices[selectedTokenObj.coingeckoId]?.ngn : null
  const amountNGN = Number(amount) || 0
  const cryptoNeeded = priceNGN && amountNGN ? amountNGN / priceNGN : 0
  const tokenAmountForOrder = selectedTokenObj ? parseUnits(cryptoNeeded.toFixed(selectedTokenObj.decimals), selectedTokenObj.decimals) : BigInt(0)
  const bytes32RequestId = requestId ? toHex(toBytes(requestId), { size: 32 }) : toHex(toBytes(""), { size: 32 })

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

  // Backend processing
  const handleBackendProcessing = useCallback(async (transactionHash: Hex) => {
    if (backendRequestSentRef.current === transactionHash) return

    backendRequestSentRef.current = transactionHash
    setTxStatus('processing')
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
        userAddress: embeddedWallet!.address
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
        setTxStatus('idle')
      }, 3000)

    } catch (error: any) {
      setTxStatus('error')
      const errorMsg = error.message?.includes('HTML') ? 'Server error' : 
                      error.message?.includes('JSON') ? 'Communication error' : 
                      error.message?.includes('fetch') ? 'Network error' : 
                      error.message || 'Unknown error'
      
      setTxError(`${errorMsg}. Request ID: ${requestId}`)
      setBackendMessage(`${errorMsg}. Request ID: ${requestId}`)
      toast.error(`Order failed: ${errorMsg}`, { id: 'backend' })
    }
  }, [requestId, phone, network, amountNGN, cryptoNeeded, selectedTokenObj, embeddedWallet])

  // Transaction execution (embedded wallet only)
  const handlePurchase = async () => {
    if (!authenticated) {
      toast.error("Please log in first")
      return
    }

    if (!embeddedWallet) {
      toast.error("No built-in wallet found. Please refresh the page.")
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

    // Start transaction
    setShowTxModal(true)
    setTxStatus('approving')
    setTxError(null)
    setBackendMessage(null)
    backendRequestSentRef.current = null

    try {
      console.log("Starting token approval and transaction:", {
        token: selectedTokenObj?.symbol,
        amount: formatUnits(tokenAmountForOrder, selectedTokenObj!.decimals),
        requestId
      })

      // Step 1: Approve token spending
      toast.info("Approving token spending...")
      
      const approvalData = encodeFunctionData({
        abi: [
          {
            name: 'approve',
            type: 'function',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ name: '', type: 'bool' }]
          }
        ],
        functionName: 'approve',
        args: [CONTRACT_ADDRESS as Hex, tokenAmountForOrder]
      })

      const approvalResult = await sendTransaction({
        to: selectedTokenObj!.address as Hex,
        data: approvalData,
        value: 0n
      })

      console.log("Approval transaction sent:", approvalResult.transactionHash)
      setApprovalHash(approvalResult.transactionHash as Hex)
      toast.success("Token spending approved!")

      // Step 2: Create the order
      setTxStatus('paying')
      toast.info("Creating your airtime order...")
      
      const orderData = encodeFunctionData({
        abi: CONTRACT_ABI,
        functionName: 'createOrder',
        args: [bytes32RequestId, selectedTokenObj!.address as Hex, tokenAmountForOrder]
      })

      const orderResult = await sendTransaction({
        to: CONTRACT_ADDRESS,
        data: orderData,
        value: 0n
      })

      console.log("Order transaction sent:", orderResult.transactionHash)
      setTxHash(orderResult.transactionHash as Hex)
      toast.success("Transaction sent! Processing order...")
      
      // Process with backend
      await handleBackendProcessing(orderResult.transactionHash as Hex)
      
    } catch (error: any) {
      console.error("Transaction failed:", error)
      setTxStatus('error')
      
      // Handle specific error types
      if (error.message?.includes('network')) {
        setTxError("Network error. Built-in wallets should automatically use Base network. Please contact support.")
      } else if (error.message?.includes('insufficient')) {
        setTxError("Insufficient token balance for this transaction.")
      } else if (error.message?.includes('rejected')) {
        setTxError("Transaction was rejected. Please try again.")
      } else if (error.message?.includes('allowance')) {
        setTxError("Token approval failed. Please try again.")
      } else {
        setTxError(error.message || "Transaction failed. Please try again.")
      }
      
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
                tokenAmountForOrder > 0 &&
                hasEmbeddedWallet

  const isProcessing = ['approving', 'paying', 'processing'].includes(txStatus)
  const isDisabled = !canPay || isProcessing

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
            Purchase airtime using your built-in wallet on Base network
          </p>
        </div>

        {/* Wallet Status */}
        {!authenticated && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please log in to access your built-in wallet and start making purchases
            </AlertDescription>
          </Alert>
        )}

        {authenticated && !hasEmbeddedWallet && (
          <Alert className="mb-6">
            <Smartphone className="h-4 w-4" />
            <AlertDescription>
              <div>
                <p className="font-medium">Setting up your built-in wallet...</p>
                <p className="text-sm mt-1">Please wait a moment while we initialize your wallet</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Built-in Wallet Purchase</CardTitle>
            <CardDescription>
              Fast and secure airtime purchase with your built-in wallet
            </CardDescription>
            {hasEmbeddedWallet && (
              <div className="flex items-center justify-between pt-2 text-sm">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-blue-500" />
                  <span className="text-muted-foreground">Built-in Wallet</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default">Base Network</Badge>
                  <span className="font-mono text-xs">
                    {embeddedWallet?.address?.slice(0, 6)}...{embeddedWallet?.address?.slice(-4)}
                  </span>
                </div>
              </div>
            )}
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Token Selection */}
            <div className="space-y-2">
              <Label>Pay With</Label>
              <Select value={selectedToken} onValueChange={setSelectedToken} disabled={!hasEmbeddedWallet}>
                <SelectTrigger>
                  <SelectValue placeholder={hasEmbeddedWallet ? "Select token" : "Wallet initializing..."} />
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
              <Select value={network} onValueChange={setNetwork} disabled={!hasEmbeddedWallet}>
                <SelectTrigger>
                  <SelectValue placeholder={hasEmbeddedWallet ? "Select provider" : "Wallet initializing..."} />
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
                disabled={!hasEmbeddedWallet}
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
                disabled={!hasEmbeddedWallet}
              />
            </div>

            {/* Transaction Summary */}
            {requestId && hasEmbeddedWallet && (
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
                <div className="flex justify-between">
                  <span>Network:</span>
                  <span>Base (Automatic)</span>
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
              {txStatus === 'approving' ? (
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
              ) : !hasEmbeddedWallet ? (
                "Wallet Initializing..."
              ) : !canPay ? (
                "Fill All Details"
              ) : (
                "Purchase Airtime"
              )}
            </Button>

            {/* Info */}
            <div className="text-xs text-center text-muted-foreground space-y-1">
              <p>🔒 Your built-in wallet is secured by your account</p>
              <p>🌐 Automatically uses Base network for all transactions</p>
              <p>⚡ No browser extensions or network switching required</p>
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