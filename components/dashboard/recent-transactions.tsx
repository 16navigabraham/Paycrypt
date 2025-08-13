"use client"

import { useEffect, useState } from "react"
import { getUserHistory } from "@/lib/api"
import Link from "next/link"
import { TransactionReceiptModal } from "@/components/TransactionReceiptModal"
import { Button } from "@/components/ui/button"
import { useSafeWagmi } from "@/hooks/useSafeWagmi"
import * as htmlToImage from 'html-to-image'
import download from 'downloadjs'

interface Transaction {
  requestId: string
  userAddress: string
  transactionHash: string
  serviceType: string
  serviceID: string
  variationCode?: string
  customerIdentifier: string
  amountNaira: number
  cryptoUsed: number
  cryptoSymbol: string
  onChainStatus: string
  vtpassStatus: string
  vtpassResponse?: any
  createdAt: string
}

interface Props {
  wallet: { address: string } | null
}

export default function RecentTransactions({ wallet }: Props) {
  const [mounted, setMounted] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Transaction | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Use safe wagmi hook
  const { address, isConnected } = useSafeWagmi();

  // Set mounted
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const fetchHistory = async () => {
      // Use address from safe wagmi hook or wallet prop
      const walletAddress = address || wallet?.address;
      
      if (walletAddress) {
        try {
          setLoading(true)
          const data = await getUserHistory(walletAddress)
          setTransactions(data.orders.slice(0, 5))
        } catch (err) {
          console.error("Failed to fetch recent transactions:", err)
        } finally {
          setLoading(false)
        }
      }
    }

    fetchHistory()
  }, [mounted, wallet, address, isConnected])

  const openModal = (txn: Transaction) => {
    setSelectedOrder(txn)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedOrder(null)
  }

  const downloadAsImage = async () => {
    const node = document.getElementById("printable-receipt")
    if (!node) return

    try {
      const dataUrl = await htmlToImage.toPng(node)
      if (selectedOrder)
        download(dataUrl, `receipt-${selectedOrder.requestId}.png`)
    } catch (error) {
      console.error("Failed to generate image:", error)
    }
  }

  // Don't render until mounted
  if (!mounted) {
    return (
      <div className="bg-white dark:bg-black border p-4 rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-black border p-4 rounded-lg shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>
      {loading && <p className="text-muted-foreground">Loading...</p>}
      {!loading && transactions.length === 0 && (
        <p className="text-muted-foreground">No recent transactions found.</p>
      )}
      <ul className="space-y-2">
        {transactions.map((txn) => (
          <li key={txn.requestId} className="text-sm">
            <div className="flex justify-between items-center">
              <div>
                <span>
                  {txn.serviceType.toUpperCase()} • ₦{txn.amountNaira} • {txn.cryptoUsed.toFixed(4)} {txn.cryptoSymbol}
                </span>
                <div className="text-muted-foreground text-xs">
                  {new Date(txn.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs ${
                    txn.vtpassStatus === "successful"
                      ? "text-green-600"
                      : txn.vtpassStatus === "pending"
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {txn.vtpassStatus}
                </span>
                <Button size="sm" variant="outline" onClick={() => openModal(txn)}>
                  Print Receipt
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="text-right mt-4">
        <Link href="/history" className="text-blue-500 hover:underline text-sm">
          View All →
        </Link>
      </div>

      {selectedOrder && (
        <TransactionReceiptModal
          isOpen={isModalOpen}
          onClose={closeModal}
          order={selectedOrder}
        />
      )}
    </div>
  )
}