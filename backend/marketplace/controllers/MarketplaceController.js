class MarketplaceController {
  constructor(searchService, marketplaceService) {
    this.searchService = searchService;
    this.marketplaceService = marketplaceService;
  }

  async searchProducts(req, res) {
    res.status(501).json({ message: 'Not Implemented' });
  }

  async getProduct(req, res) {
    res.status(501).json({ message: 'Not Implemented' });
  }

  async getShop(req, res) {
    res.status(501).json({ message: 'Not Implemented' });
  }
}

module.exports = MarketplaceController;
