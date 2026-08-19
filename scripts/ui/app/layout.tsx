import type { Metadata } from 'next'
import './globals.css'
import { Provider } from './provider'

export const metadata: Metadata = { title: 'pergunta', description: 'as perguntas abertas dos agentes' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white antialiased">
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
