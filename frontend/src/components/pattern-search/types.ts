export type Outcome = {
  horizon_candles: number;
  forward_return: number;
  mfe: number;
  mae: number;
};

export type Match = {
  start_time: string;
  end_time: string;
  similarity_score: number;
  outcomes: Outcome[];
};

export type Statistic = {
  horizon_candles: number;
  sample_size: number;
  mean_return: number;
  median_return: number;
  win_rate: number;
  mean_mfe: number;
  mean_mae: number;
};

export type SearchResponse = {
  symbol: string;
  timeframe: string;
  pattern_length: number;
  algorithm_version: string;
  feature_version: string;
  current_pattern: {
    start_time: string;
    end_time: string;
  };
  matches: Match[];
  statistics: Statistic[];
};
