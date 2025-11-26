import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Database {
  getAllAsync<T>(query: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T>(query: string, params?: any[]): Promise<T | null>;
  runAsync(query: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  withTransactionAsync<T>(callback: () => Promise<T>): Promise<T>;
}

class WebDatabase implements Database {
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
      
      if (query.includes('SELECT COUNT(*) as count FROM promocoes')) {
        const promocoes = database.promocoes || [];
        return [{ count: promocoes.length }] as T[];
      }
      
      if (query.includes('SELECT COUNT(*) as count FROM promocoes WHERE status = "ativa"')) {
        const promocoes = database.promocoes || [];
        const count = promocoes.filter((p: any) => p.status === 'ativa').length;
        return [{ count }] as T[];
      }
      
      if (query.includes('SELECT COUNT(*) as count FROM promocoes WHERE status = "expirada"')) {
        const promocoes = database.promocoes || [];
        const count = promocoes.filter((p: any) => p.status === 'expirada').length;
        return [{ count }] as T[];
      }
      
      if (query.includes('SELECT COUNT(*) as count FROM historico_promocoes WHERE acao = "excluída"')) {
        const historico = database.historico_promocoes || [];
        const count = historico.filter((h: any) => h.acao === 'excluída').length;
        return [{ count }] as T[];
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
      
      if (query.includes('WHERE promocao_id = ? AND acao = "expirada"')) {
        const promocaoId = params?.[0];
        const historico = database.historico_promocoes || [];
        return historico.filter((h: any) => h.promocao_id === promocaoId && h.acao === 'expirada') as T[];
      }
      
      if (query.includes('ORDER BY data_criacao DESC')) {
        const promocoes = database.promocoes || [];
        return promocoes.sort((a: any, b: any) => new Date(b.data_criacao).getTime() - new Date(a.data_criacao).getTime()) as T[];
      }
      
      if (query.includes('ORDER BY data_acao DESC')) {
        const historico = database.historico_promocoes || [];
        return historico.sort((a: any, b: any) => new Date(b.data_acao).getTime() - new Date(a.data_acao).getTime()) as T[];
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
      const database = data ? JSON.parse(data) : { 
        promocoes: [], 
        historico_promocoes: [] 
      };

      database.promocoes = database.promocoes || [];
      database.historico_promocoes = database.historico_promocoes || [];
      
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
          status: params?.[6],
          data_expiracao: null
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
        let changes = 0;
        
        if (query.includes('WHERE id = ?')) {
          const id = params?.[params.length - 1];
          const promocao = database.promocoes.find((p: any) => p.id === id);
          
          if (promocao) {
            if (query.includes('SET status = \'expirada\'')) {
              promocao.status = 'expirada';
              promocao.data_expiracao = params?.[0];
              changes = 1;
            } else {
              let paramIndex = 0;
              if (query.includes('desconto = ?')) {
                promocao.desconto = params?.[paramIndex++];
              }
              if (query.includes('data_fim = ?')) {
                promocao.data_fim = params?.[paramIndex++];
              }
              if (query.includes('status = ?')) {
                promocao.status = params?.[paramIndex++];
              }
              changes = 1;
            }
          }
        } else if (query.includes('WHERE data_fim < ? AND status = \'ativa\'')) {
          const hoje = params?.[0];
          for (const promocao of database.promocoes) {
            if (promocao.data_fim < hoje && promocao.status === 'ativa') {
              promocao.status = 'expirada';
              promocao.data_expiracao = hoje;
              changes++;
            }
          }
        }
        
        await AsyncStorage.setItem(this.storageKey, JSON.stringify(database));
        return { lastInsertRowId: 0, changes };
      }
      
      if (query.startsWith('DELETE FROM promocoes')) {
        const id = params?.[0];
        const initialLength = database.promocoes.length;
        database.promocoes = database.promocoes.filter((p: any) => p.id !== id);
        const changes = initialLength - database.promocoes.length;
        
        await AsyncStorage.setItem(this.storageKey, JSON.stringify(database));
        return { lastInsertRowId: 0, changes };
      }
      
      return { lastInsertRowId: 0, changes: 0 };
    } catch (error) {
      console.error('Erro no runAsync (web):', error);
      return { lastInsertRowId: 0, changes: 0 };
    }
  }

  async withTransactionAsync<T>(callback: () => Promise<T>): Promise<T> {
    return await callback();
  }
}

const db = new WebDatabase();

export const initDatabase = async (): Promise<void> => {
  const existingData = await AsyncStorage.getItem('promocoes_database');
  if (!existingData) {
    await AsyncStorage.setItem('promocoes_database', JSON.stringify({
      promocoes: [],
      historico_promocoes: []
    }));
  }
  console.log('Banco de dados web inicializado com sucesso');
};

export { db };