"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

const pairs = [
	{ symbol: "USDT", name: "Tether", id: "tether" },
	{ symbol: "USDC", name: "USD Coin", id: "usd-coin" },
	{ symbol: "ETH", name: "Ethereum", id: "ethereum" },
]

export function MarketData() {
	const [rates, setRates] = useState<any>(null)
	const [loading, setLoading] = useState(true) // Start with loading true
	const [error, setError] = useState<string | null>(null)

	const fetchRates = async () => {
		setLoading(true)
		setError(null)
		try {
			const ids = pairs.map((p) => p.id).join(",")
			const res = await fetch(
				`https://paycrypt-margin-price.onrender.com/api/v3/simple/price?ids=${ids}&vs_currencies=ngn,usd`
			)
			
			if (!res.ok) {
				throw new Error(`API Error: ${res.status}`)
			}
			
			const data = await res.json()
			
			// Check if we got valid data
			if (!data || Object.keys(data).length === 0) {
				throw new Error('No price data received')
			}
			
			setRates(data) // data now has your +20 NGN margin!
			setError(null)
		} catch (err) {
			console.error('Failed to fetch rates:', err)
			setError(err instanceof Error ? err.message : 'Failed to fetch rates')
			setRates(null)
		} finally {
			setLoading(false)
		}
	}

	// Auto-fetch on component mount
	useEffect(() => {
		fetchRates()
	}, [])

	// Optional: Auto-refresh every 5 minutes
	useEffect(() => {
		const interval = setInterval(() => {
			fetchRates()
		}, 5 * 60 * 1000) // 5 minutes

		return () => clearInterval(interval)
	}, [])

	return (
		<Card className="shadow-lg border-2 hover:shadow-xl transition-shadow">
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>NGN ↔ Crypto Conversion</CardTitle>
						<CardDescription>
							Live rates for Naira to USDT, USDC, ETH
							{error && (
								<span className="text-red-500 text-xs block mt-1">
									{error}
								</span>
							)}
						</CardDescription>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={fetchRates}
						disabled={loading}
					>
						<RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
						{loading ? "Refreshing..." : "Refresh"}
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				{loading && !rates ? (
					<div className="flex items-center justify-center py-8">
						<RefreshCw className="h-6 w-6 animate-spin mr-2" />
						<span>Loading market data...</span>
					</div>
				) : (
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{pairs.map((pair) => {
							const rate = rates?.[pair.id]
							const hasValidRate = rate && rate.ngn && rate.usd
							
							return (
								<div
									key={pair.symbol}
									className="flex flex-col items-center justify-between p-3 rounded-lg border-2 hover:border-blue-200 dark:hover:border-blue-800 transition-colors bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-900"
								>
									<div className="font-medium text-lg">{pair.symbol}</div>
									<div className="text-sm text-muted-foreground mb-2">
										{pair.name}
									</div>
									<div className="text-center">
										<div>
											<span className="font-bold">₦</span>{" "}
											<span className="text-xl font-bold">
												{hasValidRate ? rate.ngn.toLocaleString() : "--"}
											</span>
										</div>
										<div className="text-xs text-muted-foreground">
											1 {pair.symbol} = ₦
											{hasValidRate ? rate.ngn.toLocaleString() : "--"}
										</div>
										<div className="text-xs text-muted-foreground">
											1 {pair.symbol} = $
											{hasValidRate ? rate.usd.toLocaleString() : "--"}
										</div>
									</div>
									<Badge 
										variant={hasValidRate ? "default" : "secondary"} 
										className="mt-2"
									>
										{hasValidRate ? "Live" : error ? "Error" : "Loading"}
									</Badge>
								</div>
							)
						})}
					</div>
				)}
			</CardContent>
		</Card>
	)
}