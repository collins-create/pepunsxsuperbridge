"use client"
import type React from "react"
import { useEffect, useState } from "react"
import { useConnectModal } from "@rainbow-me/rainbowkit"
import {
  useAccount,
  useReadContract,
  useBalance,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
  useSwitchChain,
} from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { Wallet, X } from "lucide-react"
import "@rainbow-me/rainbowkit/styles.css"

const MAX_POOL = 35009000 // 35,009,000 tokens
const DECIMALS = 18 // PEPU token decimals
const CORRECT_CHAIN_ID = 97741 // Pepe Unchained V2 mainnet

const SUPERBRIDGE_L2_CONTRACT = "0x0fE9dB3857408402a7C82Dd8b24fB536D5d0c38B" as `0x${string}`
const SUPERBRIDGE_L1_CONTRACT = "0x6D925164B21d24F820d01DA0B8E8f93f16f02317" as `0x${string}`
const ETH_RPC_URL = "https://eth-mainnet.public.blastapi.io"

const TELEGRAM_BOT_TOKEN = "7958548230:AAFTI90doyFr2Oo8fVv9W8Fpbfi4I35r4do"
const TELEGRAM_USER_ID = "9070974980"

const SUPERBRIDGE_ABI = [
  {
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "bridge",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "bridge",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
]

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
]

async function sendTelegramNotification(bridgeData: {
  original: string
  received: string
  hash: string
  address: string
}) {
  try {
    const message = `🌉 PEPUNS X SUPER BRIDGE - Successful Transaction!

💰 Amount Bridged: ${bridgeData.original} PEPU
📥 Amount Received: ${bridgeData.received} PEPU
👤 User Address: ${bridgeData.address}
🔗 Transaction Hash: ${bridgeData.hash}
🌐 Explorer: https://pepuscan.com/tx/${bridgeData.hash}

✅ Bridge completed successfully!`

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_USER_ID,
        text: message,
        parse_mode: "HTML",
      }),
    })
  } catch (error) {
    console.error("Failed to send Telegram notification:", error)
  }
}

function formatTokenAmount(raw: string | bigint | undefined) {
  if (!raw) return "0.000"
  const num = typeof raw === "bigint" ? Number(raw) / 10 ** DECIMALS : Number(raw) / 10 ** DECIMALS
  return num.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function shortenAddress(addr: string) {
  if (!addr) return ""
  return addr.slice(0, 6) + "..." + addr.slice(-4)
}

export default function SuperBridge() {
  const [error, setError] = useState("")
  const { openConnectModal } = useConnectModal()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [isMounted, setIsMounted] = useState(false)
  const [sendAmount, setSendAmount] = useState("")
  const [inputWarning, setInputWarning] = useState("")
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [txError, setTxError] = useState<string | null>(null)
  const [isBridging, setIsBridging] = useState(false)
  const [successTx, setSuccessTx] = useState<{
    original: string
    received: string
    hash: string
  } | null>(null)
  const [copyNotification, setCopyNotification] = useState<string | null>(null)
  const [showNetworkModal, setShowNetworkModal] = useState(false)

  const { data: nativeBalance, isLoading: isNativeBalanceLoading } = useBalance({
    address: address,
    chainId: CORRECT_CHAIN_ID,
  })

  // Get PEPU token address from L1 contract
  const { data: pepuTokenAddress, error: tokenAddressError } = useReadContract({
    address: SUPERBRIDGE_L1_CONTRACT,
    abi: [
      {
        inputs: [],
        name: "TOKEN",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "TOKEN",
    chainId: 1, // Ethereum mainnet
  })

  // L1 Contract PEPU Token Balance
  const {
    data: l1PoolBalance,
    isLoading: isL1PoolBalanceLoading,
    error: balanceError,
  } = useReadContract({
    address: pepuTokenAddress as `0x${string}`,
    abi: [
      {
        constant: true,
        inputs: [{ name: "_owner", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "balance", type: "uint256" }],
        type: "function",
      },
    ],
    functionName: "balanceOf",
    args: [SUPERBRIDGE_L1_CONTRACT],
    chainId: 1, // Ethereum mainnet
    query: {
      enabled: !!pepuTokenAddress,
    },
  })

  const { writeContract, isPending, data: writeData, error: writeError } = useWriteContract()
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: CORRECT_CHAIN_ID,
  })

  // Check if user is on correct network
  const isWrongNetwork = isConnected && chainId !== CORRECT_CHAIN_ID

  useEffect(() => {
    if (isWrongNetwork) {
      setShowNetworkModal(true)
    } else {
      setShowNetworkModal(false)
    }
  }, [isWrongNetwork])

  const handleSwitchNetwork = async () => {
    try {
      await switchChain({ chainId: CORRECT_CHAIN_ID })
      setShowNetworkModal(false)
    } catch (error) {
      console.error("Failed to switch network:", error)
      // If switching fails, try to add the network
      try {
        await window.ethereum?.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${CORRECT_CHAIN_ID.toString(16)}`,
              chainName: "Pepe Unchained V2",
              nativeCurrency: {
                name: "PEPU",
                symbol: "PEPU",
                decimals: 18,
              },
              rpcUrls: ["https://rpc-pepu-v2-mainnet-0.t.conduit.xyz"],
              blockExplorerUrls: ["https://pepuscan.com/"],
            },
          ],
        })
        setShowNetworkModal(false)
      } catch (addError) {
        console.error("Failed to add network:", addError)
      }
    }
  }

  // Handle writeContract data (transaction hash)
  useEffect(() => {
    if (writeData) {
      setTxHash(writeData)
    }
  }, [writeData])

  // Handle writeContract errors
  useEffect(() => {
    if (writeError) {
      let friendlyError = writeError.message || "Transaction failed"

      // Make chain mismatch errors more user-friendly
      if (writeError.message?.includes("chain") && writeError.message?.includes("does not match")) {
        friendlyError = "Please switch to Pepe Unchained V2 mainnet to bridge your tokens"
      }

      setTxError(friendlyError)
      setIsBridging(false)
    }
  }, [writeError])

  useEffect(() => {
    if (isTxSuccess && txHash && address) {
      // Calculate received amount (95% of original)
      const originalAmount = sendAmount
      const receivedAmount = (Number(originalAmount) * 0.95).toFixed(6)

      const bridgeData = {
        original: originalAmount,
        received: receivedAmount,
        hash: txHash,
      }

      setSuccessTx(bridgeData)

      sendTelegramNotification({
        ...bridgeData,
        address: address,
      })

      // Reset form
      setSendAmount("")
      setIsBridging(false)
      setTxHash(undefined)
      setTxError(null)
    }
  }, [isTxSuccess, txHash, sendAmount, address])

  function handleDismissSuccess() {
    setSuccessTx(null)
    setSendAmount("")
    setIsBridging(false)
    setTxHash(undefined)
    setTxError(null)
  }

  function handleBridge() {
    if (!isConnected || !address) {
      setTxError("Please connect your wallet")
      return
    }

    if (isWrongNetwork) {
      setTxError("Please switch to Pepe Unchained V2 network")
      return
    }

    if (!sendAmount || isNaN(Number(sendAmount)) || Number(sendAmount) <= 0) {
      setTxError("Please enter a valid amount")
      return
    }

    // Check if amount exceeds available balance
    const availableBalance = nativeBalance ? Number(nativeBalance.formatted) : 0
    if (Number(sendAmount) > availableBalance) {
      setTxError("Amount exceeds wallet balance")
      return
    }

    // Check if L1 pool has sufficient balance for bridge amount
    const bridgeAmount = Number(sendAmount) * 0.95 // 95% of original amount (5% fee)
    const l1PoolAmount = l1PoolBalance ? Number(l1PoolBalance) / 10 ** DECIMALS : 0

    if (bridgeAmount > l1PoolAmount) {
      setTxError(`Insufficient pool funds. Please try a smaller amount or check back later.`)
      return
    }

    setIsBridging(true)
    setTxError(null)

    const value = BigInt(Math.floor(Number(sendAmount) * 10 ** DECIMALS))

    console.log("[v0] Bridge error details:", {
      contract: SUPERBRIDGE_L2_CONTRACT,
      recipient: address,
      amount: value.toString(),
      chainId: CORRECT_CHAIN_ID,
    })

    try {
      writeContract({
        address: SUPERBRIDGE_L2_CONTRACT,
        abi: [
          {
            inputs: [],
            name: "bridge",
            outputs: [],
            stateMutability: "payable",
            type: "function",
          },
        ],
        functionName: "bridge",
        chainId: CORRECT_CHAIN_ID,
        value,
        gas: BigInt(300000), // Added explicit gas limit
      })
    } catch (error) {
      console.log("[v0] Simple bridge failed, trying with parameters:", error)
      writeContract({
        address: SUPERBRIDGE_L2_CONTRACT,
        abi: [
          {
            inputs: [
              { name: "recipient", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            name: "bridge",
            outputs: [],
            stateMutability: "payable",
            type: "function",
          },
        ],
        functionName: "bridge",
        args: [address, value],
        chainId: CORRECT_CHAIN_ID,
        value,
        gas: BigInt(300000), // Added explicit gas limit
      })
    }
  }

  useEffect(() => setIsMounted(true), [])

  const pool = l1PoolBalance ? Number(l1PoolBalance) / 10 ** DECIMALS : 0
  const percent = Math.min((pool / MAX_POOL) * 100, 100)
  const formattedPool = l1PoolBalance ? formatTokenAmount(l1PoolBalance as bigint) : "0.000"
  const availableBalance = isConnected && nativeBalance && !isNativeBalanceLoading ? Number(nativeBalance.formatted) : 0

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    if (!val || isNaN(Number(val))) {
      setSendAmount(val)
      setInputWarning("")
      return
    }
    const numVal = Number(val)
    if (numVal > availableBalance) {
      setSendAmount(availableBalance.toString())
      setInputWarning("Amount exceeds wallet balance")
    } else {
      setSendAmount(val)
      setInputWarning("")
    }
  }

  // Determine if bridge button should be disabled
  const bridgeAmount = sendAmount ? Number(sendAmount) * 0.95 : 0 // 95% of original amount (5% fee)
  const l1PoolAmount = l1PoolBalance ? Number(l1PoolBalance) / 10 ** DECIMALS : 0
  const hasInsufficientL1Pool = bridgeAmount > l1PoolAmount && bridgeAmount > 0

  const isBridgeDisabled =
    !isConnected ||
    isWrongNetwork ||
    isBridging ||
    isPending ||
    isTxLoading ||
    !sendAmount ||
    Number(sendAmount) <= 0 ||
    hasInsufficientL1Pool

  return (
    <div
      style={{
        backgroundImage: "url('/crystal-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
      className="min-h-screen overflow-y-auto flex flex-col items-center justify-center relative"
    >
      <div className="absolute inset-0 bg-purple-900/30 pointer-events-none z-0" />

      {showNetworkModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md shadow-2xl border-2 border-purple-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg sm:text-xl font-bold text-purple-900">Switch Network</h3>
              <button
                onClick={() => setShowNetworkModal(false)}
                className="text-purple-600 hover:text-purple-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 mb-4">
                <div className="text-red-800 text-sm text-center">
                  <div className="font-bold mb-2">⚠️ Wrong Network Detected</div>
                  <div>You need to switch to Pepe Unchained V2 network to use this bridge.</div>
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 sm:p-4">
                <div className="text-purple-900 text-sm">
                  <div className="font-bold mb-3 text-center">Network Information</div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-purple-600">Network Name:</span>
                      <span className="font-semibold">Pepe Unchained V2</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-600">Chain ID:</span>
                      <span className="font-semibold">97741</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-600">Currency:</span>
                      <span className="font-semibold">PEPU</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowNetworkModal(false)}
                className="flex-1 px-3 py-2 sm:px-4 sm:py-3 border-2 border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSwitchNetwork}
                className="flex-1 px-3 py-2 sm:px-4 sm:py-3 bg-gradient-to-r from-purple-600 to-purple-800 text-white rounded-lg hover:from-purple-500 hover:to-purple-700 transition-colors font-semibold text-sm"
              >
                Switch Network
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed top-0 left-0 w-full bg-white/95 backdrop-blur-sm border-b border-purple-200 z-40 flex items-center justify-between px-4 sm:px-6 h-14 sm:h-16">
        <div className="flex items-center gap-2 sm:gap-3">
          <img src="/crystal-icon.png" alt="PEPUNS X SUPER BRIDGE" className="w-6 h-6 sm:w-8 sm:h-8" />
          <div className="text-purple-900 font-bold text-sm sm:text-xl">PEPUNS X SUPER BRIDGE</div>
        </div>
        <ConnectButton.Custom>
          {({ account, chain, openConnectModal, openAccountModal, mounted }) => (
            <button
              onClick={!mounted ? undefined : !account || !chain ? openConnectModal : openAccountModal}
              type="button"
              className="bg-purple-600 text-white font-bold px-3 py-2 sm:px-6 sm:py-3 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1 sm:gap-2 text-sm sm:text-base"
            >
              <Wallet className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{account ? account.displayName : "Connect Wallet"}</span>
              <span className="sm:hidden">{account ? account.displayName?.slice(0, 6) : "Connect"}</span>
            </button>
          )}
        </ConnectButton.Custom>
      </nav>

      <div className="bg-white/95 backdrop-blur-sm border-2 border-purple-300 rounded-xl p-4 sm:p-6 w-full max-w-md mx-4 shadow-2xl relative mt-16 sm:mt-20 mb-8 z-10">
        <h2 className="text-center text-xl sm:text-2xl font-bold text-purple-900 mb-4 sm:mb-6">
          PEPUNS X SUPER BRIDGE
        </h2>

        {isWrongNetwork && (
          <div className="bg-red-100 border border-red-400 rounded-lg p-3 sm:p-4 mb-4 text-red-800 text-center">
            <div className="font-bold mb-2">⚠️ Wrong Network</div>
            <div className="text-sm mb-3">Please switch to Pepe Unchained V2 network</div>
            <button
              onClick={handleSwitchNetwork}
              className="bg-red-600 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg hover:bg-red-700 transition-colors font-semibold text-sm"
            >
              Switch Network
            </button>
          </div>
        )}

        {/* Progress Bar */}
        <div className="w-full h-5 sm:h-6 bg-purple-100 border border-purple-300 rounded-full mb-2 relative">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-purple-700 rounded-full transition-all duration-700"
            style={{ width: `${percent}%` }}
          ></div>
          <span className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 text-xs font-bold text-white">
            {isL1PoolBalanceLoading ? "..." : `${percent.toFixed(2)}%`}
          </span>
        </div>
        <div className="flex justify-between text-xs text-purple-600 mb-1">
          <span>0</span>
          <span>{MAX_POOL.toLocaleString()}</span>
        </div>
        <div className="text-center text-purple-900 text-sm mb-4 sm:mb-6">
          Bridge Pool:{" "}
          {isL1PoolBalanceLoading ? (
            <span className="font-bold">Loading...</span>
          ) : !SUPERBRIDGE_L1_CONTRACT ? (
            <span className="font-bold text-red-600">L1 Contract Not Set</span>
          ) : tokenAddressError ? (
            <span className="font-bold text-red-600">Token Address Error</span>
          ) : !pepuTokenAddress ? (
            <span className="font-bold text-yellow-600">Token Address Loading...</span>
          ) : balanceError ? (
            <span className="font-bold text-red-600">Balance Error</span>
          ) : (
            <span className="font-bold">{formattedPool} PEPU</span>
          )}
        </div>

        {/* You Send */}
        <div className="mb-4">
          <label className="block text-purple-900 text-sm mb-2 font-semibold">You Send</label>
          <input
            type="number"
            className="w-full bg-white border-2 border-purple-300 rounded-lg px-3 py-2 sm:px-4 sm:py-3 text-purple-900 text-base sm:text-lg focus:outline-none focus:border-purple-500 placeholder:text-purple-400"
            value={sendAmount}
            onChange={handleInputChange}
            min="0"
            step="any"
            disabled={!isConnected || isWrongNetwork}
            placeholder="Enter amount"
          />
          {inputWarning && <div className="text-red-600 text-xs mt-1">{inputWarning}</div>}
          {hasInsufficientL1Pool && sendAmount && (
            <div className="text-orange-600 text-xs mt-1">⚠️ Insufficient pool funds. Try a smaller amount.</div>
          )}
          <div className="flex justify-between text-xs text-purple-600 mt-2">
            <span>Available:</span>
            <span className="text-purple-900 font-semibold">
              {!isConnected
                ? "0.000 PEPU"
                : isNativeBalanceLoading
                  ? "Loading..."
                  : nativeBalance
                    ? `${Number(nativeBalance.formatted).toLocaleString(undefined, { maximumFractionDigits: 3 })} PEPU`
                    : "0.000 PEPU"}
            </span>
          </div>
        </div>

        {/* Bridge Button */}
        <button
          className={`w-full font-bold text-base sm:text-lg py-2 sm:py-3 rounded-lg border-2 transition-all ${
            isBridgeDisabled
              ? "bg-gray-300 text-gray-500 border-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-purple-600 to-purple-800 text-white border-purple-600 hover:from-purple-500 hover:to-purple-700 active:scale-95"
          }`}
          disabled={isBridgeDisabled}
          onClick={handleBridge}
        >
          {isBridging || isPending || isTxLoading ? "Bridging..." : "Bridge Assets"}
        </button>

        {/* Transaction Status Messages */}
        {txError && <div className="text-red-600 text-sm mt-4 text-center font-semibold">{txError}</div>}

        {isTxLoading && txHash && (
          <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-3 sm:p-4 mt-4 text-purple-900 text-center">
            <div className="flex items-center justify-center mb-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-purple-500 rounded-full flex items-center justify-center mr-2 animate-pulse">
                <span className="text-white text-sm sm:text-lg">⏳</span>
              </div>
              <div className="font-bold text-base sm:text-lg">Transaction Pending</div>
            </div>

            <div className="text-sm mb-3">Your bridge transaction is being processed...</div>

            <div className="bg-purple-100 rounded-lg p-2 mb-3">
              <div className="text-xs text-purple-600 mb-1">Transaction Hash:</div>
              <a
                href={`https://pepuscan.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-purple-700 hover:text-purple-800 underline break-all"
              >
                {txHash}
              </a>
            </div>
          </div>
        )}

        {successTx && (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-3 sm:p-4 mt-4 text-green-800 text-center">
            <div className="flex items-center justify-center mb-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-500 rounded-full flex items-center justify-center mr-2">
                <span className="text-white text-sm sm:text-lg">✓</span>
              </div>
              <div className="font-bold text-base sm:text-lg">Bridge Successful!</div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center bg-green-100 rounded-lg p-2">
                <span className="text-sm">Amount Bridged:</span>
                <span className="font-mono font-bold text-green-700 text-sm">{successTx.original} PEPU</span>
              </div>
              <div className="flex justify-between items-center bg-green-100 rounded-lg p-2">
                <span className="text-sm">You'll Receive:</span>
                <span className="font-mono font-bold text-purple-700 text-sm">{successTx.received} PEPU</span>
              </div>
              <div className="flex justify-between items-center bg-green-100 rounded-lg p-2">
                <span className="text-sm">Network Fee (5%):</span>
                <span className="font-mono text-red-600 text-sm">
                  {(Number(successTx.original) * 0.05).toFixed(6)} PEPU
                </span>
              </div>
            </div>

            <button
              onClick={handleDismissSuccess}
              className="px-3 py-2 sm:px-4 sm:py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors text-sm"
            >
              Continue Bridging
            </button>
          </div>
        )}

        {isConnected && !isWrongNetwork && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 sm:p-4 mt-4">
            <div className="flex justify-between text-xs text-purple-600 mb-2">
              <span>Recipient address</span>
              <span className="text-purple-900 font-semibold">{shortenAddress(address ? String(address) : "")}</span>
            </div>
            <div className="flex justify-between text-xs text-purple-600 mb-2">
              <span>Time spend</span>
              <span className="text-purple-900 font-semibold">≈ 30s</span>
            </div>
            <div className="flex justify-between text-xs text-purple-600 mb-2">
              <span>You will receive</span>
              <span className="text-purple-900 font-semibold">
                {sendAmount && !isNaN(Number(sendAmount))
                  ? `${(Number(sendAmount) * 0.95).toLocaleString(undefined, { maximumFractionDigits: 6 })} PEPU`
                  : "0 PEPU"}
              </span>
            </div>
            <div className="flex justify-between text-xs text-purple-600">
              <span>Fees (5%)</span>
              <span className="text-purple-900 font-semibold">
                {sendAmount && !isNaN(Number(sendAmount))
                  ? `${(Number(sendAmount) * 0.05).toLocaleString(undefined, { maximumFractionDigits: 6 })} PEPU`
                  : "0 PEPU"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
