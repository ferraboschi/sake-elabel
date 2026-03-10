import React, { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

const SESSION_KEY = 'elabel_session'
const SESSION_EXPIRY_HOURS = 72

// User accounts - in production, move to Airtable Users table
// Passwords are in plain text for MVP. Will be hashed when we add Airtable Users table.
const USERS = {
  admin: {
    password: import.meta.env.VITE_ADMIN_PASSWORD || 'sakecompany2026',
    role: 'admin',
    name: 'Sake Company Admin',
    company: 'Sake Company srl',
  },
  partner: {
    password: import.meta.env.VITE_PARTNER_PASSWORD || 'partner2026',
    role: 'partner',
    name: 'Partner',
    company: 'Partner JP',
  },
}

// Additional partner accounts from env (format: "email:password:name:company")
const extraPartners = (import.meta.env.VITE_PARTNER_ACCOUNTS || '').split(';').filter(Boolean)
extraPartners.forEach(entry => {
  const [email, password, name, company] = entry.split(':')
  if (email && password) {
    USERS[email] = { password, role: 'partner', name: name || email, company: company || '' }
  }
})

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore session on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (saved) {
        const session = JSON.parse(saved)
        if (session.expiresAt > Date.now()) {
          setUser(session.user)
        } else {
          localStorage.removeItem(SESSION_KEY)
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY)
    }
    setLoading(false)
  }, [])

  const login = (username, password) => {
    const account = USERS[username] || USERS[username.toLowerCase()]
    if (!account) return { success: false, error: 'Utente non trovato' }
    if (account.password !== password) return { success: false, error: 'Password errata' }

    const userData = {
      username,
      role: account.role,
      name: account.name,
      company: account.company,
    }

    const session = {
      user: userData,
      expiresAt: Date.now() + (SESSION_EXPIRY_HOURS * 60 * 60 * 1000),
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUser(userData)
    return { success: true }
  }

  const logout = () => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  const isAdmin = user?.role === 'admin'
  const isPartner = user?.role === 'partner'
  const isAuthenticated = !!user

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, isPartner, isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
