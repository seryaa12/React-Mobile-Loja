import { Platform } from 'react-native';

export interface Database {
  getAllAsync<T>(query: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T>(query: string, params?: any[]): Promise<T | null>;
  runAsync(query: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  withTransactionAsync<T>(callback: () => Promise<T>): Promise<T>;
}

// Dynamic import para evitar erro na web
let SQLite: any = null;
if (Platform.OS !== 'web') {
  try {
    SQLite = require('expo-sqlite');
  } catch (error) {
    console.warn('expo-sqlite não disponível nesta plataforma');
  }
}

class NativeDatabase implements Database {
  private db: any = null;
  
  constructor() {
    if (SQLite) {
      try {
        this.db = SQLite.openDatabaseSync('promocoes.db');
      } catch (error) {
        console.error('Erro ao abrir banco SQLite:', error);
      }
    }
  }
  
  async getAllAsync<T>(query: string, params?: any[]): Promise<T[]> {
    if (!this.db) {
      console.warn('Database não disponível');
      return [] as T[];
    }
    
    try {
      // REMOVER OS <T> DOS MÉTODOS - o SQLite não tem tipagem
      if (params && params.length > 0) {
        const result = await this.db.getAllAsync(query, params);
        return result as T[];
      } else {
        const result = await this.db.getAllAsync(query);
        return result as T[];
      }
    } catch (error) {
      console.error('Erro ao executar getAllAsync:', error);
      return [] as T[];
    }
  }
  
  async getFirstAsync<T>(query: string, params?: any[]): Promise<T | null> {
    if (!this.db) {
      console.warn('Database não disponível');
      return null;
    }
    
    try {
      // REMOVER OS <T> DOS MÉTODOS
      if (params && params.length > 0) {
        const result = await this.db.getFirstAsync(query, params);
        return result as T | null;
      } else {
        const result = await this.db.getFirstAsync(query);
        return result as T | null;
      }
    } catch (error) {
      console.error('Erro ao executar getFirstAsync:', error);
      return null;
    }
  }
  
  async runAsync(query: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }> {
    if (!this.db) {
      console.warn('Database não disponível');
      return { lastInsertRowId: 0, changes: 0 };
    }
    
    try {
      let result: any;
      
      if (params && params.length > 0) {
        result = await this.db.runAsync(query, params);
      } else {
        result = await this.db.runAsync(query);
      }
      
      return {
        lastInsertRowId: result.lastInsertRowId || 0,
        changes: result.changes || 0
      };
    } catch (error) {
      console.error('Erro ao executar runAsync:', error);
      return { lastInsertRowId: 0, changes: 0 };
    }
  }
  
  async withTransactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    if (!this.db) {
      console.warn('Database não disponível - executando sem transação');
      return await callback();
    }
    
    try {
      // Implementação manual da transação
      await this.db.execAsync('BEGIN TRANSACTION');
      
      try {
        const result = await callback();
        await this.db.execAsync('COMMIT');
        return result;
      } catch (error) {
        await this.db.execAsync('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error('Erro na transação:', error);
      throw error;
    }
  }
}

// Escolher a implementação baseada na plataforma
let db: Database;

if (Platform.OS === 'web') {
  // Importar do web.ts
  const webModule = require('./web');
  db = webModule.db;
} else {
  // Usar NativeDatabase
  db = new NativeDatabase();
}

export const initDatabase = async (): Promise<void> => {
  if (Platform.OS === 'web') {
    const webModule = require('./web');
    await webModule.initDatabase();
    return;
  }

  try {
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS promocoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id TEXT NOT NULL,
        produto_nome TEXT NOT NULL,
        desconto REAL NOT NULL,
        data_inicio TEXT NOT NULL,
        data_fim TEXT NOT NULL,
        data_criacao TEXT NOT NULL,
        status TEXT NOT NULL,
        data_expiracao TEXT
      )
    `);
    
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS historico_promocoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        promocao_id INTEGER NOT NULL,
        produto_nome TEXT NOT NULL,
        desconto REAL NOT NULL,
        data_inicio TEXT NOT NULL,
        data_fim TEXT NOT NULL,
        acao TEXT NOT NULL,
        data_acao TEXT NOT NULL
      )
    `);
    console.log('Banco de dados native inicializado com sucesso');
  } catch (error) {
    console.error('Erro ao inicializar banco native:', error);
  }
};

export { db };