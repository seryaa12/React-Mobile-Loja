// services/database.ts

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Para native, vamos usar dynamic import para evitar erros no web
let SQLite: any = null;
if (Platform.OS !== 'web') {
  SQLite = require('expo-sqlite');
}

// Interface para simular o comportamento do SQLite
interface Database {
  getAllAsync<T>(query: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T>(query: string, params?: any[]): Promise<T | null>;
  runAsync(query: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  withTransactionAsync<T>(callback: () => Promise<T>): Promise<T>;
  // Métodos síncronos para inicialização (apenas native)
  runSync?(query: string, params?: any[]): { lastInsertRowId: number; changes: number };
}

// Implementação para Web usando AsyncStorage
class WebDatabaseImpl implements Database {
  private storageKey = 'promocoes_database';
  
  async getAllAsync<T>(query: string, params?: any[]): Promise<T[]> {
    try {
      const data = await AsyncStorage.getItem(this.storageKey);
      if (!data) return [];
      
      const database = JSON.parse(data);
      
      // Simular queries básicas
      if (query.includes('SELECT * FROM promocoes')) {
        return database.promocoes || [];
      }
      
      if (query.includes('SELECT * FROM historico_promocoes')) {
        return database.historico_promocoes || [];
      }
      
      if (query.includes('SELECT status, COUNT(*) as count FROM promocoes')) {
        const promocoes = database.promocoes || [];
        const result = [];
        const statusCount: { [key: string]: number } = {};
        
        for (const promocao of promocoes) {
          statusCount[promocao.status] = (statusCount[promocao.status] || 0) + 1;
        }
        
        for (const [status, count] of Object.entries(statusCount)) {
          result.push({ status, count });
        }
        
        return result as T[];
      }
      
      if (query.includes('WHERE data_fim < ? AND status = \'ativa\'')) {
        const hoje = params?.[0];
        const promocoes = database.promocoes || [];
        return promocoes.filter((p: any) => p.data_fim < hoje && p.status === 'ativa') as T[];
      }
      
      if (query.includes('WHERE id = ?')) {
        const id = params?.[0];
        const promocoes = database.promocoes || [];
        return promocoes.filter((p: any) => p.id === id) as T[];
      }
      
      return [];
    } catch (error) {
      console.error('Erro no getAllAsync (web):', error);
      return [];
    }
  }

  async getFirstAsync<T>(query: string, params?: any[]): Promise<T | null> {
    try {
      const results = await this.getAllAsync<T>(query, params);
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Erro no getFirstAsync (web):', error);
      return null;
    }
  }

  async runAsync(query: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }> {
    try {
      const data = await AsyncStorage.getItem(this.storageKey);
      const database = data ? JSON.parse(data) : { promocoes: [], historico_promocoes: [] };
      
      if (query.startsWith('INSERT INTO promocoes')) {
        const newId = database.promocoes.length > 0 
          ? Math.max(...database.promocoes.map((p: any) => p.id)) + 1 
          : 1;
        
        const novaPromocao = {
          id: newId,
          produto_id: params?.[0],
          produto_nome: params?.[1],
          desconto: params?.[2],
          data_inicio: params?.[3],
          data_fim: params?.[4],
          data_criacao: params?.[5],
          status: params?.[6]
        };
        
        database.promocoes.push(novaPromocao);
        await AsyncStorage.setItem(this.storageKey, JSON.stringify(database));
        
        return { lastInsertRowId: newId, changes: 1 };
      }
      
      if (query.startsWith('INSERT INTO historico_promocoes')) {
        const newId = database.historico_promocoes.length > 0 
          ? Math.max(...database.historico_promocoes.map((h: any) => h.id)) + 1 
          : 1;
        
        const novoHistorico = {
          id: newId,
          promocao_id: params?.[0],
          produto_nome: params?.[1],
          desconto: params?.[2],
          data_inicio: params?.[3],
          data_fim: params?.[4],
          acao: params?.[5],
          data_acao: params?.[6]
        };
        
        database.historico_promocoes.push(novoHistorico);
        await AsyncStorage.setItem(this.storageKey, JSON.stringify(database));
        
        return { lastInsertRowId: newId, changes: 1 };
      }
      
      if (query.startsWith('UPDATE promocoes')) {
        const promocoes = database.promocoes || [];
        let changes = 0;
        
        if (query.includes('WHERE id = ?')) {
          const id = params?.[params.length - 1];
          const index = promocoes.findIndex((p: any) => p.id === id);
          
          if (index !== -1) {
            if (query.includes('SET status = \'expirada\'')) {
              promocoes[index].status = 'expirada';
              promocoes[index].data_expiracao = params?.[0];
              changes = 1;
            } else {
              // Update genérico
              if (params?.[0] !== undefined) promocoes[index].desconto = params[0];
              if (params?.[1] !== undefined) promocoes[index].data_fim = params[1];
              if (params?.[2] !== undefined) promocoes[index].status = params[2];
              changes = 1;
            }
          }
        }
        
        await AsyncStorage.setItem(this.storageKey, JSON.stringify(database));
        return { lastInsertRowId: 0, changes };
      }
      
      if (query.startsWith('DELETE FROM promocoes')) {
        const id = params?.[0];
        database.promocoes = database.promocoes.filter((p: any) => p.id !== id);
        await AsyncStorage.setItem(this.storageKey, JSON.stringify(database));
        
        return { lastInsertRowId: 0, changes: 1 };
      }
      
      return { lastInsertRowId: 0, changes: 0 };
    } catch (error) {
      console.error('Erro no runAsync (web):', error);
      return { lastInsertRowId: 0, changes: 0 };
    }
  }

  async withTransactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    // No web, simplesmente executa a callback sem transação real
    return await callback();
  }
}

// Implementação para Native
class NativeDatabaseImpl implements Database {
  private db: any;
  
  constructor() {
    if (SQLite) {
      this.db = SQLite.openDatabaseSync('promocoes.db');
    }
  }
  
  async getAllAsync<T>(query: string, params?: any[]): Promise<T[]> {
    if (!this.db) return [];
    try {
      return this.db.getAllSync(query, params || []) as T[];
    } catch (error) {
      console.error('Erro no getAllAsync (native):', error);
      return [];
    }
  }
  
  async getFirstAsync<T>(query: string, params?: any[]): Promise<T | null> {
    if (!this.db) return null;
    try {
      return this.db.getFirstSync(query, params || []) as T | null;
    } catch (error) {
      console.error('Erro no getFirstAsync (native):', error);
      return null;
    }
  }
  
  async runAsync(query: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }> {
    if (!this.db) return { lastInsertRowId: 0, changes: 0 };
    try {
      const result = this.db.runSync(query, params || []);
      return {
        lastInsertRowId: result.lastInsertRowId || 0,
        changes: result.changes || 0
      };
    } catch (error) {
      console.error('Erro no runAsync (native):', error);
      return { lastInsertRowId: 0, changes: 0 };
    }
  }

  // Método síncrono para inicialização (apenas native)
  runSync(query: string, params?: any[]): { lastInsertRowId: number; changes: number } {
    if (!this.db) return { lastInsertRowId: 0, changes: 0 };
    try {
      return this.db.runSync(query, params || []);
    } catch (error) {
      console.error('Erro no runSync (native):', error);
      return { lastInsertRowId: 0, changes: 0 };
    }
  }
  
  async withTransactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    if (!this.db) return callback();
    
    return new Promise((resolve, reject) => {
      try {
        this.db.withTransactionSync(() => {
          const result = callback();
          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

// Selecionar a implementação correta baseada na plataforma
let db: Database;

if (Platform.OS === 'web') {
  db = new WebDatabaseImpl();
} else {
  db = new NativeDatabaseImpl();
}

// Inicializar o banco de dados
export const initDatabase = async (): Promise<void> => {
  if (Platform.OS === 'web') {
    // No web, verificar se já existe dados, senão inicializar com estrutura vazia
    const existingData = await AsyncStorage.getItem('promocoes_database');
    if (!existingData) {
      await AsyncStorage.setItem('promocoes_database', JSON.stringify({
        promocoes: [],
        historico_promocoes: []
      }));
    }
    console.log('Banco de dados web inicializado com sucesso');
  } else {
    // No native, criar tabelas SQL
    try {
      // Usar runAsync em vez de runSync para manter a consistência
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
  }
};

export { db };