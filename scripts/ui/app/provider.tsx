'use client'
//! Só o HeroUI. O Convex saiu junto com o Docker — o estado agora vem por
//! `fetch` na rota local e por SSE, e nenhum dos dois precisa de provider.
import { HeroUIProvider } from '@heroui/react'

export function Provider({ children }: { children: React.ReactNode }) {
  return <HeroUIProvider>{children}</HeroUIProvider>
}
