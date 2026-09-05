class MarketplaceService {
  constructor(publicProductRepository, shopProfileRepository) {
    this.publicProductRepository = publicProductRepository;
    this.shopProfileRepository = shopProfileRepository;
  }

  async getProductDetails(uuid) {
    // Stub
    return null;
  }

  async getShopProfile(uuid) {
    // Stub
    return null;
  }
}

module.exports = MarketplaceService;
