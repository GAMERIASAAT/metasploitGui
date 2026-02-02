import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Box,
  Radio,
  Terminal,
  MoreHorizontal,
} from 'lucide-react'
import { useState } from 'react'

const primaryNavItems = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/sessions', label: 'Sessions', icon: Users },
  { path: '/modules', label: 'Modules', icon: Box },
  { path: '/listeners', label: 'Listeners', icon: Radio },
  { path: '/terminal', label: 'Terminal', icon: Terminal },
]

interface BottomNavProps {
  onMoreClick: () => void
}

export default function BottomNav({ onMoreClick }: BottomNavProps) {
  const location = useLocation()
  const [ripple, setRipple] = useState<{ path: string; x: number; y: number } | null>(null)

  const handleClick = (path: string, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setRipple({
      path,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    setTimeout(() => setRipple(null), 300)
  }

  const isActiveItem = (path: string) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-msf-darker border-t border-msf-border safe-area-bottom z-40">
      <div className="flex justify-around items-center h-16">
        {primaryNavItems.map((item) => {
          const isActive = isActiveItem(item.path)
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={(e) => handleClick(item.path, e)}
              className={`relative flex flex-col items-center justify-center flex-1 h-full min-w-[64px] transition-colors overflow-hidden touch-manipulation ${
                isActive ? 'text-msf-accent' : 'text-gray-400 active:text-gray-200'
              }`}
            >
              {ripple?.path === item.path && (
                <span
                  className="absolute rounded-full bg-white/20 animate-ripple"
                  style={{
                    left: ripple.x - 20,
                    top: ripple.y - 20,
                    width: 40,
                    height: 40
                  }}
                />
              )}
              <Icon className="w-6 h-6" />
              <span className="text-xs mt-1">{item.label}</span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-msf-accent rounded-b-full" />
              )}
            </Link>
          )
        })}
        <button
          onClick={onMoreClick}
          className="relative flex flex-col items-center justify-center flex-1 h-full min-w-[64px] text-gray-400 active:text-gray-200 transition-colors touch-manipulation"
        >
          <MoreHorizontal className="w-6 h-6" />
          <span className="text-xs mt-1">More</span>
        </button>
      </div>
    </nav>
  )
}
