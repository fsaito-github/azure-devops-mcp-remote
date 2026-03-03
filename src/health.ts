/**
 * Health Check Service
 * Monitoramento de saúde da aplicação
 */

export interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: Date;
  uptime: number; // em segundos
  memory: {
    usedHeapSize: number;
    totalHeapSize: number;
    externalMemoryUsage: number;
  };
  services: {
    database?: boolean;
    cache?: boolean;
    azure_ad?: boolean;
  };
  latency: {
    average: number; // em ms
    p95: number;
    p99: number;
  };
}

export interface ReadinessStatus {
  ready: boolean;
  readiness: {
    mcp_server: boolean;
    authentication: boolean;
    external_services: boolean;
  };
  timestamp: Date;
}

export class HealthCheckService {
  private startTime: Date = new Date();
  private requestTimings: number[] = [];
  private maxTimingsToStore = 1000;

  /**
   * Obtém status de saúde da aplicação
   */
  getHealth(): HealthStatus {
    const uptime = this.getUptimeInSeconds();
    const memUsage = process.memoryUsage();

    return {
      status: this.calculateHealthStatus(),
      timestamp: new Date(),
      uptime,
      memory: {
        usedHeapSize: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        totalHeapSize: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        externalMemoryUsage: Math.round(memUsage.external / 1024 / 1024), // MB
      },
      services: {
        database: this.isServiceHealthy("database"),
        cache: this.isServiceHealthy("cache"),
        azure_ad: this.isServiceHealthy("azure_ad"),
      },
      latency: this.getLatencyStats(),
    };
  }

  /**
   * Obtém status de prontidão
   */
  getReadiness(): ReadinessStatus {
    return {
      ready: this.isReady(),
      readiness: {
        mcp_server: this.isMCPServerReady(),
        authentication: this.isAuthenticationReady(),
        external_services: this.isExternalServicesReady(),
      },
      timestamp: new Date(),
    };
  }

  /**
   * Registra timing de uma requisição
   */
  recordRequestTiming(milliseconds: number): void {
    this.requestTimings.push(milliseconds);

    // Manter apenas os últimos N timings
    if (this.requestTimings.length > this.maxTimingsToStore) {
      this.requestTimings.shift();
    }
  }

  /**
   * Calcula estatísticas de latência
   */
  private getLatencyStats(): HealthStatus["latency"] {
    if (this.requestTimings.length === 0) {
      return {
        average: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...this.requestTimings].sort((a, b) => a - b);
    const average = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p95Index = Math.ceil(sorted.length * 0.95) - 1;
    const p99Index = Math.ceil(sorted.length * 0.99) - 1;

    return {
      average: Math.round(average * 100) / 100,
      p95: sorted[p95Index] || 0,
      p99: sorted[p99Index] || 0,
    };
  }

  /**
   * Calcula status geral de saúde
   */
  private calculateHealthStatus(): "healthy" | "unhealthy" | "degraded" {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    // Unhealthy se usar > 95% da heap
    if (heapUsedPercent > 95) {
      return "unhealthy";
    }

    // Degraded se usar > 80% da heap
    if (heapUsedPercent > 80) {
      return "degraded";
    }

    return "healthy";
  }

  /**
   * Verifica se um serviço está saudável
   */
  private isServiceHealthy(serviceName: string): boolean {
    // TODO: Implementar verificações reais de serviço
    return true;
  }

  /**
   * Verifica se a aplicação está pronta
   */
  private isReady(): boolean {
    return this.isMCPServerReady() && this.isAuthenticationReady() && this.isExternalServicesReady();
  }

  /**
   * Verifica se o servidor MCP está pronto
   */
  private isMCPServerReady(): boolean {
    // TODO: Implementar verificação real
    return true;
  }

  /**
   * Verifica se autenticação está pronta
   */
  private isAuthenticationReady(): boolean {
    // TODO: Verificar se Azure AD está configurado
    return true;
  }

  /**
   * Verifica se serviços externos estão prontos
   */
  private isExternalServicesReady(): boolean {
    // TODO: Verificar conexão com Azure DevOps, etc
    return true;
  }

  /**
   * Calcula tempo de atividade em segundos
   */
  private getUptimeInSeconds(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Reseta métricas
   */
  reset(): void {
    this.startTime = new Date();
    this.requestTimings = [];
  }

  /**
   * Obtém estatísticas de requisições
   */
  getRequestStats(): {
    count: number;
    average: number;
    min: number;
    max: number;
  } {
    if (this.requestTimings.length === 0) {
      return { count: 0, average: 0, min: 0, max: 0 };
    }

    const average = this.requestTimings.reduce((a, b) => a + b, 0) / this.requestTimings.length;
    const min = Math.min(...this.requestTimings);
    const max = Math.max(...this.requestTimings);

    return {
      count: this.requestTimings.length,
      average: Math.round(average * 100) / 100,
      min,
      max,
    };
  }
}
