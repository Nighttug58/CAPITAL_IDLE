import type { AssetDefinition, AssetKind, MarketQuote } from './types.ts'

// Instantané fixe pour l'équilibrage du jeu, jamais des cours live.
// Les prix sont arrondis ; une fluctuation ultérieure est intégralement fictive.
export const CATALOG_SNAPSHOT_DATE = '2026-11-13'

const STOCK_SOURCE = 'https://stockmarketwatch.com/indices/sp500/today'
const US_CLOSE_SOURCE = 'https://newspaperjoint.com/markets/stocks/'
const CRYPTO_SOURCE = 'https://www.cryptured.com/crypto-prices/'
const MEME_SOURCE = 'https://www.coingecko.com/en/categories/meme-token'

interface StockRow {
  id: string
  symbol: string
  name: string
  inspiredBy: string
  sourceTicker: string
  sector: string
  price: number
  supply: number
  yield: number
  priceSource?: string
}
interface CoinRow {
  id: string
  symbol: string
  name: string
  sector: string
  price: number
  supply: number
  decimals: number
  supplyBasis: 'protocol-cap' | 'launch-supply' | 'game-cap'
  supplyNote: string
}

// Nombre d'actions de jeu fictif (ordre de grandeur de grosses entreprises cotées).
// Rendements initiaux arbitraires 1–30 %, ils ne prétendent pas égaler les vrais dividendes.
const stockRows: readonly StockRow[] = [
  { id: 'nvideo', symbol: 'NVDO', name: 'Nvideo', inspiredBy: 'Nvidia', sourceTicker: 'NVDA', sector: 'Semi-conducteurs', price: 166.19, supply: 24_000_000_000, yield: 0.024 },
  { id: 'mike', symbol: 'MIKE', name: 'Mike', inspiredBy: 'Nike', sourceTicker: 'NKE', sector: 'Sport et vêtements', price: 37.76, supply: 1_500_000_000, yield: 0.052, priceSource: 'https://stockanalysis.com/stocks/nke/history/' },
  { id: 'mcgonagal', symbol: 'MCGN', name: 'McGonagal', inspiredBy: "McDonald's", sourceTicker: 'MCD', sector: 'Restauration', price: 274.80, supply: 715_000_000, yield: 0.086, priceSource: US_CLOSE_SOURCE },
  { id: 'simsung', symbol: 'SMSG', name: 'Simsung', inspiredBy: 'Samsung Electronics', sourceTicker: '005930.KS', sector: 'Électronique', price: 154.14, supply: 5_970_000_000, yield: 0.041, priceSource: 'https://stockanalysis.com/quote/krx/005930/history/' },
  { id: 'aypel', symbol: 'AYPL', name: 'Aypel', inspiredBy: 'Apple', sourceTicker: 'AAPL', sector: 'Électronique', price: 354.88, supply: 15_000_000_000, yield: 0.035 },
  { id: 'microloft', symbol: 'MLFT', name: 'Microloft', inspiredBy: 'Microsoft', sourceTicker: 'MSFT', sector: 'Logiciels', price: 523.00, supply: 7_400_000_000, yield: 0.038 },
  { id: 'amazone', symbol: 'AMZE', name: 'Amazone', inspiredBy: 'Amazon', sourceTicker: 'AMZN', sector: 'Commerce', price: 267.44, supply: 10_700_000_000, yield: 0.018 },
  { id: 'goggle', symbol: 'GGLE', name: 'Goggle', inspiredBy: 'Alphabet / Google', sourceTicker: 'GOOGL', sector: 'Internet', price: 298.73, supply: 12_000_000_000, yield: 0.032 },
  { id: 'metaversa', symbol: 'MTVR', name: 'Metaversa', inspiredBy: 'Meta', sourceTicker: 'META', sector: 'Réseaux sociaux', price: 623.61, supply: 2_500_000_000, yield: 0.042 },
  { id: 'tezla', symbol: 'TZLA', name: 'Tezla', inspiredBy: 'Tesla', sourceTicker: 'TSLA', sector: 'Automobile', price: 397.45, supply: 3_200_000_000, yield: 0.016 },
  { id: 'advanz-micro', symbol: 'AVMC', name: 'Advanz Micro', inspiredBy: 'AMD', sourceTicker: 'AMD', sector: 'Semi-conducteurs', price: 585.30, supply: 1_600_000_000, yield: 0.027 },
  { id: 'koka-kola', symbol: 'KOKA', name: 'Koka-Kola', inspiredBy: 'Coca-Cola', sourceTicker: 'KO', sector: 'Boissons', price: 97.57, supply: 4_300_000_000, yield: 0.095, priceSource: US_CLOSE_SOURCE },
  { id: 'dizney', symbol: 'DZNY', name: 'Dizney', inspiredBy: 'Disney', sourceTicker: 'DIS', sector: 'Divertissement', price: 119.65, supply: 1_800_000_000, yield: 0.058, priceSource: US_CLOSE_SOURCE },
  { id: 'netflux', symbol: 'NFLU', name: 'Netflux', inspiredBy: 'Netflix', sourceTicker: 'NFLX', sector: 'Streaming', price: 62.69, supply: 4_200_000_000, yield: 0.021 },
  { id: 'wallmart', symbol: 'WLMT', name: 'Wallmart', inspiredBy: 'Walmart', sourceTicker: 'WMT', sector: 'Distribution', price: 126.19, supply: 8_000_000_000, yield: 0.078 },
  { id: 'costko', symbol: 'CSTK', name: 'Costko', inspiredBy: 'Costco', sourceTicker: 'COST', sector: 'Grande distribution', price: 1092.21, supply: 440_000_000, yield: 0.073 },
  { id: 'jp-mergan', symbol: 'JPMG', name: 'JP Mergan', inspiredBy: 'JPMorgan Chase', sourceTicker: 'JPM', sector: 'Banque', price: 342.71, supply: 2_700_000_000, yield: 0.110, priceSource: US_CLOSE_SOURCE },
  { id: 'viza', symbol: 'VIZA', name: 'Viza', inspiredBy: 'Visa', sourceTicker: 'V', sector: 'Paiements', price: 420.31, supply: 1_900_000_000, yield: 0.052 },
  { id: 'pepsy', symbol: 'PEPY', name: 'Pepsy', inspiredBy: 'PepsiCo', sourceTicker: 'PEP', sector: 'Boissons', price: 143.94, supply: 1_370_000_000, yield: 0.097, priceSource: US_CLOSE_SOURCE },
  { id: 'starbocks', symbol: 'STBK', name: 'Starbocks', inspiredBy: 'Starbucks', sourceTicker: 'SBUX', sector: 'Cafés', price: 107.26, supply: 1_140_000_000, yield: 0.069, priceSource: 'https://stockanalysis.com/stocks/sbux/history/' },
]

const cryptoRows: readonly CoinRow[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', sector: 'Monnaie', price: 69_448, supply: 21_000_000, decimals: 8, supplyBasis: 'protocol-cap', supplyNote: 'Limite théorique du protocole : 21 millions de BTC.' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', sector: 'Smart contracts', price: 1_965, supply: 72_000_000, decimals: 8, supplyBasis: 'launch-supply', supplyNote: 'Allocation de lancement d’environ 72 millions ; ETH n’a pas de plafond d’émission natif.' },
  { id: 'bnb', symbol: 'BNB', name: 'BNB', sector: 'Exchange token', price: 642.30, supply: 200_000_000, decimals: 6, supplyBasis: 'launch-supply', supplyNote: 'Émission initiale de 200 millions, sans déduction des burns.' },
  { id: 'xrp', symbol: 'XRP', name: 'XRP', sector: 'Paiements', price: 1.03, supply: 100_000_000_000, decimals: 4, supplyBasis: 'protocol-cap', supplyNote: '100 milliards créés à l’origine.' },
  { id: 'solana', symbol: 'SOL', name: 'Solana', sector: 'Smart contracts', price: 81.40, supply: 500_000_000, decimals: 8, supplyBasis: 'launch-supply', supplyNote: 'Approximativement 500 millions de SOL au lancement ; émission réelle inflationniste.' },
  { id: 'tron', symbol: 'TRX', name: 'TRON', sector: 'Smart contracts', price: 0.3133, supply: 100_000_000_000, decimals: 4, supplyBasis: 'launch-supply', supplyNote: 'Émission initiale arrondie à 100 milliards de TRX.' },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', sector: 'Oracle', price: 10.09, supply: 1_000_000_000, decimals: 6, supplyBasis: 'protocol-cap', supplyNote: 'Offre initiale de 1 milliard de LINK.' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', sector: 'Smart contracts', price: 0.1735, supply: 45_000_000_000, decimals: 4, supplyBasis: 'protocol-cap', supplyNote: 'Offre maximale théorique de 45 milliards d’ADA.' },
  { id: 'stellar', symbol: 'XLM', name: 'Stellar', sector: 'Paiements', price: 0.1491, supply: 100_000_000_000, decimals: 4, supplyBasis: 'launch-supply', supplyNote: '100 milliards de XLM à l’origine ; pas de retrait des tokens brûlés.' },
  { id: 'bitcoin-cash', symbol: 'BCH', name: 'Bitcoin Cash', sector: 'Monnaie', price: 226.74, supply: 21_000_000, decimals: 8, supplyBasis: 'protocol-cap', supplyNote: 'Limite de 21 millions, comparable à Bitcoin.' },
  { id: 'litecoin', symbol: 'LTC', name: 'Litecoin', sector: 'Monnaie', price: 49.77, supply: 84_000_000, decimals: 8, supplyBasis: 'protocol-cap', supplyNote: 'Offre maximale de 84 millions de LTC.' },
  { id: 'avalanche', symbol: 'AVAX', name: 'Avalanche', sector: 'Smart contracts', price: 8.55, supply: 720_000_000, decimals: 6, supplyBasis: 'protocol-cap', supplyNote: 'Limite de 720 millions d’AVAX.' },
  { id: 'sui', symbol: 'SUI', name: 'Sui', sector: 'Smart contracts', price: 0.8182, supply: 10_000_000_000, decimals: 4, supplyBasis: 'protocol-cap', supplyNote: 'Offre totale annoncée de 10 milliards de SUI.' },
  { id: 'monero', symbol: 'XMR', name: 'Monero', sector: 'Confidentialité', price: 538.31, supply: 18_400_000, decimals: 8, supplyBasis: 'game-cap', supplyNote: 'Plafond de jeu basé sur l’émission principale (~18,4 M). Monero a une émission résiduelle sans plafond natif.' },
  { id: 'uniswap', symbol: 'UNI', name: 'Uniswap', sector: 'DeFi', price: 5.94, supply: 1_000_000_000, decimals: 6, supplyBasis: 'launch-supply', supplyNote: '1 milliard de UNI lors de la distribution initiale ; émission ultérieure possible.' },
]

const memeRows: readonly CoinRow[] = [
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', sector: 'Meme / chien', price: 0.066, supply: 100_000_000_000, decimals: 4, supplyBasis: 'game-cap', supplyNote: '100 milliards initialement visés ; DOGE est inflationniste et n’a pas de plafond natif.' },
  { id: 'shiba-inu', symbol: 'SHIB', name: 'Shiba Inu', sector: 'Meme / chien', price: 0.00000434, supply: 1_000_000_000_000_000, decimals: 0, supplyBasis: 'launch-supply', supplyNote: '1 quadrillion de tokens à la création ; burns non déduits.' },
  { id: 'pepe', symbol: 'PEPE', name: 'Pepe', sector: 'Meme / grenouille', price: 0.00000454, supply: 420_690_000_000_000, decimals: 0, supplyBasis: 'launch-supply', supplyNote: 'Offre initiale arrondie à 420,69 billions (français).' },
  { id: 'bonk', symbol: 'BONK', name: 'Bonk', sector: 'Meme / chien', price: 0.000002723, supply: 100_000_000_000_000, decimals: 0, supplyBasis: 'launch-supply', supplyNote: '100 billions de BONK lors de la création, sans déduction des burns.' },
  { id: 'floki', symbol: 'FLOKI', name: 'FLOKI', sector: 'Meme / chien', price: 0.00002019, supply: 10_000_000_000_000, decimals: 0, supplyBasis: 'launch-supply', supplyNote: '10 billions de FLOKI initiaux, sans déduction des burns.' },
  { id: 'dogwifhat', symbol: 'WIF', name: 'dogwifhat', sector: 'Meme / chien', price: 0.1511, supply: 998_926_392, decimals: 4, supplyBasis: 'protocol-cap', supplyNote: 'Offre totale fixe de l’ordre de 999 millions de WIF.' },
  { id: 'pudgy-penguins', symbol: 'PENGU', name: 'Pudgy Penguins', sector: 'Meme / pingouin', price: 0.006182, supply: 88_888_888_888, decimals: 4, supplyBasis: 'launch-supply', supplyNote: 'Offre nominale de 88 888 888 888 PENGU.' },
  { id: 'spx6900', symbol: 'SPX', name: 'SPX6900', sector: 'Meme / finance', price: 0.3494, supply: 1_000_000_000, decimals: 4, supplyBasis: 'launch-supply', supplyNote: 'Offre totale initiale arrondie à 1 milliard de SPX.' },
  { id: 'popcat', symbol: 'POPCAT', name: 'Popcat', sector: 'Meme / chat', price: 0.03169, supply: 979_973_221, decimals: 4, supplyBasis: 'protocol-cap', supplyNote: 'Offre fixe proche de 980 millions de POPCAT.' },
  { id: 'turbo', symbol: 'TURBO', name: 'Turbo', sector: 'Meme / grenouille', price: 0.0006840, supply: 69_000_000_000, decimals: 4, supplyBasis: 'protocol-cap', supplyNote: 'Offre totale de 69 milliards de TURBO.' },
]

function stock(row: StockRow): AssetDefinition {
  return Object.freeze({
    id: row.id, symbol: row.symbol, name: row.name, kind: 'stock' as const,
    sector: row.sector, inspiredBy: row.inspiredBy, sourceTicker: row.sourceTicker,
    referencePrice: row.price,
    referenceHighPrice: row.price,
    minPrice: row.price * 0.10,
    maxPrice: row.price * 6,
    totalSupply: row.supply, initialDividendYield: row.yield,
    supplyBasis: 'fictional-issue' as const,
    supplyNote: 'Émission fictive choisie pour le jeu, non nombre officiel d’actions en circulation.',
    quantityDecimals: 4,
    priceSource: row.priceSource ?? STOCK_SOURCE,
    priceReferenceDate: CATALOG_SNAPSHOT_DATE,
  })
}

function coin(row: CoinRow, kind: Extract<AssetKind, 'crypto' | 'memecoin'>): AssetDefinition {
  return Object.freeze({
    id: row.id, symbol: row.symbol, name: row.name, kind,
    sector: row.sector, inspiredBy: null, sourceTicker: row.symbol,
    referencePrice: row.price,
    referenceHighPrice: row.price,
    minPrice: row.price * 0.05,
    // Maximum de jeu V1 : 500 % du prix de la photo de marché.
    // Ne prétend pas être 5 × un ATH historique qui reste à sourcer/valider.
    maxPrice: row.price * 5,
    totalSupply: row.supply, initialDividendYield: null,
    supplyBasis: row.supplyBasis, supplyNote: row.supplyNote,
    quantityDecimals: row.decimals,
    priceSource: kind === 'crypto' ? CRYPTO_SOURCE : MEME_SOURCE,
    priceReferenceDate: CATALOG_SNAPSHOT_DATE,
  })
}

export const ASSETS: readonly AssetDefinition[] = Object.freeze([
  ...stockRows.map(stock),
  ...cryptoRows.map((row) => coin(row, 'crypto')),
  ...memeRows.map((row) => coin(row, 'memecoin')),
])

const assetIndex = new Map(ASSETS.map((asset) => [asset.id, asset]))

export function getAsset(id: string): AssetDefinition | undefined {
  return assetIndex.get(id)
}

// Offre disponible = allocation totale de l'actif - quantité dans le portefeuille du joueur.
// Le marché individuel ne met en circulation ni n'émet de titres supplémentaires.
export function getAvailableSupply(asset: AssetDefinition, ownedQuantity: number): number {
  if (!Number.isFinite(ownedQuantity) || ownedQuantity < 0) return 0
  return Math.max(0, asset.totalSupply - Math.min(ownedQuantity, asset.totalSupply))
}

export function createInitialQuotes(at: number): Record<string, MarketQuote> {
  return Object.fromEntries(ASSETS.map((asset) => [
    asset.id,
    { price: asset.referencePrice, momentum: 0, dividendYield: asset.initialDividendYield, updatedAt: at },
  ]))
}
