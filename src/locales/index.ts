export type Language = 'PT' | 'EN' | 'ES'

export const translations = {
  PT: {
    sidebar: {
      inbox: 'Atendimento',
      campaigns: 'Campanhas',
      captain: 'Capitão IA',
      admin: 'Painel Admin',
      language: 'Idioma',
      theme: 'Tema',
      logout: 'Sair do Sistema'
    }
  },
  EN: {
    sidebar: {
      inbox: 'Inbox',
      campaigns: 'Campaigns',
      captain: 'Captain AI',
      admin: 'Admin Panel',
      language: 'Language',
      theme: 'Theme',
      logout: 'Sign Out'
    }
  },
  ES: {
    sidebar: {
      inbox: 'Bandeja de Entrada',
      campaigns: 'Campañas',
      captain: 'Capitán IA',
      admin: 'Panel de Admin',
      language: 'Idioma',
      theme: 'Tema',
      logout: 'Cerrar Sesión'
    }
  }
} as const;

export type TranslationKey = keyof typeof translations.PT;
