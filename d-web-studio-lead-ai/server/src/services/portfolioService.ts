import { PortfolioRepository } from '../database/repositories/portfolioRepository.js';

export class PortfolioService {
  static async getAllProjects() {
    return PortfolioRepository.findAll();
  }

  static async matchByNiche(niche: string) {
    if (!niche || niche === 'UNKNOWN' || niche === 'NO_MATCH') {
      return null;
    }
    return PortfolioRepository.findByCategory(niche);
  }
}
