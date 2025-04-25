import type { Metadata } from 'next'
import { Inter, Roboto_Mono } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter', 
  display: 'swap',
})

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AO-MCP - Arweave Model Context Protocol',
  description: 'Access Arweave\'s AO compute platform through the Model Context Protocol',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn('scroll-smooth', inter.variable, robotoMono.variable)}>
      <body className="min-h-screen font-sans bg-background">
        {children}
      </body>
    </html>
  )
} 