// services/database/native.ts
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

export interface Database {
  getAllAsync<T>(query: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T>(query: string, params?: any[]): Promise<T | null>;
  runAsync(query: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  withTransactionAsync<T>(callback: () => Promise<T>): Promise<T>;
}

// Implementação mock para web
class WebDatabase implements Database {
  async getAllAsync<T>(query: string, params?: any[]): Promise<T[]> {
    console.warn('SQLite não disponível na web - retornando dados mock');
    return [] as T[];
  }
  
  async getFirstAsync<T>(query: string, params?: any[]): Promise<T | null> {
    console.warn('SQLite não disponível na web - retornando null');
    return null;
  }
  
  async runAsync(query: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }> {
    console.warn('SQLite não disponível na web - operação simulada');
    return { lastInsertRowId: 0, changes: 0 };
  }
  
  async withTransactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    console.warn('SQLite não disponível na web - executando callback sem transação');
    return await callback();
  }
}

// Implementação real para native
class NativeDatabase implements Database {
  private db: SQLite.SQLiteDatabase;
  
  constructor() {
    this.db = SQLite.openDatabaseSync('promocoes.db');
  }
  
  async getAllAsync<T>(query: string, params?: any[]): Promise<T[]> {
    try {
      if (params && params.length > 0) {
        const result = await this.db.getAllAsync<T>(query, params);
        return result;
      } else {
        const result = await this.db.getAllAsync<T>(query);
        return result;
      }
    } catch (error) {
      console.error('Erro ao executar getAllAsync:', error);
      throw error;
    }
  }
  
  async getFirstAsync<T>(query: string, params?: any[]): Promise<T | null> {
    try {
      if (params && params.length > 0) {
        const result = await this.db.getFirstAsync<T>(query, params);
        return result;
      } else {
        const result = await this.db.getFirstAsync<T>(query);
        return result;
      }
    } catch (error) {
      console.error('Erro ao executar getFirstAsync:', error);
      throw error;
    }
  }
  
  async runAsync(query: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }> {
    try {
      let result: SQLite.SQLiteRunResult;
      
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
      throw error;
    }
  }
  
  async withTransactionAsync<T>(callback: () => Promise<T>): Promise<T> {
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
const db = Platform.OS === 'web' ? new WebDatabase() : new NativeDatabase();

export const initDatabase = async (): Promise<void> => {
  if (Platform.OS === 'web') {
    console.log('Banco de dados não disponível na web');
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