"use client"

import type React from "react"

import "@rainbow-me/rainbowkit/styles.css"
import { getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit"
import { WagmiProvider } from "wagmi"
import { mainnet, polygon, optimism, arbitrum, base } from "wagmi/chains"
import { QueryClientProvider, QueryClient } from "@tanstack/react-query"

// Define Pepe Unchained V2 chain
const pepuV2 = {
  id: 97741,
  name: "Pepe Unchained V2",
  iconUrl: "/crystal-icon.png",
  iconBackground: "#fff",
  nativeCurrency: { name: "PEPU", symbol: "PEPU", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc-pepu-v2-mainnet-0.t.conduit.xyz"] },
  },
  blockExplorers: {
    default: { name: "PepuScan", url: "https://pepuscan.com" },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 1,
    },
  },
} as const

const config = getDefaultConfig({
  appName: "PEPUNS X SUPER BRIDGE",
  projectId: "2f05ae7f1116030fde2d36508f472bfb",
  chains: [pepuV2, mainnet, polygon, optimism, arbitrum, base],
  ssr: true,
})

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
