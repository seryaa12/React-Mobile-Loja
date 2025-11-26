// services/promocaoService.ts
import { db } from './database/native';

export interface Promocao {
  id: number;
  produtoId: string;
  produtoNome: string;
  desconto: number;
  dataInicio: string;
  dataFim: string;
  dataCriacao: string;
  status: string;
  dataExpiracao?: string;
}

export interface HistoricoPromocao {
  id: number;
  promocaoId: number;
  produtoNome: string;
  desconto: number;
  dataInicio: string;
  dataFim: string;
  acao: string;
  dataAcao: string;
}

export interface CriarPromocaoData {
  produtoId: string;
  produtoNome: string;
  desconto: number;
  dataInicio: string;
  dataFim: string;
  dataCriacao: string;
}

export interface EstatisticasPromocoes {
  total: number;
  ativas: number;
  expiradas: number;
  canceladas: number;
}

// Inicializar o banco de dados
export const inicializarBanco = async (): Promise<void> => {
  console.log('Banco de dados pronto para uso');
};

// Criar uma nova promoção
export const criarPromocao = async (data: CriarPromocaoData): Promise<number> => {
  try {
    const status = new Date(data.dataFim) > new Date() ? 'ativa' : 'expirada';
    
    const result = await db.runAsync(
      `INSERT INTO promocoes 
       (produto_id, produto_nome, desconto, data_inicio, data_fim, data_criacao, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.produtoId, data.produtoNome, data.desconto, data.dataInicio, data.dataFim, data.dataCriacao, status]
    );

    // Registrar no histórico
    await db.runAsync(
      `INSERT INTO historico_promocoes 
       (promocao_id, produto_nome, desconto, data_inicio, data_fim, acao, data_acao) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [result.lastInsertRowId, data.produtoNome, data.desconto, data.dataInicio, data.dataFim, 'criada', data.dataCriacao]
    );

    return result.lastInsertRowId;
  } catch (error) {
    console.error('Erro ao criar promoção:', error);
    throw error;
  }
};

// Buscar todas as promoções
export const buscarTodasPromocoes = async (): Promise<Promocao[]> => {
  try {
    const promocoes = await db.getAllAsync<Promocao>(
      `SELECT 
        id,
        produto_id as produtoId,
        produto_nome as produtoNome,
        desconto,
        data_inicio as dataInicio,
        data_fim as dataFim,
        data_criacao as dataCriacao,
        status,
        data_expiracao as dataExpiracao
       FROM promocoes ORDER BY data_criacao DESC`
    );
    return promocoes;
  } catch (error) {
    console.error('Erro ao buscar promoções:', error);
    throw error;
  }
};

// Buscar histórico completo
export const buscarHistoricoCompleto = async (): Promise<HistoricoPromocao[]> => {
  try {
    const historico = await db.getAllAsync<HistoricoPromocao>(
      `SELECT 
        id,
        promocao_id as promocaoId,
        produto_nome as produtoNome,
        desconto,
        data_inicio as dataInicio,
        data_fim as dataFim,
        acao,
        data_acao as dataAcao
       FROM historico_promocoes ORDER BY data_acao DESC`
    );
    return historico;
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    throw error;
  }
};

// Atualizar promoção
export const atualizarPromocao = async (id: number, updates: Partial<Promocao>): Promise<void> => {
  try {
    // Converter camelCase para snake_case para o banco
    const camposSnakeCase: Record<string, string> = {
      produtoId: 'produto_id',
      produtoNome: 'produto_nome', 
      dataInicio: 'data_inicio',
      dataFim: 'data_fim',
      dataCriacao: 'data_criacao',
      dataExpiracao: 'data_expiracao'
    };

    const campos = Object.keys(updates);
    const valores = Object.values(updates);
    
    if (campos.length === 0) return;

    const setClause = campos.map(campo => `${camposSnakeCase[campo] || campo} = ?`).join(', ');
    const query = `UPDATE promocoes SET ${setClause} WHERE id = ?`;
    
    await db.runAsync(query, [...valores, id]);

    // Se o desconto foi atualizado, registrar no histórico
    if (updates.desconto !== undefined) {
      const promocao = await buscarPromocaoPorId(id);
      if (promocao) {
        await db.runAsync(
          `INSERT INTO historico_promocoes 
           (promocao_id, produto_nome, desconto, data_inicio, data_fim, acao, data_acao) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, promocao.produtoNome, updates.desconto, promocao.dataInicio, promocao.dataFim, 'atualizada', new Date().toISOString().split('T')[0]]
        );
      }
    }
  } catch (error) {
    console.error('Erro ao atualizar promoção:', error);
    throw error;
  }
};

// Excluir promoção
export const excluirPromocao = async (id: number): Promise<void> => {
  try {
    // Primeiro registrar no histórico
    const promocao = await buscarPromocaoPorId(id);
    if (promocao) {
      await db.runAsync(
        `INSERT INTO historico_promocoes 
         (promocao_id, produto_nome, desconto, data_inicio, data_fim, acao, data_acao) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, promocao.produtoNome, promocao.desconto, promocao.dataInicio, promocao.dataFim, 'excluída', new Date().toISOString().split('T')[0]]
      );
    }

    // Depois excluir a promoção
    await db.runAsync('DELETE FROM promocoes WHERE id = ?', [id]);
  } catch (error) {
    console.error('Erro ao excluir promoção:', error);
    throw error;
  }
};

// Atualizar status das promoções (expiradas)
export const atualizarStatusPromocoes = async (): Promise<void> => {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    
    // Marcar promoções expiradas
    await db.runAsync(
      `UPDATE promocoes SET status = 'expirada', data_expiracao = ? 
       WHERE data_fim < ? AND status = 'ativa'`,
      [hoje, hoje]
    );

    // Registrar no histórico as promoções que expiraram
    const promocoesExpiradas = await db.getAllAsync<Promocao>(
      `SELECT 
        id,
        produto_id as produtoId,
        produto_nome as produtoNome,
        desconto,
        data_inicio as dataInicio,
        data_fim as dataFim,
        data_criacao as dataCriacao,
        status,
        data_expiracao as dataExpiracao
       FROM promocoes WHERE data_expiracao = ? AND status = "expirada"`,
      [hoje]
    );

    for (const promocao of promocoesExpiradas) {
      const existeNoHistorico = await db.getFirstAsync<HistoricoPromocao>(
        `SELECT 
          id,
          promocao_id as promocaoId,
          produto_nome as produtoNome,
          desconto,
          data_inicio as dataInicio,
          data_fim as dataFim,
          acao,
          data_acao as dataAcao
         FROM historico_promocoes WHERE promocao_id = ? AND acao = "expirada"`,
        [promocao.id]
      );

      if (!existeNoHistorico) {
        await db.runAsync(
          `INSERT INTO historico_promocoes 
           (promocao_id, produto_nome, desconto, data_inicio, data_fim, acao, data_acao) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [promocao.id, promocao.produtoNome, promocao.desconto, promocao.dataInicio, promocao.dataFim, 'expirada', hoje]
        );
      }
    }
  } catch (error) {
    console.error('Erro ao atualizar status das promoções:', error);
    throw error;
  }
};

// Obter estatísticas das promoções
export const obterEstatisticasPromocoes = async (): Promise<EstatisticasPromocoes> => {
  try {
    const total = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM promocoes'
    );
    
    const ativas = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM promocoes WHERE status = "ativa"'
    );
    
    const expiradas = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM promocoes WHERE status = "expirada"'
    );
    
    const canceladas = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM historico_promocoes WHERE acao = "excluída"'
    );

    return {
      total: total?.count || 0,
      ativas: ativas?.count || 0,
      expiradas: expiradas?.count || 0,
      canceladas: canceladas?.count || 0
    };
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    throw error;
  }
};

// Buscar promoções por status
export const buscarPromocoesPorStatus = async (status: string): Promise<Promocao[]> => {
  try {
    const promocoes = await db.getAllAsync<Promocao>(
      `SELECT 
        id,
        produto_id as produtoId,
        produto_nome as produtoNome,
        desconto,
        data_inicio as dataInicio,
        data_fim as dataFim,
        data_criacao as dataCriacao,
        status,
        data_expiracao as dataExpiracao
       FROM promocoes WHERE status = ? ORDER BY data_criacao DESC`,
      [status]
    );
    return promocoes;
  } catch (error) {
    console.error('Erro ao buscar promoções por status:', error);
    throw error;
  }
};

// Buscar promoção por ID
export const buscarPromocaoPorId = async (id: number): Promise<Promocao | null> => {
  try {
    const promocao = await db.getFirstAsync<Promocao>(
      `SELECT 
        id,
        produto_id as produtoId,
        produto_nome as produtoNome,
        desconto,
        data_inicio as dataInicio,
        data_fim as dataFim,
        data_criacao as dataCriacao,
        status,
        data_expiracao as dataExpiracao
       FROM promocoes WHERE id = ?`,
      [id]
    );
    return promocao;
  } catch (error) {
    console.error('Erro ao buscar promoção por ID:', error);
    throw error;
  }
};