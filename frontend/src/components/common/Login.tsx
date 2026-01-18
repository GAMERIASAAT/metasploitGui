import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { Shield, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const { login, isLoading, error } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await login(username, password)
      navigate('/')
    } catch {
      // Error is handled by the store
    }
  }

  return (
    <div className="min-h-screen bg-msf-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-msf-card border border-msf-border rounded-lg p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <Shield className="w-16 h-16 text-msf-accent mb-4" />
            <h1 className="text-2xl font-bold text-white">Metasploit GUI</h1>
            <p className="text-gray-400 mt-2">Sign in to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-msf-red/20 border border-msf-red/50 rounded-lg text-msf-red text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="Enter username"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn btn-primary w-full">
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Default credentials hint */}
          <div className="mt-6 p-3 bg-msf-darker rounded-lg">
            <p className="text-xs text-gray-400 text-center">
              Default credentials: <span className="text-msf-blue">admin / admin</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
