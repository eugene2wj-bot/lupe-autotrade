// -------------------------------------------------------
// 티커 상수 (원본: ae2a204e5d45755a.js Line 6078)
// -------------------------------------------------------

export const QUICK_SELECT_TICKERS = ['TQQQ', 'SOXL'] as const;

export interface Ticker {
  symbol: string;
  name: string;
}

/**
 * V4.0 지원 종목 목록 (미국 레버리지 ETF 중심)
 * 원본 번들에서 추출한 주요 종목들
 */
export const TICKERS: Ticker[] = [
  { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ' },
  { symbol: 'SOXL', name: 'Direxion Daily Semiconductors Bull 3X Shares' },
  { symbol: 'LABU', name: 'Direxion Daily S&P Biotech Bull 3X Shares' },
  { symbol: 'FNGU', name: 'MicroSectors FANG+ Index 3X Leveraged ETN' },
  { symbol: 'WEBL', name: 'Direxion Daily Dow Jones Internet Bull 3X Shares' },
  { symbol: 'TECL', name: 'Direxion Daily Technology Bull 3X Shares' },
  { symbol: 'BULZ', name: 'MicroSectors FANG & Innovation 3X Leveraged ETN' },
  { symbol: 'DPST', name: 'Direxion Daily Regional Banks Bull 3X Shares' },
  { symbol: 'FAS', name: 'Direxion Daily Financial Bull 3X Shares' },
  { symbol: 'NAIL', name: 'Direxion Daily Homebuilders & Supplies Bull 3X Shares' },
  { symbol: 'UDOW', name: 'ProShares UltraPro Dow30' },
  { symbol: 'UPRO', name: 'ProShares UltraPro S&P500' },
  { symbol: 'TNA', name: 'Direxion Daily Small Cap Bull 3X Shares' },
  { symbol: 'CURE', name: 'Direxion Daily Healthcare Bull 3X Shares' },
  { symbol: 'HIBL', name: 'Direxion Daily S&P 500 High Beta Bull 3X Shares' },
  { symbol: 'DFEN', name: 'Direxion Daily Aerospace & Defense Bull 3X Shares' },
  { symbol: 'NRGU', name: 'MicroSectors U.S. Big Oil Index 3X Leveraged ETN' },
  { symbol: 'ERX', name: 'Direxion Daily Energy Bull 2X Shares' },
  { symbol: 'MIDU', name: 'Direxion Daily Mid Cap Bull 3X Shares' },
  { symbol: 'WANT', name: 'Direxion Daily Consumer Discretionary Bull 3X Shares' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'META', name: 'Meta Platforms, Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.' },
];
